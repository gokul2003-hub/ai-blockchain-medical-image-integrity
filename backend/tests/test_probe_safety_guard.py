"""Phase 18 — safety guard for the live diagnostic probe.

``scripts/p10_live_pipeline_probe.py`` performs a real upload and executes the
real Celery task body. Unguarded it targeted the production database and
``backend/storage`` directly (creating probe records 38 and 39). The guard makes
safe isolated mode the default and requires an explicit opt-in for live mode.
"""

import os
import re
import subprocess
import sys

import pytest

BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROBE = os.path.join(BACKEND, "scripts", "p10_live_pipeline_probe.py")

sys.path.insert(0, BACKEND)


def _source():
    with open(PROBE, "r", encoding="utf-8") as fh:
        return fh.read()


def _real_storage_snapshot():
    """Fingerprint of real storage, excluding the app's own log directory."""
    from app.config import BASE_DIR

    root = BASE_DIR / "storage"
    out = {}
    for dp, _dn, fns in os.walk(root):
        if os.path.relpath(dp, root).split(os.sep)[0] == "logs":
            continue
        for fn in fns:
            p = os.path.join(dp, fn)
            try:
                st = os.stat(p)
                out[os.path.relpath(p, root)] = (st.st_size, st.st_mtime_ns)
            except OSError:
                pass
    return out


def _real_record_count():
    from app.database import SessionLocal
    from app.models import MedicalImage

    db = SessionLocal()
    try:
        return db.query(MedicalImage).count()
    finally:
        db.close()


# --- static: the guard must actually be present and gate live mode -----------


def test_probe_declares_an_explicit_live_opt_in():
    src = _source()
    assert "MEDISECURE_LIVE_PROBE" in src, "probe has no live-mode opt-in variable"


def test_probe_safe_mode_is_the_default():
    """Live mode must be opt-IN, so the default must read an unset variable."""
    src = _source()
    assert re.search(
        r'_LIVE\s*=\s*os\.environ\.get\(\s*LIVE_PROBE_ENV\s*,',
        src,
    ), "live mode is not gated behind an explicit opt-in"
    assert 'os.environ.get(LIVE_PROBE_ENV, "")' in src, "no safe default when the variable is absent"
    # Safe mode must be the branch taken when the variable is missing.
    assert "if _LIVE:" in src and "else:" in src


def test_probe_redirects_database_and_storage_before_app_import():
    """The guard must bind the temp DB and storage BEFORE app.* binds paths."""
    src = _source()
    guard_at = src.find("MEDISECURE_LIVE_PROBE")
    db_at = src.find('os.environ["DATABASE_URL"]')
    store_at = src.find("_cfg.STORAGE_DIR = _tmp_store")
    app_import_at = src.find("from app.main import app")

    assert guard_at != -1
    assert db_at != -1 and store_at != -1, "guard does not redirect DB/storage"
    assert guard_at < db_at < app_import_at, "DATABASE_URL is set after app import"
    assert guard_at < store_at < app_import_at, "storage is redirected after app import"


def test_probe_does_not_redirect_model_weight_directory():
    """AI_DIR must stay readable so the pretrained Swin-UNet weights load."""
    src = _source()
    assert "_cfg.AI_DIR" not in src, "probe redirects AI_DIR and would break model loading"
    assert "_cfg.AI_MODEL_PATH" not in src


def test_probe_prints_a_warning_in_live_mode():
    src = _source()
    assert "LIVE PROBE MODE" in src
    assert "REAL database" in src or "real database" in src.lower()


# --- runtime: running the probe must leave production untouched -------------


def test_probe_run_defaults_to_safe_mode_and_leaves_production_untouched():
    """Execute the probe with no opt-in and prove production is unaffected."""
    env = dict(os.environ)
    env.pop("MEDISECURE_LIVE_PROBE", None)
    env["PYTHONPATH"] = BACKEND

    storage_before = _real_storage_snapshot()
    records_before = _real_record_count()

    proc = subprocess.run(
        [sys.executable, PROBE],
        capture_output=True,
        text=True,
        cwd=BACKEND,
        env=env,
        timeout=600,
    )

    assert proc.returncode == 0, proc.stderr[-800:]
    assert "SAFE MODE" in proc.stdout, "probe did not enter safe isolated mode"
    assert "LIVE PROBE MODE" not in proc.stdout, "probe entered live mode without opt-in"

    assert _real_storage_snapshot() == storage_before, "probe wrote into backend/storage"
    assert _real_record_count() == records_before, "probe created a real database record"


def test_safe_mode_probe_still_produces_a_real_pipeline_result():
    """The guard must not neuter the probe: it still runs the real task body."""
    env = dict(os.environ)
    env.pop("MEDISECURE_LIVE_PROBE", None)
    env["PYTHONPATH"] = BACKEND

    proc = subprocess.run(
        [sys.executable, PROBE],
        capture_output=True,
        text=True,
        cwd=BACKEND,
        env=env,
        timeout=600,
    )
    assert proc.returncode == 0, proc.stderr[-800:]
    assert "TASK_RESULT" in proc.stdout
    assert "COMPLETED" in proc.stdout, "safe mode did not complete the real pipeline"
