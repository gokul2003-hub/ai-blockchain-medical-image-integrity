"""
Phase 3 — Real Schnorr ZKP Security Tests
Tests verify genuine EC Schnorr operations on SECP256K1.
"""
import sys
import os
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.zkp import SchnorrZKP, zkp_verifier


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def zkp():
    return SchnorrZKP()


@pytest.fixture
def keypair(zkp):
    return zkp.generate_keypair()


# ---------------------------------------------------------------------------
# Core protocol tests
# ---------------------------------------------------------------------------

class TestSchnorrZKPCoreProtocol:

    def test_valid_proof_passes(self, zkp):
        """A honestly generated proof verifies correctly."""
        secret_key = 9876543210123
        message = "test-message-access-45"
        R_hash, s_hex, e_hex = zkp.generate_proof(secret_key, message)
        assert zkp.verify_proof(R_hash, s_hex, e_hex, secret_key, message) is True

    def test_wrong_witness_fails(self, zkp):
        """Using a different private key during verification must fail."""
        secret_key = 9876543210123
        message = "test-message-access-45"
        R_hash, s_hex, e_hex = zkp.generate_proof(secret_key, message)
        assert zkp.verify_proof(R_hash, s_hex, e_hex, secret_key + 1, message) is False

    def test_modified_message_fails(self, zkp):
        """Changing the context/message during verification must fail."""
        secret_key = 9876543210123
        message = "test-message-access-45"
        R_hash, s_hex, e_hex = zkp.generate_proof(secret_key, message)
        assert zkp.verify_proof(R_hash, s_hex, e_hex, secret_key, "different-message") is False

    def test_modified_commitment_fails(self, zkp):
        """Tampering with the commitment R must cause verification failure."""
        secret_key = 9876543210123
        message = "test-message"
        R_hash, s_hex, e_hex = zkp.generate_proof(secret_key, message)
        # Flip a bit in the commitment string
        tampered_R = R_hash[:-4] + "ffff"
        assert zkp.verify_proof(tampered_R, s_hex, e_hex, secret_key, message) is False

    def test_modified_response_fails(self, zkp):
        """Tampering with the response s must cause verification failure."""
        secret_key = 9876543210123
        message = "test-message"
        R_hash, s_hex, e_hex = zkp.generate_proof(secret_key, message)
        # Flip a bit in the response
        tampered_s = hex(int(s_hex, 16) ^ 0xFF)
        assert zkp.verify_proof(R_hash, tampered_s, e_hex, secret_key, message) is False

    def test_modified_challenge_fails(self, zkp):
        """Tampering with the challenge e must cause verification failure."""
        secret_key = 9876543210123
        message = "test-message"
        R_hash, s_hex, e_hex = zkp.generate_proof(secret_key, message)
        tampered_e = hex(int(e_hex, 16) ^ 0xFF)
        assert zkp.verify_proof(R_hash, s_hex, tampered_e, secret_key, message) is False

    def test_malformed_commitment_rejected(self, zkp):
        """Malformed commitment string should be rejected gracefully."""
        result = zkp.verify_proof("not-valid", "0x1234", "0x5678", 12345, "msg")
        assert result is False

    def test_malformed_response_rejected(self, zkp):
        """Non-hex response string should be handled gracefully."""
        secret_key = 9876543210123
        message = "test"
        R_hash, s_hex, e_hex = zkp.generate_proof(secret_key, message)
        result = zkp.verify_proof(R_hash, "not-hex-xxxx", e_hex, secret_key, message)
        assert result is False


# ---------------------------------------------------------------------------
# Full API tests (new generate_proof_full / verify_proof_full)
# ---------------------------------------------------------------------------

class TestSchnorrZKPFullAPI:

    def test_generate_keypair_returns_valid_scalars(self, zkp):
        """Keypair generation produces valid curve scalars and points."""
        _N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
        private, public = zkp.generate_keypair()
        assert isinstance(private, int)
        assert 0 < private < _N
        assert isinstance(public, tuple)
        assert len(public) == 2
        Px, Py = public
        assert isinstance(Px, int) and isinstance(Py, int)
        assert Px > 0 and Py > 0

    def test_deterministic_keypair_for_user(self, zkp):
        """Same user_id + seed produces same keypair deterministically."""
        kp1 = zkp.generate_keypair_for_user(42, seed=b"fixed-seed")
        kp2 = zkp.generate_keypair_for_user(42, seed=b"fixed-seed")
        assert kp1[0] == kp2[0]
        assert kp1[1] == kp2[1]

    def test_different_users_different_keypairs(self, zkp):
        """Different user IDs produce different keypairs (no fixed seed → random)."""
        # Without a fixed seed, keypairs are random and differ
        kp1 = zkp.generate_keypair()
        kp2 = zkp.generate_keypair()
        # In the astronomically unlikely case they collide, retry
        attempts = 0
        while kp1[0] == kp2[0] and attempts < 5:
            kp2 = zkp.generate_keypair()
            attempts += 1
        assert kp1[0] != kp2[0], "Random keypairs should differ"

    def test_full_api_proof_verifies(self, zkp):
        """Full API generate_proof_full / verify_proof_full round-trip."""
        private_key, public_key = zkp.generate_keypair()
        context = "patient-42-doctor-7-image-access"
        proof = zkp.generate_proof_full(private_key, public_key, context)
        assert isinstance(proof, dict)
        assert "Rx" in proof and "Ry" in proof and "s" in proof and "c" in proof
        assert zkp.verify_proof_full(public_key, proof, context) is True

    def test_full_api_wrong_public_key_fails(self, zkp):
        """Full API verification with wrong public key must fail."""
        private_key, public_key = zkp.generate_keypair()
        _, wrong_public = zkp.generate_keypair()
        context = "some-context"
        proof = zkp.generate_proof_full(private_key, public_key, context)
        assert zkp.verify_proof_full(wrong_public, proof, context) is False

    def test_full_api_wrong_context_fails(self, zkp):
        """Full API verification with modified context must fail."""
        private_key, public_key = zkp.generate_keypair()
        context = "context-A"
        proof = zkp.generate_proof_full(private_key, public_key, context)
        assert zkp.verify_proof_full(public_key, proof, "context-B") is False

    def test_full_api_tampered_proof_fails(self, zkp):
        """Tampered proof dict must fail verification."""
        private_key, public_key = zkp.generate_keypair()
        context = "context"
        proof = zkp.generate_proof_full(private_key, public_key, context)
        tampered = dict(proof)
        tampered["s"] = proof["s"] ^ 0xDEAD
        assert zkp.verify_proof_full(public_key, tampered, context) is False


# ---------------------------------------------------------------------------
# Global instance test (backward compat)
# ---------------------------------------------------------------------------

class TestGlobalZKPInstance:

    def test_global_zkp_verifier_exists(self):
        """zkp_verifier global singleton is available."""
        assert zkp_verifier is not None
        assert isinstance(zkp_verifier, SchnorrZKP)

    def test_global_backward_compat_api(self):
        """The old API (used in existing tests) still works correctly."""
        secret_key = 9876543210123
        message = "verify-image-access-45"
        R_hash, s_hex, e_hex = zkp_verifier.generate_proof(secret_key, message)
        assert zkp_verifier.verify_proof(R_hash, s_hex, e_hex, secret_key, message) is True
        assert zkp_verifier.verify_proof(R_hash, s_hex, e_hex, secret_key + 1, message) is False
