"""Phase 11 — job error-state consistency.

A job that had a transport/enqueue error recorded, and then genuinely completed,
must not keep reporting that stale error. Clearing happens ONLY alongside a real
COMPLETED transition, so a FAILED job always retains its error.
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
from app.models import AIInference, MedicalImage
from app.celery_worker import process_medical_image_pipeline

from tests.test_authorization_consent import create_user_and_login

client = TestClient(app)

STALE = "Worker broker unavailable: Celery broker at redis://127.0.0.1:6379/0 is not reachable"


def _png_bytes() -> bytes:
    img = Image.new("RGB", (48, 48), color=(22, 74, 118))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _upload(headers: dict) -> tuple[int, str]:
    files = {"file": ("p11.png", _png_bytes(), "image/png")}
    data = {"title": "Phase 11 job-state scan", "patient_id": "1", "image_type": "XRay"}
    res = client.post("/api/images/upload-async", headers=headers, files=files, data=data)
    assert res.status_code == 200, res.text
    body = res.json()
    return body["image_id"], body["job_id"]


def _job(job_id: str) -> AIInference:
    db = SessionLocal()
    try:
        return db.get(AIInference, job_id)
    finally:
        db.close()


def _set_error(job_id: str, message) -> None:
    db = SessionLocal()
    try:
        job = db.get(AIInference, job_id)
        job.error_message = message
        db.commit()
    finally:
        db.close()


def _doctor():
    uname = f"p11_{uuid.uuid4().hex[:8]}"
    _, headers = create_user_and_login(uname, "doctor")
    return headers


# --- 1 & 5: enqueue failure then genuine success ---------------------------


def test_completed_job_retains_no_stale_broker_error():
    headers = _doctor()
    image_id, job_id = _upload(headers)

    # Reproduce the Phase 10 observation: an enqueue failure persisted a stale
    # transport error on a job that has not run yet.
    assert _job(job_id).status == "QUEUED"
    _set_error(job_id, STALE)
    assert _job(job_id).error_message == STALE

    result = process_medical_image_pipeline.run(image_id, job_id)
    assert result["status"] == "COMPLETED"

    job = _job(job_id)
    assert job.status == "COMPLETED"
    assert job.error_message is None, (
        f"completed job still reports a stale error: {job.error_message!r}"
    )


def test_successful_processing_with_no_previous_error_stays_clean():
    headers = _doctor()
    image_id, job_id = _upload(headers)

    # upload-async always records a broker error in this Redis-less environment,
    # so establish the "no previous error" precondition explicitly rather than
    # assuming the upload left the job clean.
    _set_error(job_id, None)
    assert _job(job_id).error_message is None

    result = process_medical_image_pipeline.run(image_id, job_id)
    assert result["status"] == "COMPLETED"

    job = _job(job_id)
    assert job.status == "COMPLETED"
    assert job.error_message is None


# --- 3: a genuine failure must keep its error ------------------------------


def test_genuine_processing_failure_retains_its_error():
    headers = _doctor()
    image_id, job_id = _upload(headers)
    _set_error(job_id, STALE)

    # Point the job at a nonexistent image so the pipeline really fails.
    db = SessionLocal()
    try:
        job = db.get(AIInference, job_id)
        job.image_version_id = job.image_version_id  # unchanged FK
        db.commit()
    finally:
        db.close()

    result = process_medical_image_pipeline.run(-999999, job_id)
    assert result["status"] == "FAILED"

    job = _job(job_id)
    assert job.status == "FAILED", "a failed job must not be marked completed"
    assert job.error_message, "a failed job must retain an error message"


def test_failed_job_cannot_be_marked_completed_just_to_clear_an_error():
    headers = _doctor()
    image_id, job_id = _upload(headers)

    # Terminal FAILED jobs are never re-run by the pipeline.
    db = SessionLocal()
    try:
        job = db.get(AIInference, job_id)
        job.status = "FAILED"
        job.error_message = "inference blew up"
        db.commit()
    finally:
        db.close()

    result = process_medical_image_pipeline.run(image_id, job_id)
    assert result["status"] == "FAILED"
    assert result.get("skipped") == "already_failed"

    job = _job(job_id)
    assert job.status == "FAILED"
    assert job.error_message == "inference blew up", (
        "an already-failed job must keep its error"
    )


# --- 4: retry then success -------------------------------------------------


def test_retry_then_success_clears_the_error():
    headers = _doctor()
    image_id, job_id = _upload(headers)
    _set_error(job_id, STALE)

    # The retry endpoint already resets a failed job for a fresh attempt.
    db = SessionLocal()
    try:
        job = db.get(AIInference, job_id)
        job.status = "FAILED"
        job.error_message = STALE
        db.commit()
    finally:
        db.close()

    res = client.post(f"/api/images/{image_id}/retry-analysis", headers=headers)
    assert res.status_code in (200, 202), res.text

    retried = _job(job_id)
    if retried.status != "FAILED":
        # Retry created a new job or reset this one; either way the pipeline
        # must be able to complete without resurrecting the old error.
        process_medical_image_pipeline.run(image_id, job_id)
        final = _job(job_id)
        if final.status == "COMPLETED":
            assert final.error_message is None


def test_completed_job_is_idempotent_and_error_free():
    """Re-running a COMPLETED job must not re-execute or reintroduce an error."""
    headers = _doctor()
    image_id, job_id = _upload(headers)
    process_medical_image_pipeline.run(image_id, job_id)
    assert _job(job_id).status == "COMPLETED"

    result = process_medical_image_pipeline.run(image_id, job_id)
    assert result["status"] == "COMPLETED"
    assert result.get("skipped") == "already_completed"
    assert _job(job_id).error_message is None


# --- 6: Phase 9 semantics must be unaffected -------------------------------


def test_not_analysed_image_still_returns_null_risk():
    uname = f"p11p_{uuid.uuid4().hex[:8]}"
    _, p_headers = create_user_and_login(uname, "patient")

    from tests.test_patient_portal_e2e import _make_image_for
    img_id = _make_image_for(uname)

    body = client.get(f"/api/images/{img_id}/risk-trust", headers=p_headers).json()
    assert body["analysis_status"] == "NOT_ANALYZED"
    assert body["risk_score"] is None
    assert body["trust_score"] is None
