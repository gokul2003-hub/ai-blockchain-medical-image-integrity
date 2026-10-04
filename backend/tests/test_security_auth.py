import sys
import os
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.main import app
from app.database import SessionLocal
from app.models import User, PatientProfile
import time
from app.auth import _totp_code

client = TestClient(app)


import uuid

def test_public_registration_locks_role_to_patient():
    """Verify that public registration rejects or ignores role escalation attempts."""
    username = f"hacker_{uuid.uuid4().hex[:8]}"
    payload = {
        "username": username,
        "email": f"{username}@example.com",
        "password": "HackerPassword123!",
        "role": "super_admin",  # Attacker attempts to become super_admin
        "hospital_id": 1
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 200, response.text
    data = response.json()
    # The registered user MUST be patient, NEVER super_admin
    assert data["role"] == "patient"
    assert data["username"] == username

    # Verify directly in database
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        assert user is not None
        assert user.role == "patient"
    finally:
        db.close()


def test_password_policy_rejection():
    """Verify that weak passwords are rejected during registration."""
    weak_passwords = ["short", "alllowercase123", "NOLOWER12345!", "NoDigitsHere!", "123456789012!"]
    for weak_pw in weak_passwords:
        payload = {
            "username": f"weak_{abs(hash(weak_pw)) % 10000}_{uuid.uuid4().hex[:4]}",
            "email": f"weak_{abs(hash(weak_pw)) % 10000}_{uuid.uuid4().hex[:4]}@example.com",
            "password": weak_pw,
            "role": "patient"
        }
        res = client.post("/api/auth/register", json=payload)
        assert res.status_code in (400, 422), f"Password '{weak_pw}' should have been rejected"


def test_login_flow_and_jwt_tokens():
    """Verify standard login returning access token, refresh token, and token type."""
    username = f"auth_user_{uuid.uuid4().hex[:8]}"
    user_payload = {
        "username": username,
        "email": f"{username}@example.com",
        "password": "SecurePassword123!",
        "role": "patient"
    }
    reg = client.post("/api/auth/register", json=user_payload)
    assert reg.status_code == 200, reg.text

    login_data = {
        "username": username,
        "password": "SecurePassword123!"
    }
    res = client.post("/api/auth/login", json=login_data)
    assert res.status_code == 200, res.text
    tokens = res.json()
    assert "access_token" in tokens
    assert "refresh_token" in tokens
    assert tokens["token_type"] == "bearer"
    assert tokens["mfa_enabled"] is False


def test_provision_user_requires_admin():
    """Verify that POST /provision-user rejects non-admin users."""
    username = f"patient_{uuid.uuid4().hex[:8]}"
    reg = client.post("/api/auth/register", json={
        "username": username,
        "email": f"{username}@example.com",
        "password": "NormalPassword123!",
        "role": "patient"
    })
    assert reg.status_code == 200, reg.text

    login_res = client.post("/api/auth/login", json={"username": username, "password": "NormalPassword123!"})
    assert login_res.status_code == 200, login_res.text
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    prov_payload = {
        "username": f"doc_{uuid.uuid4().hex[:8]}",
        "email": f"doc_{uuid.uuid4().hex[:8]}@example.com",
        "password": "DoctorPass123!",
        "role": "doctor",
        "hospital_id": 1
    }
    res = client.post("/api/auth/provision-user", json=prov_payload, headers=headers)
    assert res.status_code == 403


def test_mfa_setup_and_verification():
    """Verify TOTP MFA setup, secret generation, and activation."""
    username = f"mfa_{uuid.uuid4().hex[:8]}"
    client.post("/api/auth/register", json={
        "username": username,
        "email": f"{username}@example.com",
        "password": "MfaTestPassword123!",
        "role": "patient"
    })
    login_res = client.post("/api/auth/login", json={"username": username, "password": "MfaTestPassword123!"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Setup MFA (GET request)
    setup_res = client.get("/api/auth/mfa/setup", headers=headers)
    assert setup_res.status_code == 200, setup_res.text
    setup_data = setup_res.json()
    secret = setup_data["secret"]
    assert len(secret) >= 16

    # 2. Generate valid TOTP code and enable MFA
    current_otp = _totp_code(secret, int(time.time() // 30))

    enable_res = client.post("/api/auth/mfa/enable", json={"code": current_otp}, headers=headers)
    assert enable_res.status_code == 200, enable_res.text
    assert enable_res.json()["success"] is True


def test_logout_revokes_jwt():
    """Verify that logging out invalidates the access token via token_version check."""
    username = f"logout_{uuid.uuid4().hex[:8]}"
    client.post("/api/auth/register", json={
        "username": username,
        "email": f"{username}@example.com",
        "password": "LogoutPassword123!",
        "role": "patient"
    })
    login_res = client.post("/api/auth/login", json={"username": username, "password": "LogoutPassword123!"})
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Verify protected endpoint works before logout
    me_res = client.get("/api/auth/me", headers=headers)
    assert me_res.status_code == 200

    # Logout
    logout_res = client.post("/api/auth/logout", headers=headers)
    assert logout_res.status_code == 200

    # Verify protected endpoint is now blocked with HTTP 401
    blocked_res = client.get("/api/auth/me", headers=headers)
    assert blocked_res.status_code == 401
