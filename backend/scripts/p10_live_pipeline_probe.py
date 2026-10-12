"""Phase 10 — run the REAL pipeline task in-process.

Redis/broker is unavailable (no redis-server binary, Docker daemon down), so
broker transport is BLOCKED. This script bypasses only the transport: it invokes
the actual `process_medical_image_pipeline` task body, which performs the real
inference, artifact generation and persistence.

Nothing is fabricated: every artifact written here is produced by production code.
"""
import io
import sys
import uuid

sys.path.insert(0, ".")
sys.path.insert(0, "tests")

# ---------------------------------------------------------------------------
# SAFETY GUARD (Phase 18)
#
# This script performs a REAL upload through the real API and executes the REAL
# Celery task body, which creates permanent records, DIT rows, ledger
# transactions and artifacts. Run without a guard it silently targets the
# production SQLite database and the real backend/storage -- that is exactly how
# probe records 38 and 39 were created.
#
# Default is SAFE mode: a throwaway database plus isolated temporary storage.
# Live mode requires an unmistakable opt-in and prints a loud warning.
#
# NOTE: AI_DIR / AI_MODEL_PATH are deliberately NOT redirected -- they hold the
# pretrained Swin-UNet weights, which must stay readable.
# ---------------------------------------------------------------------------
import os
import tempfile
import time as _time
from pathlib import Path as _Path

LIVE_PROBE_ENV = "MEDISECURE_LIVE_PROBE"
_LIVE = os.environ.get(LIVE_PROBE_ENV, "").strip().lower() in {"1", "true", "yes"}

if _LIVE:
    print("!" * 78)
    print("!! LIVE PROBE MODE -- MEDISECURE_LIVE_PROBE is set.")
    print("!! This WILL write to the REAL database and REAL backend/storage:")
    print("!!   - a new medical-image record and patient-linked upload")
    print("!!   - DIT rows and a blockchain ledger transaction")
    print("!!   - encrypted object and forensic artifacts on disk")
    print("!! Those records then require chain-aware cleanup.")
    print("!! Unset the variable to run in safe isolated mode instead.")
    print("!! Aborting in 10 seconds -- press Ctrl-C now to stop.")
    print("!" * 78)
    _time.sleep(10)
else:
    _tmp_db = os.path.join(tempfile.gettempdir(), f"p10_probe_{os.getpid()}.db")
    os.environ["DATABASE_URL"] = f"sqlite:///{_tmp_db}"
    os.environ.setdefault("APP_ENV", "test")
    os.environ.setdefault("STORAGE_PROVIDER", "local")

    _tmp_store = _Path(tempfile.mkdtemp(prefix="p10_probe_storage_"))
    import app.config as _cfg  # noqa: E402

    _cfg.STORAGE_DIR = _tmp_store
    _cfg.ENCRYPTED_DIR = _tmp_store / "objects"
    _cfg.REPORTS_DIR = _tmp_store / "reports"
    _cfg.HEATMAPS_DIR = _tmp_store / "heatmaps"
    for _d in (_cfg.ENCRYPTED_DIR, _cfg.REPORTS_DIR, _cfg.HEATMAPS_DIR, _tmp_store / "srm"):
        _d.mkdir(parents=True, exist_ok=True)

    print("[SAFE MODE] temporary database :", _tmp_db)
    print("[SAFE MODE] temporary storage  :", _tmp_store)
    print(f"[SAFE MODE] real storage untouched. Set {LIVE_PROBE_ENV}=1 for live mode.")

    # A throwaway database needs the schema and the baseline rows the foreign
    # keys point at, exactly as conftest.py does for the pytest suite.
    from app.database import Base, SessionLocal as _SL, engine as _engine
    from app.main import seed_database as _seed

    Base.metadata.create_all(bind=_engine)
    _db = _SL()
    try:
        _seed(_db)
        _db.commit()
    finally:
        _db.close()
    print("[SAFE MODE] schema created and baseline rows seeded")

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.database import SessionLocal
from app.models import AIInference, ImageVersion, MedicalImage
from app.celery_worker import process_medical_image_pipeline

client = TestClient(app)

# --- 1. real upload through the real API (doctor, so a patient is associated)
import io as _io

png = Image.new("RGB", (64, 64), color=(30, 90, 140))
for x in range(16, 32):
    for y in range(16, 32):
        png.putpixel((x, y), (200, 40, 40))  # a synthetic "region of interest"
buf = _io.BytesIO()
png.save(buf, format="PNG")
payload = buf.getvalue()

from test_authorization_consent import create_user_and_login

du = "p10doc_" + uuid.uuid4().hex[:6]
_, d_headers = create_user_and_login(du, "doctor")

files = {"file": ("p10_scan.png", payload, "image/png")}
data = {"title": "Phase 10 live pipeline scan", "patient_id": "1", "image_type": "XRay"}
up = client.post("/api/images/upload-async", headers=d_headers, files=files, data=data)
print("UPLOAD", up.status_code)
body = up.json()
image_id = body.get("image_id")
job_id = body.get("job_id") or body.get("inference_id")
print("IDS image_id=", image_id, "job_id=", job_id, "worker_queued=", body.get("worker_queued"))

# --- 2. persisted initial job state
db = SessionLocal()
job = db.get(AIInference, job_id)
print("INITIAL job.status=", job.status if job else "MISSING")
db.close()

# --- 3/4. execute the REAL task body synchronously (transport bypassed)
result = process_medical_image_pipeline.run(image_id, job_id)
print("TASK_RESULT", result)

# --- 5. persisted job status and result references
db = SessionLocal()
job = db.get(AIInference, job_id)
print("FINAL job.status=", job.status)
print("FINAL error=", (job.error_message or "")[:120])
print("FINAL mask_ref=", bool(job.mask_storage_reference))
print("FINAL heatmap_ref=", bool(job.heatmap_storage_reference))
rj = job.result_json
print("FINAL result_json_len=", len(rj) if rj else 0)
db.close()

# --- 6/7/8. authenticated retrieval of real artifacts
for path in (
    f"/api/images/{image_id}/processing-status",
    f"/api/images/srm-residual/{image_id}",
    f"/api/images/localization-mask/by-image/{image_id}",
    f"/api/images/heatmap/by-image/{image_id}",
    f"/api/images/{image_id}/risk-trust",
):
    r = client.get(path, headers=d_headers)
    ct = r.headers.get("content-type", "")
    n = len(r.content)
    print(f"EP {path.split('/api/images/')[1]} -> {r.status_code} {ct} bytes={n}")
    if "risk-trust" in path and r.status_code == 200:
        j = r.json()
        print("   analysis_status=", j.get("analysis_status"), "risk=", j.get("risk_score"), "trust=", j.get("trust_score"))

# --- 9. re-fetch in a brand new request (refresh / persistence)
print("--- REFETCH (new request) ---")
for path in (f"/api/images/{image_id}/processing-status", f"/api/images/heatmap/by-image/{image_id}"):
    r = client.get(path, headers=d_headers)
    print(f"REFETCH {path.split('/api/images/')[1]} -> {r.status_code} bytes={len(r.content)}")
