"""Focused security tests for secure role-based registration.

Covers: valid/invalid IDs, duplicate IDs, role/ID mismatch, fake admin ID,
privilege escalation, and direct API registration bypass.
"""
import sys
import os
import uuid
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.main import app
from app.database import SessionLocal
from app.models import User, DoctorIdentity, PatientIdentity, ResearcherIdentity, AdminIdentity

client = TestClient(app)

PW = "SecurePass1234!"


def _uniq():
    return uuid.uuid4().hex[:8]


def _seed_doctor(db):
    doc_id = "DR-" + str(uuid.uuid4().int % 1000000).zfill(6)
    rec = DoctorIdentity(
        doctor_id=doc_id,
        full_name="Dr. Test",
        license_number=f"LIC-{uuid.uuid4().hex[:8].upper()}",
        institution="Test Hospital",
        is_active=True,
    )
    db.add(rec)
    db.commit()
    return doc_id


def _seed_patient(db):
    pt_id = "PT-" + str(uuid.uuid4().int % 1000000).zfill(6)
    rec = PatientIdentity(patient_id=pt_id, full_name="Test Patient", is_active=True)
    db.add(rec)
    db.commit()
    return pt_id


def _seed_researcher(db, approved=True):
    res_id = "RES-" + str(uuid.uuid4().int % 1000000).zfill(6)
    rec = ResearcherIdentity(
        researcher_id=res_id,
        full_name="Test Researcher",
        institution="Test University",
        institutional_email=f"{_uniq()}@uni.test",
        approval_status="approved" if approved else "pending",
        is_active=True,
    )
    db.add(rec)
    db.commit()
    return res_id


def _seed_admin(db):
    adm_id = "ADM-" + str(uuid.uuid4().int % 1000000).zfill(6)
    rec = AdminIdentity(
        admin_id=adm_id,
        full_name="Test Admin",
        institution="Test Hospital",
        official_email=f"{_uniq()}@hospital.test",
        is_pre_provisioned=True,
        is_active=True,
    )
    db.add(rec)
    db.commit()
    return adm_id


# --- TEST 1: Valid role + valid authorized ID -> ACCEPT ---
def test_valid_doctor_id_accepted():
    db = SessionLocal()
    try:
        doc_id = _seed_doctor(db)
    finally:
        db.close()
    u = _uniq()
    res = client.post("/api/auth/register/doctor", json={
        "identity_id": doc_id,
        "username": f"doc_{u}",
        "email": f"doc_{u}@example.com",
        "password": PW,
    })
    assert res.status_code == 200, res.text
    assert res.json()["role"] == "doctor"


# --- TEST 2: Invalid ID -> REJECT ---
def test_invalid_doctor_id_rejected():
    u = _uniq()
    res = client.post("/api/auth/register/doctor", json={
        "identity_id": "DR-000000",  # well-formed but not in registry
        "username": f"doc_{u}",
        "email": f"doc_{u}@example.com",
        "password": PW,
    })
    assert res.status_code == 403, res.text
    # Generic message - no enumeration
    assert "Unable to verify" in res.json()["detail"]


def test_malformed_id_rejected():
    u = _uniq()
    res = client.post("/api/auth/register/patient", json={
        "identity_id": "not-an-id",
        "username": f"pt_{u}",
        "email": f"pt_{u}@example.com",
        "password": PW,
    })
    assert res.status_code == 422, res.text


# --- TEST 3: Valid ID + wrong role -> REJECT ---
def test_role_identity_mismatch_rejected():
    """A doctor ID submitted to the patient endpoint must be rejected."""
    db = SessionLocal()
    try:
        doc_id = _seed_doctor(db)
    finally:
        db.close()
    u = _uniq()
    res = client.post("/api/auth/register/patient", json={
        "identity_id": doc_id,  # doctor ID on patient endpoint
        "username": f"pt_{u}",
        "email": f"pt_{u}@example.com",
        "password": PW,
    })
    assert res.status_code in (403, 422), res.text


# --- TEST 4: Already registered ID -> REJECT ---
def test_duplicate_identity_rejected():
    db = SessionLocal()
    try:
        pt_id = _seed_patient(db)
    finally:
        db.close()
    u1, u2 = _uniq(), _uniq()
    payload1 = {"identity_id": pt_id, "username": f"pt_{u1}",
                "email": f"pt_{u1}@example.com", "password": PW}
    payload2 = {"identity_id": pt_id, "username": f"pt_{u2}",
                "email": f"pt_{u2}@example.com", "password": PW}
    r1 = client.post("/api/auth/register/patient", json=payload1)
    assert r1.status_code == 200, r1.text
    r2 = client.post("/api/auth/register/patient", json=payload2)
    assert r2.status_code == 403, r2.text


# --- TEST 5: Fake Admin ID -> REJECT ---
def test_fake_admin_id_rejected():
    u = _uniq()
    res = client.post("/api/auth/register/admin", json={
        "identity_id": "ADM-999999",  # not pre-provisioned
        "username": f"adm_{u}",
        "email": f"adm_{u}@example.com",
        "password": PW,
        "institution": "Evil Corp",
    })
    assert res.status_code == 403, res.text
    assert "pre-authorized" in res.json()["detail"]


def test_unpreprovisioned_admin_id_rejected():
    """Admin identity exists but is not pre-provisioned -> reject."""
    db = SessionLocal()
    try:
        adm_id = "ADM-" + str(uuid.uuid4().int % 1000000).zfill(6)
        db.add(AdminIdentity(
            admin_id=adm_id, full_name="X", institution="Y",
            official_email="x@y.test", is_pre_provisioned=False,
            is_active=True))
        db.commit()
    finally:
        db.close()
    u = _uniq()
    res = client.post("/api/auth/register/admin", json={
        "identity_id": adm_id, "username": f"adm_{u}",
        "email": f"adm_{u}@example.com", "password": PW,
        "institution": "Test"})
    assert res.status_code == 403, res.text


# --- TEST 6: Frontend/request-body role tampering -> REJECT ---
def test_request_body_role_tampering_ignored():
    """Extra role field in body must not escalate privileges."""
    db = SessionLocal()
    try:
        pt_id = _seed_patient(db)
    finally:
        db.close()
    u = _uniq()
    res = client.post("/api/auth/register/patient", json={
        "identity_id": pt_id,
        "username": f"pt_{u}",
        "email": f"pt_{u}@example.com",
        "password": PW,
        "role": "super_admin",  # tampered field
    })
    # Pydantic ignores extra field; role must be patient
    assert res.status_code == 200, res.text
    assert res.json()["role"] == "patient"


# --- TEST 7: Direct API registration bypass -> REJECT ---
def test_direct_api_bypass_rejected():
    """Calling role-specific endpoint without valid identity is rejected."""
    u = _uniq()
    # Try admin endpoint directly with arbitrary ID
    res = client.post("/api/auth/register/admin", json={
        "identity_id": "ADM-" + str(uuid.uuid4().int % 1000000).zfill(6),
        "username": f"byp_{u}",
        "email": f"byp_{u}@example.com",
        "password": PW,
        "institution": "Attacker Inc",
    })
    assert res.status_code == 403, res.text


# --- Unapproved researcher -> REJECT ---
def test_unapproved_researcher_rejected():
    db = SessionLocal()
    try:
        res_id = _seed_researcher(db, approved=False)
    finally:
        db.close()
    u = _uniq()
    res = client.post("/api/auth/register/researcher", json={
        "identity_id": res_id,
        "username": f"res_{u}",
        "email": f"res_{u}@example.com",
        "password": PW,
        "institution": "Test University",
    })
    assert res.status_code == 403, res.text


# --- Approved researcher -> ACCEPT ---
def test_approved_researcher_accepted():
    db = SessionLocal()
    try:
        res_id = _seed_researcher(db, approved=True)
    finally:
        db.close()
    u = _uniq()
    res = client.post("/api/auth/register/researcher", json={
        "identity_id": res_id,
        "username": f"res_{u}",
        "email": f"res_{u}@example.com",
        "password": PW,
        "institution": "Test University",
    })
    assert res.status_code == 200, res.text
    assert res.json()["role"] == "researcher"


# --- verify-identity endpoint reflects real registry state ---
def test_verify_identity_endpoint_real_state():
    db = SessionLocal()
    try:
        pt_id = _seed_patient(db)
    finally:
        db.close()
    ok = client.post("/api/auth/verify-identity", json={"role": "patient", "identity_id": pt_id})
    assert ok.status_code == 200
    assert ok.json()["success"] is True

    bad = client.post("/api/auth/verify-identity", json={"role": "patient", "identity_id": "PT-000000"})
    assert bad.status_code == 200
    assert bad.json()["success"] is False


# --- Privilege escalation: patient cannot use admin endpoint ---
def test_patient_cannot_register_admin():
    db = SessionLocal()
    try:
        pt_id = _seed_patient(db)
    finally:
        db.close()
    u = _uniq()
    # Patient registers normally
    client.post("/api/auth/register/patient", json={
        "identity_id": pt_id, "username": f"pt_{u}",
        "email": f"pt_{u}@example.com", "password": PW})
    # Same patient tries admin endpoint with their patient ID
    res = client.post("/api/auth/register/admin", json={
        "identity_id": pt_id, "username": f"adm_{u}",
        "email": f"adm_{u}@example.com", "password": PW,
        "institution": "Test"})
    assert res.status_code in (403, 422), res.text
