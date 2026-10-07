from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Literal, Dict, Any
from datetime import datetime

# --- Token Schemas ---
class Token(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str
    role: str
    username: str
    mfa_enabled: bool

class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None

class LoginRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=1, max_length=256)
    mfa_code: Optional[str] = None

# --- Profile Schemas ---
class PatientProfileCreate(BaseModel):
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None

class PatientProfileResponse(BaseModel):
    id: int
    date_of_birth: Optional[str] = None
    gender: Optional[str] = None
    blood_group: Optional[str] = None
    class Config:
        from_attributes = True

class DoctorProfileCreate(BaseModel):
    specialization: Optional[str] = None
    license_number: str

class DoctorProfileResponse(BaseModel):
    id: int
    specialization: Optional[str] = None
    license_number: str
    class Config:
        from_attributes = True

# --- User Schemas ---
class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str  # super_admin, hospital_admin, doctor, radiologist, patient
    hospital_id: Optional[int] = None
    patient_profile: Optional[PatientProfileCreate] = None
    doctor_profile: Optional[DoctorProfileCreate] = None

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    mfa_enabled: bool
    is_active: bool
    hospital_id: Optional[int] = None
    created_at: datetime
    patient_profile: Optional[PatientProfileResponse] = None
    doctor_profile: Optional[DoctorProfileResponse] = None
    # Public decentralized identity. Never includes key material.
    did: Optional[str] = None
    did_created_at: Optional[datetime] = None
    class Config:
        from_attributes = True


# --- Decentralized Identity Schemas (Phase 3) ---

class CredentialSummary(BaseModel):
    """Public credential projection. Contains no signing material."""

    credential_id: Optional[str] = None
    credential_type: Optional[str] = None
    issuer: Optional[str] = None
    subject: Optional[str] = None
    issued_at: Optional[str] = None
    expires_at: Optional[str] = None
    role: Optional[str] = None
    attestation: Optional[str] = None
    external_verification: Optional[str] = None
    medical_license_claimed: bool = False
    verification_method: Optional[str] = None
    proof_type: Optional[str] = None


class DidResponse(BaseModel):
    user_id: int
    username: str
    role: str
    did: Optional[str] = None
    did_document: Optional[dict] = None
    verification_method: Optional[str] = None
    did_created_at: Optional[str] = None
    credential: Optional[CredentialSummary] = None


class CredentialResponse(BaseModel):
    user_id: int
    did: Optional[str] = None
    credential: Optional[CredentialSummary] = None
    status: Optional[str] = None


class CredentialVerificationResponse(BaseModel):
    valid: bool
    credential_id: Optional[str] = None
    issuer: Optional[str] = None
    subject: Optional[str] = None
    issued_at: Optional[str] = None
    expires_at: Optional[str] = None
    verification_method: Optional[str] = None
    credential_type: Optional[str] = None
    attestation: Optional[str] = None
    external_verification: Optional[str] = None
    signature_valid: bool = False
    pqc_signature_valid: bool = False
    failure_reasons: List[str] = []

# --- Hospital Schemas ---
class HospitalCreate(BaseModel):
    name: str
    license_number: str
    address: Optional[str] = None
    contact_email: EmailStr

class HospitalResponse(BaseModel):
    id: int
    name: str
    license_number: str
    address: Optional[str] = None
    contact_email: str
    created_at: datetime
    class Config:
        from_attributes = True

# --- Permission Schemas ---
class PermissionCreate(BaseModel):
    patient_id: int
    doctor_id: Optional[int] = None
    hospital_id: Optional[int] = None
    access_type: str  # READ, DOWNLOAD
    expires_in_hours: Optional[int] = None
    is_emergency: Optional[bool] = False
    abac_constraints: Optional[str] = None

class PermissionResponse(BaseModel):
    id: int
    patient_id: int
    doctor_id: Optional[int] = None
    hospital_id: Optional[int] = None
    access_type: str
    is_active: bool
    is_emergency: bool
    granted_at: datetime
    expires_at: Optional[datetime] = None
    abac_constraints: Optional[str] = None
    class Config:
        from_attributes = True

# --- Medical Image Schemas ---
class MedicalImageResponse(BaseModel):
    id: int
    title: str
    patient_id: int
    uploader_id: int
    hospital_id: int
    image_type: str
    quality_score: float
    entropy: float
    created_at: datetime
    # Integrity fields (real DB columns exposed so the frontend can render
    # actual trusted-hash + quarantine state instead of undefined values)
    original_hash: str
    quarantine_status: bool = False
    class Config:
        from_attributes = True

class ImageVerifyResponse(BaseModel):
    status: str  # VERIFIED, TAMPERED
    original_hash: str
    current_hash: str
    tampered_percentage: Optional[float] = 0.0
    confidence_score: Optional[float] = 1.0
    heatmap_url: Optional[str] = None
    report_id: Optional[int] = None

# --- Audit & Transaction Schemas ---
class AuditLogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    action: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    status: str
    details: Optional[str] = None
    timestamp: datetime
    class Config:
        from_attributes = True

class BlockchainTransactionResponse(BaseModel):
    id: int
    block_index: int
    transaction_hash: str
    type: str
    payload: str
    timestamp: datetime
    class Config:
        from_attributes = True

# --- Dashboard & Analytics Schemas ---
class DashboardStats(BaseModel):
    total_hospitals: int
    total_doctors: int
    total_images: int
    total_transactions: int
    verified_images: int
    tampered_images: int
    active_users: int
    failed_logins: int
    security_alerts: int

class UploadStat(BaseModel):
    date: str
    count: int

class TamperStat(BaseModel):
    month: str
    tampered: int
    verified: int

class AccessStat(BaseModel):
    role: str
    count: int

class AnalyticsDashboardData(BaseModel):
    stats: DashboardStats
    daily_uploads: List[UploadStat]
    tampering_statistics: List[TamperStat]
    access_statistics: List[AccessStat]


# --- Secure v2 API schemas ----------------------------------------------------

class PublicRegistration(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    password: str = Field(min_length=12, max_length=256)
    patient_profile: Optional[PatientProfileCreate] = None


class AdminUserProvision(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    email: EmailStr
    password: str = Field(min_length=12, max_length=256)
    role: Literal["hospital_admin", "doctor", "radiologist", "researcher"]
    hospital_id: Optional[int] = None
    doctor_profile: Optional[DoctorProfileCreate] = None


class RefreshRequest(BaseModel):
    refresh_token: Optional[str] = Field(default=None, min_length=20)


class MfaConfirmRequest(BaseModel):
    code: str = Field(min_length=6, max_length=32)


class MfaSetupResponse(BaseModel):
    secret: str
    totp_uri: str
    recovery_codes: List[str]


class ConsentCreate(BaseModel):
    recipient_user_id: int
    image_id: Optional[int] = None
    actions: List[Literal["view", "download", "analyze", "share", "recover"]] = Field(min_length=1)
    purpose: str = Field(min_length=3, max_length=128)
    starts_at: Optional[datetime] = None
    expires_at: datetime


class ConsentResponseV2(BaseModel):
    id: str
    patient_id: int
    recipient_user_id: int
    image_id: Optional[int]
    actions: List[str]
    purpose: str
    starts_at: datetime
    expires_at: datetime
    revoked_at: Optional[datetime]
    created_at: datetime


class ImageVersionResponse(BaseModel):
    id: str
    version_number: int
    content_type: str
    storage_provider: str
    integrity_status: str
    plaintext_hash: str
    ciphertext_hash: str
    metadata_hash: str
    blockchain_reference: Optional[str]
    created_at: datetime
    verified_at: Optional[datetime]


class ImageResponseV2(BaseModel):
    id: int
    title: str
    patient_id: int
    image_type: str
    quality_score: float
    integrity_status: str
    latest_version: Optional[ImageVersionResponse] = None


class InferenceResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    id: str
    status: str
    model_version: str
    result: Optional[dict] = None
    error_message: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None


class RecoveryRecordItem(BaseModel):
    recovery_id: str
    image_id: int
    user_id: int
    created_at: str
    status: str
    original_hash: str
    recovered_hash: str
    hash_match: bool
    affected_regions: List[Dict[str, Any]] = []
    recovery_method: str
    verification_status: str
    blockchain_transaction: Optional[str] = None
    error_message: Optional[str] = None


class RecoveryRecordListResponse(BaseModel):
    items: List[RecoveryRecordItem]
    total: int
    page: int
    page_size: int


class IntegrityEvidenceResponse(BaseModel):
    image_id: int
    image_name: str
    image_type: str
    created_at: Optional[str] = None
    original_dimensions: Optional[List[int]] = None
    file_size_bytes: Optional[int] = None

    # Hash Evidence
    hash_algorithm: str = "SHA3-256"
    trusted_hash: str
    current_hash: Optional[str] = None
    hash_match: Optional[bool] = None
    verification_status: str
    verification_timestamp: Optional[str] = None
    # Why a preview/decrypt is unavailable, in the backend's own words.
    # "Stored encrypted object is missing" vs "ciphertext cannot be
    # authenticated with the current platform key" are different real states and
    # are never conflated.
    preview_unavailable_reason: Optional[str] = None

    # Digital Integrity Twin Evidence
    digital_integrity_twin: Optional[Dict[str, Any]] = None
    dit_status: Optional[str] = None

    # Storage Evidence
    # Dict shape: {provider, storage_reference, is_local_storage, reference_label,
    #              pin_confirmed (bool when IPFS, null when LOCAL)}
    storage: Dict[str, Any]
    storage_provider: str
    storage_reference: str
    is_local_storage: bool

    # Blockchain Evidence
    blockchain: Dict[str, Any]
    blockchain_tx_hash: Optional[str] = None
    blockchain_network: str
    blockchain_block: Optional[int] = None
    blockchain_timestamp: Optional[str] = None

    # AI Forensic Evidence
    ai_forensics: Optional[Dict[str, Any]] = None
    affected_regions: List[Dict[str, Any]] = []
    tamper_percentage: float = 0.0
    ai_model: Optional[str] = None
    ai_confidence: Optional[float] = None

    # Risk and Trust Evidence
    risk_score: Optional[float] = None
    trust_score: Optional[float] = None
    risk_and_trust: Optional[Dict[str, Any]] = None

    # Recovery Evidence
    recovery_status: Optional[str] = None
    recovery_record_id: Optional[int] = None
    recovery: Optional[Dict[str, Any]] = None
    post_recovery_hash: Optional[str] = None
    post_recovery_verified: Optional[bool] = None

    # Forensic Report Evidence
    forensic_report_id: Optional[int] = None
    forensic_report_status: Optional[str] = None
    forensic_report: Optional[Dict[str, Any]] = None

    # Audit Trail
    audit_events: List[Dict[str, Any]] = []

