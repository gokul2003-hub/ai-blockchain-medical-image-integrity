"""Phase 7 — Patient Portal end-to-end and cross-patient authorization (anti-IDOR).

Exercises the REAL endpoints the Patient Portal uses:
  GET /api/images/patient/{patient_id}   -- authorized listing
  GET /api/images/preview/{image_id}     -- authenticated blob preview
  GET /api/images/{image_id}/integrity-evidence
  GET /api/images/{image_id}/compare/{version}/artifact/{kind}

All assertions are against live backend responses. No mocks.
"""
import os
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.main import app
from app.database import SessionLocal
from app.models import User, MedicalImage
from app.crypto import encrypt_image, sha3_hash
from app.storage_provider import store_encrypted_object

from tests.test_authorization_consent import create_user_and_login

client = TestClient(app)


def _make_image_for(username: str, title: str = "Chest X-Ray") -> int:
    """Persist a real encrypted image belonging to `username` and return its id."""
    db = SessionLocal()
    try:
        user_db = db.query(User).filter(User.username == username).first()
        pat_prof = user_db.patient_profile
        raw_bytes = f"{title}-{uuid.uuid4().hex}".encode() * 64
        encrypted_bytes, orig_hash, meta_json = encrypt_image(raw_bytes, 7.5)
        stored = store_encrypted_object(encrypted_bytes, f"p7_{uuid.uuid4().hex[:6]}.enc")
        img = MedicalImage(
            title=title,
            patient_id=pat_prof.id,
            uploader_id=user_db.id,
            hospital_id=1,
            image_type="XRay",
            file_path=stored.reference,
            original_hash=orig_hash,
            encrypted_hash=sha3_hash(encrypted_bytes),
            quality_score=0.95,
            entropy=7.5,
            encryption_key_metadata=meta_json,
        )
        db.add(img)
        db.commit()
        db.refresh(img)
        return img.id
    finally:
        db.close()


def _patient_profile_id(username: str) -> int:
    db = SessionLocal()
    try:
        user_db = db.query(User).filter(User.username == username).first()
        return user_db.patient_profile.id
    finally:
        db.close()


# --- Task 2: authorized access -------------------------------------------


def test_patient_can_list_their_own_images():
    uname = f"p7_a_{uuid.uuid4().hex[:8]}"
    _, p_headers = create_user_and_login(uname, "patient")
    img_id = _make_image_for(uname)

    res = client.get(f"/api/images/patient/{_patient_profile_id(uname)}", headers=p_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)
    assert img_id in [row["id"] for row in res.json()], "own image must be listed"


def test_unauthenticated_preview_is_rejected():
    u = f"p7_b_{uuid.uuid4().hex[:8]}"
    _, p_headers = create_user_and_login(u, "patient")
    img_id = _make_image_for(u)

    res = client.get(f"/api/images/preview/{img_id}")
    assert res.status_code == 401, "preview must never be publicly reachable"


# --- Task 2: cross-patient IDOR -------------------------------------------


def test_patient_cannot_list_another_patients_images():
    ua = f"p7_c_{uuid.uuid4().hex[:8]}"
    ub = f"p7_d_{uuid.uuid4().hex[:8]}"
    _, a_headers = create_user_and_login(ua, "patient")
    create_user_and_login(ub, "patient")
    _make_image_for(ub, title="Patient-B-Scan")

    res = client.get(f"/api/images/patient/{_patient_profile_id(ub)}", headers=a_headers)
    assert res.status_code in (403, 404), (
        f"Patient A listed Patient B's images (status {res.status_code})"
    )


def test_patient_cannot_preview_another_patients_image():
    ua = f"p7_e_{uuid.uuid4().hex[:8]}"
    ub = f"p7_f_{uuid.uuid4().hex[:8]}"
    _, a_headers = create_user_and_login(ua, "patient")
    create_user_and_login(ub, "patient")
    b_img = _make_image_for(ub, title="Patient-B-Private")

    res = client.get(f"/api/images/preview/{b_img}", headers=a_headers)
    assert res.status_code in (403, 404), (
        f"IDOR: Patient A previewed Patient B's image {b_img} (status {res.status_code})"
    )
    assert "image" not in res.headers.get("content-type", ""), "must not leak bytes"


def test_patient_cannot_download_another_patients_image():
    ua = f"p7_g_{uuid.uuid4().hex[:8]}"
    ub = f"p7_h_{uuid.uuid4().hex[:8]}"
    _, a_headers = create_user_and_login(ua, "patient")
    create_user_and_login(ub, "patient")
    b_img = _make_image_for(ub)

    res = client.get(f"/api/images/download/{b_img}", headers=a_headers)
    assert res.status_code in (403, 404)


def test_patient_cannot_read_another_patients_integrity_evidence():
    ua = f"p7_i_{uuid.uuid4().hex[:8]}"
    ub = f"p7_j_{uuid.uuid4().hex[:8]}"
    _, a_headers = create_user_and_login(ua, "patient")
    create_user_and_login(ub, "patient")
    b_img = _make_image_for(ub)

    res = client.get(f"/api/images/{b_img}/integrity-evidence", headers=a_headers)
    assert res.status_code in (403, 404), (
        f"IDOR on integrity evidence (status {res.status_code})"
    )


def test_patient_cannot_read_another_patients_risk_trust():
    ua = f"p7_k_{uuid.uuid4().hex[:8]}"
    ub = f"p7_l_{uuid.uuid4().hex[:8]}"
    _, a_headers = create_user_and_login(ua, "patient")
    create_user_and_login(ub, "patient")
    b_img = _make_image_for(ub)

    res = client.get(f"/api/images/{b_img}/risk-trust", headers=a_headers)
    assert res.status_code in (403, 404)


def test_patient_cannot_read_another_patients_digital_twin():
    ua = f"p7_m_{uuid.uuid4().hex[:8]}"
    ub = f"p7_n_{uuid.uuid4().hex[:8]}"
    _, a_headers = create_user_and_login(ua, "patient")
    create_user_and_login(ub, "patient")
    b_img = _make_image_for(ub)

    res = client.get(f"/api/images/digital-twin/{b_img}", headers=a_headers)
    assert res.status_code in (403, 404)


def test_patient_cannot_trigger_recovery_on_another_patients_image():
    ua = f"p7_o_{uuid.uuid4().hex[:8]}"
    ub = f"p7_p_{uuid.uuid4().hex[:8]}"
    _, a_headers = create_user_and_login(ua, "patient")
    create_user_and_login(ub, "patient")
    b_img = _make_image_for(ub)

    res = client.post(f"/api/images/recover/{b_img}", headers=a_headers)
    assert res.status_code in (403, 404)


# --- Task 4: preview must not mutate the trusted baseline ------------------


def test_preview_does_not_modify_the_trusted_baseline():
    u = f"p7_q_{uuid.uuid4().hex[:8]}"
    _, p_headers = create_user_and_login(u, "patient")
    img_id = _make_image_for(u)

    db = SessionLocal()
    try:
        before = db.query(MedicalImage).filter(MedicalImage.id == img_id).first()
        before_hash, before_path = before.original_hash, before.file_path
    finally:
        db.close()

    res = client.get(f"/api/images/preview/{img_id}", headers=p_headers)
    assert res.status_code == 200, f"owner preview failed: {res.status_code}"
    assert res.headers.get("content-type", "").startswith("image/"), (
        f"preview must return an image blob, got {res.headers.get('content-type')}"
    )

    db = SessionLocal()
    try:
        after = db.query(MedicalImage).filter(MedicalImage.id == img_id).first()
        assert after.original_hash == before_hash, "preview mutated the trusted SHA-3 baseline"
        assert after.file_path == before_path, "preview mutated the stored object reference"
    finally:
        db.close()


def test_owner_preview_returns_bytes_not_a_placeholder():
    u = f"p7_r_{uuid.uuid4().hex[:8]}"
    _, p_headers = create_user_and_login(u, "patient")
    img_id = _make_image_for(u)

    res = client.get(f"/api/images/preview/{img_id}", headers=p_headers)
    assert res.status_code == 200
    assert len(res.content) > 0, "empty preview body"
