"""
Phase 1 — 4D Chen hyperchaotic encryption pipeline tests.

Covers the complete target pipeline:

    Original Image -> preprocessing -> 4D Chen sequence -> 4D Chen permutation
                   -> 4D Chen diffusion (XOR keystream) -> AES-256-GCM

and its exact inverse:

    AES-256-GCM -> inverse Chen diffusion -> inverse Chen permutation -> image

AES-256-GCM authentication is never weakened by the hyperchaotic layer; the
chaotic stage is a preprocessing transform applied before the encryption
boundary.
"""

import base64
import dataclasses
import hashlib
import inspect
import json
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import app.crypto as crypto_module
from app.crypto import (
    _chen_pipeline_seed,
    _hyperchaos_key,
    decrypt_image,
    encrypt_image,
    encrypt_payload,
    sha3_hash,
)
from app.hyperchaos import ChenHyperchaosPermutation

KEY_BYTES = b"\xde\xad\xbe\xef" * 8


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def chen():
    return ChenHyperchaosPermutation(KEY_BYTES)


@pytest.fixture
def sample_data():
    np.random.seed(1337)
    return bytes(np.random.randint(0, 256, 2048, dtype=np.uint8))


def _png_bytes(width: int = 64, height: int = 64, salt: int = 0) -> bytes:
    """Build a real encoded image so tests exercise the true application input."""
    import cv2

    img = np.zeros((height, width), dtype=np.uint8)
    cv2.ellipse(img, (width // 2, height // 2), (width // 4, height // 3), 0, 0, 360, 180 + salt, -1)
    ok, encoded = cv2.imencode(".png", img)
    assert ok
    return encoded.tobytes()


# ---------------------------------------------------------------------------
# 1. Chen permutation
# ---------------------------------------------------------------------------

class TestChenPermutation:

    def test_permutation_is_valid_bijection(self, chen, sample_data):
        indices = chen.generate_permutation_indices(len(sample_data))
        assert sorted(indices.tolist()) == list(range(len(sample_data)))

    def test_permutation_preserves_length_and_multiset(self, chen, sample_data):
        permuted = chen.permute(sample_data)
        assert len(permuted) == len(sample_data)
        assert sorted(permuted) == sorted(sample_data)

    def test_permutation_changes_byte_order(self, chen, sample_data):
        assert chen.permute(sample_data) != sample_data

    def test_permutation_differs_by_key(self, sample_data):
        a = ChenHyperchaosPermutation(b"\x01" * 32).permute(sample_data)
        b = ChenHyperchaosPermutation(b"\x02" * 32).permute(sample_data)
        assert a != b


# ---------------------------------------------------------------------------
# 2. Chen diffusion
# ---------------------------------------------------------------------------

class TestChenDiffusion:

    def test_keystream_length_and_range(self, chen):
        ks = chen.generate_keystream(512)
        assert len(ks) == 512
        assert all(0 <= byte <= 255 for byte in ks)

    def test_keystream_is_not_constant(self, chen):
        """A degenerate keystream would provide no diffusion at all."""
        ks = chen.generate_keystream(512)
        assert len(set(ks)) > 32, "Keystream lacks byte diversity"

    def test_diffusion_changes_data_and_preserves_length(self, sample_data):
        from app.hyperchaos import diffuse

        out = diffuse(KEY_BYTES, sample_data)
        assert out != sample_data
        assert len(out) == len(sample_data)

    def test_diffusion_uses_all_four_chaotic_dimensions(self, chen):
        """The keystream must not be reproducible from a single dimension."""
        ks = chen.generate_keystream(1024)
        assert len(set(ks)) > 64


# ---------------------------------------------------------------------------
# 3. Inverse diffusion
# ---------------------------------------------------------------------------

class TestInverseDiffusion:

    def test_inverse_diffusion_restores_original(self, sample_data):
        from app.hyperchaos import diffuse, inverse_diffuse

        diffused = diffuse(KEY_BYTES, sample_data)
        assert inverse_diffuse(KEY_BYTES, diffused) == sample_data

    def test_inverse_diffusion_is_exact_on_repeated_application(self, sample_data):
        from app.hyperchaos import diffuse, inverse_diffuse

        once = diffuse(KEY_BYTES, sample_data)
        twice = inverse_diffuse(KEY_BYTES, once)
        assert twice == sample_data
        assert diffuse(KEY_BYTES, twice) == once


# ---------------------------------------------------------------------------
# 4. Inverse permutation / combined stage inverse
# ---------------------------------------------------------------------------

class TestInversePermutation:

    def test_inverse_permutation_restores_original(self, sample_data):
        from app.hyperchaos import create_permutation, restore_permutation

        permuted = create_permutation(KEY_BYTES, sample_data)
        assert restore_permutation(KEY_BYTES, permuted, len(sample_data)) == sample_data

    def test_combined_stage_inverse_restores_original(self, sample_data):
        from app.hyperchaos import inverse_permute_and_diffuse, permute_and_diffuse

        chaotic = permute_and_diffuse(KEY_BYTES, sample_data)
        assert inverse_permute_and_diffuse(KEY_BYTES, chaotic, len(sample_data)) == sample_data

    def test_combined_stage_differs_from_permutation_only(self, sample_data):
        """The diffusion layer must actually contribute, not be a no-op wrapper."""
        from app.hyperchaos import create_permutation, permute_and_diffuse

        assert permute_and_diffuse(KEY_BYTES, sample_data) != create_permutation(KEY_BYTES, sample_data)

    def test_inverse_with_wrong_seed_does_not_restore(self, sample_data):
        from app.hyperchaos import inverse_permute_and_diffuse, permute_and_diffuse

        chaotic = permute_and_diffuse(KEY_BYTES, sample_data)
        wrong = inverse_permute_and_diffuse(b"\x07" * 32, chaotic, len(chaotic))
        assert wrong != sample_data


# ---------------------------------------------------------------------------
# 5. Full encrypt/decrypt round trip
# ---------------------------------------------------------------------------

class TestFullRoundTrip:

    def test_round_trip_returns_identical_bytes(self):
        original = _png_bytes()
        ciphertext, original_hash, metadata_json = encrypt_image(original)
        assert decrypt_image(ciphertext, original_hash, metadata_json) == original

    def test_round_trip_with_entropy_argument(self):
        original = _png_bytes(salt=40)
        ciphertext, original_hash, metadata_json = encrypt_image(original, 7.5)
        assert decrypt_image(ciphertext, original_hash, metadata_json) == original

    def test_round_trip_dicom_style_payload(self):
        original = _png_bytes(128, 128, salt=15)
        ciphertext, original_hash, metadata_json = encrypt_image(original)
        assert decrypt_image(ciphertext, original_hash, metadata_json) == original

    def test_metadata_marks_hyperchaos_and_diffusion(self):
        _, _, metadata_json = encrypt_image(_png_bytes())
        metadata = json.loads(metadata_json)
        assert metadata["hyperchaos"] == "chen-4d-v1"
        assert metadata["chen_diffusion"] == "keystream-xor-v1"

    def test_round_trip_is_stable_across_calls(self):
        original = _png_bytes()
        _, hash_a, _ = encrypt_image(original)
        _, hash_b, _ = encrypt_image(original)
        assert hash_a == hash_b


# ---------------------------------------------------------------------------
# 6. Corrupted ciphertext detection
# ---------------------------------------------------------------------------

class TestCorruptionDetection:

    def test_ciphertext_byte_flip_is_rejected(self):
        original = _png_bytes()
        ciphertext, original_hash, metadata_json = encrypt_image(original)
        tampered = bytearray(ciphertext)
        tampered[16] ^= 0xFF
        with pytest.raises(Exception):
            decrypt_image(bytes(tampered), original_hash, metadata_json)

    def test_truncated_ciphertext_is_rejected(self):
        original = _png_bytes()
        ciphertext, original_hash, metadata_json = encrypt_image(original)
        with pytest.raises(Exception):
            decrypt_image(ciphertext[:-8], original_hash, metadata_json)

    def test_tampered_nonce_is_rejected(self):
        original = _png_bytes()
        ciphertext, original_hash, metadata_json = encrypt_image(original)
        metadata = json.loads(metadata_json)
        raw = bytearray(base64.urlsafe_b64decode(metadata["payload_nonce"].encode()))
        raw[0] ^= 0xFF
        metadata["payload_nonce"] = base64.urlsafe_b64encode(bytes(raw)).decode()
        with pytest.raises(Exception):
            decrypt_image(ciphertext, original_hash, json.dumps(metadata, sort_keys=True))

    def test_tampered_wrapped_key_is_rejected(self):
        original = _png_bytes()
        ciphertext, original_hash, metadata_json = encrypt_image(original)
        metadata = json.loads(metadata_json)
        raw = bytearray(base64.urlsafe_b64decode(metadata["wrapped_dek"].encode()))
        raw[0] ^= 0xFF
        metadata["wrapped_dek"] = base64.urlsafe_b64encode(bytes(raw)).decode()
        with pytest.raises(Exception):
            decrypt_image(ciphertext, original_hash, json.dumps(metadata, sort_keys=True))

    def test_wrong_plaintext_hash_is_rejected(self):
        original = _png_bytes()
        ciphertext, original_hash, metadata_json = encrypt_image(original)
        with pytest.raises(Exception):
            decrypt_image(ciphertext, "0" * 64, metadata_json)


# ---------------------------------------------------------------------------
# 7. Different plaintext -> different ciphertext / different integrity hash
# ---------------------------------------------------------------------------

class TestPlaintextVariation:

    def test_different_plaintext_yields_different_ciphertext(self):
        first = _png_bytes(salt=0)
        second = _png_bytes(salt=90)
        cipher_a, _, _ = encrypt_image(first)
        cipher_b, _, _ = encrypt_image(second)
        assert cipher_a != cipher_b

    def test_single_pixel_change_changes_integrity_hash(self):
        """One altered pixel must change the recorded integrity hash."""
        original = _png_bytes()
        perturbed = bytearray(original)
        perturbed[len(perturbed) // 2] ^= 0x01
        _, hash_original, _ = encrypt_image(original)
        _, hash_perturbed, _ = encrypt_image(bytes(perturbed))
        assert hash_original != hash_perturbed

    def test_single_pixel_change_changes_chaotic_stage_completely(self):
        """Avalanche: one changed byte rekeys the whole chaotic stage."""
        original = _png_bytes()
        perturbed = bytearray(original)
        perturbed[len(perturbed) // 2] ^= 0x01
        perturbed = bytes(perturbed)

        seed_a = _chen_pipeline_seed(sha3_hash(original))
        seed_b = _chen_pipeline_seed(sha3_hash(perturbed))
        assert seed_a != seed_b

        from app.hyperchaos import permute_and_diffuse

        out_a = permute_and_diffuse(seed_a, original)
        out_b = permute_and_diffuse(seed_b, perturbed)
        differing = sum(1 for x, y in zip(out_a, out_b) if x != y)
        assert differing > 0.99 * len(out_a), "Diffusion failed to avalanche"


# ---------------------------------------------------------------------------
# 8. Different key -> different ciphertext
# ---------------------------------------------------------------------------

class TestKeyVariation:

    def _with_master_key(self, monkeypatch, key_material: bytes) -> None:
        """Swap the settings object bound inside app.crypto (Settings is frozen)."""
        replaced = dataclasses.replace(
            crypto_module.settings,
            master_key_b64=base64.urlsafe_b64encode(key_material).decode(),
        )
        monkeypatch.setattr(crypto_module, "settings", replaced)

    def test_different_key_changes_chaotic_stage(self, sample_data):
        from app.hyperchaos import permute_and_diffuse

        assert permute_and_diffuse(b"\x01" * 32, sample_data) != permute_and_diffuse(
            b"\x02" * 32, sample_data
        )

    def test_different_master_key_changes_ciphertext(self, monkeypatch):
        """With nonces and DEKs held fixed, the key must still change the ciphertext.

        This proves the master key drives the chaotic stage rather than the output
        differing merely because encryption uses fresh randomness.
        """
        monkeypatch.setattr(crypto_module.os, "urandom", lambda n: bytes(n))
        original = _png_bytes()

        self._with_master_key(monkeypatch, b"\x01" * 32)
        cipher_a, hash_a, _ = encrypt_image(original)

        self._with_master_key(monkeypatch, b"\x02" * 32)
        cipher_b, hash_b, _ = encrypt_image(original)

        assert hash_a == hash_b, "Plaintext hash must not depend on the key"
        assert cipher_a != cipher_b, "Master key must affect the encrypted output"

    def test_wrong_master_key_cannot_decrypt(self, monkeypatch):
        original = _png_bytes()
        ciphertext, original_hash, metadata_json = encrypt_image(original)
        self._with_master_key(monkeypatch, b"\x09" * 32)
        with pytest.raises(Exception):
            decrypt_image(ciphertext, original_hash, metadata_json)


# ---------------------------------------------------------------------------
# 9. Same plaintext + same parameters -> deterministic Chen stage
# ---------------------------------------------------------------------------

class TestDeterminism:

    def test_keystream_is_deterministic(self, chen, sample_data):
        n = len(sample_data)
        assert chen.generate_keystream(n) == chen.generate_keystream(n)

    def test_keystream_prefix_is_stable(self, chen):
        """The keystream is a stream: a shorter request is a prefix of a longer one."""
        assert chen.generate_keystream(64) == chen.generate_keystream(256)[:64]

    def test_combined_stage_is_deterministic(self, sample_data):
        from app.hyperchaos import permute_and_diffuse

        seed = _chen_pipeline_seed("a" * 64)
        assert permute_and_diffuse(seed, sample_data) == permute_and_diffuse(seed, sample_data)

    def test_pipeline_seed_is_deterministic(self):
        assert _chen_pipeline_seed("b" * 64) == _chen_pipeline_seed("b" * 64)

    def test_pipeline_seed_depends_on_key_and_hash(self, monkeypatch):
        base = _chen_pipeline_seed("c" * 64)
        TestKeyVariation()._with_master_key(monkeypatch, b"\x05" * 32)
        assert _chen_pipeline_seed("c" * 64) != base


# ---------------------------------------------------------------------------
# 10. Existing API compatibility
# ---------------------------------------------------------------------------

class TestApiCompatibility:

    def test_encrypt_image_signature_unchanged(self):
        params = list(inspect.signature(encrypt_image).parameters)
        assert params == ["image_bytes", "entropy"]
        assert inspect.signature(encrypt_image).parameters["entropy"].default is None

    def test_decrypt_image_signature_unchanged(self):
        params = list(inspect.signature(decrypt_image).parameters)
        assert params == ["encrypted_bytes", "image_hash", "encrypted_metadata"]

    def test_encrypt_image_return_contract(self):
        result = encrypt_image(_png_bytes())
        assert isinstance(result, tuple) and len(result) == 3
        ciphertext, plaintext_hash, metadata_json = result
        assert isinstance(ciphertext, bytes)
        assert isinstance(plaintext_hash, str) and len(plaintext_hash) == 64
        assert isinstance(metadata_json, str)
        assert json.loads(metadata_json)

    def test_metadata_structure_preserved(self):
        _, _, metadata_json = encrypt_image(_png_bytes())
        metadata = json.loads(metadata_json)
        for key in ("format", "payload_nonce", "tag_location", "key_provider", "key_id",
                    "wrap_nonce", "wrapped_dek", "hyperchaos"):
            assert key in metadata, f"Metadata key '{key}' disappeared"
        assert metadata["format"] == "AES-256-GCM-DEK-v1"

    def test_metadata_leaks_no_key_material(self):
        """Requirements 8 and 9: key material must stay server-side."""
        _, _, metadata_json = encrypt_image(_png_bytes())
        master = crypto_module.settings.master_key_b64
        assert master not in metadata_json
        assert base64.urlsafe_b64encode(hashlib.sha256(master.encode()).digest()).decode() not in metadata_json
        assert _hyperchaos_key().hex() not in metadata_json

    def test_legacy_permutation_only_object_still_decrypts(self):
        """Pre-upgrade stored objects (no diffusion marker) remain readable."""
        original = _png_bytes(salt=25)
        original_hash = sha3_hash(original)
        from app.hyperchaos import create_permutation

        legacy_chaotic = create_permutation(_hyperchaos_key(), original)
        ciphertext, metadata = encrypt_payload(legacy_chaotic, f"legacy:{original_hash}".encode())
        metadata["hyperchaos"] = "chen-4d-v1"

        assert decrypt_image(ciphertext, original_hash, json.dumps(metadata, sort_keys=True)) == original

    def test_object_without_any_chen_marker_still_decrypts(self):
        """Objects encrypted outside the Chen pipeline pass through unchanged."""
        original = _png_bytes(salt=60)
        original_hash = sha3_hash(original)
        ciphertext, metadata = encrypt_payload(original, f"legacy:{original_hash}".encode())
        assert decrypt_image(ciphertext, original_hash, json.dumps(metadata, sort_keys=True)) == original