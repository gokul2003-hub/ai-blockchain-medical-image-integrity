import sys
import os
import pytest
import numpy as np

# Ensure app is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.zkp import zkp_verifier
from app.did import generate_did_document, create_verifiable_credential, verify_verifiable_credential
from app.fhir import create_fhir_consent, create_fhir_audit_event, create_fhir_document_reference
from app.dp import add_laplace_noise_int
from app.crypto import calculate_npcr_uaci, calculate_pixel_correlation

def test_zkp_schnorr_flow():
    secret_key = 9876543210123
    message = "verify-image-access-45"
    
    # Generate proof
    R_hash, s_hex, e_hex = zkp_verifier.generate_proof(secret_key, message)
    
    # Verify success
    success = zkp_verifier.verify_proof(R_hash, s_hex, e_hex, secret_key, message)
    assert success is True
    
    # Verify failure on wrong secret key
    fail = zkp_verifier.verify_proof(R_hash, s_hex, e_hex, secret_key + 1, message)
    assert fail is False
    
    # Verify failure on tampered message
    fail_msg = zkp_verifier.verify_proof(R_hash, s_hex, e_hex, secret_key, "verify-image-access-46")
    assert fail_msg is False

def test_did_and_vc_flow():
    user_id = 99
    username = "drjones"
    
    # Generate DID Document
    did_doc = generate_did_document(user_id, username, "doctor")
    assert did_doc["id"] == f"did:medshare:doctor:{user_id}"
    assert len(did_doc["verificationMethod"]) > 0
    
    # Create Verifiable Credential
    vc = create_verifiable_credential(user_id, username, "LIC-999-DOC", "Radiology")
    assert vc["credentialSubject"]["license_number"] == "LIC-999-DOC"
    assert "proof" in vc
    
    # Verify VC
    assert verify_verifiable_credential(vc) is True

def test_fhir_json_generation():
    # Test Consent
    consent = create_fhir_consent(12, 5, 8, True)
    assert consent["resourceType"] == "Consent"
    assert consent["patient"]["reference"] == "Patient/5"
    
    # Test AuditEvent
    audit = create_fhir_audit_event(44, 8, "doctor", "DOWNLOAD", "192.168.1.100", True)
    assert audit["resourceType"] == "AuditEvent"
    assert audit["recorded"] is not None
    
    # Test DocumentReference
    doc = create_fhir_document_reference(7, "Chest X-Ray CT Scan", 10, "QmHashCidExample", 98.4)
    assert doc["resourceType"] == "DocumentReference"
    assert doc["content"][0]["attachment"]["url"] == "ipfs://QmHashCidExample"

def test_differential_privacy():
    original_val = 100
    eps = 1.0
    
    perturbed_vals = [add_laplace_noise_int(original_val, eps) for _ in range(50)]
    
    # Noise should center around original value (mean error should be relatively small)
    mean_val = np.mean(perturbed_vals)
    assert abs(mean_val - original_val) < 10.0
    
    # Check that it introduces variance (it is not a static flat 100)
    assert np.var(perturbed_vals) > 0.0

def test_cryptographic_verification_metrics():
    # 256x256 grayscale arrays
    c1 = bytes(np.random.randint(0, 256, 65536, dtype=np.uint8))
    # Perturb a few bytes
    c2_arr = bytearray(c1)
    for i in range(100):
        c2_arr[i] = (c2_arr[i] + 1) % 256
    c2 = bytes(c2_arr)
    
    npcr, uaci = calculate_npcr_uaci(c1, c2)
    
    # Since only 100 bytes out of 65536 differ, NPCR should be low
    assert npcr > 0.0
    assert npcr < 1.0
    assert uaci > 0.0
    
    # Test adjacent correlations
    correlations = calculate_pixel_correlation(c1)
    assert "horizontal" in correlations
    assert "vertical" in correlations
    assert "diagonal" in correlations
