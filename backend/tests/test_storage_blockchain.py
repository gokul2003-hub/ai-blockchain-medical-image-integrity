import os
import sys
import uuid
import json
import pytest
import numpy as np
import cv2
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app.models import (
    Base, User, Hospital, PatientProfile, MedicalImage,
    DigitalIntegrityTwin, BlockchainTransaction, RecoveryRecord
)
from app.storage_provider import (
    LocalStorageProvider,
    store_encrypted_object,
    load_encrypted_object,
)
from app.blockchain import blockchain_service, LocalSimulatedBlockchain
from app.digital_twin import create_digital_twin, get_digital_twin, update_twin_status
from app.recovery import recover_compromised_image
from app.crypto import encrypt_image, sha3_hash
from app.auth import get_password_hash


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
            name=f"Hospital_{uuid.uuid4().hex[:6]}",
            license_number=f"LIC_{uuid.uuid4().hex[:6]}",
            address="100 Medical Plaza",
            contact_email="admin@hospital.org"
        )
        db.add(h)
        db.commit()
        db.refresh(h)
    return h


@pytest.fixture
def test_patient(db: Session, test_hospital: Hospital):
    uname = f"pat_{uuid.uuid4().hex[:8]}"
    user = User(
        username=uname,
        email=f"{uname}@hospital.org",
        hashed_password=get_password_hash("Password123!"),
        role="patient",
        hospital_id=test_hospital.id,
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    pat_prof = PatientProfile(
        user_id=user.id,
        date_of_birth="1990-01-01",
        gender="Other",
        blood_group="O+",
    )
    db.add(pat_prof)
    db.commit()
    db.refresh(pat_prof)
    return user, pat_prof


def test_local_storage_provider_put_get():
    """Verifies that LocalStorageProvider correctly encrypts/stores and retrieves objects."""
    provider = LocalStorageProvider()
    payload = b"CRITICAL_MEDICAL_IMAGING_ENCRYPTED_PAYLOAD_TEST_BYTES"
    
    stored = provider.put(payload, "test_scan.enc")
    assert stored.provider == "local"
    assert stored.reference.endswith(".enc")
    assert stored.size == len(payload)
    
    # Retrieve object
    retrieved = provider.get(stored.reference)
    assert retrieved == payload


def test_storage_provider_path_traversal_rejection():
    """Verifies that storage provider rejects malicious relative path traversal references."""
    provider = LocalStorageProvider()
    with pytest.raises(ValueError):
        provider.get("../../../etc/passwd")

    with pytest.raises(ValueError):
        provider.get("subfolder/image.enc")


def test_load_encrypted_object_resolution():
    """Verifies that load_encrypted_object resolves references across standard storage locations."""
    payload = b"RADIOLOGY_ARCHIVE_MOCK_PAYLOAD"
    stored = store_encrypted_object(payload, "dicom_archive_slice.enc", provider_name="local")
    
    # Resolves by object reference
    data = load_encrypted_object(stored.reference)
    assert data == payload

    # Rejects empty reference
    with pytest.raises(ValueError):
        load_encrypted_object("")


def test_load_encrypted_object_rejects_arbitrary_filesystem_paths(tmp_path):
    """Ciphertext loader must not read files outside encrypted object storage."""
    secret = tmp_path / "secret.txt"
    secret.write_bytes(b"PLAINTEXT_SHOULD_NOT_BE_READ")
    with pytest.raises(FileNotFoundError):
        load_encrypted_object(str(secret))


def test_local_blockchain_pow_and_persistence(db: Session):
    """Verifies local proof-of-work blockchain ledger and database transaction persistence."""
    chain = LocalSimulatedBlockchain()
    action = "IMAGE_REGISTRATION"
    payload = {
        "image_id": 9999,
        "image_hash": "a" * 64,
        "modality": "CT",
        "patient_uid": "ANON_PATIENT_101",
    }
    
    tx_hash = chain.write_transaction(db, action, payload)
    assert len(tx_hash) == 64
    
    # Verify transaction is in SQLite DB
    tx_row = db.query(BlockchainTransaction).filter(BlockchainTransaction.transaction_hash == tx_hash).first()
    assert tx_row is not None
    assert tx_row.type == action
    assert "IMAGE_REGISTRATION" in tx_row.payload


def test_blockchain_service_record_events(db: Session, test_patient):
    """Verifies high-level blockchain service upload and integrity verification recordings."""
    user, pat_prof = test_patient
    img_hash = sha3_hash(b"SAMPLE_SCAN_CONTENT")
    cid = f"Qm{uuid.uuid4().hex}"
    
    # Record upload
    tx_upload = blockchain_service.record_upload(
        db, image_id=101, image_hash=img_hash, ipfs_cid=cid,
        patient_id=pat_prof.id, uploader_id=user.id
    )
    assert tx_upload is not None
    
    # Record verification
    tx_verify = blockchain_service.record_verification(
        db, image_id=101, status="VERIFIED", details={"method": "SHA3-256", "tamper_detected": False}
    )
    assert tx_verify is not None


def test_digital_integrity_twin_lifecycle(db: Session, test_hospital: Hospital, test_patient):
    """Verifies Digital Integrity Twin creation, state transitions, and audit logs."""
    user, pat_prof = test_patient
    raw_bytes = b"SAMPLE_DICOM_IMAGE_PIXELS_FOR_TWIN"
    enc_bytes, orig_hash, meta_json = encrypt_image(raw_bytes, 7.2)
    cid = f"Qm{uuid.uuid4().hex}"

    med_img = MedicalImage(
        title="Brain MRI Scan",
        patient_id=pat_prof.id,
        uploader_id=user.id,
        hospital_id=test_hospital.id,
        image_type="MRI",
        file_path=cid,
        original_hash=orig_hash,
        encrypted_hash=sha3_hash(enc_bytes),
        quality_score=0.98,
        entropy=7.2,
        encryption_key_metadata=meta_json,
        quarantine_status=False,
    )
    db.add(med_img)
    db.commit()
    db.refresh(med_img)
    
    twin = create_digital_twin(
        db=db,
        image_id=med_img.id,
        trusted_hash=orig_hash,
        ipfs_cid=cid,
        owner_id=user.id,
        metadata_dict={"modality": "MR", "body_part": "BRAIN"},
        provenance_info={"device": "Siemens MAGNETOM 3T", "software": "Syngo.via"},
    )
    assert twin.image_id == med_img.id
    assert twin.verification_status == "VERIFIED"
    assert twin.trusted_hash == orig_hash
    
    # Update status to TAMPERED_QUARANTINED
    updated_twin = update_twin_status(
        db=db,
        image_id=med_img.id,
        status="TAMPERED_QUARANTINED",
        event_name="AI_TAMPER_DETECTED",
        details="SRM Residual filter detected high-frequency splice artifact in quadrant 2",
        region_map=[{"region_id": "ROI_1", "status": "COMPROMISED", "tamper_probability": 0.88}],
    )
    assert updated_twin.verification_status == "TAMPERED_QUARANTINED"
    history = json.loads(updated_twin.verification_history)
    assert len(history) >= 2
    assert history[-1]["event"] == "AI_TAMPER_DETECTED"


def test_region_level_self_recovery_pipeline(db: Session, test_hospital: Hospital, test_patient):
    """
    Verifies end-to-end Region-Level Self-Recovery:
    1. Creates a synthetic test image (grayscale medical phantom).
    2. Encrypts and stores it using AES-256-GCM.
    3. Records MedicalImage and DigitalIntegrityTwin.
    4. Triggers recover_compromised_image.
    5. Confirms ROI restoration, post-recovery SHA-3 hash verification, and quarantine release.
    """
    user, pat_prof = test_patient

    # Create test 128x128 grayscale phantom
    phantom = np.zeros((128, 128), dtype=np.uint8)
    cv2.circle(phantom, (64, 64), 40, 200, -1)
    cv2.circle(phantom, (64, 64), 20, 100, -1)
    _, phantom_png = cv2.imencode(".png", phantom)
    raw_img_bytes = phantom_png.tobytes()

    # Encrypt raw image
    enc_payload, orig_hash, key_meta = encrypt_image(raw_img_bytes, 7.5)
    stored_obj = store_encrypted_object(enc_payload, "test_recovery_scan.enc", provider_name="local")

    # Persist MedicalImage
    med_image = MedicalImage(
        title="Synthetic Phantom Scan",
        patient_id=pat_prof.id,
        uploader_id=user.id,
        hospital_id=test_hospital.id,
        image_type="CT",
        file_path=stored_obj.reference,
        original_hash=orig_hash,
        encrypted_hash=sha3_hash(enc_payload),
        quality_score=0.99,
        entropy=7.5,
        encryption_key_metadata=key_meta,
        quarantine_status=True,  # Initially quarantined due to tamper
    )
    db.add(med_image)
    db.commit()
    db.refresh(med_image)

    # Persist Digital Integrity Twin
    twin = create_digital_twin(
        db=db,
        image_id=med_image.id,
        trusted_hash=orig_hash,
        ipfs_cid=stored_obj.reference,
        owner_id=user.id,
        metadata_dict={"type": "PHANTOM_SIMULATION"},
        provenance_info={"source": "UNIT_TEST_RECOVERY"},
    )

    # Execute Region-Level Self-Recovery
    result = recover_compromised_image(db, med_image.id, user.id)

    # Assert recovery outcome
    assert result["success"] is True
    assert result["verification_passed"] is True
    assert result["twin_status"] == "RECOVERED"
    assert result["recovered_hash"] == orig_hash
    assert result["recovered_image_base64"].startswith("data:image/png;base64,")

    # Verify database state was updated
    db.refresh(med_image)
    assert med_image.quarantine_status is False  # Restored from quarantine

    db.refresh(twin)
    assert twin.verification_status == "RECOVERED"

    # Verify recovery record was logged
    rec_log = db.query(RecoveryRecord).filter(RecoveryRecord.image_id == med_image.id).first()
    assert rec_log is not None
    assert rec_log.verification_passed is True
    assert rec_log.recovered_hash == orig_hash
