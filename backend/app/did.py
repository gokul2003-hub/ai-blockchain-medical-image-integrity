import json
import time
import hashlib
import datetime
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature
from loguru import logger

import base64
from typing import Optional, Tuple
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from app.config import settings

def _derive_did_keypair(master_key_b64: Optional[str] = None) -> Tuple[ec.EllipticCurvePrivateKey, ec.EllipticCurvePublicKey]:
    """
    Derives deterministic, persistent ECDSA SECP256R1 signing keys from the persistent application master key.
    Ensures that keys survive server restarts and maintain verification of previously issued credentials.
    """
    key_b64 = master_key_b64 or settings.master_key_b64
    master_key_bytes = base64.urlsafe_b64decode(key_b64.encode())
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"medshare-did-signing-salt-v1",
        info=b"did-system-key-derivation",
    )
    derived_bytes = hkdf.derive(master_key_bytes)
    # NIST P-256 (SECP256R1) group order n
    n = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
    scalar = int.from_bytes(derived_bytes, "big") % (n - 1) + 1
    priv_key = ec.derive_private_key(scalar, ec.SECP256R1())
    pub_key = priv_key.public_key()
    return priv_key, pub_key

# Initialize module-level persistent keys
_private_key, _public_key = _derive_did_keypair()

def reinitialize_did_keys(master_key_b64: Optional[str] = None) -> Tuple[ec.EllipticCurvePrivateKey, ec.EllipticCurvePublicKey]:
    """
    Re-initializes the DID signing keypair (useful for simulating server restarts and testing key stability).
    """
    global _private_key, _public_key
    _private_key, _public_key = _derive_did_keypair(master_key_b64)
    return _private_key, _public_key

def get_did_keypair() -> Tuple[ec.EllipticCurvePrivateKey, ec.EllipticCurvePublicKey]:
    """Returns the current DID signing keypair."""
    return _private_key, _public_key

def get_did_public_key() -> ec.EllipticCurvePublicKey:
    """Returns the current DID public verification key."""
    return _public_key


# The platform issuer identity. Every credential this deployment signs is issued
# by the platform itself, which is what distinguishes a system-issued credential
# from an externally attested professional credential.
ISSUER_DID = "did:medshare:hospital:root"
ISSUER_VERIFICATION_METHOD = f"{ISSUER_DID}#keys-1"

# Credential type used for platform role authorisation. It deliberately makes no
# claim about medical licensing or professional qualification.
PLATFORM_ROLE_CREDENTIAL_TYPE = "MedSharePlatformRoleCredential"


def build_did(user_id: int, role: str) -> str:
    """Return the canonical DID string for a user account."""
    return f"did:medshare:{role}:{user_id}"


def _derive_subject_keypair(user_id: int, role: str) -> Tuple[ec.EllipticCurvePrivateKey, ec.EllipticCurvePublicKey]:
    """Derive a per-user DID signing keypair deterministically from the master key.

    Keys are never persisted: they are recomputed from the server master key and
    the user's immutable id, so no private key is ever written to the database, a
    log line, or an API response. Recomputation is stable across restarts, which
    keeps previously published DID documents verifiable.
    """
    master_key_bytes = base64.urlsafe_b64decode(settings.master_key_b64.encode())
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=b"medshare-did-signing-salt-v1",
        info=f"did:subject:{role}:{user_id}".encode(),
    )
    derived_bytes = hkdf.derive(master_key_bytes)
    n = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551
    scalar = int.from_bytes(derived_bytes, "big") % (n - 1) + 1
    priv_key = ec.derive_private_key(scalar, ec.SECP256R1())
    return priv_key, priv_key.public_key()


def get_subject_public_key(user_id: int, role: str) -> ec.EllipticCurvePublicKey:
    """Public half of a user's DID keypair. Safe to publish."""
    return _derive_subject_keypair(user_id, role)[1]


def generate_did_document(user_id: int, username: str, role: str) -> dict:
    """
    Generates a W3C-compliant Decentralized Identifier (DID) Document.
    Example output format: did:medshare:doctor:123

    The verification method carries the *user's own* per-account key so that each
    document is independently verifiable, while credentials continue to be signed
    by the platform issuer key.
    """
    did = build_did(user_id, role)
    logger.info(f"Generating DID Document for: {did}")

    subject_private_key, subject_public_key = _derive_subject_keypair(user_id, role)
    pub_numbers = subject_public_key.public_numbers()

    did_doc = {
        "@context": [
            "https://www.w3.org/ns/did/v1",
            "https://w3id.org/security/suites/jws-2020/v1"
        ],
        "id": did,
        "controller": did,
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
        "assertionMethod": [f"{did}#keys-1"],
        "service": [
            {
                "id": f"{did}#medshare-identity",
                "type": "MedShareIdentity",
                "serviceEndpoint": ISSUER_DID
            }
        ]
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


def create_platform_role_credential(
    user_id: int,
    username: str,
    role: str,
    hospital_id: Optional[int] = None,
    valid_for_days: int = 365,
) -> dict:
    """Issue a system-issued platform role credential for a user account.

    This credential asserts one thing only: that the MedShare platform issued this
    account the given platform role. It makes **no** claim about medical
    licensing, professional qualification, or external verification. A credential
    of this type is not evidence of a real medical licence and must never be
    presented as such.
    """
    did = build_did(user_id, role)
    issued_at = time.time()
    expires_at = issued_at + (valid_for_days * 86400)

    vc = {
        "@context": [
            "https://www.w3.org/2018/credentials/v1",
            "https://w3id.org/security/suites/jws-2020/v1"
        ],
        "id": f"urn:uuid:medshare-role-{role}-{user_id}",
        "type": ["VerifiableCredential", PLATFORM_ROLE_CREDENTIAL_TYPE],
        "issuer": ISSUER_DID,
        "issuanceDate": datetime_to_iso(issued_at),
        "expirationDate": datetime_to_iso(expires_at),
        "credentialSubject": {
            "id": did,
            "username": username,
            "role": role,
            "hospital_id": hospital_id,
            # Explicit provenance so a verifier is never misled about what was checked.
            "attestation": "system_issued",
            "external_verification": "not_performed",
            "medical_license_claimed": False
        }
    }

    vc["proof"] = _attach_proof(vc)
    logger.info(f"Issued system platform-role credential {vc['id']} for subject {did}")
    return vc


def _attach_proof(vc: dict) -> dict:
    """Sign the unsigned credential with the issuer key and attach a PQC signature."""
    jws = sign_payload(vc)

    from app.pqc import pqc_engine

    pqc_pub, pqc_priv = pqc_engine.generate_ml_dsa_keypair()
    pqc_proof = pqc_engine.sign_ml_dsa(json.dumps(vc, sort_keys=True).encode(), pqc_priv)

    return {
        "type": "JsonWebSignature2020",
        "pqc_type": "ML-DSA-65 (Dilithium)",
        "created": datetime_to_iso(time.time()),
        "proofPurpose": "assertionMethod",
        "verificationMethod": ISSUER_VERIFICATION_METHOD,
        "jws": jws,
        "pqc_signature": pqc_proof,
        "pqc_public_key": pqc_pub
    }


def verify_credential_detailed(
    vc: dict,
    expected_subject: Optional[str] = None,
    expected_issuer: Optional[str] = ISSUER_DID,
) -> dict:
    """Verify a credential and return a structured result.

    Detects an invalid signature, a modified payload, a wrong issuer, a wrong
    subject, expiry, and malformed structure. Never returns private key material.
    """
    result = {
        "valid": False,
        "credential_id": None,
        "issuer": None,
        "subject": None,
        "issued_at": None,
        "expires_at": None,
        "verification_method": None,
        "credential_type": None,
        "attestation": None,
        "external_verification": None,
        "signature_valid": False,
        "pqc_signature_valid": False,
        "failure_reasons": [],
    }

    if not isinstance(vc, dict):
        result["failure_reasons"].append("malformed_credential")
        return result

    result["credential_id"] = vc.get("id")
    result["issuer"] = vc.get("issuer")
    result["issued_at"] = vc.get("issuanceDate")
    result["expires_at"] = vc.get("expirationDate")
    types = vc.get("type")
    result["credential_type"] = types[-1] if isinstance(types, list) and types else types

    subject_block = vc.get("credentialSubject")
    if not isinstance(subject_block, dict):
        result["failure_reasons"].append("malformed_credential_subject")
        return result

    result["subject"] = subject_block.get("id")
    result["attestation"] = subject_block.get("attestation")
    result["external_verification"] = subject_block.get("external_verification")

    proof = vc.get("proof")
    if not isinstance(proof, dict) or not proof.get("jws"):
        result["failure_reasons"].append("unsigned_credential")
        return result

    result["verification_method"] = proof.get("verificationMethod")

    # Expiry, when the credential carries an expirationDate.
    expires_at = result["expires_at"]
    if expires_at:
        try:
            expiry_epoch = datetime.datetime.fromisoformat(expires_at).timestamp()
        except (TypeError, ValueError):
            result["failure_reasons"].append("malformed_expiration_date")
        else:
            if expiry_epoch < time.time():
                result["failure_reasons"].append("expired_credential")

    if expected_issuer and result["issuer"] != expected_issuer:
        result["failure_reasons"].append("unexpected_issuer")

    if expected_subject and result["subject"] != expected_subject:
        result["failure_reasons"].append("unexpected_subject")

    unsigned = {key: value for key, value in vc.items() if key != "proof"}
    serialized_payload = json.dumps(unsigned, sort_keys=True)

    try:
        signature_bytes = bytes.fromhex(proof["jws"])
        _public_key.verify(signature_bytes, serialized_payload.encode(), ec.ECDSA(hashes.SHA256()))
        result["signature_valid"] = True
    except Exception:
        result["failure_reasons"].append("invalid_signature")

    # The PQC signature covers the same unsigned payload and is independently checked.
    pqc_signature = proof.get("pqc_signature")
    pqc_public_key = proof.get("pqc_public_key")
    if pqc_signature and pqc_public_key:
        try:
            from app.pqc import pqc_engine

            result["pqc_signature_valid"] = pqc_engine.verify_ml_dsa(
                serialized_payload.encode(), pqc_signature, pqc_public_key
            )
            if not result["pqc_signature_valid"]:
                result["failure_reasons"].append("invalid_pqc_signature")
        except Exception:
            result["failure_reasons"].append("invalid_pqc_signature")

    result["valid"] = not result["failure_reasons"]
    return result

# --- Cryptographic Helpers ---

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
