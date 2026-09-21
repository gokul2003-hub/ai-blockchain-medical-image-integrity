import datetime
import uuid
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, Float, Text, Index, CheckConstraint
from sqlalchemy.orm import relationship
from app.database import Base

class Hospital(Base):
    __tablename__ = "hospitals"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    license_number = Column(String, unique=True, nullable=False)
    address = Column(String, nullable=True)
    contact_email = Column(String, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    # Relationships
    users = relationship("User", back_populates="hospital", cascade="all, delete-orphan")
    images = relationship("MedicalImage", back_populates="hospital", cascade="all, delete-orphan")
    permissions = relationship("Permission", back_populates="hospital", cascade="all, delete-orphan")

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False)  # super_admin, hospital_admin, doctor, radiologist, patient
    mfa_secret = Column(String, nullable=True)
    mfa_enabled = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    # Relationships
    hospital = relationship("Hospital", back_populates="users")
    patient_profile = relationship("PatientProfile", uselist=False, back_populates="user", cascade="all, delete-orphan")
    doctor_profile = relationship("DoctorProfile", uselist=False, back_populates="user", cascade="all, delete-orphan")
    uploaded_images = relationship("MedicalImage", back_populates="uploader", cascade="all, delete-orphan")
    audit_logs = relationship("AuditLog", back_populates="user", cascade="all, delete-orphan")
    reports_generated = relationship("Report", back_populates="generated_by", cascade="all, delete-orphan")

class PatientProfile(Base):
    __tablename__ = "patient_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    date_of_birth = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    blood_group = Column(String, nullable=True)

    # Relationships
    user = relationship("User", back_populates="patient_profile")
    images = relationship("MedicalImage", back_populates="patient", cascade="all, delete-orphan")
    permissions = relationship("Permission", back_populates="patient", cascade="all, delete-orphan")

class DoctorProfile(Base):
    __tablename__ = "doctor_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    specialization = Column(String, nullable=True)
    license_number = Column(String, unique=True, nullable=False)

    # Relationships
    user = relationship("User", back_populates="doctor_profile")
    permissions = relationship("Permission", back_populates="doctor", cascade="all, delete-orphan")

class MedicalImage(Base):
    __tablename__ = "medical_images"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    patient_id = Column(Integer, ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    uploader_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=False, index=True)
    image_type = Column(String, nullable=False)  # MRI, CT, XRay, PET, Ultrasound
    file_path = Column(String, nullable=False)  # Acts as IPFS CID in upgraded system
    original_hash = Column(String, nullable=False, index=True)  # SHA-3 of original preprocessed image
    encrypted_hash = Column(String, nullable=False)  # SHA-3 of encrypted image
    quality_score = Column(Float, nullable=False)
    entropy = Column(Float, nullable=False)
    encryption_key_metadata = Column(Text, nullable=False)  # Encrypted JSON string (AES-GCM metadata)
    quarantine_status = Column(Boolean, default=False, index=True)  # True when flagged as tampered/quarantined
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    # Relationships
    patient = relationship("PatientProfile", back_populates="images")
    uploader = relationship("User", back_populates="uploaded_images")
    hospital = relationship("Hospital", back_populates="images")
    reports = relationship("Report", back_populates="image", cascade="all, delete-orphan")
    digital_twin = relationship("DigitalIntegrityTwin", uselist=False, back_populates="image", cascade="all, delete-orphan")

class Permission(Base):
    __tablename__ = "permissions"
    __table_args__ = (CheckConstraint('expires_at > granted_at', name='chk_expiry_valid'),)

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    doctor_id = Column(Integer, ForeignKey("doctor_profiles.id", ondelete="CASCADE"), nullable=True, index=True)
    hospital_id = Column(Integer, ForeignKey("hospitals.id", ondelete="CASCADE"), nullable=True, index=True)
    access_type = Column(String, nullable=False)  # READ, DOWNLOAD
    is_active = Column(Boolean, default=True, index=True)
    is_emergency = Column(Boolean, default=False)
    granted_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    expires_at = Column(DateTime, nullable=True)
    abac_constraints = Column(String, nullable=True)

    # Relationships
    patient = relationship("PatientProfile", back_populates="permissions")
    doctor = relationship("DoctorProfile", back_populates="permissions")
    hospital = relationship("Hospital", back_populates="permissions")

class BlockchainTransaction(Base):
    __tablename__ = "blockchain_transactions"

    id = Column(Integer, primary_key=True, index=True)
    block_index = Column(Integer, nullable=False, index=True)
    transaction_hash = Column(String, unique=True, index=True, nullable=False)
    type = Column(String, nullable=False, index=True)  # UPLOAD, VERIFY, ACCESS_GRANT, ACCESS_REVOKE, TAMPER_ALERT
    payload = Column(Text, nullable=False)  # JSON representation of transaction details
    timestamp = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    image_id = Column(Integer, ForeignKey("medical_images.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String, nullable=False, index=True)  # LOGIN, LOGOUT, UPLOAD, DOWNLOAD, VERIFY_SUCCESS, VERIFY_FAIL, PERMISSION_CHANGE
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    status = Column(String, nullable=False)  # SUCCESS, FAILED
    details = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), index=True)

    # Relationships
    user = relationship("User", back_populates="audit_logs")
    image = relationship("MedicalImage", backref="audit_logs")

class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, ForeignKey("medical_images.id", ondelete="CASCADE"), nullable=False, index=True)
    generated_by_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    file_path = Column(String, nullable=False)  # PDF report location / IPFS CID
    status = Column(String, nullable=False, index=True)  # VERIFIED, TAMPERED
    tampered_percentage = Column(Float, default=0.0)
    confidence_score = Column(Float, default=1.0)
    details = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    # Relationships
    image = relationship("MedicalImage", back_populates="reports")
    generated_by = relationship("User", back_populates="reports_generated")

# Index for fast lookup on Permissions checks
Index('idx_perm_lookup', Permission.patient_id, Permission.doctor_id, Permission.is_active)

class DicomMetadata(Base):
    __tablename__ = "dicom_metadata_records"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, ForeignKey("medical_images.id", ondelete="CASCADE"), nullable=False, index=True)
    patient_name = Column(String, nullable=True)
    study_instance_uid = Column(String, nullable=True)
    series_instance_uid = Column(String, nullable=True)
    manufacturer = Column(String, nullable=True)
    study_date = Column(String, nullable=True)

    # Relationships
    image = relationship("MedicalImage", backref="dicom_metadata")

class RevocationRegistry(Base):
    __tablename__ = "revocation_registry_logs"

    id = Column(Integer, primary_key=True, index=True)
    vc_id = Column(String, unique=True, index=True, nullable=False)
    revocation_reason = Column(String, nullable=True)
    revoked_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

class DeviceFingerprint(Base):
    __tablename__ = "device_fingerprints"

    id = Column(Integer, primary_key=True, index=True)
    audit_log_id = Column(Integer, ForeignKey("audit_logs.id", ondelete="CASCADE"), nullable=False, index=True)
    browser_hash = Column(String, index=True, nullable=False)
    screen_resolution = Column(String, nullable=True)
    os_platform = Column(String, nullable=True)
    detected_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    # Relationships
    audit_log = relationship("AuditLog", backref="device_fingerprints")

# Composite Index for fast patient modality scans searches
Index('idx_image_lookup', MedicalImage.patient_id, MedicalImage.image_type)

class PHIAccessLog(Base):
    """
    Immutable HIPAA compliance PHI Access Audit trail table.
    Tracks every viewing and extraction of Patient Health Information (PHI).
    """
    __tablename__ = "phi_access_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    patient_id = Column(Integer, ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String, nullable=False, index=True)  # READ, DOWNLOAD, PRINT, OVERRIDE
    phi_fields_exposed = Column(String, nullable=True)   # e.g., "PatientName, BloodGroup, ScanImage"
    access_purpose = Column(String, nullable=False)      # e.g., "CLINICAL_TREATMENT", "EMERGENCY_OVERRIDE"
    ip_address = Column(String, nullable=True)
    signature = Column(String, nullable=True)             # Cryptographic client session signature
    timestamp = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), index=True)

    # Relationships
    user = relationship("User", backref="phi_access_logs")
    patient = relationship("PatientProfile", backref="phi_access_logs")

class DicomSlice(Base):
    """
    DICOM slices table mapping 3D clinical volumetric scan frames (SOP Instances)
    to the parent database image record.
    """
    __tablename__ = "dicom_slices"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, ForeignKey("medical_images.id", ondelete="CASCADE"), nullable=False, index=True)
    slice_index = Column(Integer, nullable=False)
    ipfs_cid = Column(String, nullable=False)
    slice_hash = Column(String, nullable=False)

    # Relationships
    image = relationship("MedicalImage", backref="slices")

class DigitalIntegrityTwin(Base):
    """
    Digital Integrity Twin Model.
    Maintains persistent off-chain verification twin state, trusted original SHA-3 hash,
    IPFS CID, provenance details, region-level integrity maps, and verification history.
    """
    __tablename__ = "digital_integrity_twins"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, ForeignKey("medical_images.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    trusted_hash = Column(String, nullable=False, index=True)
    metadata_json = Column(Text, nullable=False)
    provenance_info = Column(Text, nullable=False)
    ipfs_cid = Column(String, nullable=False)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    verification_status = Column(String, default="VERIFIED", index=True)  # VERIFIED, SUSPECTED_TAMPERING, QUARANTINED, RECOVERED
    region_integrity_map = Column(Text, nullable=True)  # JSON representation of region-level ROI statuses
    verification_history = Column(Text, nullable=True)  # JSON list of past verification events
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), onupdate=lambda: datetime.datetime.now(datetime.timezone.utc))

    # Relationships
    image = relationship("MedicalImage", back_populates="digital_twin")
    owner = relationship("User")

class TamperRiskLog(Base):
    """
    Logs multi-factor Tamper Risk Score & Cybersecurity Trust Score evaluations.
    """
    __tablename__ = "tamper_risk_logs"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, ForeignKey("medical_images.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    risk_score = Column(Float, nullable=False)
    risk_category = Column(String, nullable=False)  # LOW, MEDIUM, HIGH
    trust_score = Column(Float, nullable=False)
    trust_level = Column(String, nullable=False)    # OPTIMAL, GUARDED, CRITICAL
    access_decision = Column(String, nullable=False) # ACTION_ALLOW, ACTION_REQUIRE_ZKP, ACTION_QUARANTINE
    breakdown_json = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), index=True)

class RecoveryRecord(Base):
    """
    Logs region-level self-recovery execution events, ROI parameters, SHA-3 post-recovery checks, and twin updates.
    """
    __tablename__ = "recovery_records"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, ForeignKey("medical_images.id", ondelete="CASCADE"), nullable=False, index=True)
    triggered_by_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tampered_roi_count = Column(Integer, default=0)
    recovered_hash = Column(String, nullable=False)
    trusted_hash = Column(String, nullable=False)
    verification_passed = Column(Boolean, default=False)
    blockchain_tx_hash = Column(String, nullable=True)
    details_json = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), index=True)


# --- Secure-platform entities -------------------------------------------------
# These tables supplement the prototype tables above.  They allow a safe
# migration path for existing demonstration data while new routes use the
# versioned, consent-aware model below.

class UserSecurityState(Base):
    __tablename__ = "user_security_states"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    failed_login_count = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime, nullable=True, index=True)
    token_version = Column(Integer, nullable=False, default=0)
    last_login_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), onupdate=lambda: datetime.datetime.now(datetime.timezone.utc))

    user = relationship("User", backref="security_state", uselist=False)


class MfaCredential(Base):
    __tablename__ = "mfa_credentials"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    encrypted_totp_secret = Column(Text, nullable=False)
    recovery_code_hashes = Column(Text, nullable=False, default="[]")
    enabled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), onupdate=lambda: datetime.datetime.now(datetime.timezone.utc))

    user = relationship("User", backref="mfa_credential", uselist=False)


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id = Column(String(64), primary_key=True, default=lambda: uuid.uuid4().hex)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    refresh_token_hash = Column(String(64), nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True, index=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))

    user = relationship("User", backref="auth_sessions")


class ConsentGrant(Base):
    __tablename__ = "consent_grants"
    __table_args__ = (
        CheckConstraint("starts_at < expires_at", name="chk_consent_valid_period"),
        Index("idx_consent_resource_recipient", "image_id", "recipient_user_id", "revoked_at"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(Integer, ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    image_id = Column(Integer, ForeignKey("medical_images.id", ondelete="CASCADE"), nullable=True, index=True)
    actions_json = Column(Text, nullable=False)  # JSON list: view/download/analyze/share/recover
    purpose = Column(String(128), nullable=False)
    starts_at = Column(DateTime, nullable=False, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    expires_at = Column(DateTime, nullable=False, index=True)
    revoked_at = Column(DateTime, nullable=True, index=True)
    revoked_reason = Column(String(256), nullable=True)
    granted_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), onupdate=lambda: datetime.datetime.now(datetime.timezone.utc))

    patient = relationship("PatientProfile", backref="consent_grants")
    recipient = relationship("User", foreign_keys=[recipient_user_id], backref="received_consents")
    granted_by = relationship("User", foreign_keys=[granted_by_id])
    image = relationship("MedicalImage", backref="consent_grants")


class ImageVersion(Base):
    __tablename__ = "image_versions"
    __table_args__ = (
        Index("idx_image_version_number", "image_id", "version_number", unique=True),
        Index("idx_image_version_integrity", "integrity_status", "created_at"),
    )

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    image_id = Column(Integer, ForeignKey("medical_images.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    parent_version_id = Column(String(36), ForeignKey("image_versions.id", ondelete="SET NULL"), nullable=True)
    content_type = Column(String(128), nullable=False)
    original_filename = Column(String(255), nullable=False)
    storage_provider = Column(String(32), nullable=False)
    storage_reference = Column(String(512), nullable=False, unique=True)
    plaintext_hash = Column(String(64), nullable=False, index=True)
    ciphertext_hash = Column(String(64), nullable=False, index=True)
    metadata_hash = Column(String(64), nullable=False)
    encryption_metadata_json = Column(Text, nullable=False)
    integrity_status = Column(String(32), nullable=False, default="VERIFIED", index=True)
    blockchain_reference = Column(String(128), nullable=True, index=True)
    uploaded_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), index=True)
    verified_at = Column(DateTime, nullable=True)

    image = relationship("MedicalImage", backref="versions")
    parent_version = relationship("ImageVersion", remote_side=[id])
    uploaded_by = relationship("User")


class AIInference(Base):
    __tablename__ = "ai_inferences"
    __table_args__ = (Index("idx_ai_inference_version_status", "image_version_id", "status"),)

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    image_version_id = Column(String(36), ForeignKey("image_versions.id", ondelete="CASCADE"), nullable=False, index=True)
    requested_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(16), nullable=False, default="QUEUED", index=True)  # QUEUED/PROCESSING/COMPLETED/FAILED
    model_version = Column(String(128), nullable=False, default="demo-srm-attention-unet-v1")
    result_json = Column(Text, nullable=True)
    mask_storage_reference = Column(String(512), nullable=True)
    heatmap_storage_reference = Column(String(512), nullable=True)
    error_message = Column(Text, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), index=True)

    image_version = relationship("ImageVersion", backref="ai_inferences")
    requested_by = relationship("User")


class IntegrityEvent(Base):
    __tablename__ = "integrity_events"
    __table_args__ = (Index("idx_integrity_event_version_time", "image_version_id", "created_at"),)

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    image_version_id = Column(String(36), ForeignKey("image_versions.id", ondelete="CASCADE"), nullable=False, index=True)
    actor_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    event_type = Column(String(64), nullable=False, index=True)
    status = Column(String(32), nullable=False)
    details_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=lambda: datetime.datetime.now(datetime.timezone.utc), index=True)

    image_version = relationship("ImageVersion", backref="integrity_events")
    actor = relationship("User")
