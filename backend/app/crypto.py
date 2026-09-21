"""Authenticated encryption and integrity helpers.

The former AES-CBC/chaos construction has been removed from application paths.
Each protected object receives a random data-encryption key (DEK); the DEK is
wrapped by a key-encryption key (KEK) derived from the configured master key.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
from typing import Any

import numpy as np
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from app.config import settings
from app.hyperchaos import create_permutation, restore_permutation


def sha3_hash(data: bytes) -> str:
    return hashlib.sha3_256(data).hexdigest()


def sha256_hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_json_hash(value: dict[str, Any]) -> str:
    return sha256_hash(json.dumps(value, sort_keys=True, separators=(",", ":")).encode())


class LocalKeyEncryptionProvider:
    """Development key-management adapter with an AWS/Azure/Vault-ready seam."""

    key_id = "local-hkdf-kek-v1"

    def __init__(self) -> None:
        master_key = base64.urlsafe_b64decode(settings.master_key_b64.encode())
        self._kek = HKDF(
            algorithm=SHA256(), length=32, salt=b"medshare-kek-salt-v1", info=b"image-key-encryption"
        ).derive(master_key)

    def wrap_key(self, dek: bytes, aad: bytes) -> dict[str, str]:
        nonce = os.urandom(12)
        ciphertext = AESGCM(self._kek).encrypt(nonce, dek, aad)
        return {
            "key_provider": "local",
            "key_id": self.key_id,
            "wrap_nonce": base64.urlsafe_b64encode(nonce).decode(),
            "wrapped_dek": base64.urlsafe_b64encode(ciphertext).decode(),
        }

    def unwrap_key(self, metadata: dict[str, Any], aad: bytes) -> bytes:
        if metadata.get("key_provider") != "local" or metadata.get("key_id") != self.key_id:
            raise ValueError("Unsupported key encryption provider or key id")
        nonce = base64.urlsafe_b64decode(metadata["wrap_nonce"].encode())
        wrapped_dek = base64.urlsafe_b64decode(metadata["wrapped_dek"].encode())
        return AESGCM(self._kek).decrypt(nonce, wrapped_dek, aad)


key_encryption_provider = LocalKeyEncryptionProvider()


def encrypt_payload(plaintext: bytes, associated_data: bytes) -> tuple[bytes, dict[str, str]]:
    """Encrypt one object with a fresh AES-256-GCM DEK and authenticated AAD."""
    if not plaintext:
        raise ValueError("Cannot encrypt an empty image payload")
    dek = os.urandom(32)
    payload_nonce = os.urandom(12)
    wrapped_key = key_encryption_provider.wrap_key(dek, associated_data)
    ciphertext = AESGCM(dek).encrypt(payload_nonce, plaintext, associated_data)
    return ciphertext, {
        "format": "AES-256-GCM-DEK-v1",
        "payload_nonce": base64.urlsafe_b64encode(payload_nonce).decode(),
        "tag_location": "ciphertext_suffix_16_bytes",
        **wrapped_key,
    }


def decrypt_payload(ciphertext: bytes, encryption_metadata: dict[str, Any], associated_data: bytes) -> bytes:
    """Authenticate ciphertext, AAD and wrapped DEK before returning plaintext."""
    if encryption_metadata.get("format") != "AES-256-GCM-DEK-v1":
        raise ValueError("Unsupported encrypted payload format")
    nonce = base64.urlsafe_b64decode(encryption_metadata["payload_nonce"].encode())
    dek = key_encryption_provider.unwrap_key(encryption_metadata, associated_data)
    return AESGCM(dek).decrypt(nonce, ciphertext, associated_data)


# Compatibility helpers for isolated research utilities. New application routes
# use encrypt_payload/decrypt_payload with a version-specific AAD value.
def encrypt_image(image_bytes: bytes, entropy: float | None = None) -> tuple[bytes, str, str]:
    plaintext_hash = sha3_hash(image_bytes)
    # Step 1: Hyperchaotic pixel permutation (preprocessing layer)
    key_bytes = hashlib.sha256(settings.master_key_b64.encode() + b"hyperchaos-v1").digest()
    permuted_bytes = create_permutation(key_bytes, image_bytes)
    # Step 2: AES-256-GCM authenticated encryption
    ciphertext, metadata = encrypt_payload(permuted_bytes, f"legacy:{plaintext_hash}".encode())
    metadata["hyperchaos"] = "chen-4d-v1"
    return ciphertext, plaintext_hash, json.dumps(metadata, sort_keys=True)


def decrypt_image(encrypted_bytes: bytes, image_hash: str, encrypted_metadata: str) -> bytes:
    metadata = json.loads(encrypted_metadata)
    permuted_plaintext = decrypt_payload(encrypted_bytes, metadata, f"legacy:{image_hash}".encode())
    # Reverse hyperchaotic permutation if applied
    if metadata.get("hyperchaos") == "chen-4d-v1":
        key_bytes = hashlib.sha256(settings.master_key_b64.encode() + b"hyperchaos-v1").digest()
        plaintext = restore_permutation(key_bytes, permuted_plaintext, len(permuted_plaintext))
    else:
        plaintext = permuted_plaintext
    if sha3_hash(plaintext) != image_hash:
        raise ValueError("Plaintext integrity hash mismatch")
    return plaintext


def calculate_npcr_uaci(c1_bytes: bytes, c2_bytes: bytes) -> tuple[float, float]:
    """Research metric only; it is not a security certification."""
    if not c1_bytes or len(c1_bytes) != len(c2_bytes):
        raise ValueError("Ciphertexts must be non-empty and equal length")
    a = np.frombuffer(c1_bytes, dtype=np.uint8).astype(np.float64)
    b = np.frombuffer(c2_bytes, dtype=np.uint8).astype(np.float64)
    npcr = float(np.mean(a != b) * 100)
    uaci = float(np.mean(np.abs(a - b) / 255.0) * 100)
    return npcr, uaci


def calculate_pixel_correlation(image_bytes: bytes) -> dict[str, float]:
    values = np.frombuffer(image_bytes, dtype=np.uint8).astype(np.float64)
    if values.size < 3:
        return {"horizontal": 0.0, "vertical": 0.0, "diagonal": 0.0}

    def correlation(left: np.ndarray, right: np.ndarray) -> float:
        if np.std(left) == 0 or np.std(right) == 0:
            return 0.0
        return round(float(np.corrcoef(left, right)[0, 1]), 6)

    return {
        "horizontal": correlation(values[:-1], values[1:]),
        "vertical": correlation(values[:-2], values[2:]),
        "diagonal": correlation(values[:-3], values[3:]),
    }
