"""Server-side Identity Registry for Role-Specific Identity Validation.

This module provides the authoritative server-side identity verification that
prevents self-registration with arbitrary role-specific IDs.

IMPORTANT: This is the single source of truth for identity validation.
Frontend role selection, request-body role, and client-side validation are
never trusted. The backend remains the ultimate authority.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Optional, Any

from sqlalchemy.orm import Session

from app.models import (
    User, Hospital,
    DoctorIdentity, PatientIdentity, ResearcherIdentity, AdminIdentity
)
from app.auth import get_password_hash, validate_password_policy
from app.identity import IdentityProvisioningError, ensure_user_identity
from app.auth import SAFE_PUBLIC_ROLE, PRIVILEGED_ROLES


class RoleIdentityType(str, Enum):
    """Supported role-specific identity types."""
    DOCTOR = "doctor"
    PATIENT = "patient"
    RESEARCHER = "researcher"
    ADMIN = "admin"


class IdentityVerificationStatus(str, Enum):
    """Status of an identity verification attempt."""
    VERIFIED = "verified"
    PENDING = "pending"
    REJECTED = "rejected"
    EXPIRED = "expired"
    ALREADY_REGISTERED = "already_registered"
    INVALID_FORMAT = "invalid_format"
    NOT_FOUND = "not_found"
    INACTIVE = "inactive"
    UNAUTHORIZED_ROLE = "unauthorized_role"


# ID Format Patterns (server-side validation)
ID_PATTERNS = {
    RoleIdentityType.DOCTOR: re.compile(r"^DR-\d{6}$"),
    RoleIdentityType.PATIENT: re.compile(r"^PT-\d{6}$"),
    RoleIdentityType.RESEARCHER: re.compile(r"^RES-\d{6}$"),
    RoleIdentityType.ADMIN: re.compile(r"^ADM-\d{6}$"),
}

# Human-readable format descriptions
ID_FORMAT_DESCRIPTIONS = {
    RoleIdentityType.DOCTOR: "DR-XXXXXX (6 digits)",
    RoleIdentityType.PATIENT: "PT-XXXXXX (6 digits)",
    RoleIdentityType.RESEARCHER: "RES-XXXXXX (6 digits)",
    RoleIdentityType.ADMIN: "ADM-XXXXXX (6 digits)",
}


@dataclass
class IdentityValidationResult:
    """Result of identity validation."""
    success: bool
    status: IdentityVerificationStatus
    message: str
    identity_record: Optional[Any] = None
    user_id: Optional[int] = None


# =============================================================================
# Identity Registry Service
# =============================================================================

class IdentityRegistryService:
    """Central service for role-specific identity validation and registration."""

    def __init__(self, db: Session):
        self.db = db

    def validate_doctor_id(self, doctor_id: str) -> IdentityValidationResult:
        """Validate a doctor ID against the authorized registry."""
        # Format validation
        if not ID_PATTERNS[RoleIdentityType.DOCTOR].match(doctor_id):
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.INVALID_FORMAT,
                message=f"Invalid Doctor ID format. Expected: {ID_FORMAT_DESCRIPTIONS[RoleIdentityType.DOCTOR]}"
            )

        record = self.db.query(DoctorIdentity).filter(
            DoctorIdentity.doctor_id == doctor_id
        ).first()

        if not record:
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.NOT_FOUND,
                message="Unable to verify the supplied identity information."
            )

        if not record.is_active:
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.INACTIVE,
                message="This doctor identity is not active."
            )

        if record.is_registered:
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.ALREADY_REGISTERED,
                message="This identity is already associated with an account."
            )

        return IdentityValidationResult(
            success=True,
            status=IdentityVerificationStatus.VERIFIED,
            message="Identity verified successfully.",
            identity_record=record
        )

    def validate_patient_id(self, patient_id: str) -> IdentityValidationResult:
        """Validate a patient ID against the authorized registry."""
        if not ID_PATTERNS[RoleIdentityType.PATIENT].match(patient_id):
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.INVALID_FORMAT,
                message=f"Invalid Patient ID format. Expected: {ID_FORMAT_DESCRIPTIONS[RoleIdentityType.PATIENT]}"
            )

        record = self.db.query(PatientIdentity).filter(
            PatientIdentity.patient_id == patient_id
        ).first()

        if not record:
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.NOT_FOUND,
                message="Unable to verify the supplied identity information."
            )

        if not record.is_active:
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.INACTIVE,
                message="This patient identity is not active."
            )

        if record.is_registered:
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.ALREADY_REGISTERED,
                message="This identity is already associated with an account."
            )

        return IdentityValidationResult(
            success=True,
            status=IdentityVerificationStatus.VERIFIED,
            message="Identity verified successfully.",
            identity_record=record
        )

    def validate_researcher_id(self, researcher_id: str) -> IdentityValidationResult:
        """Validate a researcher ID against the authorized registry."""
        if not ID_PATTERNS[RoleIdentityType.RESEARCHER].match(researcher_id):
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.INVALID_FORMAT,
                message=f"Invalid Researcher ID format. Expected: {ID_FORMAT_DESCRIPTIONS[RoleIdentityType.RESEARCHER]}"
            )

        record = self.db.query(ResearcherIdentity).filter(
            ResearcherIdentity.researcher_id == researcher_id
        ).first()

        if not record:
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.NOT_FOUND,
                message="Unable to verify the supplied identity information."
            )

        if not record.is_active:
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.INACTIVE,
                message="This researcher identity is not active."
            )

        if record.approval_status != "approved":
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.UNAUTHORIZED_ROLE,
                message="This researcher is not approved for registration."
            )

        if record.is_registered:
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.ALREADY_REGISTERED,
                message="This identity is already associated with an account."
            )

        return IdentityValidationResult(
            success=True,
            status=IdentityVerificationStatus.VERIFIED,
            message="Identity verified successfully.",
            identity_record=record
        )

    def validate_admin_id(self, admin_id: str) -> IdentityValidationResult:
        """Validate an admin ID against the pre-authorized registry."""
        if not ID_PATTERNS[RoleIdentityType.ADMIN].match(admin_id):
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.INVALID_FORMAT,
                message=f"Invalid Admin ID format. Expected: {ID_FORMAT_DESCRIPTIONS[RoleIdentityType.ADMIN]}"
            )

        record = self.db.query(AdminIdentity).filter(
            AdminIdentity.admin_id == admin_id
        ).first()

        if not record:
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.NOT_FOUND,
                message="Unable to verify the supplied identity information."
            )

        if not record.is_active:
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.INACTIVE,
                message="This admin identity is not active."
            )

        if not record.is_pre_provisioned:
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.UNAUTHORIZED_ROLE,
                message="Admin registration requires pre-authorized identity provisioning."
            )

        if record.is_registered:
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.ALREADY_REGISTERED,
                message="This identity is already associated with an account."
            )

        return IdentityValidationResult(
            success=True,
            status=IdentityVerificationStatus.VERIFIED,
            message="Identity verified successfully.",
            identity_record=record
        )

    def validate_identity(self, role: str, identity_id: str) -> IdentityValidationResult:
        """Dispatch identity validation based on role."""
        role_lower = role.lower()

        if role_lower in {"doctor", "radiologist"}:
            return self.validate_doctor_id(identity_id)
        elif role_lower == "patient":
            return self.validate_patient_id(identity_id)
        elif role_lower == "researcher":
            return self.validate_researcher_id(identity_id)
        elif role_lower in {"hospital_admin", "super_admin", "admin"}:
            return self.validate_admin_id(identity_id)
        else:
            return IdentityValidationResult(
                success=False,
                status=IdentityVerificationStatus.UNAUTHORIZED_ROLE,
                message="Invalid role for identity verification."
            )

    def register_identity(self, role: str, identity_id: str, user: User) -> None:
        """Mark an identity as registered and link to user."""
        role_lower = role.lower()

        if role_lower in {"doctor", "radiologist"}:
            record = self.db.query(DoctorIdentity).filter(
                DoctorIdentity.doctor_id == identity_id
            ).first()
            if record:
                record.is_registered = True
                record.registered_user_id = user.id
                record.updated_at = datetime.now(timezone.utc)
        elif role_lower == "patient":
            record = self.db.query(PatientIdentity).filter(
                PatientIdentity.patient_id == identity_id
            ).first()
            if record:
                record.is_registered = True
                record.registered_user_id = user.id
                record.updated_at = datetime.now(timezone.utc)
        elif role_lower == "researcher":
            record = self.db.query(ResearcherIdentity).filter(
                ResearcherIdentity.researcher_id == identity_id
            ).first()
            if record:
                record.is_registered = True
                record.registered_user_id = user.id
                record.updated_at = datetime.now(timezone.utc)
        elif role_lower in {"hospital_admin", "super_admin", "admin"}:
            record = self.db.query(AdminIdentity).filter(
                AdminIdentity.admin_id == identity_id
            ).first()
            if record:
                record.is_registered = True
                record.registered_user_id = user.id
                record.updated_at = datetime.now(timezone.utc)

        self.db.commit()


# =============================================================================
# Registration Schemas
# =============================================================================

from pydantic import BaseModel, EmailStr, Field, validator
from typing import Optional, Literal


class DoctorRegistrationRequest(BaseModel):
    """Doctor registration request. Identity verification is OPTIONAL:
    when omitted the account is still created with the server-assigned role,
    and registry validation is skipped. When provided it must be valid."""
    identity_id: Optional[str] = Field(None, description="Optional Doctor ID (format: DR-XXXXXX)")
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    password: str = Field(min_length=12, max_length=256)
    hospital_id: Optional[int] = None
    specialization: Optional[str] = None
    license_number: Optional[str] = None

    @validator('identity_id')
    def validate_format(cls, v):
        if v and not ID_PATTERNS[RoleIdentityType.DOCTOR].match(v):
            raise ValueError(f"Doctor ID must match format: {ID_FORMAT_DESCRIPTIONS[RoleIdentityType.DOCTOR]}")
        return v


class PatientRegistrationRequest(BaseModel):
    """Patient registration request. Identity verification is OPTIONAL:
    when omitted the account is still created with the server-assigned role,
    and registry validation is skipped. When provided it must be valid."""
    identity_id: Optional[str] = Field(None, description="Optional Patient ID (format: PT-XXXXXX)")
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    password: str = Field(min_length=12, max_length=256)
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None

    @validator('identity_id')
    def validate_format(cls, v):
        if v and not ID_PATTERNS[RoleIdentityType.PATIENT].match(v):
            raise ValueError(f"Patient ID must match format: {ID_FORMAT_DESCRIPTIONS[RoleIdentityType.PATIENT]}")
        return v


class ResearcherRegistrationRequest(BaseModel):
    """Researcher registration request. Identity verification is OPTIONAL:
    when omitted the account is still created with the server-assigned role,
    and registry validation is skipped. When provided it must be valid."""
    identity_id: Optional[str] = Field(None, description="Optional Researcher ID (format: RES-XXXXXX)")
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    password: str = Field(min_length=12, max_length=256)
    institution: str = Field(min_length=2, max_length=255)
    department: Optional[str] = None

    @validator('identity_id')
    def validate_format(cls, v):
        if v and not ID_PATTERNS[RoleIdentityType.RESEARCHER].match(v):
            raise ValueError(f"Researcher ID must match format: {ID_FORMAT_DESCRIPTIONS[RoleIdentityType.RESEARCHER]}")
        return v


class AdminRegistrationRequest(BaseModel):
    """Admin registration request with pre-authorized identity validation."""
    identity_id: str = Field(..., description="Admin ID (format: ADM-XXXXXX)")
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    password: str = Field(min_length=12, max_length=256)
    institution: str = Field(min_length=2, max_length=255)
    role_level: Literal["hospital_admin", "super_admin"] = "hospital_admin"

    @validator('identity_id')
    def validate_format(cls, v):
        if not ID_PATTERNS[RoleIdentityType.ADMIN].match(v):
            raise ValueError(f"Admin ID must match format: {ID_FORMAT_DESCRIPTIONS[RoleIdentityType.ADMIN]}")
        return v


class IdentityVerificationRequest(BaseModel):
    """Request to verify an identity ID before registration."""
    role: Literal["doctor", "radiologist", "patient", "researcher", "hospital_admin", "super_admin", "admin"]
    identity_id: str


class IdentityVerificationResponse(BaseModel):
    """Response from identity verification."""
    success: bool
    status: str
    message: str
    role: str
    identity_id: str
    details: Optional[dict] = None


# =============================================================================
# Utility Functions
# =============================================================================

def get_id_format_description(role: str) -> str:
    """Get the expected ID format description for a role."""
    role_lower = role.lower()
    if role_lower in {"doctor", "radiologist"}:
        return ID_FORMAT_DESCRIPTIONS[RoleIdentityType.DOCTOR]
    elif role_lower == "patient":
        return ID_FORMAT_DESCRIPTIONS[RoleIdentityType.PATIENT]
    elif role_lower == "researcher":
        return ID_FORMAT_DESCRIPTIONS[RoleIdentityType.RESEARCHER]
    elif role_lower in {"hospital_admin", "super_admin", "admin"}:
        return ID_FORMAT_DESCRIPTIONS[RoleIdentityType.ADMIN]
    return "Unknown format"


def validate_id_format(role: str, identity_id: str) -> bool:
    """Quick format validation for a role-specific ID."""
    role_lower = role.lower()
    if role_lower in {"doctor", "radiologist"}:
        return bool(ID_PATTERNS[RoleIdentityType.DOCTOR].match(identity_id))
    elif role_lower == "patient":
        return bool(ID_PATTERNS[RoleIdentityType.PATIENT].match(identity_id))
    elif role_lower == "researcher":
        return bool(ID_PATTERNS[RoleIdentityType.RESEARCHER].match(identity_id))
    elif role_lower in {"hospital_admin", "super_admin", "admin"}:
        return bool(ID_PATTERNS[RoleIdentityType.ADMIN].match(identity_id))
    return False