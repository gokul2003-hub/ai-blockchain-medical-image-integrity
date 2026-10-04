import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.zkp import zkp_verifier
from app.did import generate_did_document, create_verifiable_credential, verify_verifiable_credential
from app.fhir import create_fhir_consent, create_fhir_audit_event, create_fhir_document_reference
from app.dp import add_laplace_noise_int
from app.crypto import calculate_npcr_uaci, calculate_pixel_correlation

def run_tests():
    print("--------------------------------------------------")
    print("RUNNING NATIVE CRYPTOGRAPHIC & INTEROPERABILITY TESTS")
    print("--------------------------------------------------")

    # 1. Test ZKP Schnorr Proof Flow
    print("[1/5] Testing ECC-based Schnorr Zero-Knowledge Proofs...")
    secret_key = 123456789
    message = "verify-access-image-12"
    R_hash, s_hex, e_hex = zkp_verifier.generate_proof(secret_key, message)
    
    # Validation
    assert zkp_verifier.verify_proof(R_hash, s_hex, e_hex, secret_key, message) is True
    assert zkp_verifier.verify_proof(R_hash, s_hex, e_hex, secret_key + 1, message) is False
    assert zkp_verifier.verify_proof(R_hash, s_hex, e_hex, secret_key, "verify-access-image-13") is False
    print("      >> SECURE ZKP FLOW SUCCESSFUL")

    # 2. Test W3C DIDs and Verifiable Credentials
    print("[2/5] Testing W3C Decentralized DIDs & Verifiable Credentials...")
    did_doc = generate_did_document(77, "drjones", "doctor")
    assert did_doc["id"] == "did:medshare:doctor:77"
    
    vc = create_verifiable_credential(77, "drjones", "LIC-77-DOC", "Neurology")
    assert vc["credentialSubject"]["license_number"] == "LIC-77-DOC"
    assert verify_verifiable_credential(vc) is True
    print("      >> DECENTRALIZED IDENTITY VERIFIED")

    # 3. Test FHIR JSON compilation schemas
    print("[3/5] Testing HL7 FHIR Interoperability Resources...")
    consent = create_fhir_consent(101, 2, 4, True)
    assert consent["resourceType"] == "Consent"
    
    audit = create_fhir_audit_event(202, 4, "doctor", "DOWNLOAD", "10.0.0.5", True)
    assert audit["resourceType"] == "AuditEvent"
    print("      >> HL7 FHIR EXPORT SCHEMAS VERIFIED")

    # 4. Test Differential Privacy noise perturbation
    print("[4/5] Testing Laplacian Differential Privacy mechanisms...")
    original = 500
    perturbed = add_laplace_noise_int(original, 1.0)
    print(f"      Original Count: {original} | Perturbed Count: {perturbed}")
    assert perturbed >= 0
    print("      >> LAPLACIAN NOISE SYSTEM SUCCESSFUL")

    # 5. Test Cryptographic Verification Benchmarks (NPCR & UACI)
    print("[5/5] Testing NPCR/UACI security benchmarks...")
    import numpy as np
    c1 = bytes(np.random.randint(0, 256, 10000, dtype=np.uint8))
    c2 = bytes(np.random.randint(0, 256, 10000, dtype=np.uint8))
    
    npcr, uaci = calculate_npcr_uaci(c1, c2)
    print(f"      Random Arrays NPCR: {npcr:.4f}% | UACI: {uaci:.4f}%")
    assert npcr > 90.0 # Random ciphertexts will have extremely high pixel difference rate
    
    correlations = calculate_pixel_correlation(c1)
    print(f"      Adjacent Pixel Correlation: {correlations}")
    print("      >> CRYPTOGRAPHIC VERIFICATION BENCHMARKS SUCCESSFUL")

    print("\n--------------------------------------------------")
    print("ALL ACADEMIC & CLINICAL UPGRADE CHECKS PASSED")
    print("--------------------------------------------------")

if __name__ == "__main__":
    run_tests()
