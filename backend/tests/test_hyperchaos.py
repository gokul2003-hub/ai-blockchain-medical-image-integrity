"""
Phase 4 — 4D Chen Hyperchaotic System Tests
Tests verify the hyperchaotic permutation correctness, determinism,
round-trip invertibility, and integration with AES-256-GCM.
"""
import sys
import os
import pytest
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.hyperchaos import (
    ChenHyperchaosPermutation,
    create_permutation,
    restore_permutation,
)
from app.crypto import encrypt_image, decrypt_image


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

KEY_BYTES = b"\xde\xad\xbe\xef" * 8  # 32 bytes fixed test key


@pytest.fixture
def chen():
    return ChenHyperchaosPermutation(KEY_BYTES)


@pytest.fixture
def sample_data():
    np.random.seed(42)
    return bytes(np.random.randint(0, 256, 1024, dtype=np.uint8))


# ---------------------------------------------------------------------------
# ChenHyperchaosPermutation Unit Tests
# ---------------------------------------------------------------------------

class TestChenHyperchaosPermutation:

    def test_initial_conditions_deterministic(self, chen):
        """Same key always produces same initial conditions."""
        chen2 = ChenHyperchaosPermutation(KEY_BYTES)
        assert chen._x0 == chen2._x0
        assert chen._y0 == chen2._y0
        assert chen._z0 == chen2._z0
        assert chen._w0 == chen2._w0

    def test_initial_conditions_in_valid_range(self, chen):
        """Initial conditions must be in chemically chaotic regime."""
        assert 0.1 <= chen._x0 <= 1.0
        assert 0.1 <= chen._y0 <= 1.0
        assert 1.0 <= chen._z0 <= 10.0
        assert 0.1 <= chen._w0 <= 1.0

    def test_different_keys_different_initial_conditions(self):
        """Different keys produce different initial conditions."""
        chen1 = ChenHyperchaosPermutation(b"\x00" * 32)
        chen2 = ChenHyperchaosPermutation(b"\xFF" * 32)
        assert chen1._x0 != chen2._x0 or chen1._z0 != chen2._z0

    def test_integration_produces_trajectory(self, chen):
        """RK4 integration produces a trajectory of correct shape."""
        traj = chen._integrate(100)
        assert traj.shape == (100, 4), f"Expected (100, 4), got {traj.shape}"

    def test_trajectory_is_bounded(self, chen):
        """Chen system trajectory stays bounded (chaos, not explosion)."""
        traj = chen._integrate(500)
        assert np.all(np.isfinite(traj)), "Trajectory contains NaN or Inf"
        assert np.max(np.abs(traj)) < 1e6, "Trajectory values unexpectedly large"

    def test_permutation_indices_correct_length(self, chen, sample_data):
        """Permutation indices have correct length."""
        n = len(sample_data)
        indices = chen.generate_permutation_indices(n)
        assert len(indices) == n

    def test_permutation_indices_valid_range(self, chen, sample_data):
        """Permutation indices form a valid bijection [0, n)."""
        n = len(sample_data)
        indices = chen.generate_permutation_indices(n)
        assert set(indices.tolist()) == set(range(n)), "Indices not a valid permutation"

    def test_permutation_indices_deterministic(self, chen, sample_data):
        """Same key always produces same permutation indices."""
        chen2 = ChenHyperchaosPermutation(KEY_BYTES)
        n = len(sample_data)
        idx1 = chen.generate_permutation_indices(n)
        idx2 = chen2.generate_permutation_indices(n)
        np.testing.assert_array_equal(idx1, idx2)

    def test_permute_changes_data(self, chen, sample_data):
        """Permutation changes the byte order."""
        permuted = chen.permute(sample_data)
        assert permuted != sample_data, "Permuted data should differ from original"

    def test_permute_preserves_length(self, chen, sample_data):
        """Permutation preserves data length."""
        permuted = chen.permute(sample_data)
        assert len(permuted) == len(sample_data)

    def test_permute_preserves_content(self, chen, sample_data):
        """Permutation only reorders bytes, does not change byte values."""
        permuted = chen.permute(sample_data)
        assert sorted(permuted) == sorted(sample_data)

    def test_round_trip_restore(self, chen, sample_data):
        """Permute then inverse_permute returns original data exactly."""
        permuted = chen.permute(sample_data)
        restored = chen.inverse_permute(permuted, len(sample_data))
        assert restored == sample_data, "Round-trip failed: restored != original"

    def test_round_trip_different_key_fails(self, sample_data):
        """Cannot restore with a different key."""
        chen1 = ChenHyperchaosPermutation(b"\x01" * 32)
        chen2 = ChenHyperchaosPermutation(b"\x02" * 32)
        permuted = chen1.permute(sample_data)
        # Restoring with wrong key should produce wrong data
        wrong_restore = chen2.inverse_permute(permuted, len(sample_data))
        assert wrong_restore != sample_data

    def test_keystream_length(self, chen):
        """Keystream has requested length."""
        ks = chen.generate_keystream(256)
        assert len(ks) == 256

    def test_keystream_is_bytes(self, chen):
        """Keystream returns bytes in 0-255 range."""
        ks = chen.generate_keystream(100)
        assert isinstance(ks, bytes)
        assert all(0 <= b <= 255 for b in ks)


# ---------------------------------------------------------------------------
# Module-level function tests
# ---------------------------------------------------------------------------

class TestModuleFunctions:

    def test_create_then_restore(self, sample_data):
        """create_permutation then restore_permutation returns original."""
        permuted = create_permutation(KEY_BYTES, sample_data)
        restored = restore_permutation(KEY_BYTES, permuted, len(sample_data))
        assert restored == sample_data

    def test_permutation_is_different_from_original(self, sample_data):
        """Permuted data differs from original (not identity permutation)."""
        permuted = create_permutation(KEY_BYTES, sample_data)
        # Extremely unlikely to be the same for 1024 bytes of random data
        assert permuted != sample_data

    def test_different_keys_different_permutations(self, sample_data):
        """Different keys produce different permutations."""
        p1 = create_permutation(b"\x01" * 32, sample_data)
        p2 = create_permutation(b"\x02" * 32, sample_data)
        assert p1 != p2


# ---------------------------------------------------------------------------
# Integration with AES-256-GCM (crypto.py)
# ---------------------------------------------------------------------------

class TestHyperchaosInEncryptionPipeline:

    def test_encrypt_decrypt_round_trip(self):
        """encrypt_image → decrypt_image returns original bytes."""
        import cv2
        # Create a small synthetic image
        img = np.zeros((128, 128), dtype=np.uint8)
        cv2.ellipse(img, (64, 64), (40, 50), 0, 0, 360, 180, -1)
        _, encoded = cv2.imencode(".png", img)
        original_bytes = encoded.tobytes()

        ciphertext, original_hash, metadata_json = encrypt_image(original_bytes)
        decrypted = decrypt_image(ciphertext, original_hash, metadata_json)
        assert decrypted == original_bytes

    def test_encrypt_metadata_has_hyperchaos_flag(self):
        """Encryption metadata marks the hyperchaotic layer."""
        import json
        import cv2
        img = np.zeros((64, 64), dtype=np.uint8)
        _, encoded = cv2.imencode(".png", img)
        _, _, metadata_json = encrypt_image(encoded.tobytes())
        metadata = json.loads(metadata_json)
        assert metadata.get("hyperchaos") == "chen-4d-v1"

    def test_tampered_ciphertext_rejected(self):
        """Modifying ciphertext causes decryption to fail (AES-GCM auth)."""
        import cv2
        img = np.zeros((64, 64), dtype=np.uint8)
        _, encoded = cv2.imencode(".png", img)
        ciphertext, original_hash, metadata_json = encrypt_image(encoded.tobytes())
        tampered = bytearray(ciphertext)
        tampered[16] ^= 0xFF
        with pytest.raises(Exception):
            decrypt_image(bytes(tampered), original_hash, metadata_json)

    def test_wrong_hash_rejected(self):
        """Wrong image_hash causes decryption to fail (integrity check)."""
        import cv2
        img = np.zeros((64, 64), dtype=np.uint8)
        _, encoded = cv2.imencode(".png", img)
        ciphertext, original_hash, metadata_json = encrypt_image(encoded.tobytes())
        with pytest.raises(Exception):
            decrypt_image(ciphertext, "deadbeef" * 8, metadata_json)

    def test_backward_compat_no_hyperchaos_metadata(self):
        """Images encrypted without hyperchaos (legacy) still decrypt."""
        import json
        from app.crypto import encrypt_payload, decrypt_payload, sha3_hash
        # Simulate legacy encryption without hyperchaos flag
        original = b"legacy test data for backward compat " * 10
        orig_hash = sha3_hash(original)
        aad = f"legacy:{orig_hash}".encode()
        ciphertext, meta = encrypt_payload(original, aad)
        # meta has no 'hyperchaos' key — simulates old images
        meta_str = json.dumps(meta, sort_keys=True)
        # decrypt_image should handle this via the else branch
        decrypted = decrypt_image(ciphertext, orig_hash, meta_str)
        assert decrypted == original
