"""Phase 14 — test storage isolation and real-data protection.

Every artifact a test generates (encrypted objects, PDFs, heatmaps, localization
masks and provenance sidecars) must land in a throwaway directory, never in the
real ``backend/storage`` that holds live demo studies.
"""

import json
import os
import subprocess
import sys
import uuid

from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, os.path.abspath(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.main import app
import app.config as config
from app.config import STORAGE_DIR, ENCRYPTED_DIR, REPORTS_DIR, HEATMAPS_DIR
from app.artifact_provenance import provenance_path_for
from tests.test_authorization_consent import create_user_and_login

client = TestClient(app)

REAL_STORAGE = config.BASE_DIR / "storage"
HEATMAP_DIR = STORAGE_DIR / "heatmaps"


def _count(root):
    total = 0
    for _dirpath, _dirnames, filenames in os.walk(root):
        total += len(filenames)
    return total


def _snapshot(root):
    """Fingerprint of a file tree: names, sizes and mtimes.

    ``storage/logs/`` is excluded: that is the running application's own log
    file, which the request middleware appends to on every call. It is not a
    generated artifact, so including it would make the check a false positive.
    """
    out = {}
    for dp, _dn, fns in os.walk(root):
        rel_dir = os.path.relpath(dp, root)
        if rel_dir.split(os.sep)[0] == "logs":
            continue
        for fn in fns:
            p = os.path.join(dp, fn)
            try:
                st = os.stat(p)
                out[os.path.relpath(p, root)] = (st.st_size, st.st_mtime_ns)
            except OSError:
                pass
    return out


def _png(size=48, color=(22, 74, 118), gradient=False):
    import io

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


def _doctor_image(color=(22, 74, 118), gradient=False):
    uname = f"p14_{uuid.uuid4().hex[:8]}"
    _, headers = create_user_and_login(uname, "doctor")
    res = client.post(
        "/api/images/upload-async",
        headers=headers,
        files={"file": (f"p14_{uuid.uuid4().hex[:6]}.png", _png(color=color, gradient=gradient), "image/png")},
        data={"title": "Phase 14 isolation", "patient_id": "1", "image_type": "XRay"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    return body["image_id"], body["job_id"], headers


# --- 1. the isolated root really is outside the project ---------------------


def test_test_storage_is_outside_real_storage():
    assert STORAGE_DIR != REAL_STORAGE
    assert not str(STORAGE_DIR).startswith(str(REAL_STORAGE))
    # Must live in the system temp area, not a hard-coded developer path.
    import tempfile

    assert str(STORAGE_DIR).startswith(tempfile.gettempdir()), (
        f"test storage {STORAGE_DIR} is not in the system temp directory"
    )


def test_all_derived_storage_paths_are_isolated():
    for path in (STORAGE_DIR, ENCRYPTED_DIR, REPORTS_DIR, HEATMAPS_DIR):
        assert not str(path).startswith(str(REAL_STORAGE)), f"{path} still points at real storage"
        assert path.exists(), f"{path} was never created"


def test_model_weights_stay_read_only_and_shared():
    """AI_DIR/AI_MODEL_PATH deliberately still point at the real storage.

    They hold the pretrained Swin-UNet weights -- read-only model inputs, not
    generated artifacts. Redirecting them makes the model hunt for weights in an
    empty temp directory and block on a network download, so they must remain
    shared and untouched by tests.
    """
    from app.config import AI_DIR, AI_MODEL_PATH

    assert str(AI_DIR).startswith(str(REAL_STORAGE)), "AI_DIR must stay on real storage"
    assert str(AI_MODEL_PATH).startswith(str(REAL_STORAGE))
    # And no test may ever write into it.
    assert not str(HEATMAP_DIR).startswith(str(AI_DIR))


# --- 2/3. artifacts and sidecars land only in isolated storage --------------


def test_artifacts_and_sidecars_are_written_only_to_isolated_storage():
    real_before = _snapshot(REAL_STORAGE)
    img_id, job_id, headers = _doctor_image()

    from app.celery_worker import process_medical_image_pipeline

    assert process_medical_image_pipeline.run(img_id, job_id)["status"] == "COMPLETED"

    for kind in ("heatmap", "mask"):
        art = HEATMAP_DIR / f"{kind}_img_{img_id}.png"
        assert art.exists(), f"{kind} was not written to isolated storage"
        assert provenance_path_for(art).exists(), f"{kind} sidecar missing"
        assert str(art).startswith(str(STORAGE_DIR))

    # Legacy files for low ids already exist in backend/storage from earlier
    # runs, so "must not exist" is the wrong check. Instead the real tree must
    # be byte-for-byte untouched: no new, removed or modified file.
    assert _snapshot(REAL_STORAGE) == real_before, "a test modified backend/storage"


def test_encrypted_objects_go_to_isolated_storage():
    assert not str(ENCRYPTED_DIR).startswith(str(REAL_STORAGE))
    img_id, _, headers = _doctor_image()

    from app.database import SessionLocal
    from app.models import MedicalImage

    db = SessionLocal()
    try:
        ref = db.query(MedicalImage).filter(MedicalImage.id == img_id).first().file_path
    finally:
        db.close()

    stored = ENCRYPTED_DIR / ref
    assert stored.exists(), "encrypted object not written to isolated storage"
    assert not (REAL_STORAGE / "objects" / ref).exists(), "encrypted object leaked into real storage"


# --- 4. identical image ids cannot contaminate each other -------------------


def test_identical_image_ids_cannot_contaminate_each_other():
    """The isolated root is shared, so isolation must come from provenance
    binding, not from the directory alone."""
    from app.celery_worker import process_medical_image_pipeline
    from app.database import SessionLocal
    from app.models import MedicalImage

    a_id, a_job, headers = _doctor_image()
    assert process_medical_image_pipeline.run(a_id, a_job)["status"] == "COMPLETED"

    db = SessionLocal()
    try:
        a_hash = db.query(MedicalImage).filter(MedicalImage.id == a_id).first().original_hash
    finally:
        db.close()

    # Simulate an earlier lifecycle: A's bytes parked at B's id-derived name
    # with provenance anchored to A's content.
    b_id, b_job, headers = _doctor_image(gradient=True)
    b_path = HEATMAP_DIR / f"heatmap_img_{b_id}.png"
    b_path.write_bytes((HEATMAP_DIR / f"heatmap_img_{a_id}.png").read_bytes())
    with open(provenance_path_for(b_path), "w", encoding="utf-8") as fh:
        json.dump(
            {
                "schema": "medisecure.artifact.provenance.v1",
                "kind": "heatmap",
                "image_id": b_id,
                "original_hash": a_hash,
                "image_version_id": None,
                "job_id": None,
            },
            fh,
        )

    res = client.get(f"/api/images/heatmap/by-image/{b_id}", headers=headers)
    assert res.status_code != 200 or res.content != (HEATMAP_DIR / f"heatmap_img_{a_id}.png").read_bytes()

    data = json.loads(provenance_path_for(b_path).read_text(encoding="utf-8"))
    assert data["original_hash"] != a_hash, "B inherited A's content binding"


# --- 5. production configuration is unchanged when tests are not running ----


def test_production_storage_config_is_unchanged_outside_pytest():
    """Re-import app.config in a clean interpreter with no conftest patch and
    confirm it still resolves to the real backend/storage."""
    code = (
        "import app.config as c;"
        "print(c.STORAGE_DIR);"
        "print(c.ENCRYPTED_DIR)"
    )
    env = dict(os.environ)
    env.pop("DATABASE_URL", None)
    proc = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        env=env,
    )
    assert proc.returncode == 0, proc.stderr[-500:]
    lines = [ln.strip() for ln in proc.stdout.strip().splitlines() if ln.strip()]
    assert len(lines) == 2, proc.stdout
    assert lines[0] == str(REAL_STORAGE), f"production STORAGE_DIR changed: {lines[0]}"
    assert lines[1] == str(REAL_STORAGE / "objects"), f"production ENCRYPTED_DIR changed: {lines[1]}"


# --- 6. cleanup never touches production -----------------------------------


def test_cleanup_targets_only_the_temporary_storage(test_storage_root):
    import tempfile

    # Resolved through the fixture rather than by re-importing conftest, which
    # would execute it a second time and re-point app.config at a different
    # temp root mid-session.
    assert str(test_storage_root).startswith(tempfile.gettempdir())
    assert not str(test_storage_root).startswith(str(REAL_STORAGE))
    assert str(STORAGE_DIR).startswith(str(test_storage_root)), (
        "application is not writing into the session storage root"
    )
    # The real tree must still be intact and untouched by this suite.
    assert REAL_STORAGE.exists()


def test_phase13_provenance_still_validates_identity():
    """Isolation must not weaken provenance binding."""
    from app.artifact_provenance import provenance_is_valid, write_provenance
    from pathlib import Path

    art = HEATMAP_DIR / "heatmap_img_isolation_check.png"
    art.parent.mkdir(parents=True, exist_ok=True)
    art.write_bytes(_png())

    write_provenance(art, kind="heatmap", image_id=4242, original_hash="ab" * 32)

    assert provenance_is_valid(art, kind="heatmap", image_id=4242, original_hash="ab" * 32)
    assert not provenance_is_valid(art, kind="mask", image_id=4242, original_hash="ab" * 32)
    assert not provenance_is_valid(art, kind="heatmap", image_id=9999, original_hash="ab" * 32)
    assert not provenance_is_valid(art, kind="heatmap", image_id=4242, original_hash="cd" * 32)
