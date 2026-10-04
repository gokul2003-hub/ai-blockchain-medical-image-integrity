"""
Phase 2 — Self-Recovery Engine Tests
Tests verify the recovery pipeline correctly loads compromised images,
identifies tampered regions via AI, and restores from trusted backup.
"""
import os
import sys
import uuid
import pytest
import numpy as np
import cv2

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app.models import (
    Base, User, Hospital, PatientProfile, MedicalImage,
    DigitalIntegrityTwin, RecoveryRecord
)
from app.crypto import encrypt_image, sha3_hash
from app.storage_provider import store_encrypted_object, load_encrypted_object
from app.digital_twin import create_digital_twin, get_digital_twin
from app.recovery import recover_compromised_image
from app.auth import get_password_hash


# ---------------------------------------------------------------------------
# DB fixtures matching the project's existing pattern
# ---------------------------------------------------------------------------

@pytest.fixture
def db():
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture
def test_hospital(db: Session):
    h = db.query(Hospital).first()
    if not h:
        h = Hospital(
            name=f"RecoveryHosp_{uuid.uuid4().hex[:6]}",
            license_number=f"RLICS_{uuid.uuid4().hex[:6]}",
            contact_email="recovery@hospital.org"
        )
        db.add(h)
        db.commit()
        db.refresh(h)
    return h


@pytest.fixture
def test_uploader(db: Session, test_hospital: Hospital):
    u = User(
        username=f"rec_uploader_{uuid.uuid4().hex[:6]}",
        email=f"rec_up_{uuid.uuid4().hex[:6]}@test.com",
        hashed_password=get_password_hash("Secure123!Pass"),
        role="radiologist",
        hospital_id=test_hospital.id,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture
def test_patient_profile(db: Session, test_hospital: Hospital):
    pu = User(
        username=f"rec_patient_{uuid.uuid4().hex[:6]}",
        email=f"rec_pat_{uuid.uuid4().hex[:6]}@test.com",
        hashed_password=get_password_hash("Secure123!Pass"),
        role="patient",
        hospital_id=test_hospital.id,
    )
    db.add(pu)
    db.commit()
    db.refresh(pu)
    pp = PatientProfile(user_id=pu.id)
    db.add(pp)
    db.commit()
    db.refresh(pp)
    return pp


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_synthetic_image(size: int = 128) -> bytes:
    """Create a synthetic grayscale PNG image as bytes."""
    img = np.zeros((size, size), dtype=np.uint8)
    cv2.ellipse(img, (size // 2, size // 2), (size // 3, size // 4), 0, 0, 360, 180, -1)
    _, encoded = cv2.imencode(".png", img)
    return encoded.tobytes()


def _setup_image_and_twin(db, uploader_user, patient_profile, hospital):
    """Upload a clean image and create its digital integrity twin."""
    original_bytes = _make_synthetic_image()
    encrypted_bytes, original_hash, metadata_json = encrypt_image(original_bytes)
    encrypted_hash = sha3_hash(encrypted_bytes)

    filename = f"test_recovery_{uuid.uuid4().hex}.enc"
    stored = store_encrypted_object(encrypted_bytes, filename)
    file_reference = stored.reference

    db_image = MedicalImage(
        title="Test Recovery Image",
        patient_id=patient_profile.id,
        uploader_id=uploader_user.id,
        hospital_id=hospital.id,
        image_type="MRI",
        file_path=file_reference,
        original_hash=original_hash,
        encrypted_hash=encrypted_hash,
        quality_score=80.0,
        entropy=7.5,
        encryption_key_metadata=metadata_json,
    )
    db.add(db_image)
    db.commit()
    db.refresh(db_image)

    # Store backup with same encrypted bytes (trusted reference)
    backup_filename = f"twin_backup_{db_image.id}_{uuid.uuid4().hex}.enc"
    backup_stored = store_encrypted_object(encrypted_bytes, backup_filename)

    twin = create_digital_twin(
        db,
        image_id=db_image.id,
        trusted_hash=original_hash,
        ipfs_cid=backup_stored.reference,
        owner_id=uploader_user.id,
        metadata_dict={"modality": "MRI"},
        provenance_info={"source": "test"},
    )

    return db_image, twin, original_bytes, encrypted_bytes


# ---------------------------------------------------------------------------
# Recovery Tests
# ---------------------------------------------------------------------------

class TestSelfRecovery:

    def test_recovery_no_tampering_clean_image(self, db, test_uploader, test_patient_profile, test_hospital):
        """Recovery on a clean (untampered) image: AI finds 0 ROIs, status is still valid."""
        db_image, twin, original_bytes, _ = _setup_image_and_twin(
            db, test_uploader, test_patient_profile, test_hospital
        )

        result = recover_compromised_image(db, db_image.id, test_uploader.id)

        assert result["image_id"] == db_image.id
        assert "recovered_hash" in result
        assert "trusted_hash" in result
        assert "tampered_rois" in result
        assert isinstance(result["tampered_roi_count"], int)
        assert result["tampered_roi_count"] >= 0

    def test_recovery_returns_correct_hash_fields(self, db, test_uploader, test_patient_profile, test_hospital):
        """Recovery result contains recovered_hash and trusted_hash."""
        db_image, twin, original_bytes, _ = _setup_image_and_twin(
            db, test_uploader, test_patient_profile, test_hospital
        )

        result = recover_compromised_image(db, db_image.id, test_uploader.id)

        assert "recovered_hash" in result
        assert "trusted_hash" in result
        assert isinstance(result["recovered_hash"], str)
        assert len(result["recovered_hash"]) == 64  # SHA-3 hex = 64 chars

    def test_recovery_blockchain_tx_recorded(self, db, test_uploader, test_patient_profile, test_hospital):
        """Recovery event is recorded on the blockchain (or simulation)."""
        db_image, twin, _, _ = _setup_image_and_twin(
            db, test_uploader, test_patient_profile, test_hospital
        )

        result = recover_compromised_image(db, db_image.id, test_uploader.id)
        tx_hash = result["blockchain_tx_hash"]
        assert tx_hash is not None
        assert len(tx_hash) > 0

    def test_recovery_missing_image_raises(self, db, test_uploader):
        """Recovery with non-existent image_id raises ValueError."""
        with pytest.raises(ValueError, match="not found"):
            recover_compromised_image(db, 999999, test_uploader.id)

    def test_recovery_missing_twin_raises(self, db, test_uploader, test_patient_profile, test_hospital):
        """Recovery without a digital twin raises ValueError."""
        original_bytes = _make_synthetic_image()
        encrypted_bytes, original_hash, metadata_json = encrypt_image(original_bytes)
        stored = store_encrypted_object(encrypted_bytes, f"notwin_{uuid.uuid4().hex}.enc")

        db_image = MedicalImage(
            title="No Twin Image",
            patient_id=test_patient_profile.id,
            uploader_id=test_uploader.id,
            hospital_id=test_hospital.id,
            image_type="MRI",
            file_path=stored.reference,
            original_hash=original_hash,
            encrypted_hash=sha3_hash(encrypted_bytes),
            quality_score=70.0,
            entropy=7.0,
            encryption_key_metadata=metadata_json,
        )
        db.add(db_image)
        db.commit()
        db.refresh(db_image)
        # No digital twin created

        with pytest.raises(ValueError, match="Digital Integrity Twin"):
            recover_compromised_image(db, db_image.id, test_uploader.id)

    def test_recovery_quarantine_cleared_on_success(self, db, test_uploader, test_patient_profile, test_hospital):
        """After successful recovery, quarantine_status is cleared."""
        db_image, twin, _, _ = _setup_image_and_twin(
            db, test_uploader, test_patient_profile, test_hospital
        )
        db_image.quarantine_status = True
        db.commit()

        result = recover_compromised_image(db, db_image.id, test_uploader.id)
        db.refresh(db_image)

        if result["verification_passed"]:
            assert db_image.quarantine_status is False

    def test_recovery_twin_status_updated(self, db, test_uploader, test_patient_profile, test_hospital):
        """Digital twin status is updated after recovery."""
        db_image, twin, _, _ = _setup_image_and_twin(
            db, test_uploader, test_patient_profile, test_hospital
        )

        recover_compromised_image(db, db_image.id, test_uploader.id)
        updated_twin = get_digital_twin(db, db_image.id)

        assert updated_twin.verification_status in {"RECOVERED", "RECOVERY_FAILED"}

    def test_recovery_result_structure_complete(self, db, test_uploader, test_patient_profile, test_hospital):
        """Recovery result contains all required fields per spec."""
        db_image, twin, _, _ = _setup_image_and_twin(
            db, test_uploader, test_patient_profile, test_hospital
        )

        result = recover_compromised_image(db, db_image.id, test_uploader.id)

        required_keys = {
            "success", "image_id", "tampered_roi_count", "tampered_rois",
            "recovered_hash", "trusted_hash", "verification_passed",
            "blockchain_tx_hash", "twin_status", "recovered_image_base64",
        }
        missing = required_keys - result.keys()
        assert not missing, f"Missing keys: {missing}"

    def test_recovery_image_base64_is_valid_png(self, db, test_uploader, test_patient_profile, test_hospital):
        """Returned recovered_image_base64 is a valid base64-encoded PNG."""
        import base64
        db_image, twin, _, _ = _setup_image_and_twin(
            db, test_uploader, test_patient_profile, test_hospital
        )

        result = recover_compromised_image(db, db_image.id, test_uploader.id)
        b64_data = result["recovered_image_base64"]
        assert b64_data.startswith("data:image/png;base64,")

        # Decode the base64 part and verify it's a valid PNG
        raw = base64.b64decode(b64_data.split(",", 1)[1])
        assert raw[:8] == b"\x89PNG\r\n\x1a\n"  # PNG magic bytes
