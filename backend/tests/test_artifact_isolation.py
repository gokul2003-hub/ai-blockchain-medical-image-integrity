"""Phase 13 — artifact provenance binding and cross-study isolation.

Artifacts are written as ``{kind}_img_{image.id}.png``. Because ``image.id`` is
an autoincrement key that can be reused across database lifecycles, the filename
alone never proves ownership. Generation now records provenance bound to the
source image's identity AND content hash; retrieval refuses to serve an artifact
whose provenance does not match, regenerating it from the requested study's own
bytes instead.
"""

import io
import json
import os
import sys
import uuid

import pytest
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
from app.config import STORAGE_DIR
from app.artifact_provenance import provenance_path_for
from app.celery_worker import process_medical_image_pipeline
from tests.test_patient_portal_e2e import _make_image_for
from tests.test_authorization_consent import create_user_and_login

client = TestClient(app)
HEATMAP_DIR = STORAGE_DIR / "heatmaps"

KINDS = (
    ("heatmap", "/api/images/heatmap/by-image/{i}"),
    ("mask", "/api/images/localization-mask/by-image/{i}"),
)


def _login(role="patient"):
    uname = f"p13_{uuid.uuid4().hex[:8]}"
    _, headers = create_user_and_login(uname, role)
    return uname, headers


def _png(size=48, color=(22, 74, 118), gradient=False) -> bytes:
    """Solid PNG by default. ``gradient=True`` gives a structurally different
    image -- per-image normalization maps any uniform image to the same model
    input, so colour alone cannot distinguish two studies."""
    if gradient:
        img = Image.new("RGB", (size, size))
        px = img.load()
        for y in range(size):
            for x in range(size):
                px[x, y] = ((x * 255) // size, (y * 255) // size, 128)
    else:
        img = Image.new("RGB", (size, size), color=color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _purge(image_id: int) -> None:
    for kind, _ in KINDS:
        p = HEATMAP_DIR / f"{kind}_img_{image_id}.png"
        if p.exists():
            p.unlink()
        prov = provenance_path_for(p)
        if prov.exists():
            prov.unlink()


def _plant(image_id: int, color, bound_hash: str) -> bytes:
    """Place artifact bytes plus provenance anchored to a DIFFERENT image."""
    HEATMAP_DIR.mkdir(parents=True, exist_ok=True)
    buf = io.BytesIO()
    Image.new("RGB", (16, 16), color=color).save(buf, format="PNG")
    raw = buf.getvalue()
    for kind, _ in KINDS:
        p = HEATMAP_DIR / f"{kind}_img_{image_id}.png"
        p.write_bytes(raw)
        with open(provenance_path_for(p), "w", encoding="utf-8") as fh:
            json.dump(
                {
                    "schema": "medisecure.artifact.provenance.v1",
                    "kind": kind,
                    "image_id": image_id,
                    "original_hash": bound_hash,
                    "image_version_id": None,
                    "job_id": None,
                },
                fh,
            )
    return raw


def _upload(headers, color=(22, 74, 118), gradient=False):
    res = client.post(
        "/api/images/upload-async",
        headers=headers,
        files={"file": (f"p13_{uuid.uuid4().hex[:6]}.png", _png(color=color, gradient=gradient), "image/png")},
        data={"title": "Phase 13 provenance", "patient_id": "1", "image_type": "XRay"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    return body["image_id"], body["job_id"]


# --- 1/2. generation records provenance for BOTH artifacts -----------------


def test_successful_generation_records_provenance_for_both_artifacts():
    _, headers = _login("doctor")
    img_id, job_id = _upload(headers)
    _purge(img_id)

    assert process_medical_image_pipeline.run(img_id, job_id)["status"] == "COMPLETED"

    for kind, _ in KINDS:
        art = HEATMAP_DIR / f"{kind}_img_{img_id}.png"
        sidecar = provenance_path_for(art)
        assert art.exists(), f"{kind} artifact not written"
        assert sidecar.exists(), f"{kind} provenance not recorded"
        data = json.loads(sidecar.read_text(encoding="utf-8"))
        assert data["kind"] == kind
        assert data["image_id"] == img_id
        assert data["original_hash"], "provenance has no content binding"


def test_heatmap_request_also_binds_the_mask():
    """Requesting one artifact must not leave the other unbound."""
    _, headers = _login("doctor")
    img_id, job_id = _upload(headers)
    _purge(img_id)
    process_medical_image_pipeline.run(img_id, job_id)

    _purge(img_id)
    res = client.get(f"/api/images/heatmap/by-image/{img_id}", headers=headers)
    assert res.status_code == 200, res.status_code

    mask = HEATMAP_DIR / f"mask_img_{img_id}.png"
    assert mask.exists()
    assert provenance_path_for(mask).exists(), "mask left unbound by heatmap request"


def test_correct_image_retrieves_its_own_artifacts():
    _, headers = _login("doctor")
    img_id, job_id = _upload(headers)
    _purge(img_id)
    process_medical_image_pipeline.run(img_id, job_id)

    for _, template in KINDS:
        res = client.get(template.format(i=img_id), headers=headers)
        assert res.status_code == 200, f"{template} -> {res.status_code}"
        assert res.headers.get("content-type") == "image/png"
        assert len(res.content) > 0


# --- 3. reused ids / stale artifacts from an earlier lifecycle -------------


def test_stale_artifact_from_reused_id_is_regenerated_not_served():
    _, headers = _login("doctor")
    img_id, _ = _upload(headers)
    _purge(img_id)
    foreign = _plant(img_id, color=(200, 30, 30), bound_hash="deadbeef" * 8)

    res = client.get(f"/api/images/heatmap/by-image/{img_id}", headers=headers)
    assert res.status_code != 200 or res.content != foreign, (
        "a stale artifact from an earlier image was served"
    )
    assert not (
        res.status_code == 200 and res.headers.get("content-type", "").startswith("image/")
        and res.content == foreign
    )


def test_stale_mask_artifact_is_not_served():
    _, headers = _login("doctor")
    img_id, _ = _upload(headers)
    _purge(img_id)
    foreign = _plant(img_id, color=(10, 190, 10), bound_hash="cafebabe" * 4)

    res = client.get(f"/api/images/localization-mask/by-image/{img_id}", headers=headers)
    assert res.status_code == 404 or res.content != foreign


# --- 4. image B never receives image A's artifact --------------------------


def test_image_b_never_receives_image_a_artifact():
    ua, ub = f"p13a_{uuid.uuid4().hex[:8]}", f"p13b_{uuid.uuid4().hex[:8]}"
    _, a_headers = create_user_and_login(ua, "doctor")
    create_user_and_login(ub, "doctor")

    a_id, a_job = _upload(a_headers)
    _purge(a_id)
    process_medical_image_pipeline.run(a_id, a_job)
    a_bytes = (HEATMAP_DIR / f"heatmap_img_{a_id}.png").read_bytes()

    # Plant A's bytes + provenance at B's id-derived path. B must be a
    # structurally different study (per-image normalisation makes any uniform
    # image map to the same model input, so colour alone is not enough).
    b_id, _ = _upload(a_headers, gradient=True)
    _purge(b_id)
    b_path = HEATMAP_DIR / f"heatmap_img_{b_id}.png"
    b_path.write_bytes(a_bytes)
    with open(provenance_path_for(b_path), "w", encoding="utf-8") as fh:
        json.dump(
            {
                "schema": "medisecure.artifact.provenance.v1",
                "kind": "heatmap",
                "image_id": b_id,  # id matches, but content binding does not
                "original_hash": "00" * 32,
                "image_version_id": None,
                "job_id": None,
            },
            fh,
        )

    res = client.get(f"/api/images/heatmap/by-image/{b_id}", headers=a_headers)
    # A's bytes must never be served as B's result, and whatever is served must
    # be rebound to B's own content identity.
    assert res.status_code != 200 or res.content != a_bytes, (
        "image B was served image A's artifact"
    )
    data = json.loads(provenance_path_for(b_path).read_text(encoding="utf-8"))
    assert data["image_id"] == b_id
    assert data["original_hash"] != "00" * 32, "stale foreign provenance survived"


# --- 5/6. mismatched / missing provenance fails closed ---------------------


def test_mismatched_provenance_content_hash_is_rejected():
    _, headers = _login("doctor")
    img_id, _ = _upload(headers)
    _purge(img_id)
    planted = _plant(img_id, color=(200, 30, 30), bound_hash="ff" * 64)

    for _, template in KINDS:
        res = client.get(template.format(i=img_id), headers=headers)
        # The mismatching artifact must never be served as this study's result.
        # Regenerating it from this image's own bytes is the allowed recovery.
        assert res.status_code != 200 or res.content != planted, (
            "artifact with mismatched provenance was served as verified"
        )
        assert not (res.status_code == 200 and res.content == planted)


def test_missing_provenance_sidecar_is_not_served_as_verified():
    _, headers = _login("doctor")
    img_id, _ = _upload(headers)
    _purge(img_id)
    HEATMAP_DIR.mkdir(parents=True, exist_ok=True)
    art = HEATMAP_DIR / f"heatmap_img_{img_id}.png"
    art.write_bytes(_png(color=(200, 30, 30)))  # bytes, no provenance

    res = client.get(f"/api/images/heatmap/by-image/{img_id}", headers=headers)
    assert res.status_code in (200, 404, 422)
    if res.status_code == 200:
        # Only acceptable if regenerated from THIS image's own bytes.
        assert provenance_path_for(art).exists(), "served without recording provenance"


def test_provenance_failure_leaves_no_accessible_artifact(monkeypatch):
    import app.artifact_provenance as ap

    def _boom(*args, **kwargs):
        raise ap.ArtifactProvenanceError("simulated persistence failure")

    monkeypatch.setattr(ap, "write_provenance", _boom)

    _, headers = _login("doctor")
    img_id, _ = _upload(headers)
    _purge(img_id)

    res = client.get(f"/api/images/heatmap/by-image/{img_id}", headers=headers)
    assert res.status_code == 500, res.status_code
    assert not (HEATMAP_DIR / f"heatmap_img_{img_id}.png").exists(), (
        "unbound artifact remained accessible after provenance failure"
    )
    assert not (HEATMAP_DIR / f"mask_img_{img_id}.png").exists()


# --- 8. missing artifacts --------------------------------------------------


def test_missing_artifact_returns_controlled_response():
    uname, headers = _login("patient")
    img_id = _make_image_for(uname)
    _purge(img_id)
    res = client.get(f"/api/images/heatmap/by-image/{img_id}", headers=headers)
    assert res.status_code in (401, 403, 404, 422), f"uncontrolled: {res.status_code}"
    assert res.status_code != 500


# --- 9. authorization / ownership ------------------------------------------


def test_cross_patient_artifact_access_still_denied():
    ua, ub = f"p13x_{uuid.uuid4().hex[:8]}", f"p13y_{uuid.uuid4().hex[:8]}"
    _, a_headers = create_user_and_login(ua, "patient")
    create_user_and_login(ub, "patient")
    b_img = _make_image_for(ub)

    for _, template in KINDS:
        res = client.get(template.format(i=b_img), headers=a_headers)
        assert res.status_code in (403, 404), f"cross-patient access not denied: {res.status_code}"


def test_unauthenticated_artifact_access_still_401():
    uname, _ = _login("patient")
    img_id = _make_image_for(uname)
    for _, template in KINDS:
        assert client.get(template.format(i=img_id)).status_code == 401


# --- 10. comparison artifacts stay isolated from the Doctor baseline -------


def test_comparison_artifacts_do_not_overwrite_baseline():
    from app.routes.images import _comparison_artifact_paths

    legacy = HEATMAP_DIR / f"heatmap_img_1.png"
    v1 = _comparison_artifact_paths(1, 1)
    v2 = _comparison_artifact_paths(2, 1)
    v3 = _comparison_artifact_paths(3, 1)

    every = [str(p) for p in v1.values()] + [str(p) for p in v2.values()] + [str(p) for p in v3.values()]
    # Each version owns distinct paths: no version can overwrite another.
    assert len(set(every)) == 9, "comparison artifacts collide across versions"
    # And no versioned artifact ever collides with the legacy baseline name.
    assert str(legacy) not in every
    assert all(p.name != legacy.name for p in list(v1.values()) + list(v2.values()) + list(v3.values()))
    # Version identity is present in every versioned artifact name.
    assert all("_v1" in p.name for p in v1.values())
    assert all("_v2" in p.name for p in v2.values())
    assert all("_v3" in p.name for p in v3.values())


def test_srm_still_computed_live_from_requested_image():
    uname, headers = _login("patient")
    img_id = _make_image_for(uname)
    res = client.get(f"/api/images/srm-residual/{img_id}", headers=headers)
    assert res.status_code in (200, 422), res.status_code
