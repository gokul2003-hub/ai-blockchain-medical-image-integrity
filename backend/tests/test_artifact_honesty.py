"""Phase 9 — regression tests for the two Phase 8 defects.

Defect A (patient-safety): an image that was never analysed returned
risk 0.0 (LOW) / trust 75.0 (GUARDED) from zeroed defaults.
Defect B: SRM/heatmap/mask returned HTTP 500 for undecodable image bytes,
conflating a data problem with an internal server fault.

Note: the Phase 8 report attributed Defect B to NULL artifact references. That
was WRONG -- these endpoints compute artifacts on demand and do not dereference
stored references. The real cause was undecodable input bytes surfacing as 500.
"""
import io
import os
import sys
import uuid

from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.main import app
from app.database import SessionLocal
from app.models import User

from tests.test_patient_portal_e2e import _make_image_for
from tests.test_authorization_consent import create_user_and_login

client = TestClient(app)

ARTIFACT_PATHS = (
    "/api/images/srm-residual/{i}",
    "/api/images/heatmap/by-image/{i}",
    "/api/images/localization-mask/by-image/{i}",
)


def _owner_image():
    uname = f"p9_{uuid.uuid4().hex[:8]}"
    _, headers = create_user_and_login(uname, "patient")
    return uname, headers, _make_image_for(uname)


# --- Defect A: false LOW risk on an unanalysed image -----------------------


def test_never_analysed_image_does_not_report_LOW_risk():
    _, headers, img_id = _owner_image()
    body = client.get(f"/api/images/{img_id}/risk-trust", headers=headers).json()

    assert body["risk_score"] is None, (
        f"unanalysed image returned a fabricated risk_score of {body['risk_score']}"
    )
    assert body["risk_score"] != 0.0, "zero must not stand in for a missing measurement"
    assert body["analysis_status"] == "NOT_ANALYZED"


def test_never_analysed_image_does_not_report_a_trust_score():
    _, headers, img_id = _owner_image()
    body = client.get(f"/api/images/{img_id}/risk-trust", headers=headers).json()

    assert body["trust_score"] is None, (
        f"unanalysed image returned a fabricated trust_score of {body['trust_score']}"
    )
    assert body["trust_score"] != 75.0
    assert body["source"] == "unavailable"


def test_analysis_status_is_explicit_and_not_a_measured_claim():
    _, headers, img_id = _owner_image()
    body = client.get(f"/api/images/{img_id}/risk-trust", headers=headers).json()

    assert body["analysis_status"] in {"NOT_ANALYZED", "IN_PROGRESS", "FAILED"}
    # The response must carry a machine-readable signal that metrics are absent.
    assert body.get("message"), "an unavailable state must explain itself"


def test_integrity_measurement_is_still_reported_for_unanalysed_image():
    """The SHA-3 recompute is real even without AI analysis, and stays available."""
    _, headers, img_id = _owner_image()
    body = client.get(f"/api/images/{img_id}/risk-trust", headers=headers).json()

    assert "tamper_detected" in body
    assert "integrity_verified" in body
    assert body["integrity_verified"] is True, (
        "a freshly stored image must still pass its own SHA-3 check"
    )


def test_risk_trust_still_denies_cross_patient_access():
    ua, ub = f"p9a_{uuid.uuid4().hex[:8]}", f"p9b_{uuid.uuid4().hex[:8]}"
    _, a_headers = create_user_and_login(ua, "patient")
    create_user_and_login(ub, "patient")
    b_img = _make_image_for(ub)

    res = client.get(f"/api/images/{b_img}/risk-trust", headers=a_headers)
    assert res.status_code in (403, 404), "authorization must be unchanged by the fix"


# --- Defect B: artifact endpoints must not surface a data problem as 500 ---


def test_undecodable_bytes_return_422_not_500():
    _, headers, img_id = _owner_image()
    _purge_stale_artifacts(img_id)

    for template in ARTIFACT_PATHS:
        res = client.get(template.format(i=img_id), headers=headers)
        assert res.status_code == 422, (
            f"{template} returned {res.status_code}; undecodable image bytes must "
            "be a 422 data error, not an internal 500"
        )
        assert res.headers.get("content-type", "").startswith("application/json")


def _purge_stale_artifacts(image_id: int) -> None:
    """Remove on-disk artifacts left by a PREVIOUS image that reused this id.

    Artifact filenames are keyed by image id while the test database recycles
    ids across runs, so a stale PNG from an earlier image can otherwise be
    served for a newer one.
    """
    from app.config import STORAGE_DIR

    for name in (f"heatmap_img_{image_id}.png", f"mask_img_{image_id}.png"):
        p = STORAGE_DIR / "heatmaps" / name
        if p.exists():
            p.unlink()


def test_error_detail_does_not_leak_internal_paths_or_exception_text():
    _, headers, img_id = _owner_image()
    _purge_stale_artifacts(img_id)

    for template in ARTIFACT_PATHS:
        res = client.get(template.format(i=img_id), headers=headers)
        assert res.status_code == 422, (
            f"expected 422, got {res.status_code} - a stale artifact from a "
            "previous image reusing this id may have been served"
        )
        detail = res.json().get("detail", "")
        assert "storage" not in detail.lower()
        assert "traceback" not in detail.lower()
        assert "c:\\" not in detail.lower()
        assert ".enc" not in detail


def test_artifacts_still_serve_real_png_for_a_decodable_image():
    """The normal success path must be preserved by the fix."""
    uname, headers, _ = _owner_image()
    png = Image.new("RGB", (32, 32), color=(18, 52, 86))
    buf = io.BytesIO()
    png.save(buf, format="PNG")

    from app.crypto import encrypt_image, sha3_hash
    from app.storage_provider import store_encrypted_object
    from app.models import MedicalImage

    raw = buf.getvalue()
    enc, orig_hash, meta = encrypt_image(raw, 7.5)
    stored = store_encrypted_object(enc, f"p9real_{uuid.uuid4().hex[:6]}.enc")

    db = SessionLocal()
    try:
        user_db = db.query(User).filter(User.username == uname).first()
        img = MedicalImage(
            title="Real PNG",
            patient_id=user_db.patient_profile.id,
            uploader_id=user_db.id,
            hospital_id=1,
            image_type="XRay",
            file_path=stored.reference,
            original_hash=orig_hash,
            encrypted_hash=sha3_hash(enc),
            quality_score=0.95,
            entropy=7.5,
            encryption_key_metadata=meta,
        )
        db.add(img)
        db.commit()
        db.refresh(img)
        real_id = img.id
    finally:
        db.close()

    # Start from a known-clean disk state: artifact filenames are id-derived
    # while the test database recycles ids, so a leftover file from an earlier
    # image would otherwise decide this test's outcome.
    _purge_stale_artifacts(real_id)

    for template in ARTIFACT_PATHS:
        res = client.get(template.format(i=real_id), headers=headers)
        assert res.status_code == 200, f"{template} -> {res.status_code}"
        assert res.headers.get("content-type") == "image/png"
        assert len(res.content) > 0, "empty artifact body"
