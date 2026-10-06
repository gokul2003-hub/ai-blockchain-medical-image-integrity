"""Live verification: identity verification is OPTIONAL at registration.

- doctor/patient/researcher registration WITHOUT identity_id succeeds
  (server-assigned role, audit notes skipped verification)
- admin registration WITHOUT identity_id is still REJECTED (RBAC gate intact)
- a supplied identity_id is still strictly validated (format + registry)
"""
from app.database import Base, engine, SessionLocal
from app.models import User
from fastapi.testclient import TestClient
from app.main import app
import uuid

client = TestClient(app)


def _unique(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


def setup_module():
    Base.metadata.create_all(bind=engine)


def _register(role_endpoint: str, username: str, extra: dict | None = None):
    payload = {
        "username": username,
        "email": f"{username}@example.org",
        "password": "OptionalIdPass123!",
    }
    if extra:
        payload.update(extra)
    return client.post(f"/api/auth/{role_endpoint}", json=payload)


def test_patient_registration_without_identity_id():
    u = _unique("pt_noid")
    res = _register("register/patient", u)
    assert res.status_code in (200, 201), res.text
    body = res.json()
    assert body["role"] == "patient"
    # audit trail must honestly record skipped verification
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == u).first()
        assert user is not None and user.role == "patient"
        from app.models import AuditLog
        log = db.query(AuditLog).filter(AuditLog.user_id == user.id,
                                        AuditLog.action == "REGISTER").first()
        assert log is not None
        assert "without identity verification (optional)" in (log.details or "")
    finally:
        db.close()


def test_doctor_registration_without_identity_id():
    u = _unique("doc_noid")
    res = _register("register/doctor", u)
    assert res.status_code in (200, 201), res.text
    assert res.json()["role"] == "doctor"


def test_researcher_registration_without_identity_id():
    u = _unique("res_noid")
    res = _register("register/researcher", u, {"institution": "Test Institute"})
    assert res.status_code in (200, 201), res.text
    assert res.json()["role"] == "researcher"


def test_admin_registration_without_identity_id_still_rejected():
    """RBAC preserved: admin signup still requires pre-authorized identity."""
    u = _unique("adm_noid")
    res = _register("register/admin", u, {"institution": "Test Hospital"})
    assert res.status_code == 422, res.text


def test_supplied_identity_id_is_still_strictly_validated():
    """Optional != lax: a malformed supplied ID must still be rejected."""
    u = _unique("pt_badid")
    res = _register("register/patient", u, {"identity_id": "not-an-id"})
    assert res.status_code == 422, res.text


def test_unregistered_wellformed_id_still_rejected():
    u = _unique("pt_unreg")
    res = _register("register/patient", u, {"identity_id": "PT-000000"})
    assert res.status_code == 403, res.text
