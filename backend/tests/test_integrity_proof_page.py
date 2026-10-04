"""Focused tests for the Integrity Proof & Self-Recovery Evidence Center.

Covers: difference map, blockchain audit recording, evidence bundle,
RBAC, and honest blockchain labeling.
"""
import sys
import os
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi.testclient import TestClient

from app.main import app
from app.forensic_dataset import build_forensic_dataset, run_forensic_analysis

client = TestClient(app)


def _doctor_headers() -> dict:
    res = client.post("/api/auth/login", json={"username": "drsmith", "password": "DocSecure123!"})
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture(scope="module")
def sample_id():
    return build_forensic_dataset()["samples"][0]["image_id"]


# 1. Actual pixel difference computed from real image data
def test_difference_map_computed(sample_id):
    result = run_forensic_analysis(sample_id)
    d = result["difference"]
    assert d["available"] is True
    assert d["changed_pixels"] > 0
    assert d["total_pixels"] == 256 * 256
    assert d["difference_map_base64"].startswith("data:image/png;base64,")
    assert d["difference_overlay_base64"].startswith("data:image/png;base64,")
    # percentage consistent with pixel counts
    calc = round(d["changed_pixels"] / d["total_pixels"] * 100.0, 4)
    assert calc == d["changed_pixel_percentage"]


# 2. Evidence bundle endpoint returns real data (auth required)
def test_evidence_requires_auth(sample_id):
    res = client.get(f"/api/forensic-demo/evidence/{sample_id}")
    assert res.status_code == 401


def test_evidence_bundle_content(sample_id):
    headers = _doctor_headers()
    res = client.get(f"/api/forensic-demo/evidence/{sample_id}", headers=headers)
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["report_type"] == "MediSecure AI Forensic Evidence Bundle"
    ev = data["evidence"]
    # Real chain values present
    assert ev["sha3"]["match"] is False
    assert ev["dit_state"] == "TAMPERED"
    assert ev["recovery"]["post_recovery_match"] in (True, False)
    assert "risk" in ev and "trust" in ev
    # Base64 images stripped from text bundle (small payload)
    assert "images" not in ev or not str(ev.get("images", "")).startswith("data:image")


# 3. Blockchain audit: real transaction recorded on local ledger
def test_blockchain_audit_recorded(sample_id):
    headers = _doctor_headers()
    res = client.post(f"/api/forensic-demo/analyze/{sample_id}?record_audit=true", headers=headers)
    assert res.status_code == 200, res.text
    audit = res.json()["blockchain_audit"]
    assert audit is not None, "Expected a real blockchain audit record"
    assert audit["tx_hash"]
    assert audit["block_index"] is not None and audit["block_index"] > 0
    assert audit["implementation"] == "Local Blockchain Simulation"


def test_analyze_without_audit_flag(sample_id):
    headers = _doctor_headers()
    res = client.post(f"/api/forensic-demo/analyze/{sample_id}", headers=headers)
    assert res.status_code == 200
    # audit optional — must not be fabricated when not requested
    assert res.json()["blockchain_audit"] is None


# 4. Recorded transaction appears in the real ledger endpoint
def test_recorded_tx_appears_in_ledger(sample_id):
    headers = _doctor_headers()
    res = client.post(f"/api/forensic-demo/analyze/{sample_id}?record_audit=true", headers=headers)
    tx = res.json()["blockchain_audit"]["tx_hash"]
    blocks = client.get("/api/blockchain/blocks", headers=headers)
    assert blocks.status_code == 200
    hashes = [b.get("transaction_hash") for b in blocks.json()]
    assert tx in hashes, "Recorded forensic tx must be present in ledger"


# 5. Honest blockchain labeling: ledger endpoint has no "mainnet" claims
def test_blockchain_labeling_honest():
    headers = _doctor_headers()
    blocks = client.get("/api/blockchain/blocks", headers=headers)
    assert blocks.status_code == 200
    # No fake claims anywhere in ledger data
    text = str(blocks.json()).lower()
    for fake in ("ethereum mainnet", "production blockchain", "immutable public"):
        assert fake not in text


# 6. RBAC: unauthenticated callers blocked from proof endpoints
def test_proof_endpoints_rbac():
    sample = build_forensic_dataset()["samples"][0]["image_id"]
    assert client.post(f"/api/forensic-demo/analyze/{sample}").status_code == 401
    assert client.get("/api/blockchain/blocks").status_code == 401


# 7. Full proof chain values used by the page are present & real
def test_proof_page_data_completeness(sample_id):
    result = run_forensic_analysis(sample_id)
    # Section data: SHA-3, DIT, AI, GT, metrics, Grad-CAM, risk, trust, recovery, difference
    assert result["sha3"]["trusted_original"] != result["sha3"]["current"]
    assert result["dit_state"] == "TAMPERED"
    assert isinstance(result["ai"]["confidence_score"], float)
    assert result["ground_truth"]["region"]["width"] > 0
    m = result["prediction"]["metrics"]
    assert 0.0 <= m["iou"] <= 1.0 and 0.0 <= m["dice"] <= 1.0
    assert "available" in result["grad_cam"]
    assert "total_tamper_risk_score" in result["risk"]
    assert "cybersecurity_trust_score" in result["trust"]
    assert result["recovery"]["recovered_sha3"] != result["recovery"]["tampered_sha3"] or \
        result["recovery"]["post_recovery_match"]
    assert result["difference"]["changed_pixels"] > 0
