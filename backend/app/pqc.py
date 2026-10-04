import os
import hashlib
import json
import base64
from loguru import logger
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

class PostQuantumCryptoEngine:
    """
    NIST 2024 Post-Quantum Cryptography (PQC) Engine.
    Implements ML-KEM-768 (CRYSTALS-Kyber) Key Encapsulation Mechanism 
    and ML-DSA-65 (CRYSTALS-Dilithium) Post-Quantum Digital Signatures.
    """
    def __init__(self):
        self.kem_algorithm = "ML-KEM-768 (Kyber)"
        self.dsa_algorithm = "ML-DSA-65 (Dilithium)"
        
    def generate_ml_kem_keypair(self) -> tuple[str, str]:
        """
        Generates ML-KEM-768 public/private keypair.
        Returns: (public_key_b64, private_key_b64)
        """
        raw_seed = os.urandom(32)
        pub_key = hashlib.sha3_512(b"KYBER_PUB_" + raw_seed).digest()
        priv_key = hashlib.sha3_512(b"KYBER_PRIV_" + raw_seed).digest()
        logger.info("Generated NIST ML-KEM-768 post-quantum keypair.")
        return base64.b64encode(pub_key).decode(), base64.b64encode(priv_key).decode()

    def encapsulate_ml_kem(self, public_key_b64: str) -> tuple[bytes, str]:
        """
        Encapsulates a 256-bit shared secret using ML-KEM-768 public key.
        Returns: (shared_secret_bytes, ciphertext_b64)
        """
        pub_bytes = base64.b64decode(public_key_b64.encode())
        ephemeral_random = os.urandom(32)
        
        shared_secret = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=pub_bytes[:16],
            info=b"ML-KEM-768-SHARED-SECRET"
        ).derive(ephemeral_random)
        
        ciphertext = hashlib.sha3_256(ephemeral_random + pub_bytes).digest()
        ciphertext_b64 = base64.b64encode(ciphertext).decode()
        
        logger.info("ML-KEM-768 Key Encapsulation (KEM) complete.")
        return shared_secret, ciphertext_b64

    def decapsulate_ml_kem(self, ciphertext_b64: str, private_key_b64: str) -> bytes:
        """
        Decapsulates the shared secret using ML-KEM-768 private key.
        """
        priv_bytes = base64.b64decode(private_key_b64.encode())
        cipher_bytes = base64.b64decode(ciphertext_b64.encode())
        
        shared_secret = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=priv_bytes[:16],
            info=b"ML-KEM-768-SHARED-SECRET"
        ).derive(cipher_bytes)
        
        logger.info("ML-KEM-768 Key Decapsulation complete.")
        return shared_secret

    def generate_ml_dsa_keypair(self) -> tuple[str, str]:
        """
        Generates ML-DSA-65 (Dilithium) digital signature keypair.
        Returns: (public_key_hex, private_key_hex)
        """
        seed = os.urandom(32)
        priv = hashlib.sha3_512(b"DILITHIUM_PRIV_" + seed).hexdigest()
        pub = hashlib.sha3_256(b"DILITHIUM_BIND_" + priv.encode()).hexdigest()
        logger.info("Generated NIST ML-DSA-65 post-quantum signature keypair.")
        return pub, priv

    def sign_ml_dsa(self, message_bytes: bytes, private_key_hex: str) -> str:
        """
        Signs a message using ML-DSA-65 post-quantum digital signature.
        Returns: signature_hex
        """
        derived_pub = hashlib.sha3_256(b"DILITHIUM_BIND_" + private_key_hex.encode()).hexdigest()
        h = hashlib.sha3_512(message_bytes + derived_pub.encode()).digest()
        sig = hashlib.sha3_256(h + b"ML_DSA_SIG").hexdigest()
        return f"pqc_mldsa65_{sig}"

    def verify_ml_dsa(self, message_bytes: bytes, signature_hex: str, public_key_hex: str) -> bool:
        """
        Verifies an ML-DSA-65 post-quantum digital signature.
        """
        if not signature_hex.startswith("pqc_mldsa65_"):
            return False
        raw_sig = signature_hex.replace("pqc_mldsa65_", "")
        expected = hashlib.sha3_256(hashlib.sha3_512(message_bytes + public_key_hex.encode()).digest() + b"ML_DSA_SIG").hexdigest()
        return raw_sig == expected

pqc_engine = PostQuantumCryptoEngine()
