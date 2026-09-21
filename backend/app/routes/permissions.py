import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from loguru import logger

from app.database import get_db
from app.models import User, Permission, PatientProfile, DoctorProfile, ConsentGrant, MedicalImage, AuditLog
from app.schemas import PermissionCreate, PermissionResponse, ConsentCreate, ConsentResponseV2
from app.auth import get_current_user, RoleChecker
from app.authorization import authorize_emergency_access, write_audit
from app.blockchain import blockchain_service

router = APIRouter(prefix="/permissions", tags=["Access Permissions & Patient Consent"])


@router.post("", response_model=PermissionResponse)
async def grant_permission(
    perm_in: PermissionCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Grants read/download access to a doctor or hospital.
    Automatically creates both a Permission entry and a fine-grained ConsentGrant.
    """
    patient_profile = db.query(PatientProfile).filter(PatientProfile.id == perm_in.patient_id).first()
    if not patient_profile:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    if current_user.role != "super_admin" and current_user.id != patient_profile.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the patient or authorized administrator can grant access permissions"
        )

    # Expiration datetime
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=perm_in.expires_in_hours or 24)

    # Deactivate existing active permissions for same subject
    existing = db.query(Permission).filter(
        Permission.patient_id == perm_in.patient_id,
        Permission.doctor_id == perm_in.doctor_id,
        Permission.hospital_id == perm_in.hospital_id,
        Permission.is_active == True
    ).first()
    if existing:
        existing.is_active = False

    db_perm = Permission(
        patient_id=perm_in.patient_id,
        doctor_id=perm_in.doctor_id,
        hospital_id=perm_in.hospital_id,
        access_type=perm_in.access_type,
        is_active=True,
        is_emergency=perm_in.is_emergency or False,
        expires_at=expires_at,
        abac_constraints=perm_in.abac_constraints
    )
    db.add(db_perm)

    # Map to ConsentGrant recipient user id
    recipient_user_id = None
    if perm_in.doctor_id:
        doc_prof = db.get(DoctorProfile, perm_in.doctor_id)
        if doc_prof:
            recipient_user_id = doc_prof.user_id

    if recipient_user_id:
        actions = ["view"]
        if perm_in.access_type.upper() in {"DOWNLOAD", "READ_DOWNLOAD"}:
            actions.append("download")
        grant = ConsentGrant(
            id=str(uuid.uuid4()),
            patient_id=perm_in.patient_id,
            recipient_user_id=recipient_user_id,
            image_id=None,
            actions_json=json.dumps(actions),
            purpose="CLINICAL_CONSULTATION",
            starts_at=now,
            expires_at=expires_at,
            granted_by_id=current_user.id
        )
        db.add(grant)

    # Blockchain event
    tx_hash = blockchain_service.record_permission_grant(
        db, perm_in.patient_id, perm_in.doctor_id or 0, perm_in.hospital_id or 0, perm_in.access_type, expires_at
    )

    # Audit event
    write_audit(
        db=db,
        user=current_user,
        action="CONSENT_GRANT",
        status_value="SUCCESS",
        request=request,
        details=f"Granted {perm_in.access_type} permission on patient {perm_in.patient_id}. Expiry: {expires_at.isoformat()}"
    )
    db.commit()
    db.refresh(db_perm)

    logger.info(f"Permission granted (ID: {db_perm.id}, TX: {tx_hash})")
    return db_perm


@router.post("/consent", response_model=ConsentResponseV2)
async def create_fine_grained_consent(
    consent_in: ConsentCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Fine-grained Consent Management endpoint.
    Allows patients to explicitly grant scoped actions (view, download, analyze, share, recover)
    to a specific recipient for an image with an explicit clinical purpose and expiration.
    """
    patient = db.query(PatientProfile).filter(PatientProfile.user_id == current_user.id).first()
    if not patient and current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only patients can manage consent grants")

    patient_id = patient.id if patient else (
        db.query(PatientProfile).filter(PatientProfile.id == consent_in.recipient_user_id).first().id if db.query(PatientProfile).count() > 0 else 1
    )

    recipient = db.get(User, consent_in.recipient_user_id)
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient user not found")

    now = datetime.now(timezone.utc)
    starts = consent_in.starts_at or now
    if consent_in.expires_at <= starts:
        raise HTTPException(status_code=422, detail="Expiration time must be in the future")

    grant = ConsentGrant(
        id=str(uuid.uuid4()),
        patient_id=patient_id,
        recipient_user_id=consent_in.recipient_user_id,
        image_id=consent_in.image_id,
        actions_json=json.dumps(consent_in.actions),
        purpose=consent_in.purpose,
        starts_at=starts,
        expires_at=consent_in.expires_at,
        granted_by_id=current_user.id
    )
    db.add(grant)

    write_audit(
        db, current_user, "CONSENT_CREATE", "SUCCESS", consent_in.image_id, request,
        f"Consent grant created for recipient {recipient.username} ({', '.join(consent_in.actions)}) - Purpose: {consent_in.purpose}"
    )
    db.commit()

    return ConsentResponseV2(
        id=grant.id,
        patient_id=grant.patient_id,
        recipient_user_id=grant.recipient_user_id,
        image_id=grant.image_id,
        actions=json.loads(grant.actions_json),
        purpose=grant.purpose,
        starts_at=grant.starts_at,
        expires_at=grant.expires_at,
        revoked_at=grant.revoked_at,
        created_at=grant.created_at
    )


@router.get("/consents", response_model=List[ConsentResponseV2])
async def list_consents(
    image_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lists all active and historical consent grants relevant to current user."""
    query = db.query(ConsentGrant)
    if current_user.role == "patient":
        patient = db.query(PatientProfile).filter(PatientProfile.user_id == current_user.id).first()
        if not patient:
            return []
        query = query.filter(ConsentGrant.patient_id == patient.id)
    elif current_user.role != "super_admin":
        query = query.filter(ConsentGrant.recipient_user_id == current_user.id)

    if image_id is not None:
        query = query.filter(or_(ConsentGrant.image_id.is_(None), ConsentGrant.image_id == image_id))

    grants = query.order_by(ConsentGrant.created_at.desc()).all()
    results = []
    for g in grants:
        try:
            acts = json.loads(g.actions_json)
        except Exception:
            acts = []
        results.append(ConsentResponseV2(
            id=g.id,
            patient_id=g.patient_id,
            recipient_user_id=g.recipient_user_id,
            image_id=g.image_id,
            actions=acts,
            purpose=g.purpose,
            starts_at=g.starts_at,
            expires_at=g.expires_at,
            revoked_at=g.revoked_at,
            created_at=g.created_at
        ))
    return results


@router.post("/revoke/{permission_id}")
async def revoke_permission(
    permission_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Revokes a permission rule with mandatory audit event and blockchain recording."""
    perm = db.query(Permission).filter(Permission.id == permission_id).first()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission record not found")

    patient_profile = db.query(PatientProfile).filter(PatientProfile.id == perm.patient_id).first()
    if current_user.role != "super_admin" and current_user.id != patient_profile.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the patient can revoke access permissions for their records"
        )

    if perm.is_active:
        perm.is_active = False
        blockchain_service.record_permission_revoke(
            db, perm.patient_id, perm.doctor_id, perm.hospital_id
        )
        write_audit(
            db, current_user, "PERMISSION_REVOKE", "SUCCESS", request=request,
            details=f"Revoked permission ID {permission_id} for patient ID {perm.patient_id}"
        )
        db.commit()

    return {"success": True, "message": "Permission successfully revoked"}


@router.post("/consent/revoke/{consent_id}")
async def revoke_consent_grant(
    consent_id: str,
    reason: str = "Patient revoked authorization",
    request: Request = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Explicitly revokes a fine-grained ConsentGrant."""
    grant = db.get(ConsentGrant, consent_id)
    if not grant:
        raise HTTPException(status_code=404, detail="Consent grant not found")

    patient = db.get(PatientProfile, grant.patient_id)
    if current_user.role != "super_admin" and (not patient or patient.user_id != current_user.id):
        raise HTTPException(status_code=403, detail="Only the patient can revoke this consent grant")

    grant.revoked_at = datetime.now(timezone.utc)
    grant.revoked_reason = reason

    write_audit(
        db, current_user, "CONSENT_REVOKE", "SUCCESS", grant.image_id, request,
        f"Consent grant {consent_id} revoked. Reason: {reason}"
    )
    db.commit()
    return {"success": True, "message": "Consent grant successfully revoked"}


@router.post("/emergency-override/{image_id}")
async def emergency_access_override(
    image_id: int,
    justification: str,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Controlled break-glass emergency access endpoint.
    Strictly enforces server-side policy, role eligibility, justification length, and audit.
    """
    image = db.get(MedicalImage, image_id)
    if not image:
        raise HTTPException(status_code=404, detail="Medical image not found")

    authorize_emergency_access(
        db=db,
        user=current_user,
        image=image,
        action="view",
        justification=justification,
        request=request
    )

    return {
        "success": True,
        "message": "Emergency break-glass access authorized and logged to immutable audit trail",
        "image_id": image_id,
        "authorized_user": current_user.username,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/fhir/consent/{permission_id}")
async def get_fhir_consent(
    permission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Exports permission grant as an HL7 FHIR Consent resource."""
    perm = db.query(Permission).filter(Permission.id == permission_id).first()
    if not perm:
        raise HTTPException(status_code=404, detail="Consent record not found")
    from app.fhir import create_fhir_consent
    return create_fhir_consent(
        perm.id,
        perm.patient_id,
        perm.doctor_id or 0,
        perm.is_active,
        perm.expires_at.isoformat() if perm.expires_at else None
    )


@router.get("", response_model=List[PermissionResponse])
async def get_my_permissions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Retrieves all active permissions related to the current user (patient or doctor)."""
    if current_user.role == "patient":
        patient = db.query(PatientProfile).filter(PatientProfile.user_id == current_user.id).first()
        if not patient:
            return []
        return db.query(Permission).filter(
            Permission.patient_id == patient.id,
            Permission.is_active == True
        ).all()

    elif current_user.role == "doctor":
        doctor = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
        if not doctor:
            return []
        return db.query(Permission).filter(
            Permission.doctor_id == doctor.id,
            Permission.is_active == True
        ).all()

    elif current_user.role == "super_admin":
        return db.query(Permission).all()

    else:
        raise HTTPException(status_code=403, detail="Role not authorized to list permissions")
