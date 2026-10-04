from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from loguru import logger

from app.database import get_db
from app.models import User, PatientProfile, DoctorProfile
from app.schemas import (
    UserResponse,
    DidResponse,
    CredentialResponse,
    CredentialVerificationResponse,
)
from app.auth import get_current_user, RoleChecker
from app.did import verify_credential_detailed
from app.identity import (
    can_access_identity,
    load_user_credential,
    public_credential_view,
    public_identity_view,
)

router = APIRouter(prefix="/users", tags=["Users"])
staff_guard = RoleChecker(["super_admin", "hospital_admin", "doctor"])

@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns the authenticated user's profile without injecting fabricated placeholder data."""
    return current_user

@router.get("/doctors", response_model=List[UserResponse])
async def list_doctors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lists all registered doctors in the system."""
    doctors = db.query(User).filter(User.role == "doctor").all()
    return doctors

@router.get("/patients", response_model=List[UserResponse])
async def list_patients(
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_guard)
):
    """Lists all patients (restricted to hospital staff)."""
    # If hospital admin, only show patients registered under their hospital
    if current_user.role == "hospital_admin":
        patients = db.query(User).filter(
            User.role == "patient",
            User.hospital_id == current_user.hospital_id
        ).all()
    else:
        patients = db.query(User).filter(User.role == "patient").all()
    return patients


# ---------------------------------------------------------------------------
# Decentralized identity (Phase 3)
#
# Every endpoint below resolves the target user and then applies
# can_access_identity(). A request for someone else's credential by URL id alone
# is refused, so changing the id cannot be used to read another user's protected
# credential data.
# ---------------------------------------------------------------------------

def _authorized_target(db: Session, user_id: int, viewer: User) -> User:
    """Load the target user or refuse. Never leaks whether the id exists."""
    target = db.get(User, user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not can_access_identity(viewer, target):
        logger.warning(
            f"Identity read denied: viewer={viewer.id} ({viewer.role}) target={user_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to view this identity",
        )
    return target


@router.get("/{user_id}/did", response_model=DidResponse)
async def get_user_did(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return the public DID document and credential summary for a user.

    Authorization: the account itself, a super_admin, or a hospital_admin within
    the same hospital. Peer doctors and all other roles are refused.
    """
    target = _authorized_target(db, user_id, current_user)
    credential = load_user_credential(target)
    view = public_identity_view(target, credential)
    return DidResponse(**view)


@router.get("/{user_id}/credential", response_model=CredentialResponse)
async def get_user_credential(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Return the system-issued platform role credential summary for a user."""
    target = _authorized_target(db, user_id, current_user)
    credential = load_user_credential(target)
    return CredentialResponse(
        user_id=target.id,
        did=target.did,
        credential=public_credential_view(credential),
        status=target.did_credential_status,
    )


@router.get("/{user_id}/credential/verify", response_model=CredentialVerificationResponse)
async def verify_user_credential(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Verify a stored credential and report the structured verification result.

    Checks the issuer signature, the PQC signature, the expected subject, and
    expiry. A credential that fails verification is reported as invalid rather
    than raising, so the caller can surface the reason.
    """
    target = _authorized_target(db, user_id, current_user)
    credential = load_user_credential(target)

    if credential is None:
        return CredentialVerificationResponse(
            valid=False,
            subject=target.did,
            failure_reasons=["no_credential_issued"],
        )

    expected_subject = target.did or None
    result = verify_credential_detailed(credential, expected_subject=expected_subject)

    # Reuse the existing revocation registry so a revoked credential fails
    # verification here as well as in the image download path.
    credential_id = result.get("credential_id")
    if credential_id:
        from app.models import RevocationRegistry

        revocation = db.query(RevocationRegistry).filter(
            RevocationRegistry.vc_id == credential_id
        ).first()
        if revocation is not None:
            result["valid"] = False
            result["failure_reasons"].append("revoked_credential")

    return CredentialVerificationResponse(**result)
