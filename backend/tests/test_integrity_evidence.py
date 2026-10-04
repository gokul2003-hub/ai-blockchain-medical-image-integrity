import os
import sys
import uuid
import json
import pytest
from datetime import datetime, timezone
from typing import Optional, Tuple
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.database import SessionLocal
from app.models import (
    User, PatientProfile, DoctorProfile, MedicalImage,
    RecoveryRecord, Report, BlockchainTransaction, DigitalIntegrityTwin
)
from app.auth import get_password_hash
from app.blockchain import LocalSimulatedBlockchain
from app.crypto import encrypt_image, sha3_hash
from app.storage_provider import store_encrypted_object

client = TestClient(app)


def _create_user(username: str, role: str, hospital_id: int = 1) -> Tuple[dict, dict, int, Optional[int]]:
    db = SessionLocal()
    patient_id = None
    try:
        user = User(
            username=username,
            email=f"{username}@example.com",
            hashed_password=get_password_hash("Password123!"),
            role=role,
            hospital_id=hospital_id
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        user_id = user.id

        if role == "patient":
            patient = PatientProfile(
                user_id=user.id,
                date_of_birth="1990-01-01",
                blood_group="O+"
            )
            db.add(patient)
            db.commit()
            db.refresh(patient)
            patient_id = patient.id
        elif role in {"doctor", "radiologist"}:
            doc = DoctorProfile(
                user_id=user.id,
                license_number=f"LIC-{user.id}",
                specialization="Radiology"
            )
            db.add(doc)
            db.commit()
    finally:
        db.close()

    login_res = client.post("/api/auth/login", json={"username": username, "password": "Password123!"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return login_res.json(), headers, user_id, patient_id


def _create_test_image(patient_id: int, uploader_id: int, hospital_id: int = 1, tampered: bool = False) -> Tuple[int, str]:
    db = SessionLocal()
    try:
        raw_bytes = b"evidence_scan_data_" + uuid.uuid4().hex.encode()
        enc_bytes, orig_hash, meta_json = encrypt_image(raw_bytes, 7.5)

        stored_bytes = enc_bytes if not tampered else b"corrupted_tampered_bytes_" + enc_bytes[25:]
        file_name = f"test_ev_{uuid.uuid4().hex[:8]}.enc"
        stored_obj = store_encrypted_object(stored_bytes, file_name)

        med_img = MedicalImage(
            title=f"Scan_{uuid.uuid4().hex[:6]}",
            patient_id=patient_id,
            uploader_id=uploader_id,
            hospital_id=hospital_id,
            image_type="MRI",
            file_path=stored_obj.reference,
            original_hash=orig_hash,
            encrypted_hash=sha3_hash(stored_bytes),
            quality_score=0.98,
            entropy=7.5,
            encryption_key_metadata=meta_json,
            quarantine_status=tampered
        )
        db.add(med_img)
        db.commit()
        db.refresh(med_img)

        db.query(BlockchainTransaction).filter(
            BlockchainTransaction.payload.like(f'%"image_id": {med_img.id}%')
        ).delete(synchronize_session=False)
        db.query(RecoveryRecord).filter(RecoveryRecord.image_id == med_img.id).delete(synchronize_session=False)
        db.query(Report).filter(Report.image_id == med_img.id).delete(synchronize_session=False)
        db.commit()

        twin = DigitalIntegrityTwin(
            image_id=med_img.id,
            trusted_hash=orig_hash,
            metadata_json=json.dumps({"modality": "MRI", "dimensions": [256, 256]}),
            provenance_info=json.dumps({"uploader_id": uploader_id, "hospital_id": hospital_id}),
            ipfs_cid=f"QmTestCID{uuid.uuid4().hex[:16]}",
            owner_id=uploader_id,
            verification_status="QUARANTINED" if tampered else "VERIFIED"
        )
        db.add(twin)
        db.commit()

        return med_img.id, orig_hash
    finally:
        db.close()


def test_1_evidence_unauthenticated():
    """Unauthenticated request must be rejected with 401 Unauthorized."""
    res = client.get("/api/images/1/integrity-evidence")
    assert res.status_code == 401


def test_2_evidence_not_found():
    """Requesting non-existent image returns 404."""
    _, admin_headers, _, _ = _create_user(f"admin_{uuid.uuid4().hex[:6]}", "super_admin")
    res = client.get("/api/images/999999/integrity-evidence", headers=admin_headers)
    assert res.status_code == 404


def test_3_evidence_rbac_patient_unauthorized():
    """Patient A cannot access Patient B's image evidence."""
    _, _, admin_id, _ = _create_user(f"admin_{uuid.uuid4().hex[:6]}", "super_admin")
    _, _, _, pat_a_pid = _create_user(f"pat_a_{uuid.uuid4().hex[:6]}", "patient")
    _, pat_b_headers, _, pat_b_pid = _create_user(f"pat_b_{uuid.uuid4().hex[:6]}", "patient")

    img_id, _ = _create_test_image(pat_a_pid, admin_id)

    res = client.get(f"/api/images/{img_id}/integrity-evidence", headers=pat_b_headers)
    assert res.status_code == 403
    assert "Access Denied" in res.json()["detail"]


def test_4_evidence_rbac_patient_own_image():
    """Patient can access evidence for their own image."""
    _, _, admin_id, _ = _create_user(f"admin_{uuid.uuid4().hex[:6]}", "super_admin")
    _, pat_headers, _, pat_pid = _create_user(f"pat_{uuid.uuid4().hex[:6]}", "patient")

    img_id, trusted_hash = _create_test_image(pat_pid, admin_id)

    res = client.get(f"/api/images/{img_id}/integrity-evidence", headers=pat_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["image_id"] == img_id
    assert data["trusted_hash"] == trusted_hash


def test_5_evidence_rbac_super_admin():
    """Super Admin can access any image's evidence."""
    _, admin_headers, admin_id, _ = _create_user(f"admin_{uuid.uuid4().hex[:6]}", "super_admin")
    _, _, _, pat_pid = _create_user(f"pat_{uuid.uuid4().hex[:6]}", "patient")

    img_id, _ = _create_test_image(pat_pid, admin_id)

    res = client.get(f"/api/images/{img_id}/integrity-evidence", headers=admin_headers)
    assert res.status_code == 200


def test_6_evidence_rbac_doctor_cross_hospital_forbidden():
    """Doctor from Hospital 2 cannot access Hospital 1's image without consent."""
    _, _, admin_id, _ = _create_user(f"admin_{uuid.uuid4().hex[:6]}", "super_admin", hospital_id=1)
    _, doc2_headers, _, _ = _create_user(f"doc_{uuid.uuid4().hex[:6]}", "doctor", hospital_id=2)
    _, _, _, pat_pid = _create_user(f"pat_{uuid.uuid4().hex[:6]}", "patient", hospital_id=1)

    img_id, _ = _create_test_image(pat_pid, admin_id, hospital_id=1)

    res = client.get(f"/api/images/{img_id}/integrity-evidence", headers=doc2_headers)
    assert res.status_code == 403


def test_7_evidence_verified_image_chain():
    """Clean verified image returns intact evidence chain."""
    _, admin_headers, admin_id, _ = _create_user(f"admin_{uuid.uuid4().hex[:6]}", "super_admin")
    _, _, _, pat_pid = _create_user(f"pat_{uuid.uuid4().hex[:6]}", "patient")

    img_id, trusted_hash = _create_test_image(pat_pid, admin_id)

    # Mine through the real chain writer. Hand-built rows carry no previous_hash and
    # no SHA-3 content hash, so they break every later link and make
    # /api/blockchain/verify-chain report tampering for an intact ledger.
    db = SessionLocal()
    try:
        tx_hash = LocalSimulatedBlockchain().write_transaction(
            db, "UPLOAD", {"image_id": img_id, "action": "UPLOAD_IMAGE"}
        )
    finally:
        db.close()

    res = client.get(f"/api/images/{img_id}/integrity-evidence", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()

    assert data["hash_algorithm"] == "SHA3-256"
    assert data["trusted_hash"] == trusted_hash
    assert data["current_hash"] == trusted_hash
    assert data["hash_match"] is True
    assert data["verification_status"] == "VERIFIED"

    # Storage evidence
    assert data["storage"]["provider"] == "LOCAL"
    assert data["storage"]["is_local_storage"] is True
    assert not os.path.isabs(data["storage"]["storage_reference"])

    # Digital Twin evidence
    assert data["digital_integrity_twin"] is not None
    assert data["digital_integrity_twin"]["trusted_hash"] == trusted_hash
    assert data["dit_status"] == "VERIFIED"

    # Blockchain evidence
    assert data["blockchain"]["has_blockchain_record"] is True
    assert data["blockchain"]["record_count"] >= 1
    assert data["blockchain_tx_hash"] == tx_hash

    # AI evidence
    assert data["ai_forensics"]["status"] == "NO_TAMPERING_DETECTED"
    assert data["tamper_percentage"] == 0.0

    # Risk and Trust evidence
    assert data["risk_score"] == 0.0
    assert data["trust_score"] >= 80.0


def test_8_evidence_tampered_image_chain():
    """Tampered image reflects hash mismatch and elevated risk."""
    _, admin_headers, admin_id, _ = _create_user(f"admin_{uuid.uuid4().hex[:6]}", "super_admin")
    _, _, _, pat_pid = _create_user(f"pat_{uuid.uuid4().hex[:6]}", "patient")

    img_id, trusted_hash = _create_test_image(pat_pid, admin_id, tampered=True)

    db = SessionLocal()
    try:
        report = Report(
            image_id=img_id,
            generated_by_id=admin_id,
            file_path="PROCESSING",
            status="TAMPERED",
            tampered_percentage=14.5,
            confidence_score=0.92,
            details=json.dumps({"bboxes": [{"x": 10, "y": 10, "width": 30, "height": 30}]}),
            timestamp=datetime.now(timezone.utc)
        )
        db.add(report)
        db.commit()
    finally:
        db.close()

    res = client.get(f"/api/images/{img_id}/integrity-evidence", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()

    assert data["trusted_hash"] == trusted_hash
    assert data["hash_match"] is False
    assert data["verification_status"] in ["TAMPERED", "QUARANTINED"]
    assert data["ai_forensics"]["status"] == "TAMPERED"
    assert data["tamper_percentage"] == 14.5
    assert data["ai_confidence"] == 0.92
    assert len(data["affected_regions"]) == 1

    assert data["risk_score"] > 50.0
    assert data["trust_score"] < 80.0


def test_9_evidence_missing_blockchain_record():
    """Image with no blockchain transactions returns has_blockchain_record == False."""
    _, admin_headers, admin_id, _ = _create_user(f"admin_{uuid.uuid4().hex[:6]}", "super_admin")
    _, _, _, pat_pid = _create_user(f"pat_{uuid.uuid4().hex[:6]}", "patient")

    img_id, _ = _create_test_image(pat_pid, admin_id)

    res = client.get(f"/api/images/{img_id}/integrity-evidence", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()

    assert data["blockchain"]["has_blockchain_record"] is False
    assert data["blockchain"]["record_count"] == 0
    assert data["blockchain_tx_hash"] is None


def test_10_evidence_with_successful_recovery():
    """Image with verified recovery record shows RECOVERED status."""
    _, admin_headers, admin_id, _ = _create_user(f"admin_{uuid.uuid4().hex[:6]}", "super_admin")
    _, _, _, pat_pid = _create_user(f"pat_{uuid.uuid4().hex[:6]}", "patient")

    img_id, trusted_hash = _create_test_image(pat_pid, admin_id)

    db = SessionLocal()
    try:
        rec = RecoveryRecord(
            image_id=img_id,
            triggered_by_id=admin_id,
            tampered_roi_count=2,
            recovered_hash=trusted_hash,
            trusted_hash=trusted_hash,
            verification_passed=True,
            blockchain_tx_hash="0x" + uuid.uuid4().hex + uuid.uuid4().hex,
            timestamp=datetime.now(timezone.utc)
        )
        db.add(rec)
        db.commit()
    finally:
        db.close()

    res = client.get(f"/api/images/{img_id}/integrity-evidence", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()

    assert data["recovery"] is not None
    assert data["recovery"]["status"] == "RECOVERED"
    assert data["recovery"]["verification_passed"] is True
    assert data["post_recovery_hash"] == trusted_hash
    assert data["post_recovery_verified"] is True
    assert data["verification_status"] == "RECOVERED"


def test_11_evidence_with_failed_recovery():
    """Image with failed recovery record shows FAILED recovery status and not RECOVERED."""
    _, admin_headers, admin_id, _ = _create_user(f"admin_{uuid.uuid4().hex[:6]}", "super_admin")
    _, _, _, pat_pid = _create_user(f"pat_{uuid.uuid4().hex[:6]}", "patient")

    img_id, trusted_hash = _create_test_image(pat_pid, admin_id, tampered=True)

    db = SessionLocal()
    try:
        rec = RecoveryRecord(
            image_id=img_id,
            triggered_by_id=admin_id,
            tampered_roi_count=1,
            recovered_hash="wrong_hash_" + "0"*53,
            trusted_hash=trusted_hash,
            verification_passed=False,
            blockchain_tx_hash="0x" + uuid.uuid4().hex + uuid.uuid4().hex,
            timestamp=datetime.now(timezone.utc)
        )
        db.add(rec)
        db.commit()
    finally:
        db.close()

    res = client.get(f"/api/images/{img_id}/integrity-evidence", headers=admin_headers)
    assert res.status_code == 200
    data = res.json()

    assert data["recovery"]["status"] == "FAILED"
    assert data["recovery"]["verification_passed"] is False
    assert data["post_recovery_verified"] is False
    assert data["verification_status"] != "RECOVERED"


def test_12_evidence_no_sensitive_secrets_leaked():
    """Verify response does not expose encryption key metadata, private keys, or passwords."""
    _, admin_headers, admin_id, _ = _create_user(f"admin_{uuid.uuid4().hex[:6]}", "super_admin")
    _, _, _, pat_pid = _create_user(f"pat_{uuid.uuid4().hex[:6]}", "patient")

    img_id, _ = _create_test_image(pat_pid, admin_id)

    res = client.get(f"/api/images/{img_id}/integrity-evidence", headers=admin_headers)
    assert res.status_code == 200
    raw_text = res.text

    assert "encryption_key_metadata" not in raw_text
    assert "hashed_password" not in raw_text
    assert "private_key" not in raw_text
    assert "BLOCKCHAIN_PRIVATE_KEY" not in raw_text
