"""Central resource-level authorization for protected medical-image actions."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Literal

from fastapi import HTTPException, Request, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import AuditLog, ConsentGrant, MedicalImage, PatientProfile, User


ImageAction = Literal["view", "download", "analyze", "share", "recover"]


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def write_audit(
    db: Session,
    user: User | None,
    action: str,
    status_value: str,
    image_id: int | None = None,
    request: Request | None = None,
    details: str | None = None,
) -> None:
    db.add(AuditLog(
        user_id=user.id if user else None,
        image_id=image_id,
        action=action,
        status=status_value,
        ip_address=request.client.host if request and request.client else None,
        user_agent=(request.headers.get("user-agent") if request else None),
        details=details,
        timestamp=utcnow(),
    ))


def _patient_for_image(db: Session, image: MedicalImage) -> PatientProfile:
    patient = db.get(PatientProfile, image.patient_id)
    if patient is None:
        raise HTTPException(status_code=404, detail="Image patient profile is unavailable")
    return patient


def authorize_image_action(
    db: Session,
    user: User,
    image: MedicalImage,
    action: ImageAction,
    purpose: str,
    request: Request | None = None,
) -> ConsentGrant | None:
    """Require ownership, privileged administration, or an active scoped consent."""
    patient = _patient_for_image(db, image)
    if user.role == "super_admin" or patient.user_id == user.id:
        return None

    now = utcnow()
    grants = db.query(ConsentGrant).filter(
        ConsentGrant.patient_id == image.patient_id,
        ConsentGrant.recipient_user_id == user.id,
        ConsentGrant.revoked_at.is_(None),
        ConsentGrant.starts_at <= now,
        ConsentGrant.expires_at > now,
        or_(ConsentGrant.image_id.is_(None), ConsentGrant.image_id == image.id),
    ).all()
    for grant in grants:
        try:
            actions = json.loads(grant.actions_json)
        except json.JSONDecodeError:
            continue
        if action in actions:
            return grant

    write_audit(
        db, user, f"ACCESS_DENIED_{action.upper()}", "FAILED", image.id, request,
        f"No active patient consent for purpose '{purpose}'.",
    )
    db.commit()
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Active patient consent is required for this image action")


def authorize_emergency_access(
    db: Session,
    user: User,
    image: MedicalImage,
    action: Literal["view", "download"],
    justification: str | None,
    request: Request | None = None,
) -> None:
    """Controlled break-glass access; it is never driven by a boolean client flag."""
    from app.config import _as_bool
    import os

    if not _as_bool(os.getenv("EMERGENCY_ACCESS_ENABLED"), False):
        raise HTTPException(status_code=403, detail="Emergency access is disabled by server policy")
    if user.role not in {"doctor", "radiologist", "super_admin"}:
        raise HTTPException(status_code=403, detail="Your role is not eligible for emergency access")
    if not justification or len(justification.strip()) < 15:
        raise HTTPException(status_code=422, detail="Emergency access requires a meaningful clinical justification")
    write_audit(
        db, user, f"EMERGENCY_{action.upper()}", "SUCCESS", image.id, request,
        f"Break-glass access recorded. Justification: {justification.strip()[:300]}",
    )
    db.commit()
