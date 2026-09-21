from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Literal
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
    class Config:
        from_attributes = True

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
