import json
import time
import hashlib
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from loguru import logger

# Generate system-wide signing keys for Verifiable Credentials
# In production, these private keys would be stored in an HSM or KMS
_private_key = ec.generate_private_key(ec.SECP256R1())
_public_key = _private_key.public_key()

def generate_did_document(user_id: int, username: str, role: str) -> dict:
    """
    Generates a W3C-compliant Decentralized Identifier (DID) Document.
    Example output format: did:medshare:123
    """
    did = f"did:medshare:{role}:{user_id}"
    logger.info(f"Generating DID Document for: {did}")
    
    # Simple public key representation for the verificationMethod
    pub_numbers = _public_key.public_numbers()
    pub_hex = f"{pub_numbers.x:064x}{pub_numbers.y:064x}"
    
    did_doc = {
        "@context": [
            "https://www.w3.org/ns/did/v1",
            "https://w3id.org/security/suites/jws-2020/v1"
        ],
        "id": did,
        "controller": f"did:medshare:admin:superadmin",
        "verificationMethod": [
            {
                "id": f"{did}#keys-1",
                "type": "JsonWebKey2020",
                "controller": did,
                "publicKeyJwk": {
                    "kty": "EC",
                    "crv": "P-256",
                    "x": base64_url_encode(pub_numbers.x.to_bytes(32, "big")),
                    "y": base64_url_encode(pub_numbers.y.to_bytes(32, "big"))
                }
            }
        ],
        "authentication": [f"{did}#keys-1"],
        "assertionMethod": [f"{did}#keys-1"]
    }
    return did_doc

def create_verifiable_credential(doctor_id: int, username: str, license_number: str, specialization: str) -> dict:
    """
    Issues a W3C Verifiable Credential (VC) verifying clinician credentials.
    Digitally signed using the framework's private key.
    """
    logger.info(f"Issuing Verifiable Credential for Doctor ID {doctor_id} | License: {license_number}")
    
    did = f"did:medshare:doctor:{doctor_id}"
    credential_subject = {
        "id": did,
        "role": "doctor",
        "username": username,
        "license_number": license_number,
        "specialization": specialization,
        "is_active_practice": True
    }
    
    vc = {
        "@context": [
            "https://www.w3.org/2018/credentials/v1",
            "https://w3id.org/security/suites/jws-2020/v1"
        ],
        "id": f"urn:uuid:doctor-credential-{doctor_id}",
        "type": ["VerifiableCredential", "ClinicalLicenseCredential"],
        "issuer": "did:medshare:hospital:root",
        "issuanceDate": datetime_to_iso(time.time()),
        "credentialSubject": credential_subject
    }
    
    # Generate cryptographic proof (Dual ECDSA + Post-Quantum ML-DSA-65)
    proof_value = sign_payload(vc)
    from app.pqc import pqc_engine
    pqc_pub, pqc_priv = pqc_engine.generate_ml_dsa_keypair()
    pqc_proof = pqc_engine.sign_ml_dsa(json.dumps(vc, sort_keys=True).encode(), pqc_priv)
    
    vc["proof"] = {
        "type": "JsonWebSignature2020",
        "pqc_type": "ML-DSA-65 (Dilithium)",
        "created": datetime_to_iso(time.time()),
        "proofPurpose": "assertionMethod",
        "verificationMethod": "did:medshare:hospital:root#keys-1",
        "jws": proof_value,
        "pqc_signature": pqc_proof,
        "pqc_public_key": pqc_pub
    }
    
    return vc

def verify_verifiable_credential(vc: dict) -> bool:
    """
    Verifies the cryptographic signature of a Verifiable Credential.
    """
    logger.info(f"Verifying Verifiable Credential for ID: {vc.get('id')}")
    if "proof" not in vc:
        logger.warning("Verification failed: Credential is unsigned.")
        return False
        
    proof = vc.get("proof")
    jws = proof.get("jws")
    
    # Recreate unsigned payload
    payload_copy = vc.copy()
    payload_copy.pop("proof")
    
    serialized_payload = json.dumps(payload_copy, sort_keys=True)
    
    try:
        signature_bytes = bytes.fromhex(jws)
        _public_key.verify(
            signature_bytes,
            serialized_payload.encode(),
            ec.ECDSA(hashes.SHA256())
        )
        logger.info("Verifiable Credential signature verified successfully.")
        return True
    except Exception as e:
        logger.error(f"Verifiable Credential verification failed: {str(e)}")
        return False

# --- Cryptographic Helpers ---
import base64

def base64_url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")

def datetime_to_iso(t: float) -> str:
    import datetime
    return datetime.datetime.fromtimestamp(t, datetime.timezone.utc).isoformat()

def sign_payload(payload: dict) -> str:
    """Signs a dictionary payload with the system's private key."""
    serialized = json.dumps(payload, sort_keys=True)
    signature = _private_key.sign(
        serialized.encode(),
        ec.ECDSA(hashes.SHA256())
    )
    return signature.hex()
