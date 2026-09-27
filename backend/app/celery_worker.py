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
)

@celery_app.task(name="app.celery_worker.run_ai_tamper_localization")
def run_ai_tamper_localization(image_id: int, output_filename: str):
    """
    Background Celery task to run U-Net model and localize image tampering.
    Retrieves and decrypts the specific encrypted image inside the worker.
    Plain medical-image bytes are deliberately not serialized into the Celery
    broker message.
    """
    logger.info(f"Starting background AI tamper localization for {output_filename}")
    from app.ai_model import localize_tampering
    
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
        tampered_pct, confidence, bboxes, heatmap_path = localize_tampering(image_bytes, output_filename)
        logger.info(f"Tamper localization completed: {tampered_pct}% tampered, confidence: {confidence}")
        return {
            "status": "SUCCESS",
            "tampered_percentage": tampered_pct,
            "confidence_score": confidence,
            "bounding_boxes": bboxes,
            "heatmap_path": heatmap_path
        }
    except Exception as e:
        logger.error(f"AI Tamper localization failed: {str(e)}")
        return {
            "status": "FAILED",
            "error": str(e),
            "tampered_percentage": 0.0,
            "confidence_score": 0.0,
            "bounding_boxes": [],
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
        return {"status": "SUCCESS", "pdf_path": pdf_path}
    except Exception as e:
        logger.error(f"Failed to generate forensic PDF: {str(e)}")
        return {"status": "FAILED", "error": str(e)}
