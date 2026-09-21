import sys
import os
import uuid
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.main import app
from app.database import SessionLocal
from app.models import User, PatientProfile, DoctorProfile, MedicalImage, ConsentGrant, AuditLog
from app.crypto import encrypt_image, sha3_hash
from app.storage_provider import store_encrypted_object
from app.digital_twin import create_digital_twin

client = TestClient(app)


def create_user_and_login(username: str, role: str, email: str = None) -> tuple[dict, dict]:
    """Helper to create a user and return (user_data, auth_headers)."""
    email = email or f"{username}@example.com"
    password = "SecurePassword123!"
    reg_payload = {
        "username": username,
        "email": email,
        "password": password,
        "role": "patient",
        "hospital_id": 1
    }
    client.post("/api/auth/register", json=reg_payload)

    # If privileged role, update in db for test setup
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        if role != "patient":
            user.role = role
            if role in {"doctor", "radiologist"}:
                doc_p = DoctorProfile(user_id=user.id, specialization="Radiology", license_number=f"LIC-{user.id}")
                db.add(doc_p)
            db.commit()
            db.refresh(user)
    finally:
        db.close()

    # Login
    login_res = client.post("/api/auth/login", json={"username": username, "password": password})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return login_res.json(), headers


def test_doctor_without_consent_rejected():
    """Verify that a doctor without consent cannot access a patient's medical image (anti-BOLA)."""
    p_user, p_headers = create_user_and_login(f"patient_{uuid.uuid4().hex[:8]}", "patient")
    d_user, d_headers = create_user_and_login(f"doctor_{uuid.uuid4().hex[:8]}", "doctor")

    # Patient uploads image
    db = SessionLocal()
    try:
        pat_prof = db.query(PatientProfile).filter(PatientProfile.user_id == p_user["username"]).first()
        # Find by username lookup
        user_db = db.query(User).filter(User.username == p_user["username"]).first()
        pat_prof = user_db.patient_profile

        raw_bytes = b"fake_pixel_array_test_data" * 100
        encrypted_bytes, orig_hash, meta_json = encrypt_image(raw_bytes, 7.5)
        stored = store_encrypted_object(encrypted_bytes, f"test_img_{uuid.uuid4().hex[:6]}.enc")
        
        med_img = MedicalImage(
            title="Chest X-Ray",
            patient_id=pat_prof.id,
            uploader_id=user_db.id,
            hospital_id=1,
            image_type="XRay",
            file_path=stored.reference,
            original_hash=orig_hash,
            encrypted_hash=sha3_hash(encrypted_bytes),
            quality_score=0.95,
            entropy=7.5,
            encryption_key_metadata=meta_json
        )
        db.add(med_img)
        db.commit()
        db.refresh(med_img)
        img_id = med_img.id
    finally:
        db.close()

    # Doctor attempts to download image without consent
    res = client.get(f"/api/images/download/{img_id}", headers=d_headers)
    assert res.status_code == 403
    assert "Active patient consent" in res.json().get("detail", "") or "Access Denied" in res.json().get("detail", "")


def test_patient_consent_grant_allows_doctor_access():
    """Verify that after patient grants consent, authorized doctor can download the image."""
    p_user, p_headers = create_user_and_login(f"patient_{uuid.uuid4().hex[:8]}", "patient")
    d_user, d_headers = create_user_and_login(f"doctor_{uuid.uuid4().hex[:8]}", "doctor")

    db = SessionLocal()
    try:
        p_db = db.query(User).filter(User.username == p_user["username"]).first()
        d_db = db.query(User).filter(User.username == d_user["username"]).first()
        pat_prof = p_db.patient_profile
        doc_prof = d_db.doctor_profile

        raw_bytes = b"mri_brain_scan_clean_pixels" * 100
        encrypted_bytes, orig_hash, meta_json = encrypt_image(raw_bytes, 7.8)
        stored = store_encrypted_object(encrypted_bytes, f"mri_{uuid.uuid4().hex[:6]}.enc")
        
        med_img = MedicalImage(
            title="Brain MRI T1",
            patient_id=pat_prof.id,
            uploader_id=p_db.id,
            hospital_id=1,
            image_type="MRI",
            file_path=stored.reference,
            original_hash=orig_hash,
            encrypted_hash=sha3_hash(encrypted_bytes),
            quality_score=0.98,
            entropy=7.8,
            encryption_key_metadata=meta_json
        )
        db.add(med_img)
        db.commit()
        db.refresh(med_img)
        img_id = med_img.id
        pat_id = pat_prof.id
        doc_id = doc_prof.id
    finally:
        db.close()

    # Patient grants consent to the doctor via /api/permissions
    grant_payload = {
        "patient_id": pat_id,
        "doctor_id": doc_id,
        "access_type": "DOWNLOAD",
        "expires_in_hours": 48
    }
    grant_res = client.post("/api/permissions", json=grant_payload, headers=p_headers)
    assert grant_res.status_code == 200, grant_res.text

    # Doctor downloads image - must succeed now
    dl_res = client.get(f"/api/images/download/{img_id}", headers=d_headers)
    assert dl_res.status_code == 200, dl_res.text
    assert dl_res.headers["content-type"] == "image/png"


def test_emergency_break_glass_access(monkeypatch):
    """Verify controlled emergency break-glass access policy with clinical justification."""
    monkeypatch.setenv("EMERGENCY_ACCESS_ENABLED", "true")
    p_user, p_headers = create_user_and_login(f"patient_{uuid.uuid4().hex[:8]}", "patient")
    d_user, d_headers = create_user_and_login(f"er_doc_{uuid.uuid4().hex[:8]}", "doctor")

    db = SessionLocal()
    try:
        p_db = db.query(User).filter(User.username == p_user["username"]).first()
        pat_prof = p_db.patient_profile

        raw_bytes = b"trauma_ct_head_scan_bytes" * 100
        encrypted_bytes, orig_hash, meta_json = encrypt_image(raw_bytes, 7.9)
        stored = store_encrypted_object(encrypted_bytes, f"trauma_{uuid.uuid4().hex[:6]}.enc")
        
        med_img = MedicalImage(
            title="Trauma CT Head",
            patient_id=pat_prof.id,
            uploader_id=p_db.id,
            hospital_id=1,
            image_type="CT",
            file_path=stored.reference,
            original_hash=orig_hash,
            encrypted_hash=sha3_hash(encrypted_bytes),
            quality_score=0.96,
            entropy=7.9,
            encryption_key_metadata=meta_json
        )
        db.add(med_img)
        db.commit()
        db.refresh(med_img)
        img_id = med_img.id
    finally:
        db.close()

    # 1. Emergency download with insufficient justification -> rejected 422
    insufficient_headers = {**d_headers, "x-emergency-justification": "short"}
    rej_res = client.get(f"/api/images/download/{img_id}?is_emergency=true", headers=insufficient_headers)
    assert rej_res.status_code == 422

    # 2. Emergency download with valid clinical justification -> accepted 200
    valid_headers = {
        **d_headers,
        "x-emergency-justification": "Acute traumatic brain injury emergency resuscitation required immediate imaging."
    }
    ok_res = client.get(f"/api/images/download/{img_id}?is_emergency=true", headers=valid_headers)
    assert ok_res.status_code == 200, ok_res.text
