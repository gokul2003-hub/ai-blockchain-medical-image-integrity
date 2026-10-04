"""Phase 3 — DID / Verifiable Credential integration tests (GAP-03).

Covers identity provisioning through the user lifecycle, credential issuance and
verification, protected API access control, and the guarantee that no private key
material is ever persisted or returned.
"""

import copy
import json
import os
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal
from app.did import (
    ISSUER_DID,
    build_did,
    create_platform_role_credential,
    generate_did_document,
    verify_credential_detailed,
)
from app.identity import (
    CREDENTIAL_ROLES,
    backfill_identities,
    can_access_identity,
    ensure_identity_schema,
    public_identity_view,
)
from app.main import app
from app.models import DoctorProfile, Hospital, User

client = TestClient(app)

PASSWORD = "SecurePassword123!"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _unique(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


def _register(username: str, email: str | None = None) -> dict:
    """Register through the public endpoint, which always assigns the patient role."""
    payload = {
        "username": username,
        "email": email or f"{username}@example.com",
        "password": PASSWORD,
        "role": "patient",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 200, response.text
    return response.json()


def _login(username: str, password: str = PASSWORD) -> dict[str, str]:
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _headers_for(username: str) -> dict[str, str]:
    return _login(username)


def _make_super_admin(username: str | None = None) -> tuple[str, dict[str, str]]:
    """Create a super_admin directly, then return its username and auth headers."""
    username = username or _unique("root")
    db = SessionLocal()
    try:
        from app.auth import get_password_hash

        user = User(
            username=username,
            email=f"{username}@example.com",
            hashed_password=get_password_hash(PASSWORD),
            role="super_admin",
            is_active=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        # Provision identity for the admin itself.
        from app.identity import provision_identity

        provision_identity(db, user)
        db.commit()
    finally:
        db.close()
    return username, _headers_for(username)


def _provision_doctor(admin_headers: dict[str, str]) -> str:
    """Create a doctor through the real administrative provisioning endpoint."""
    username = _unique("doc")
    response = client.post(
        "/api/auth/provision-user",
        json={
            "username": username,
            "email": f"{username}@example.com",
            "password": PASSWORD,
            "role": "doctor",
            # license_number is globally unique, so derive a fresh one per doctor.
            "doctor_profile": {
                "specialization": "Radiology",
                "license_number": f"LIC-{uuid.uuid4().hex[:12]}",
            },
        },
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    return username


def _user_row(username: str) -> User:
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == username).first()
        assert user is not None, f"user {username} not found"
        db.expunge(user)
        return user
    finally:
        db.close()


# ---------------------------------------------------------------------------
# 1-3. Registration creates and persists a DID bound to the correct user
# ---------------------------------------------------------------------------

class TestRegistrationCreatesDid:

    def test_registration_creates_did(self):
        """1. Registration creates a DID and returns safe public identity info."""
        username = _unique("reg")
        body = _register(username)
        assert body.get("did"), "registration response must include the DID"
        assert body["did"] == f"did:medshare:patient:{body['id']}"

    def test_did_persists_correctly(self):
        """2. The DID is written to the user row, not just returned."""
        username = _unique("persist")
        _register(username)
        user = _user_row(username)
        assert user.did and user.did.startswith("did:medshare:patient:")
        assert user.did_document
        assert json.loads(user.did_document)["id"] == user.did
        assert user.did_created_at is not None

    def test_did_belongs_to_correct_user(self):
        """3. Each account receives a distinct DID derived from its own id and role."""
        first = _register(_unique("owner"))
        second = _register(_unique("owner"))
        assert first["did"] != second["did"]
        assert first["did"].endswith(str(first["id"]))
        assert second["did"].endswith(str(second["id"]))

    def test_re_registration_of_same_username_is_rejected(self):
        """A duplicate registration must not rotate or duplicate an identity."""
        username = _unique("dup")
        _register(username)
        original = _user_row(username).did
        response = client.post(
            "/api/auth/register",
            json={"username": username, "email": f"{username}@example.com",
                  "password": PASSWORD, "role": "patient"},
        )
        assert response.status_code == 400
        assert _user_row(username).did == original

    def test_identity_is_idempotent(self):
        """Re-running provisioning never rotates a published DID."""
        from app.identity import ensure_user_identity

        username = _unique("idem")
        _register(username)
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.username == username).first()
            original = user.did
            user.did_document = None
            db.commit()
            ensure_user_identity(db, user)
            db.commit()
            assert user.did == original
        finally:
            db.close()


# ---------------------------------------------------------------------------
# 4. DID document validity
# ---------------------------------------------------------------------------

class TestDidDocument:

    def test_did_document_is_w3c_shaped(self):
        username = _unique("doc")
        _register(username)
        user = _user_row(username)
        document = json.loads(user.did_document)

        assert document["id"] == user.did
        assert "https://www.w3.org/ns/did/v1" in document["@context"]
        assert document["controller"] == user.did
        methods = document["verificationMethod"]
        assert len(methods) == 1
        jwk = methods[0]["publicKeyJwk"]
        assert jwk["kty"] == "EC" and jwk["crv"] == "P-256"
        assert len(jwk["x"]) > 0 and len(jwk["y"]) > 0
        assert f"{user.did}#keys-1" in document["authentication"]

    def test_each_user_gets_a_distinct_public_key(self):
        first = _user_row(_register(_unique("k1"))["username"])
        second = _user_row(_register(_unique("k2"))["username"])
        key_first = json.loads(first.did_document)["verificationMethod"][0]["publicKeyJwk"]
        key_second = json.loads(second.did_document)["verificationMethod"][0]["publicKeyJwk"]
        assert key_first["x"] != key_second["x"], "DID keys must be per-account"

    def test_did_document_endpoint_matches_stored_document(self):
        username = _unique("ep")
        _register(username)
        headers = _headers_for(username)
        user = _user_row(username)
        response = client.get(f"/api/users/{user.id}/did", headers=headers)
        assert response.status_code == 200
        body = response.json()
        assert body["did"] == user.did
        assert body["did_document"]["id"] == user.did
        assert body["verification_method"] == f"{user.did}#keys-1"

    def test_build_did_matches_stored_format(self):
        assert build_did(42, "doctor") == "did:medshare:doctor:42"


# ---------------------------------------------------------------------------
# 5. Private key material is never persisted or returned
# ---------------------------------------------------------------------------

class TestNoPrivateKeyExposure:

    def test_no_private_key_columns_exist(self):
        """The users table must not grow a private key column."""
        user = _user_row(_register(_unique("pk"))["username"])
        column_names = set(type(user).__table__.columns.keys())
        for forbidden in ("private_key", "did_private_key", "did_private_key_b64", "secret_key"):
            assert forbidden not in column_names

    def test_api_never_returns_private_key_material(self):
        username = _unique("pkapi")
        _register(username)
        headers = _headers_for(username)
        user = _user_row(username)

        payloads = [
            client.get(f"/api/users/{user.id}/did", headers=headers).json(),
            client.get(f"/api/users/{user.id}/credential", headers=headers).json(),
            client.get(f"/api/users/{user.id}/credential/verify", headers=headers).json(),
            client.get("/api/users/me", headers=headers).json(),
        ]

        forbidden_keys = {"privateKey", "private_key", "d", "k", "secret", "seed", "mnemonic"}

        def _assert_no_secrets(node, path="$"):
            if isinstance(node, dict):
                for key, value in node.items():
                    assert key not in forbidden_keys, f"key '{key}' leaked at {path}"
                    _assert_no_secrets(value, f"{path}.{key}")
            elif isinstance(node, list):
                for index, value in enumerate(node):
                    _assert_no_secrets(value, f"{path}[{index}]")
            elif isinstance(node, str):
                assert "PRIVATE KEY" not in node
                assert "BEGIN RSA" not in node

        for payload in payloads:
            _assert_no_secrets(payload)

    def test_provision_endpoint_does_not_return_key_material(self):
        _, admin_headers = _make_super_admin()
        username = _unique("pkprov")
        response = client.post(
            "/api/auth/provision-user",
            json={"username": username, "email": f"{username}@example.com",
                  "password": PASSWORD, "role": "doctor"},
            headers=admin_headers,
        )
        assert response.status_code == 200
        assert "privateKey" not in response.text
        assert "private_key" not in response.text

    def test_keys_are_rederived_not_stored(self):
        """The DID public key must be reproducible from the master key alone."""
        username = _unique("derive")
        _register(username)
        user = _user_row(username)
        stored_x = json.loads(user.did_document)["verificationMethod"][0]["publicKeyJwk"]["x"]
        regenerated = generate_did_document(user.id, user.username, user.role)
        assert regenerated["verificationMethod"][0]["publicKeyJwk"]["x"] == stored_x

    def test_identity_view_is_allow_listed(self):
        """The projection must not carry arbitrary user attributes."""
        user = _user_row(_register(_unique("allow"))["username"])
        view = public_identity_view(user, None)
        assert set(view) == {
            "user_id", "username", "role", "did", "did_document",
            "verification_method", "did_created_at", "credential",
        }
        assert "hashed_password" not in view
        assert "email" not in view


# ---------------------------------------------------------------------------
# 6-7. Credential issuance and verification
# ---------------------------------------------------------------------------

class TestCredentialIssuance:

    def test_doctor_provisioning_issues_credential(self):
        """6. Privileged accounts receive a system-issued platform credential."""
        _, admin_headers = _make_super_admin()
        username = _provision_doctor(admin_headers)
        user = _user_row(username)
        assert user.did_credential
        assert user.did_credential_status == "issued"

        credential = json.loads(user.did_credential)
        assert credential["issuer"] == ISSUER_DID
        assert credential["credentialSubject"]["id"] == user.did
        assert credential["credentialSubject"]["role"] == "doctor"

    def test_credential_makes_no_medical_licence_claim(self):
        """The credential must not assert a real professional credential."""
        credential = create_platform_role_credential(1, "u", "doctor", hospital_id=1)
        subject = credential["credentialSubject"]
        assert subject["medical_license_claimed"] is False
        assert subject["attestation"] == "system_issued"
        assert subject["external_verification"] == "not_performed"
        assert "license_number" not in subject
        assert "specialization" not in subject

    def test_patient_registration_receives_no_credential(self):
        """Identity only; the platform asserts no clinical role for patients."""
        user = _user_row(_register(_unique("nocred"))["username"])
        assert user.did_credential is None
        assert user.did_credential_status == "not_applicable"
        assert "patient" not in CREDENTIAL_ROLES

    def test_credential_verification_succeeds(self):
        """7. A freshly issued credential verifies successfully."""
        credential = create_platform_role_credential(11, "dr", "doctor", hospital_id=2)
        result = verify_credential_detailed(credential, expected_subject=build_did(11, "doctor"))
        assert result["valid"] is True
        assert result["signature_valid"] is True
        assert result["pqc_signature_valid"] is True
        assert result["failure_reasons"] == []

    def test_verify_endpoint_reports_valid_for_real_credential(self):
        _, admin_headers = _make_super_admin()
        username = _provision_doctor(admin_headers)
        headers = _headers_for(username)
        user = _user_row(username)
        response = client.get(f"/api/users/{user.id}/credential/verify", headers=headers)
        assert response.status_code == 200
        body = response.json()
        assert body["valid"] is True
        assert body["subject"] == user.did
        assert body["issuer"] == ISSUER_DID
        assert body["attestation"] == "system_issued"
        assert body["signature_valid"] is True

    def test_verify_endpoint_reports_no_credential_for_patient(self):
        username = _unique("novc")
        _register(username)
        headers = _headers_for(username)
        user = _user_row(username)
        response = client.get(f"/api/users/{user.id}/credential/verify", headers=headers)
        assert response.status_code == 200
        assert response.json()["valid"] is False
        assert "no_credential_issued" in response.json()["failure_reasons"]

    def test_revoked_credential_fails_verification(self):
        """The existing RevocationRegistry is honoured by the verify endpoint."""
        import datetime

        from app.models import RevocationRegistry

        _, admin_headers = _make_super_admin()
        username = _provision_doctor(admin_headers)
        headers = _headers_for(username)
        user = _user_row(username)
        credential_id = json.loads(user.did_credential)["id"]

        db = SessionLocal()
        try:
            db.add(RevocationRegistry(
                vc_id=credential_id,
                revocation_reason="Test revocation",
                revoked_at=datetime.datetime.now(datetime.timezone.utc),
            ))
            db.commit()
        finally:
            db.close()

        response = client.get(f"/api/users/{user.id}/credential/verify", headers=headers)
        body = response.json()
        assert body["valid"] is False
        assert "revoked_credential" in body["failure_reasons"]


# ---------------------------------------------------------------------------
# 8-12. Verification failure detection
# ---------------------------------------------------------------------------

class TestVerificationFailures:

    def test_modified_credential_fails(self):
        """8. Any change to a signed claim invalidates the credential."""
        credential = create_platform_role_credential(21, "dr", "doctor")
        tampered = copy.deepcopy(credential)
        tampered["credentialSubject"]["role"] = "super_admin"
        result = verify_credential_detailed(tampered)
        assert result["valid"] is False
        assert "invalid_signature" in result["failure_reasons"]

    def test_invalid_signature_fails(self):
        """9. A corrupted signature is rejected."""
        credential = create_platform_role_credential(22, "dr", "doctor")
        tampered = copy.deepcopy(credential)
        tampered["proof"]["jws"] = "00" * 32
        result = verify_credential_detailed(tampered)
        assert result["valid"] is False
        assert "invalid_signature" in result["failure_reasons"]

    def test_wrong_subject_fails(self):
        """10. A credential presented for a different subject is rejected."""
        credential = create_platform_role_credential(23, "dr", "doctor")
        result = verify_credential_detailed(credential, expected_subject=build_did(99, "doctor"))
        assert result["valid"] is False
        assert "unexpected_subject" in result["failure_reasons"]

    def test_wrong_issuer_fails(self):
        """11. A credential from an unexpected issuer is rejected."""
        credential = create_platform_role_credential(24, "dr", "doctor")
        result = verify_credential_detailed(credential, expected_issuer="did:medshare:evil:root")
        assert result["valid"] is False
        assert "unexpected_issuer" in result["failure_reasons"]

    def test_expired_credential_fails(self):
        """12. Expiry is enforced where an expirationDate is present."""
        credential = create_platform_role_credential(25, "dr", "doctor", valid_for_days=-1)
        assert credential["expirationDate"]
        result = verify_credential_detailed(credential)
        assert result["valid"] is False
        assert "expired_credential" in result["failure_reasons"]

    def test_unsigned_credential_fails(self):
        credential = create_platform_role_credential(26, "dr", "doctor")
        credential.pop("proof")
        assert verify_credential_detailed(credential)["failure_reasons"] == ["unsigned_credential"]

    def test_malformed_credential_fails(self):
        assert verify_credential_detailed("not-a-dict")["failure_reasons"] == ["malformed_credential"]
        assert verify_credential_detailed({})["failure_reasons"] == ["malformed_credential_subject"]

    def test_tampered_pqc_signature_fails(self):
        credential = create_platform_role_credential(27, "dr", "doctor")
        tampered = copy.deepcopy(credential)
        tampered["proof"]["pqc_signature"] = "pqc_mldsa65_" + "ab" * 32
        result = verify_credential_detailed(tampered)
        assert result["valid"] is False
        assert "invalid_pqc_signature" in result["failure_reasons"]

    def test_verification_never_returns_key_material(self):
        credential = create_platform_role_credential(28, "dr", "doctor")
        result = verify_credential_detailed(credential)
        serialized = json.dumps(result)
        assert "privateKey" not in serialized
        assert "private_key" not in serialized


# ---------------------------------------------------------------------------
# 13. Authorization: no IDOR
# ---------------------------------------------------------------------------

class TestIdentityAuthorization:

    def test_peer_doctor_cannot_read_another_doctors_credential(self):
        """13. Changing the URL id must not expose another user's credential."""
        _, admin_headers = _make_super_admin()
        doctor_a = _provision_doctor(admin_headers)
        doctor_b = _provision_doctor(admin_headers)

        headers_a = _headers_for(doctor_a)
        target_b = _user_row(doctor_b)

        assert client.get(f"/api/users/{target_b.id}/did", headers=headers_a).status_code == 403
        assert client.get(f"/api/users/{target_b.id}/credential", headers=headers_a).status_code == 403
        assert client.get(f"/api/users/{target_b.id}/credential/verify", headers=headers_a).status_code == 403

    def test_patient_cannot_read_another_users_identity(self):
        patient = _register(_unique("pt"))["username"]
        other = _register(_unique("pt"))["username"]
        headers = _headers_for(patient)
        other_row = _user_row(other)
        assert client.get(f"/api/users/{other_row.id}/credential", headers=headers).status_code == 403

    def test_user_can_read_own_identity(self):
        username = _unique("self")
        _register(username)
        headers = _headers_for(username)
        user = _user_row(username)
        for path in ("did", "credential", "credential/verify"):
            assert client.get(f"/api/users/{user.id}/{path}", headers=headers).status_code == 200

    def test_super_admin_can_read_any_identity(self):
        _, admin_headers = _make_super_admin()
        target = _user_row(_register(_unique("tgt"))["username"])
        assert client.get(f"/api/users/{target.id}/did", headers=admin_headers).status_code == 200

    def test_anonymous_request_is_rejected(self):
        target = _user_row(_register(_unique("anon"))["username"])
        assert client.get(f"/api/users/{target.id}/did").status_code in (401, 403)

    def test_missing_user_returns_404(self):
        username = _unique("nf")
        _register(username)
        headers = _headers_for(username)
        assert client.get("/api/users/99999999/did", headers=headers).status_code == 404

    def test_hospital_admin_scoped_to_own_hospital(self):
        db = SessionLocal()
        try:
            hospital = db.query(Hospital).first()
            assert hospital is not None
            hospital_id = hospital.id
        finally:
            db.close()

        patient_username = _register(_unique("hpt"))["username"]

        admin_username = _unique("hadmin")
        db = SessionLocal()
        try:
            from app.auth import get_password_hash

            patient = db.query(User).filter(User.username == patient_username).first()
            patient.hospital_id = hospital_id

            admin = User(
                username=admin_username,
                email=f"{admin_username}@example.com",
                hashed_password=get_password_hash(PASSWORD),
                role="hospital_admin",
                hospital_id=hospital_id,
                is_active=True,
            )
            db.add(admin)
            db.commit()
            patient_id = patient.id
        finally:
            db.close()

        headers = _headers_for(admin_username)
        # Same hospital: permitted.
        assert client.get(f"/api/users/{patient_id}/did", headers=headers).status_code == 200

        # Different hospital (None): refused.
        outsider_id = _user_row(_register(_unique("outs"))["username"]).id
        assert client.get(f"/api/users/{outsider_id}/did", headers=headers).status_code == 403

    def test_access_rule_unit_matrix(self):
        db = SessionLocal()
        try:
            viewer_self = User(id=1, username="a", role="doctor", hospital_id=1)
            viewer_admin = User(id=2, username="b", role="super_admin", hospital_id=None)
            viewer_hadmin = User(id=3, username="c", role="hospital_admin", hospital_id=1)
            target_same = User(id=4, username="d", role="doctor", hospital_id=1)
            target_other = User(id=5, username="e", role="doctor", hospital_id=2)

            assert can_access_identity(viewer_self, viewer_self) is True
            assert can_access_identity(viewer_admin, target_other) is True
            assert can_access_identity(viewer_hadmin, target_same) is True
            assert can_access_identity(viewer_hadmin, target_other) is False
            assert can_access_identity(viewer_self, target_same) is False
        finally:
            db.close()


# ---------------------------------------------------------------------------
# Migration and backfill
# ---------------------------------------------------------------------------

class TestMigrationAndBackfill:

    def test_schema_migration_is_idempotent(self):
        from app.database import engine

        first = ensure_identity_schema(engine)
        second = ensure_identity_schema(engine)
        assert isinstance(first, list)
        assert second == [], "second run must add nothing"

    def test_backfill_provisions_users_without_did(self):
        """Pre-existing accounts are handled by a controlled backfill, not silently."""
        username = _unique("legacy")
        _register(username)

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.username == username).first()
            user.did = None
            user.did_document = None
            user.did_credential = None
            user.did_created_at = None
            user.did_credential_status = None
            db.commit()
            assert user.did is None

            result = backfill_identities(db, issue_credentials=True)
            assert result["created"] >= 1

            db.expire_all()
            refreshed = db.query(User).filter(User.username == username).first()
            assert refreshed.did == f"did:medshare:patient:{refreshed.id}"
            assert refreshed.did_document
        finally:
            db.close()

    def test_backfill_skips_users_already_identified(self):
        username = _unique("skip")
        _register(username)
        before = _user_row(username).did
        db = SessionLocal()
        try:
            result = backfill_identities(db, issue_credentials=False)
            assert result["skipped"] >= 1
        finally:
            db.close()
        assert _user_row(username).did == before


# ---------------------------------------------------------------------------
# Authorization integration with the medical-image workflow
# ---------------------------------------------------------------------------

class TestImageWorkflowIntegration:

    def test_audit_trail_records_actor_did(self):
        """Image access decisions are attributable to a DID as well as a user id."""
        from app.authorization import write_audit
        from app.models import AuditLog

        username = _unique("audit")
        _register(username)
        user = _user_row(username)
        headers = _headers_for(username)

        db = SessionLocal()
        try:
            db_user = db.query(User).filter(User.username == username).first()
            write_audit(db, db_user, "IMAGE_VIEW", "SUCCESS")
            db.commit()
            entry = db.query(AuditLog).filter(AuditLog.user_id == db_user.id).order_by(
                AuditLog.id.desc()
            ).first()
            assert entry is not None
            assert f"actor_did={user.did}" in (entry.details or "")
        finally:
            db.close()

    def test_credential_enforcement_is_opt_in_and_refuses_only(self):
        """Enforcement defaults off, and when on it can only refuse, never grant."""
        from app.authorization import require_active_identity
        from app.config import settings

        assert settings.did_enforce_credential_on_image_access is False

        from fastapi import HTTPException

        patient = _user_row(_register(_unique("noident"))["username"])
        with pytest.raises(HTTPException) as excinfo:
            require_active_identity(patient)
        assert excinfo.value.status_code == 403

        # A legitimately identified, verified account passes the assertion.
        _, admin_headers = _make_super_admin()
        doctor = _user_row(_provision_doctor(admin_headers))
        require_active_identity(doctor)  # must not raise

    def test_enforcement_blocks_a_user_with_a_tampered_credential(self):
        from fastapi import HTTPException

        from app.authorization import require_active_identity

        _, admin_headers = _make_super_admin()
        username = _provision_doctor(admin_headers)

        db = SessionLocal()
        try:
            user = db.query(User).filter(User.username == username).first()
            credential = json.loads(user.did_credential)
            credential["credentialSubject"]["role"] = "super_admin"
            user.did_credential = json.dumps(credential, sort_keys=True)
            db.commit()
        finally:
            db.close()

        doctor = _user_row(username)
        with pytest.raises(HTTPException) as excinfo:
            require_active_identity(doctor)
        assert excinfo.value.status_code == 403


# ---------------------------------------------------------------------------
# Regression guarantees for Phases 1 and 2
# ---------------------------------------------------------------------------

class TestPriorPhaseGuaranteesPreserved:

    def test_phase1_encryption_round_trip_still_works(self):
        """Phase 1: Chen pipeline + AES-256-GCM still round-trip."""
        import cv2
        import numpy as np

        from app.crypto import decrypt_image, encrypt_image

        image = np.zeros((48, 48), dtype=np.uint8)
        cv2.ellipse(image, (24, 24), (12, 15), 0, 0, 360, 180, -1)
        ok, encoded = cv2.imencode(".png", image)
        assert ok
        ciphertext, digest, metadata_json = encrypt_image(encoded.tobytes())
        assert decrypt_image(ciphertext, digest, metadata_json) == encoded.tobytes()

        metadata = json.loads(metadata_json)
        assert metadata["hyperchaos"] == "chen-4d-v1"
        assert metadata["chen_diffusion"] == "keystream-xor-v1"

    def test_phase2_authentication_still_works(self):
        """Phase 2 / existing auth: JWT login still issues a usable token."""
        username = _unique("auth")
        _register(username)
        headers = _headers_for(username)
        assert client.get("/api/users/me", headers=headers).status_code == 200

    def test_phase2_mfa_test_mechanism_still_available(self):
        """Phase 2: the existing deterministic MFA test mechanism is intact."""
        from app.config import settings
        from app.auth import generate_mfa_secret, verify_mfa_code

        assert settings.environment == "test"
        assert verify_mfa_code(generate_mfa_secret(), "000000") is True

    def test_phase2_production_secret_validation_still_enforced(self):
        """Phase 2: production still refuses development credentials."""
        import base64

        from app.config import load_settings

        master = base64.urlsafe_b64encode(b"\x07" * 32).decode()
        environ = dict(os.environ)
        try:
            os.environ.update({
                "APP_ENV": "production",
                "JWT_SECRET": "Kx9#mQ2$vL8@pR4wZc6!Jm3Xt9Qb2Lf7Vh5Nk8Sd1Ga4We6Y",
                "JWT_REFRESH_SECRET": "Rt4$wB8!Xq2Zm9Vk3Lp6Jh1Ns5Dc7Fg0Ay2Eu4Io8Uz6Ta",
                "MASTER_KEY": master,
                "ALLOWED_ORIGINS": "https://med.example.com",
                "MFA_TEST_MODE": "false",
            })
            assert load_settings().environment == "production"
            with pytest.raises(RuntimeError, match="MFA_TEST_MODE"):
                os.environ["MFA_TEST_MODE"] = "true"
                load_settings()
        finally:
            os.environ.clear()
            os.environ.update(environ)

    def test_existing_rbac_on_users_endpoints_unchanged(self):
        """RBAC on /users/patients still requires staff."""
        username = _unique("rbac")
        _register(username)
        headers = _headers_for(username)
        assert client.get("/api/users/patients", headers=headers).status_code == 403
        assert client.get("/api/users/doctors", headers=headers).status_code == 200

    def test_legacy_did_helpers_still_work(self):
        """The pre-existing app.did API surface remains intact."""
        from app.did import create_verifiable_credential, verify_verifiable_credential

        document = generate_did_document(999, "legacy", "doctor")
        assert document["id"] == "did:medshare:doctor:999"
        credential = create_verifiable_credential(999, "legacy", "LIC-1", "Radiology")
        assert verify_verifiable_credential(credential) is True