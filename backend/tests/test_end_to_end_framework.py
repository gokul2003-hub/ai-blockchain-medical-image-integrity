import sys
import os
import pytest
import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Ensure app is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.database import Base
from app.models import User, Hospital, PatientProfile, DoctorProfile, MedicalImage
from app.crypto import encrypt_image, decrypt_image, sha3_hash
from app.digital_twin import create_digital_twin, get_digital_twin, update_twin_status
from app.risk_engine import calculate_tamper_risk_score, calculate_cybersecurity_trust_score
from app.access_policy import evaluate_risk_adaptive_access, ACTION_ALLOW, ACTION_REQUIRE_ZKP, ACTION_QUARANTINE
from app.recovery import recover_compromised_image
from app.ai_model import extract_srm_residual, get_ai_model

@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()

def test_digital_integrity_twin_lifecycle(db_session):
    # Setup test entities
    user = User(username="drtest", email="test@med.org", hashed_password="pass", role="doctor")
    db_session.add(user)
    db_session.commit()

    patient = PatientProfile(user_id=user.id)
    db_session.add(patient)
    db_session.commit()

    img = MedicalImage(
        title="Brain MRI Test",
        patient_id=patient.id,
        uploader_id=user.id,
        hospital_id=1,
        image_type="MRI",
        file_path="QmSimulatedCIDTest123",
        original_hash="0xOriginalHash123",
        encrypted_hash="0xEncryptedHash123",
        quality_score=95.0,
        entropy=7.8,
        encryption_key_metadata="{}"
    )
    db_session.add(img)
    db_session.commit()

    # 1. Create Digital Integrity Twin
    twin = create_digital_twin(
        db=db_session,
        image_id=img.id,
        trusted_hash=img.original_hash,
        ipfs_cid=img.file_path,
        owner_id=user.id,
        metadata_dict={"title": img.title},
        provenance_info={"uploader": user.username}
    )

    assert twin is not None
    assert twin.trusted_hash == img.original_hash
    assert twin.verification_status == "VERIFIED"

    # 2. Query Twin
    retrieved = get_digital_twin(db_session, img.id)
    assert retrieved.id == twin.id

    # 3. Update Twin Status
    updated = update_twin_status(
        db=db_session,
        image_id=img.id,
        status="QUARANTINED",
        event_name="SECURITY_ALERT",
        details="Test quarantine"
    )
    assert updated.verification_status == "QUARANTINED"

def test_risk_and_trust_score_engine():
    # Low Risk scenario
    low_risk = calculate_tamper_risk_score(ai_confidence=0.1, tampered_pixel_pct=0.0, sha3_mismatch=False)
    assert low_risk["category"] == "LOW"
    assert low_risk["total_tamper_risk_score"] <= 30.0

    # High Risk scenario
    high_risk = calculate_tamper_risk_score(ai_confidence=0.9, tampered_pixel_pct=15.0, sha3_mismatch=True, blockchain_mismatch=True)
    assert high_risk["category"] == "HIGH"
    assert high_risk["total_tamper_risk_score"] > 70.0

    # Trust Score calculation
    trust_opt = calculate_cybersecurity_trust_score(integrity_verified=True, blockchain_verified=True, risk_score=5.0)
    assert trust_opt["trust_level"] == "OPTIMAL"
    assert trust_opt["cybersecurity_trust_score"] >= 80.0

    trust_crit = calculate_cybersecurity_trust_score(integrity_verified=False, blockchain_verified=False, risk_score=85.0, is_quarantined=True)
    assert trust_crit["trust_level"] == "CRITICAL"
    assert trust_crit["cybersecurity_trust_score"] < 50.0

def test_risk_adaptive_access_policy(db_session):
    user = User(username="doctor_bob", email="bob@med.org", hashed_password="pass", role="doctor")
    db_session.add(user)
    db_session.commit()

    patient = PatientProfile(user_id=user.id)
    db_session.add(patient)
    db_session.commit()

    img = MedicalImage(
        title="CT Scan Test",
        patient_id=patient.id,
        uploader_id=user.id,
        hospital_id=1,
        image_type="CT",
        file_path="QmTestCID456",
        original_hash="0xHash456",
        encrypted_hash="0xEnc456",
        quality_score=90.0,
        entropy=7.5,
        encryption_key_metadata="{}"
    )
    db_session.add(img)
    db_session.commit()

    create_digital_twin(db_session, img.id, img.original_hash, img.file_path, user.id, {}, {})

    # Test Low Risk -> Allow
    act_low, risk_low, _ = evaluate_risk_adaptive_access(db_session, user, img, ai_confidence=0.1, tampered_pixel_pct=0.0, sha3_mismatch=False)
    assert act_low == ACTION_ALLOW

    # Test High Risk -> Quarantine
    act_high, risk_high, _ = evaluate_risk_adaptive_access(db_session, user, img, ai_confidence=0.95, tampered_pixel_pct=25.0, sha3_mismatch=True, blockchain_mismatch=True)
    assert act_high == ACTION_QUARANTINE
    assert img.quarantine_status is True

def test_srm_residual_extraction():
    # 256x256 test image
    import cv2
    img = np.zeros((256, 256), dtype=np.uint8)
    cv2.circle(img, (128, 128), 50, 200, -1)
    _, png_bytes = cv2.imencode(".png", img)

    srm_png = extract_srm_residual(png_bytes.tobytes())
    assert len(srm_png) > 0
    assert srm_png.startswith(b"\x89PNG")

def test_region_level_self_recovery(db_session):
    user = User(username="dr_alice", email="alice@med.org", hashed_password="pass", role="doctor")
    db_session.add(user)
    db_session.commit()

    patient = PatientProfile(user_id=user.id)
    db_session.add(patient)
    db_session.commit()

    # Generate synthetic brain image and encode to PNG
    import cv2
    from app.ai_model import generate_synthetic_medical_image
    syn_img = generate_synthetic_medical_image()
    _, encoded_png = cv2.imencode(".png", syn_img)
    original_raw = encoded_png.tobytes()
    entropy = 7.5
    enc_bytes, orig_hash, meta_b64 = encrypt_image(original_raw, entropy)

    from app.ipfs import ipfs_client
    ipfs_cid = ipfs_client.upload_bytes(enc_bytes, "test_recovery_scan.enc")

    img = MedicalImage(
        title="XRay Recovery Scan",
        patient_id=patient.id,
        uploader_id=user.id,
        hospital_id=1,
        image_type="XRay",
        file_path=ipfs_cid,
        original_hash=orig_hash,
        encrypted_hash=sha3_hash(enc_bytes),
        quality_score=92.0,
        entropy=entropy,
        encryption_key_metadata=meta_b64,
        quarantine_status=True
    )
    db_session.add(img)
    db_session.commit()

    create_digital_twin(db_session, img.id, orig_hash, ipfs_cid, user.id, {}, {})

    # Execute Region-Level Self-Recovery
    rec_res = recover_compromised_image(db_session, img.id, user.id)

    assert rec_res["success"] is True
    assert rec_res["twin_status"] == "RECOVERED"
    assert rec_res["verification_passed"] is True
    assert img.quarantine_status is False
