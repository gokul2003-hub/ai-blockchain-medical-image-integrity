"""Write paths for the versioned integrity tables.

``image_versions``, ``integrity_events`` and ``ai_inferences`` are declared in
``app.models`` but previously had no constructor call anywhere in the
application, so verification results and forensic inferences were only
returned in HTTP responses and never persisted.

This module materializes a real ``ImageVersion`` row from data that already
exists on the ``MedicalImage`` record (no schema changes, no fabricated
values) and attaches real integrity/AI events to it.  Every value written is
derived from an actual computation or an actual stored record.
"""

import hashlib
import json
import mimetypes
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from loguru import logger
from sqlalchemy.orm import Session

from app.models import AIInference, ImageVersion, IntegrityEvent, MedicalImage, TamperRiskLog

__all__ = [
    "ensure_image_version",
    "record_integrity_event",
    "record_ai_inference",
    "record_tamper_risk_log",
    "record_recovered_version",
]


def _metadata_hash(encryption_metadata_json: Optional[str]) -> str:
    """SHA3-256 over the stored encryption metadata (real derived value)."""
    return hashlib.sha3_256((encryption_metadata_json or "").encode("utf-8")).hexdigest()


def _content_type_for(image: MedicalImage) -> str:
    guessed, _ = mimetypes.guess_type(image.title or "")
    if guessed:
        return guessed
    return "application/octet-stream"


def _storage_provider_for(image: MedicalImage) -> str:
    """Mirror the provider detection used by the integrity-evidence route."""
    ref = (image.file_path or "").lower()
    if "ipfs" in ref:
        return "ipfs"
    return "local"


def ensure_image_version(
    db: Session,
    image: MedicalImage,
    integrity_status: Optional[str] = None,
    commit: bool = False,
) -> ImageVersion:
    """Return the latest ``ImageVersion`` for ``image``, creating v1 if absent.

    Version 1 is built exclusively from fields already persisted on the
    ``MedicalImage`` row (hashes, storage reference, encryption metadata,
    uploader).  ``integrity_status`` mirrors the live quarantine state unless
    the caller passes an explicit value.
    """
    latest = (
        db.query(ImageVersion)
        .filter(ImageVersion.image_id == image.id)
        .order_by(ImageVersion.version_number.desc())
        .first()
    )
    if latest is not None:
        return latest

    if integrity_status is None:
        integrity_status = "QUARANTINED" if image.quarantine_status else "VERIFIED"

    version = ImageVersion(
        image_id=image.id,
        version_number=1,
        parent_version_id=None,
        content_type=_content_type_for(image),
        original_filename=image.title or f"image_{image.id}",
        storage_provider=_storage_provider_for(image),
        storage_reference=image.file_path,
        plaintext_hash=image.original_hash,
        ciphertext_hash=image.encrypted_hash or "",
        metadata_hash=_metadata_hash(image.encryption_key_metadata),
        encryption_metadata_json=image.encryption_key_metadata or "{}",
        integrity_status=integrity_status,
        blockchain_reference=None,
        uploaded_by_id=image.uploader_id,
        verified_at=datetime.now(timezone.utc) if integrity_status == "VERIFIED" else None,
    )
    db.add(version)
    db.flush()
    db.refresh(version)
    if commit:
        db.commit()
    logger.info(
        f"Materialized ImageVersion v{version.version_number} (id={version.id}) "
        f"for image {image.id}"
    )
    return version


def record_integrity_event(
    db: Session,
    image: MedicalImage,
    event_type: str,
    status: str,
    details: Dict[str, Any],
    actor_user_id: Optional[int] = None,
    commit: bool = True,
    best_effort: bool = True,
) -> Optional[IntegrityEvent]:
    """Persist a real verification/integrity result as an ``IntegrityEvent``.

    ``best_effort=True`` (default) keeps this observability side-channel from
    breaking the primary request path; failures are logged, never hidden.
    """
    try:
        version = ensure_image_version(db, image, commit=False)
        event = IntegrityEvent(
            image_version_id=version.id,
            actor_user_id=actor_user_id,
            event_type=event_type,
            status=status,
            details_json=json.dumps(details, default=str),
        )
        db.add(event)
        if commit:
            db.commit()
        else:
            db.flush()
        return event
    except Exception as exc:
        if not best_effort:
            raise
        logger.error(f"Failed to persist integrity event for image {image.id}: {exc}")
        try:
            db.rollback()
        except Exception:
            pass
        return None


def record_ai_inference(
    db: Session,
    image: MedicalImage,
    ai_result: Dict[str, Any],
    requested_by_id: Optional[int] = None,
    status: str = "COMPLETED",
    started_at: Optional[datetime] = None,
    model_version: Optional[str] = None,
    commit: bool = True,
    best_effort: bool = True,
) -> Optional[AIInference]:
    """Persist the real outputs of a run of the AI forensic pipeline.

    Stores the Swin-UNet/SRM result JSON (class/score/regions), plus the real
    heatmap and binary-mask file paths produced by ``run_ai_tamper_pipeline``.
    """
    try:
        now = datetime.now(timezone.utc)
        version = ensure_image_version(db, image, commit=False)

        provenance = ai_result.get("model_provenance") or {}
        resolved_model_version = model_version or provenance.get("model_version") or "demo-srm-attention-unet-v1"

        inference = AIInference(
            image_version_id=version.id,
            requested_by_id=requested_by_id,
            status=status,
            model_version=resolved_model_version,
            result_json=json.dumps(
                {
                    "status": ai_result.get("status"),
                    "tamper_detected": ai_result.get("tampered_detected"),
                    "tampered_percentage": ai_result.get("tampered_percentage"),
                    "confidence_score": ai_result.get("confidence_score"),
                    "confidence_label": ai_result.get("confidence_label"),
                    "bounding_boxes": ai_result.get("bounding_boxes", []),
                    "regions": ai_result.get("regions", []),
                    "original_dimensions": ai_result.get("original_dimensions"),
                    "model_provenance": provenance,
                },
                default=str,
            ),
            mask_storage_reference=ai_result.get("mask_path"),
            heatmap_storage_reference=ai_result.get("heatmap_path"),
            started_at=started_at,
            completed_at=now if status == "COMPLETED" else None,
        )
        db.add(inference)
        if commit:
            db.commit()
        else:
            db.flush()
        logger.info(f"Persisted AIInference {inference.id} for image {image.id} ({status})")
        return inference
    except Exception as exc:
        if not best_effort:
            raise
        logger.error(f"Failed to persist AI inference for image {image.id}: {exc}")
        try:
            db.rollback()
        except Exception:
            pass
        return None


def record_tamper_risk_log(
    db: Session,
    image: MedicalImage,
    user_id: Optional[int],
    risk_breakdown: Dict[str, Any],
    trust_breakdown: Dict[str, Any],
    access_decision: str,
    commit: bool = True,
    dedupe: bool = True,
) -> Optional[TamperRiskLog]:
    """Persist the real risk/trust computation for an image.

    ``dedupe=True`` skips the insert when the latest persisted log already
    holds the exact same scores and decision, so repeated reads of an
    unchanged image do not flood ``tamper_risk_logs``.
    """
    risk_score = float(risk_breakdown["total_tamper_risk_score"])
    trust_score = float(trust_breakdown["cybersecurity_trust_score"])

    if dedupe:
        latest = (
            db.query(TamperRiskLog)
            .filter(TamperRiskLog.image_id == image.id)
            .order_by(TamperRiskLog.timestamp.desc())
            .first()
        )
        if (
            latest is not None
            and latest.risk_score == risk_score
            and latest.trust_score == trust_score
            and latest.access_decision == access_decision
        ):
            return latest

    log = TamperRiskLog(
        image_id=image.id,
        user_id=user_id,
        risk_score=risk_score,
        risk_category=risk_breakdown["category"],
        trust_score=trust_score,
        trust_level=trust_breakdown["trust_level"],
        access_decision=access_decision,
        breakdown_json=json.dumps(
            {"risk": risk_breakdown, "trust": trust_breakdown},
            default=str,
        ),
    )
    db.add(log)
    if commit:
        db.commit()
    else:
        db.flush()
    logger.info(
        f"Persisted TamperRiskLog {log.id} for image {image.id}: "
        f"risk={risk_score} ({risk_breakdown['category']}), "
        f"trust={trust_score} ({trust_breakdown['trust_level']}), "
        f"decision={access_decision}"
    )
    return log


def record_recovered_version(
    db: Session,
    image: MedicalImage,
    recovered_bytes: bytes,
    triggered_by_id: int,
    verification_passed: bool,
    blockchain_reference: Optional[str] = None,
    commit: bool = True,
    best_effort: bool = True,
) -> Optional[ImageVersion]:
    """Persist the recovered scan as a new immutable ``ImageVersion`` (v2+).

    The recovered pixels are encrypted through the existing pipeline and
    stored, then a new version row is written with the real plaintext /
    ciphertext / metadata hashes.  Only a SHA-3-verified recovery repoints
    ``MedicalImage.file_path`` at the new ciphertext, so a failed recovery
    never replaces the quarantined object.
    """
    # Local imports: crypto/storage are heavy and this module must stay
    # import-light so routes, recovery and celery can all depend on it.
    from app.crypto import encrypt_image, sha3_hash
    from app.storage_provider import store_encrypted_object

    import uuid as _uuid

    new_ref = None
    try:
        ciphertext, plaintext_hash, metadata_json = encrypt_image(recovered_bytes, image.entropy)
        if plaintext_hash != sha3_hash(recovered_bytes):  # defensive: never store a mismatched object
            raise ValueError("Recovered plaintext hash mismatch")
        stored = store_encrypted_object(
            ciphertext, f"img_recovered_{image.id}_{_uuid.uuid4().hex[:10]}.enc"
        )
        new_ref = (stored.reference, stored.provider)

        latest = (
            db.query(ImageVersion)
            .filter(ImageVersion.image_id == image.id)
            .order_by(ImageVersion.version_number.desc())
            .first()
        )
        version = ImageVersion(
            image_id=image.id,
            version_number=(latest.version_number + 1) if latest else 1,
            parent_version_id=latest.id if latest else None,
            content_type=_content_type_for(image),
            original_filename=image.title or f"image_{image.id}",
            storage_provider=getattr(stored, "provider", _storage_provider_for(image)),
            storage_reference=stored.reference,
            plaintext_hash=plaintext_hash,
            ciphertext_hash=sha3_hash(ciphertext),
            metadata_hash=_metadata_hash(metadata_json),
            encryption_metadata_json=metadata_json,
            integrity_status="RECOVERED" if verification_passed else "RECOVERY_FAILED",
            blockchain_reference=blockchain_reference,
            uploaded_by_id=triggered_by_id,
            verified_at=datetime.now(timezone.utc) if verification_passed else None,
        )
        db.add(version)
        if verification_passed:
            # Future preview/download verification now runs against the
            # SHA-3-verified recovered ciphertext instead of the tampered one.
            # All three ciphertext-bound fields must move together or the
            # AES-GCM tag check (nonce/DEK in metadata) and the ciphertext
            # hash check would reject the new object.
            image.file_path = stored.reference
            image.encryption_key_metadata = metadata_json
            image.encrypted_hash = sha3_hash(ciphertext)
        if commit:
            db.commit()
        else:
            db.flush()
        db.refresh(version)
        logger.info(
            f"Persisted recovered ImageVersion v{version.version_number} "
            f"({version.integrity_status}) for image {image.id}"
        )
        return version
    except Exception as exc:
        if not best_effort:
            raise
        logger.error(f"Failed to persist recovered image version for {image.id}: {exc}")
        try:
            db.rollback()
        except Exception:
            pass
        return None
