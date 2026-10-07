from celery import Celery
import os
import json
import logging
from loguru import logger
from app.config import CELERY_BROKER_URL, CELERY_RESULT_BACKEND

# Initialize Celery app
celery_app = Celery(
    "medical_sharing_tasks",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # A dead broker must fail fast so the HTTP upload request never waits on
    # kombu's default ~60s exponential reconnect loop. The API then reports the
    # real broker error instead of hanging.
    broker_connection_retry_on_startup=False,
    broker_connection_max_retries=0,
    broker_transport_options={
        "socket_connect_timeout": 2,
        "socket_timeout": 2,
        "max_retries": 0,
        "retry_on_timeout": False,
    },
    result_backend_transport_options={"socket_connect_timeout": 2, "socket_timeout": 2},
)

# Ordered pipeline stages persisted on the AIInference job row. The frontend
# renders these verbatim, so a displayed stage is always a real backend state.
PIPELINE_STAGES = (
    "QUEUED",
    "PREPROCESSING",
    "ENCRYPTING",
    "HASHING",
    "DIT_CREATING",
    "STORING",
    "BLOCKCHAIN_RECORDING",
    "AI_QUEUED",
    "AI_PROCESSING",
    "FORENSIC_ANALYSIS",
    "RISK_ASSESSMENT",
    "COMPLETED",
)


def _stage_progress(stage: str) -> int:
    """Stage-based progress - explicitly NOT a measured execution percentage."""
    try:
        idx = PIPELINE_STAGES.index(stage)
    except ValueError:
        return 0
    return 5 + round((idx / max(1, len(PIPELINE_STAGES) - 1)) * 95)


def broker_reachable(timeout: float = 1.5) -> bool:
    """
    Real TCP reachability probe of the configured Celery broker.

    kombu's default reconnect loop blocks a request for ~60s when the broker is
    down. Probing first keeps the upload request fast; the enqueue itself is
    still attempted and its real result is what decides ``worker_queued``.
    """
    import socket as _socket
    from urllib.parse import urlparse

    try:
        parsed = urlparse(CELERY_BROKER_URL)
        host = parsed.hostname or "127.0.0.1"
        port = parsed.port or (6379 if "redis" in parsed.scheme else 5672)
        with _socket.create_connection((host, port), timeout=timeout):
            return True
    except Exception as exc:  # noqa: BLE001 - probe failure simply means "down"
        logger.warning(f"Celery broker {CELERY_BROKER_URL} unreachable: {exc}")
        return False


def enqueue_pipeline(image_id: int, inference_id) -> None:
    """
    Publish the pipeline task, failing fast and loudly.

    Never silently falls back to running the forensics inline - the caller must
    surface the failure so the study is never reported as verified.
    """
    if not broker_reachable():
        raise RuntimeError(
            f"Celery broker at {CELERY_BROKER_URL} is not reachable "
            "(TCP connect failed). Background forensic processing cannot be queued."
        )
    process_medical_image_pipeline.apply_async(
        args=(image_id, inference_id), retry=False, retry_policy={"max_retries": 0}
    )


@celery_app.task(name="app.celery_worker.process_medical_image_pipeline")
def process_medical_image_pipeline(image_id: int, inference_id: str):
    """
    Run the expensive, deferrable half of the security pipeline.

    The HTTP request already completed the mandatory integrity chain
    (preprocess -> 4D Chen + AES-256-GCM -> SHA-3 -> Digital Integrity Twin ->
    secure storage -> ledger registration): a study cannot be given a trusted
    baseline without it. Everything expensive runs here - AI forensic analysis
    (SRM, Hybrid Swin-UNet localization, Grad-CAM), risk/trust, the
    risk-adaptive access decision and report compilation.

    Idempotent: a COMPLETED or FAILED job is never re-run automatically.
    Each run opens and always closes its own database session.
    """
    import datetime as _dt

    from app.database import SessionLocal
    from app.models import AIInference, MedicalImage

    logger.info(f"process_medical_image_pipeline START image={image_id} job={inference_id}")

    db = SessionLocal()
    try:
        job = db.get(AIInference, inference_id)
        if job is None:
            logger.error(f"Job {inference_id} not found")
            return {"status": "FAILED", "error": "job_not_found"}

        if job.status == "COMPLETED":
            logger.info(f"Job {inference_id} already COMPLETED - skipping")
            return {"status": "COMPLETED", "skipped": "already_completed"}
        if job.status == "FAILED":
            logger.info(f"Job {inference_id} already FAILED - skipping")
            return {"status": "FAILED", "skipped": "already_failed"}

        image = db.get(MedicalImage, image_id)
        if image is None:
            job.status = "FAILED"
            job.error_message = "Medical image no longer exists"
            db.commit()
            return {"status": "FAILED", "error": "image_not_found"}

        def set_stage(stage: str) -> None:
            job.status = stage
            if stage not in ("QUEUED", "COMPLETED"):
                job.started_at = job.started_at or _dt.datetime.now(_dt.timezone.utc)
            db.commit()
            logger.info(f"[{stage}] image={image_id} job={inference_id} stage_progress={_stage_progress(stage)}")

        set_stage("AI_QUEUED")

        from app.crypto import decrypt_image, sha3_hash
        from app.storage_provider import load_encrypted_object

        encrypted_bytes = load_encrypted_object(image.file_path)
        if sha3_hash(encrypted_bytes) != image.encrypted_hash:
            raise ValueError("Ciphertext integrity hash mismatch - refusing to analyze")
        image_bytes = decrypt_image(
            encrypted_bytes, image.original_hash, image.encryption_key_metadata
        )

        # AI forensic analysis: SRM + Hybrid Swin-UNet localization + Grad-CAM
        set_stage("AI_PROCESSING")
        from app.ai_model import extract_srm_residual, run_ai_tamper_pipeline

        ai_res = run_ai_tamper_pipeline(image_bytes, f"heatmap_img_{image_id}.png")

        set_stage("FORENSIC_ANALYSIS")
        srm_reference = None
        try:
            from app.config import STORAGE_DIR

            srm_dir = STORAGE_DIR / "srm"
            srm_dir.mkdir(parents=True, exist_ok=True)
            srm_path = srm_dir / f"srm_img_{image_id}.png"
            srm_path.write_bytes(extract_srm_residual(image_bytes))
            srm_reference = str(srm_path)
        except Exception as srm_exc:
            logger.warning(f"SRM residual failed for image {image_id}: {srm_exc}")

        # Persist artifact references as soon as they exist so a later stage
        # failure still leaves the real forensic artifacts discoverable.
        job.mask_storage_reference = ai_res.get("mask_path")
        job.heatmap_storage_reference = ai_res.get("heatmap_path")
        db.commit()

        set_stage("RISK_ASSESSMENT")
        from app.access_policy import evaluate_risk_adaptive_access
        from app.risk_engine import (
            calculate_cybersecurity_trust_score,
            calculate_tamper_risk_score,
        )
        from app.versioning import record_tamper_risk_log

        tampered_pct = float(ai_res.get("tampered_percentage", 0.0) or 0.0)
        confidence = float(ai_res.get("confidence_score", 0.0) or 0.0)

        # The risk-adaptive access decision is evaluated FIRST so the real
        # decision string can be persisted with the risk log (access_decision
        # is NOT NULL). This is the same ABAC gate the synchronous path uses.
        access_decision, risk_breakdown, trust_breakdown = evaluate_risk_adaptive_access(
            db=db,
            user=None,
            image=image,
            ai_confidence=confidence,
            tampered_pixel_pct=tampered_pct,
            sha3_mismatch=False,
            blockchain_mismatch=False,
        )
        risk_score = float(risk_breakdown["total_tamper_risk_score"])
        trust_score = float(trust_breakdown["cybersecurity_trust_score"])
        record_tamper_risk_log(
            db=db,
            image=image,
            user_id=image.uploader_id,
            risk_breakdown=risk_breakdown,
            trust_breakdown=trust_breakdown,
            access_decision=access_decision,
        )

        job.result_json = json.dumps(
            {
                "tampered_percentage": tampered_pct,
                "confidence_score": confidence,
                "bounding_boxes": ai_res.get("bounding_boxes", []),
                "srm_reference": srm_reference,
                "risk_score": risk_score,
                "risk_category": risk_breakdown["category"],
                "trust_score": trust_score,
                "trust_level": trust_breakdown["trust_level"],
                "access_decision": access_decision,
                "heatmap_reference": ai_res.get("heatmap_path"),
                "mask_reference": ai_res.get("mask_path"),
                "srm_reference": srm_reference,
            }
        )
        job.status = "COMPLETED"
        job.completed_at = _dt.datetime.now(_dt.timezone.utc)
        db.commit()
        logger.info(
            f"process_medical_image_pipeline COMPLETED image={image_id} "
            f"risk={risk_score} trust={trust_score} decision={access_decision}"
        )

        # Report compilation stays a separate background job.
        try:
            if not broker_reachable():
                raise RuntimeError(
                    f"Celery broker at {CELERY_BROKER_URL} is not reachable; "
                    "forensic report job was NOT queued."
                )
            compile_forensic_report_task.apply_async(
                kwargs={
                    "image_id": image_id,
                    "image_title": image.title,
                    "image_type": image.image_type,
                    "patient_name": "",
                    "uploader_name": "",
                    "hospital_name": "",
                    "blockchain_hash": image.encrypted_hash,
                    "original_hash": image.original_hash,
                    "current_hash": image.original_hash,
                    "integrity_status": "VERIFIED",
                    "tampered_percentage": tampered_pct,
                    "confidence_score": confidence,
                    "heatmap_path": ai_res.get("heatmap_path", ""),
                    "user_agent": "celery-worker",
                    "ip_address": "127.0.0.1",
                },
                retry=False,
            )
        except Exception as report_err:
            logger.warning(f"Forensic report job not queued: {report_err}")

        return {"status": "COMPLETED", "risk_score": risk_score, "trust_score": trust_score}

    except Exception as exc:
        logger.error(f"process_medical_image_pipeline FAILED image={image_id}: {exc}")
        try:
            db.rollback()
            failed_job = db.get(AIInference, inference_id)
            if failed_job is not None:
                failed_job.status = "FAILED"
                failed_job.error_message = str(exc)[:500]
                failed_job.completed_at = _dt.datetime.now(_dt.timezone.utc)
                db.commit()
        except Exception as persist_exc:
            logger.error(f"Failed to persist FAILED status: {persist_exc}")
        return {"status": "FAILED", "error": str(exc)}
    finally:
        db.close()


@celery_app.task(name="app.celery_worker.celery_worker_health")
def celery_worker_health() -> dict:
    """Liveness probe so the API reports true worker availability."""
    return {"status": "WORKER_ALIVE", "stages": list(PIPELINE_STAGES)}

@celery_app.task(name="app.celery_worker.run_ai_tamper_localization")
def run_ai_tamper_localization(image_id: int, output_filename: str):
    """
    Background Celery task to run U-Net model and localize image tampering.
    Retrieves and decrypts the specific encrypted image inside the worker.
    Plain medical-image bytes are deliberately not serialized into the Celery
    broker message.
    """
    logger.info(f"Starting background AI tamper localization for {output_filename}")
    from app.ai_model import run_ai_tamper_pipeline
    
    try:
        from app.crypto import decrypt_image, sha3_hash
        from app.database import SessionLocal
        from app.models import MedicalImage
        from app.storage_provider import load_encrypted_object

        db = SessionLocal()
        try:
            image = db.get(MedicalImage, image_id)
            if not image:
                raise ValueError(f"Medical image {image_id} was not found")
            encrypted_bytes = load_encrypted_object(image.file_path)
            if sha3_hash(encrypted_bytes) != image.encrypted_hash:
                raise ValueError("Ciphertext integrity hash mismatch")
            image_bytes = decrypt_image(
                encrypted_bytes, image.original_hash, image.encryption_key_metadata
            )
        finally:
            db.close()
        res = run_ai_tamper_pipeline(image_bytes, output_filename)
        logger.info(f"Tamper localization completed: {res['tampered_percentage']}% tampered, confidence: {res['confidence_score']}")
        # Persist the real inference (ai_inferences write path) against the
        # image version so forensics survive beyond the Celery return value.
        try:
            from app.database import SessionLocal
            from app.models import MedicalImage
            from app.versioning import record_ai_inference

            persist_db = SessionLocal()
            try:
                persist_image = persist_db.get(MedicalImage, image_id)
                if persist_image:
                    record_ai_inference(persist_db, persist_image, res)
            finally:
                persist_db.close()
        except Exception as persist_err:
            logger.error(f"Failed to persist AI inference for image {image_id}: {persist_err}")
        return {
            "status": "SUCCESS",
            "tampered_percentage": res["tampered_percentage"],
            "confidence_score": res["confidence_score"],
            "bounding_boxes": res["bounding_boxes"],
            "regions": res.get("regions", []),
            "heatmap_path": res["heatmap_path"],
            "model_provenance": res.get("model_provenance", {})
        }
    except Exception as e:
        logger.error(f"AI Tamper localization failed: {str(e)}")
        return {
            "status": "FAILED",
            "error": str(e),
            "tampered_percentage": 0.0,
            "confidence_score": 0.0,
            "bounding_boxes": [],
            "regions": [],
            "heatmap_path": ""
        }

@celery_app.task(name="app.celery_worker.compile_forensic_report_task")
def compile_forensic_report_task(
    image_id: int,
    image_title: str,
    image_type: str,
    patient_name: str,
    uploader_name: str,
    hospital_name: str,
    blockchain_hash: str,
    original_hash: str,
    current_hash: str,
    integrity_status: str,
    tampered_percentage: float,
    confidence_score: float,
    heatmap_path: str,
    user_agent: str,
    ip_address: str
):
    """
    Background Celery task to compile forensic report as a PDF.
    """
    logger.info(f"Compiling forensic report for image ID {image_id} in background")
    from app.report import generate_forensic_pdf
    try:
        pdf_path = generate_forensic_pdf(
            image_id=image_id,
            image_title=image_title,
            image_type=image_type,
            patient_name=patient_name,
            uploader_name=uploader_name,
            hospital_name=hospital_name,
            blockchain_hash=blockchain_hash,
            block_index=1,
            original_hash=original_hash,
            current_hash=current_hash,
            integrity_status=integrity_status,
            tampered_percentage=tampered_percentage,
            confidence_score=confidence_score,
            heatmap_path=heatmap_path,
            user_agent=user_agent,
            ip_address=ip_address
        )
        logger.info(f"Forensic PDF compiled successfully at: {pdf_path}")
        from app.database import SessionLocal
        from app.models import Report
        db = SessionLocal()
        try:
            report = db.query(Report).filter(Report.image_id == image_id).order_by(Report.id.desc()).first()
            if report:
                report.file_path = pdf_path
                report.status = "TAMPERED"
                db.commit()
        finally:
            db.close()
        return {"status": "SUCCESS", "pdf_path": pdf_path}
    except Exception as e:
        logger.error(f"Failed to generate forensic PDF: {str(e)}")
        try:
            from app.database import SessionLocal
            from app.models import Report
            db = SessionLocal()
            try:
                report = db.query(Report).filter(Report.image_id == image_id).order_by(Report.id.desc()).first()
                if report:
                    report.status = "FAILED"
                    db.commit()
            finally:
                db.close()
        except Exception:
            pass
        return {"status": "FAILED", "error": str(e)}
