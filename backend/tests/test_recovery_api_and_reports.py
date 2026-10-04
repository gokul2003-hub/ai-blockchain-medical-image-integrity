import os
import sys
import uuid
import json
import pytest
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.database import SessionLocal
from app.models import (
    User, Hospital, PatientProfile, DoctorProfile, MedicalImage,
    RecoveryRecord, Report, BlockchainTransaction
)
from app.auth import get_password_hash
from app.crypto import encrypt_image, sha3_hash
from app.report import generate_forensic_pdf
from app.config import REPORTS_DIR

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
                specialization="Radiology",
                is_active_practice=True
            )
            db.add(doc)
            db.commit()
    finally:
        db.close()

    login_res = client.post("/api/auth/login", json={"username": username, "password": "Password123!"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return login_res.json(), headers, user_id, patient_id


def _create_mock_image(patient_id: int, uploader_id: int, hospital_id: int = 1) -> int:
    db = SessionLocal()
    try:
        raw_bytes = b"scan_test_bytes_" + uuid.uuid4().hex.encode()
        enc_bytes, orig_hash, meta_json = encrypt_image(raw_bytes, 7.5)
        med_img = MedicalImage(
            title=f"Scan_{uuid.uuid4().hex[:6]}",
            patient_id=patient_id,
            uploader_id=uploader_id,
            hospital_id=hospital_id,
            image_type="CT",
            file_path=f"storage/objects/test_{uuid.uuid4().hex[:8]}.enc",
            original_hash=orig_hash,
            encrypted_hash=sha3_hash(enc_bytes),
            quality_score=0.95,
            entropy=7.5,
            encryption_key_metadata=meta_json
        )
        db.add(med_img)
        db.commit()
        db.refresh(med_img)
        return med_img.id
    finally:
        db.close()


def test_1_recovery_record_api_returns_records():
    """1. RecoveryRecord API returns records for an authorized user."""
    _, a_headers, admin_id, _ = _create_user(f"admin_rec_{uuid.uuid4().hex[:6]}", "super_admin")
    _, _, _, pat_pid = _create_user(f"pat_rec_{uuid.uuid4().hex[:6]}", "patient")

    img_id = _create_mock_image(pat_pid, admin_id)

    db = SessionLocal()
    try:
        rec = RecoveryRecord(
            image_id=img_id,
            triggered_by_id=admin_id,
            tampered_roi_count=1,
            recovered_hash="a"*64,
            trusted_hash="a"*64,
            verification_passed=True,
            blockchain_tx_hash="0x" + "1"*64,
            details_json=json.dumps({"tampered_rois": [{"x": 10, "y": 10, "width": 20, "height": 20}]}),
            timestamp=datetime.now(timezone.utc)
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)
        rec_id = str(rec.id)
    finally:
        db.close()

    res = client.get(f"/api/images/recovery-records?image_id={img_id}", headers=a_headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["total"] >= 1
    assert any(item["recovery_id"] == rec_id for item in data["items"])


def test_2_empty_recovery_history():
    """2. Empty recovery history returns empty list with 0 total."""
    _, a_headers, _, _ = _create_user(f"admin_empty_{uuid.uuid4().hex[:6]}", "super_admin")
    res = client.get("/api/images/recovery-records?image_id=9999999", headers=a_headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["items"] == []
    assert data["total"] == 0
    assert data["page"] == 1


def test_3_image_id_filtering():
    """3. Filters accurately by image_id."""
    _, a_headers, admin_id, _ = _create_user(f"admin_filt_{uuid.uuid4().hex[:6]}", "super_admin")
    _, _, _, pat_pid = _create_user(f"pat_filt_{uuid.uuid4().hex[:6]}", "patient")

    img1_id = _create_mock_image(pat_pid, admin_id)
    img2_id = _create_mock_image(pat_pid, admin_id)

    db = SessionLocal()
    try:
        rec1 = RecoveryRecord(
            image_id=img1_id,
            triggered_by_id=admin_id,
            tampered_roi_count=1,
            recovered_hash="b"*64,
            trusted_hash="b"*64,
            verification_passed=True,
            blockchain_tx_hash="0x" + "2"*64,
            details_json=json.dumps({"tampered_rois": []}),
            timestamp=datetime.now(timezone.utc)
        )
        rec2 = RecoveryRecord(
            image_id=img2_id,
            triggered_by_id=admin_id,
            tampered_roi_count=2,
            recovered_hash="c"*64,
            trusted_hash="c"*64,
            verification_passed=True,
            blockchain_tx_hash="0x" + "3"*64,
            details_json=json.dumps({"tampered_rois": []}),
            timestamp=datetime.now(timezone.utc)
        )
        db.add_all([rec1, rec2])
        db.commit()
    finally:
        db.close()

    res1 = client.get(f"/api/images/recovery-records?image_id={img1_id}", headers=a_headers)
    assert res1.status_code == 200
    for item in res1.json()["items"]:
        assert item["image_id"] == img1_id


def test_4_user_authorization_scoping():
    """4. Patients cannot see recovery records belonging to other patients."""
    _, p1_headers, _, _ = _create_user(f"pat_scope1_{uuid.uuid4().hex[:6]}", "patient")
    _, _, _, p2_pid = _create_user(f"pat_scope2_{uuid.uuid4().hex[:6]}", "patient")
    _, _, admin_id, _ = _create_user(f"admin_scope_{uuid.uuid4().hex[:6]}", "super_admin")

    img_p2_id = _create_mock_image(p2_pid, admin_id)

    db = SessionLocal()
    try:
        rec_p2 = RecoveryRecord(
            image_id=img_p2_id,
            triggered_by_id=admin_id,
            tampered_roi_count=1,
            recovered_hash="d"*64,
            trusted_hash="d"*64,
            verification_passed=True,
            blockchain_tx_hash="0x" + "4"*64,
            details_json=json.dumps({"tampered_rois": []}),
            timestamp=datetime.now(timezone.utc)
        )
        db.add(rec_p2)
        db.commit()
    finally:
        db.close()

    # Patient 1 attempts to query Patient 2's recovery records
    res = client.get(f"/api/images/recovery-records?image_id={img_p2_id}", headers=p1_headers)
    assert res.status_code == 200
    # Patient 1 must receive empty results for an image that does not belong to them
    assert res.json()["total"] == 0
    assert len(res.json()["items"]) == 0


def test_5_pagination():
    """5. Validates pagination limits, page, page_size, and total count."""
    _, a_headers, admin_id, _ = _create_user(f"admin_page_{uuid.uuid4().hex[:6]}", "super_admin")
    _, _, _, pat_pid = _create_user(f"pat_page_{uuid.uuid4().hex[:6]}", "patient")

    img_id = _create_mock_image(pat_pid, admin_id)

    db = SessionLocal()
    try:
        for i in range(5):
            rec = RecoveryRecord(
                image_id=img_id,
                triggered_by_id=admin_id,
                tampered_roi_count=i,
                recovered_hash=f"hash_{i}_" + "0"*50,
                trusted_hash=f"hash_{i}_" + "0"*50,
                verification_passed=True,
                blockchain_tx_hash=f"0x{i}" + "0"*60,
                details_json=json.dumps({"tampered_rois": []}),
                timestamp=datetime.now(timezone.utc) + timedelta(minutes=i)
            )
            db.add(rec)
        db.commit()
    finally:
        db.close()

    res = client.get(f"/api/images/recovery-records?image_id={img_id}&page=1&page_size=2", headers=a_headers)
    assert res.status_code == 200
    d = res.json()
    assert d["total"] == 5
    assert len(d["items"]) == 2
    assert d["page"] == 1
    assert d["page_size"] == 2

    res_p2 = client.get(f"/api/images/recovery-records?image_id={img_id}&page=2&page_size=2", headers=a_headers)
    assert res_p2.status_code == 200
    assert len(res_p2.json()["items"]) == 2

    res_p3 = client.get(f"/api/images/recovery-records?image_id={img_id}&page=3&page_size=2", headers=a_headers)
    assert res_p3.status_code == 200
    assert len(res_p3.json()["items"]) == 1


def test_6_unauthorized_access():
    """6. Rejects unauthenticated requests with 401."""
    res = client.get("/api/images/recovery-records")
    assert res.status_code == 401


def test_7_successful_recovery_record():
    """7. Verifies fields of a successful recovery record."""
    _, a_headers, admin_id, _ = _create_user(f"admin_succ_{uuid.uuid4().hex[:6]}", "super_admin")
    _, _, _, pat_pid = _create_user(f"pat_succ_{uuid.uuid4().hex[:6]}", "patient")

    img_id = _create_mock_image(pat_pid, admin_id)

    db = SessionLocal()
    try:
        rec = RecoveryRecord(
            image_id=img_id,
            triggered_by_id=admin_id,
            tampered_roi_count=2,
            recovered_hash="e"*64,
            trusted_hash="e"*64,
            verification_passed=True,
            blockchain_tx_hash="0x" + "e"*64,
            details_json=json.dumps({"tampered_rois": [{"x": 1, "y": 2, "width": 3, "height": 4}]}),
            timestamp=datetime.now(timezone.utc)
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)
        rec_id = str(rec.id)
    finally:
        db.close()

    res = client.get(f"/api/images/recovery-records?image_id={img_id}&status=VERIFIED", headers=a_headers)
    assert res.status_code == 200
    items = res.json()["items"]
    target = next((item for item in items if item["recovery_id"] == rec_id), None)
    assert target is not None
    assert target["status"] == "VERIFIED"
    assert target["hash_match"] is True
    assert target["verification_status"] == "PASSED"
    assert len(target["affected_regions"]) == 1
    assert target["recovery_method"] == "TRUSTED_IPFS_ROI_REPLACEMENT"


def test_8_failed_recovery_record():
    """8. Verifies fields of a failed recovery record."""
    _, a_headers, admin_id, _ = _create_user(f"admin_fail_{uuid.uuid4().hex[:6]}", "super_admin")
    _, _, _, pat_pid = _create_user(f"pat_fail_{uuid.uuid4().hex[:6]}", "patient")

    img_id = _create_mock_image(pat_pid, admin_id)

    db = SessionLocal()
    try:
        rec = RecoveryRecord(
            image_id=img_id,
            triggered_by_id=admin_id,
            tampered_roi_count=1,
            recovered_hash="f"*64,
            trusted_hash="0"*64,
            verification_passed=False,
            blockchain_tx_hash="0x" + "f"*64,
            details_json=json.dumps({"tampered_rois": [], "error": "Post-recovery hash mismatch"}),
            timestamp=datetime.now(timezone.utc)
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)
        rec_id = str(rec.id)
    finally:
        db.close()

    res = client.get(f"/api/images/recovery-records?image_id={img_id}&status=FAILED", headers=a_headers)
    assert res.status_code == 200
    items = res.json()["items"]
    target = next((item for item in items if item["recovery_id"] == rec_id), None)
    assert target is not None
    assert target["status"] == "FAILED"
    assert target["hash_match"] is False
    assert target["verification_status"] == "FAILED"
    assert target["error_message"] == "Post-recovery hash mismatch"


def test_9_forensic_report_creation():
    """9. Generates valid forensic PDF report on disk with valid PDF magic bytes."""
    pdf_path = generate_forensic_pdf(
        image_id=101,
        image_title="Test Brain MRI",
        image_type="MRI",
        patient_name="John Doe",
        uploader_name="Dr. Smith",
        hospital_name="City Central Hospital",
        blockchain_hash="0x" + "a"*64,
        block_index=1,
        original_hash="0"*64,
        current_hash="1"*64,
        integrity_status="TAMPERED",
        tampered_percentage=7.5,
        confidence_score=0.92,
        heatmap_path=None,
        user_agent="Pytest Agent",
        ip_address="127.0.0.1"
    )

    assert os.path.exists(pdf_path)
    assert pdf_path.endswith(".pdf")
    with open(pdf_path, "rb") as f:
        header = f.read(5)
    assert header == b"%PDF-"


def test_10_forensic_report_failure_handling():
    """10. Requesting non-existent forensic report returns 404."""
    _, a_headers, _, _ = _create_user(f"admin_rep_fail_{uuid.uuid4().hex[:6]}", "super_admin")
    res = client.get("/api/images/report/9999999/download", headers=a_headers)
    assert res.status_code == 404
    assert "not found" in res.json().get("detail", "").lower()


def test_11_celery_unavailable_fallback():
    """11. Verifies that when Celery is offline, PDF generation falls back synchronously without crash."""
    from app.report import generate_forensic_pdf
    pdf_path = generate_forensic_pdf(
        image_id=202,
        image_title="Sync Fallback Scan",
        image_type="CT",
        patient_name="Jane Doe",
        uploader_name="Dr. Fallback",
        hospital_name="Memorial Hospital",
        blockchain_hash="0x" + "b"*64,
        block_index=2,
        original_hash="2"*64,
        current_hash="3"*64,
        integrity_status="TAMPERED",
        tampered_percentage=4.2,
        confidence_score=0.89,
        heatmap_path=None,
        user_agent="Fallback Client",
        ip_address="127.0.0.1"
    )
    assert os.path.exists(pdf_path)
    assert os.path.getsize(pdf_path) > 0


def test_12_malformed_recovery_data():
    """12. Handles corrupted or non-JSON details_json in RecoveryRecord safely without 500 error."""
    _, a_headers, admin_id, _ = _create_user(f"admin_malform_{uuid.uuid4().hex[:6]}", "super_admin")
    _, _, _, pat_pid = _create_user(f"pat_malform_{uuid.uuid4().hex[:6]}", "patient")

    img_id = _create_mock_image(pat_pid, admin_id)

    db = SessionLocal()
    try:
        rec = RecoveryRecord(
            image_id=img_id,
            triggered_by_id=admin_id,
            tampered_roi_count=0,
            recovered_hash="1"*64,
            trusted_hash="1"*64,
            verification_passed=True,
            blockchain_tx_hash=None,
            details_json="CORRUPTED_NON_JSON_DATA{{{",
            timestamp=datetime.now(timezone.utc)
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)
        rec_id = str(rec.id)
    finally:
        db.close()

    res = client.get(f"/api/images/recovery-records?image_id={img_id}", headers=a_headers)
    assert res.status_code == 200
    target = next((item for item in res.json()["items"] if item["recovery_id"] == rec_id), None)
    assert target is not None
    assert target["affected_regions"] == []
    assert target["error_message"] is None
