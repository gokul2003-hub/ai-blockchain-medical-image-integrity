import sys
import os
import pytest
import numpy as np
from cryptography.exceptions import InvalidTag

# Ensure app is in path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.crypto import (
    sha3_hash,
    sha256_hash,
    canonical_json_hash,
    encrypt_payload,
    decrypt_payload,
    encrypt_image,
    decrypt_image,
    calculate_npcr_uaci,
    calculate_pixel_correlation,
)


def test_sha3_and_sha256_hashes():
    data = b"medical_image_scan_bytes_clinical_study"
    h3 = sha3_hash(data)
    h256 = sha256_hash(data)

    assert len(h3) == 64
    assert len(h256) == 64
    assert h3 == sha3_hash(data)
    assert h256 == sha256_hash(data)
    assert h3 != h256


def test_canonical_json_hash():
    dict1 = {"patient_id": 1, "modality": "MRI", "active": True}
    dict2 = {"active": True, "modality": "MRI", "patient_id": 1}
    assert canonical_json_hash(dict1) == canonical_json_hash(dict2)


def test_aes_256_gcm_payload_encryption_and_decryption():
    plaintext = os.urandom(65536)  # 256x256 grayscale scan bytes
    aad = b"image_id:101:version:1"

    ciphertext, metadata = encrypt_payload(plaintext, aad)

    assert len(ciphertext) == len(plaintext) + 16  # 16-byte GCM authentication tag
    assert metadata["format"] == "AES-256-GCM-DEK-v1"
    assert "wrapped_dek" in metadata
    assert "payload_nonce" in metadata
    assert "wrap_nonce" in metadata

    decrypted = decrypt_payload(ciphertext, metadata, aad)
    assert decrypted == plaintext


def test_aes_gcm_tampered_ciphertext_rejected():
    plaintext = b"sensitive_patient_diagnostic_report_payload"
    aad = b"aad_binding_v1"

    ciphertext, metadata = encrypt_payload(plaintext, aad)

    # Flip a bit in the ciphertext payload
    tampered = bytearray(ciphertext)
    tampered[10] ^= 0x01
    tampered_bytes = bytes(tampered)

    with pytest.raises(InvalidTag):
        decrypt_payload(tampered_bytes, metadata, aad)


def test_aes_gcm_tampered_aad_rejected():
    plaintext = b"sensitive_patient_diagnostic_report_payload"
    aad = b"legitimate_aad"
    attacker_aad = b"malicious_aad"

    ciphertext, metadata = encrypt_payload(plaintext, aad)

    with pytest.raises(InvalidTag):
        decrypt_payload(ciphertext, metadata, attacker_aad)


def test_aes_gcm_tampered_wrapped_key_rejected():
    plaintext = b"sensitive_patient_diagnostic_report_payload"
    aad = b"aad_binding_v1"

    ciphertext, metadata = encrypt_payload(plaintext, aad)

    # Tamper with wrapped DEK
    import base64
    wrapped_bytes = bytearray(base64.urlsafe_b64decode(metadata["wrapped_dek"]))
    wrapped_bytes[5] ^= 0xFF
    bad_meta = dict(metadata)
    bad_meta["wrapped_dek"] = base64.urlsafe_b64encode(bytes(wrapped_bytes)).decode()

    with pytest.raises(InvalidTag):
        decrypt_payload(ciphertext, bad_meta, aad)


def test_empty_payload_rejection():
    with pytest.raises(ValueError, match="Cannot encrypt an empty image payload"):
        encrypt_payload(b"", b"aad")


def test_encrypt_and_decrypt_image_flow():
    image_bytes = os.urandom(32768)
    ciphertext, orig_hash, metadata_json = encrypt_image(image_bytes)

    assert orig_hash == sha3_hash(image_bytes)
    assert len(metadata_json) > 0

    decrypted = decrypt_image(ciphertext, orig_hash, metadata_json)
    assert decrypted == image_bytes


def test_crypto_research_metrics():
    # NPCR and UACI
    c1 = bytes(np.random.randint(0, 256, 10000, dtype=np.uint8))
    c2 = bytearray(c1)
    for i in range(50):
        c2[i] = (c2[i] + 1) % 256
    npcr, uaci = calculate_npcr_uaci(c1, bytes(c2))
    assert 0.0 < npcr < 1.0
    assert uaci >= 0.0

    # Pixel correlation
    corrs = calculate_pixel_correlation(c1)
    assert "horizontal" in corrs
    assert "vertical" in corrs
    assert "diagonal" in corrs
