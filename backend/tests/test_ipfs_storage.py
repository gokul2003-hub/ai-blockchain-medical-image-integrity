"""
Phase 6 — Real IPFS Storage Integration Tests
==============================================

All tests in this module are fully mocked at the `requests` boundary.
No real IPFS daemon is required.  Tests verify:

  Functional (16):
  1.  validate_ipfs_cid — valid CIDv0
  2.  validate_ipfs_cid — valid CIDv1
  3.  validate_ipfs_cid — empty string is rejected
  4.  validate_ipfs_cid — whitespace-only is rejected
  5.  LocalStorageProvider still works (regression guard)
  6.  IPFSProvider.put — success path (mocked daemon /api/v0/add)
  7.  IPFSProvider.put — daemon returns non-200 raises RuntimeError
  8.  IPFSProvider.put — daemon returns invalid/empty Hash raises RuntimeError
  9.  IPFSProvider.get — success path (mocked /api/v0/cat)
  10. IPFSProvider.get — invalid CID raises ValueError before network call
  11. IPFSProvider.delete — success path (mocked /api/v0/pin/rm)
  12. verify_ipfs_pin  — returns True when CID is in pin/ls response
  13. verify_ipfs_pin  — returns False when CID is NOT in pin/ls response
  14. verify_ipfs_pin  — returns False when daemon is unreachable (no raise)
  15. ipfs_is_reachable — returns True when daemon responds
  16. ipfs_is_reachable — returns False when daemon unreachable (no raise)

  Security (7):
  17. URL injection via slash in CID is rejected
  18. URL injection via colon in CID is rejected
  19. URL injection via query string in CID is rejected
  20. Path traversal via .. in CID is rejected
  21. CID with embedded null byte is rejected
  22. CID that is far too short is rejected by validate_ipfs_cid
  23. IPFSProvider.get never issues a request for an invalid CID
"""

import os
import sys
import pytest
from unittest.mock import MagicMock, patch, PropertyMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))


from app.storage_provider import (
    LocalStorageProvider,
    IPFSProvider,
    validate_ipfs_cid,
    verify_ipfs_pin,
    ipfs_is_reachable,
    store_encrypted_object,
    load_encrypted_object,
    StoredObject,
    assert_ipfs_available,
    verify_stored_content,
)


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

VALID_CIDv0 = "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"  # 46 chars
VALID_CIDv1 = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
MOCK_PAYLOAD = b"ENCRYPTED_MEDICAL_SCAN_PAYLOAD_BYTES_FOR_PHASE6_TEST"


def _mock_response(status: int = 200, json_data: dict | None = None, content: bytes = b"") -> MagicMock:
    """Build a minimal mock that quacks like a requests.Response."""
    resp = MagicMock()
    resp.status_code = status
    resp.content = content
    resp.json.return_value = json_data or {}
    # raise_for_status() raises only when status >= 400
    if status >= 400:
        import requests
        resp.raise_for_status.side_effect = requests.HTTPError(
            f"HTTP {status}", response=resp
        )
    else:
        resp.raise_for_status.return_value = None
    return resp


# ===========================================================================
# Functional Tests
# ===========================================================================


class TestValidateIPFSCid:
    """Tests 1-4: CID validation."""

    def test_valid_cidv0_accepted(self):
        """Test 1: A well-formed CIDv0 (Qm...) is returned unchanged."""
        result = validate_ipfs_cid(VALID_CIDv0)
        assert result == VALID_CIDv0

    def test_valid_cidv1_accepted(self):
        """Test 2: A well-formed CIDv1 (base32, starts with 'b') is accepted."""
        result = validate_ipfs_cid(VALID_CIDv1)
        assert result == VALID_CIDv1

    def test_empty_string_rejected(self):
        """Test 3: Empty string raises ValueError."""
        with pytest.raises(ValueError, match="must not be empty"):
            validate_ipfs_cid("")

    def test_whitespace_only_rejected(self):
        """Test 4: Whitespace-only string raises ValueError."""
        with pytest.raises(ValueError, match="must not be empty"):
            validate_ipfs_cid("   ")


class TestLocalStorageProviderRegression:
    """Test 5: LOCAL provider must still work unchanged after Phase 6."""

    def test_local_provider_put_get_roundtrip(self):
        """Test 5: LocalStorageProvider put→get roundtrip is unaffected by Phase 6 changes."""
        provider = LocalStorageProvider()
        stored = provider.put(MOCK_PAYLOAD, "phase6_regression.enc")
        assert stored.provider == "local"
        assert stored.reference.endswith(".enc")
        retrieved = provider.get(stored.reference)
        assert retrieved == MOCK_PAYLOAD


class TestIPFSProviderPut:
    """Tests 6-8: IPFSProvider.put()"""

    @patch("app.storage_provider.requests.post")
    def test_put_success_returns_stored_object_with_cid(self, mock_post):
        """Test 6: Successful IPFS upload returns StoredObject with real CID."""
        mock_post.return_value = _mock_response(200, {"Hash": VALID_CIDv1})
        provider = IPFSProvider()
        result = provider.put(MOCK_PAYLOAD, "scan.enc")
        assert isinstance(result, StoredObject)
        assert result.provider == "ipfs"
        assert result.reference == VALID_CIDv1
        assert result.size == len(MOCK_PAYLOAD)
        mock_post.assert_called_once()

    @patch("app.storage_provider.requests.post")
    def test_put_daemon_error_raises_runtime_error(self, mock_post):
        """Test 7: IPFS daemon returning HTTP 500 raises RuntimeError (no silent fallback)."""
        mock_post.return_value = _mock_response(500)
        with pytest.raises(RuntimeError, match="IPFS upload failed"):
            IPFSProvider().put(MOCK_PAYLOAD, "scan.enc")

    @patch("app.storage_provider.requests.post")
    def test_put_invalid_cid_from_daemon_raises_runtime_error(self, mock_post):
        """Test 8: IPFS daemon returning an invalid/malformed Hash raises RuntimeError."""
        mock_post.return_value = _mock_response(200, {"Hash": "invalid cid with spaces"})
        with pytest.raises(RuntimeError, match="invalid content identifier"):
            IPFSProvider().put(MOCK_PAYLOAD, "scan.enc")


class TestIPFSProviderGet:
    """Tests 9-10: IPFSProvider.get()"""

    @patch("app.storage_provider.requests.post")
    def test_get_success_returns_bytes(self, mock_post):
        """Test 9: Successful IPFS retrieval returns the correct bytes."""
        mock_post.return_value = _mock_response(200, content=MOCK_PAYLOAD)
        result = IPFSProvider().get(VALID_CIDv1)
        assert result == MOCK_PAYLOAD

    def test_get_invalid_cid_raises_value_error_without_network_call(self):
        """Test 10: Invalid CID raises ValueError before any network call is made."""
        with patch("app.storage_provider.requests.post") as mock_post:
            with pytest.raises(ValueError, match="Invalid IPFS content identifier"):
                IPFSProvider().get("../../etc/passwd")
            mock_post.assert_not_called()


class TestIPFSProviderDelete:
    """Test 11: IPFSProvider.delete()"""

    @patch("app.storage_provider.requests.post")
    def test_delete_success_calls_pin_rm(self, mock_post):
        """Test 11: Successful IPFS delete calls /api/v0/pin/rm with the CID."""
        mock_post.return_value = _mock_response(200)
        IPFSProvider().delete(VALID_CIDv1)
        call_url = mock_post.call_args[0][0]
        assert "/api/v0/pin/rm" in call_url
        assert mock_post.call_args[1]["params"]["arg"] == VALID_CIDv1


class TestVerifyIPFSPin:
    """Tests 12-14: verify_ipfs_pin()"""

    @patch("app.storage_provider.requests.post")
    def test_verify_pin_returns_true_when_pinned(self, mock_post):
        """Test 12: verify_ipfs_pin returns True when CID is listed as pinned."""
        mock_post.return_value = _mock_response(
            200, {"Keys": {VALID_CIDv1: {"Type": "recursive"}}}
        )
        assert verify_ipfs_pin(VALID_CIDv1) is True

    @patch("app.storage_provider.requests.post")
    def test_verify_pin_returns_false_when_not_pinned(self, mock_post):
        """Test 13: verify_ipfs_pin returns False when CID is absent from pin list."""
        mock_post.return_value = _mock_response(200, {"Keys": {}})
        assert verify_ipfs_pin(VALID_CIDv1) is False

    @patch("app.storage_provider.requests.post")
    def test_verify_pin_returns_false_when_daemon_unreachable(self, mock_post):
        """Test 14: verify_ipfs_pin returns False (does not raise) when daemon is down."""
        import requests as req_lib
        mock_post.side_effect = req_lib.ConnectionError("Connection refused")
        result = verify_ipfs_pin(VALID_CIDv1)
        assert result is False


class TestIPFSIsReachable:
    """Tests 15-16: ipfs_is_reachable()"""

    @patch("app.storage_provider.requests.post")
    def test_reachable_returns_true_on_200(self, mock_post):
        """Test 15: ipfs_is_reachable returns True when /api/v0/version returns 200."""
        mock_post.return_value = _mock_response(200, {"Version": "0.24.0"})
        assert ipfs_is_reachable("http://127.0.0.1:5001") is True

    @patch("app.storage_provider.requests.post")
    def test_not_reachable_returns_false_on_connection_error(self, mock_post):
        """Test 16: ipfs_is_reachable returns False (does not raise) when daemon is down."""
        import requests as req_lib
        mock_post.side_effect = req_lib.ConnectionError("Connection refused")
        assert ipfs_is_reachable("http://127.0.0.1:5001") is False


# ===========================================================================
# Security Tests
# ===========================================================================


class TestIPFSCIDSecurityBoundaries:
    """Tests 17-23: Security boundary enforcement."""

    def test_slash_in_cid_rejected(self):
        """Test 17: CID with embedded slash (URL path injection) is rejected."""
        with pytest.raises(ValueError, match="disallowed characters"):
            validate_ipfs_cid("QmValid/../../etc/passwd")

    def test_colon_in_cid_rejected(self):
        """Test 18: CID with embedded colon (URL scheme injection) is rejected."""
        with pytest.raises(ValueError, match="disallowed characters"):
            validate_ipfs_cid("http://evil.example.com/cid")

    def test_query_string_in_cid_rejected(self):
        """Test 19: CID with embedded query string character is rejected."""
        with pytest.raises(ValueError, match="disallowed characters"):
            validate_ipfs_cid(f"{VALID_CIDv1}?pin=false")

    def test_path_traversal_via_dots_rejected(self):
        """Test 20: CID that is a relative path with dots is rejected."""
        with pytest.raises(ValueError):
            validate_ipfs_cid("../../etc/shadow")

    def test_null_byte_in_cid_rejected(self):
        """Test 21: CID containing a null byte is rejected (binary injection guard)."""
        with pytest.raises(ValueError):
            validate_ipfs_cid(VALID_CIDv1 + "\x00malicious")

    def test_too_short_value_rejected(self):
        """Test 22: A value that is too short to be any valid CID is rejected."""
        with pytest.raises(ValueError, match="valid IPFS CID"):
            validate_ipfs_cid("Qm1")

    @patch("app.storage_provider.requests.post")
    def test_get_never_calls_network_for_invalid_cid(self, mock_post):
        """Test 23: IPFSProvider.get() does NOT issue any network call for an invalid CID."""
        with pytest.raises(ValueError):
            IPFSProvider().get("../../evil/path")
        mock_post.assert_not_called()


# ---------------------------------------------------------------------------
# Phase 8 (GAP-05) — secured-node auth, timeouts, integrity verification
# ---------------------------------------------------------------------------

class TestSecuredNodeAuth:
    """Optional Authorization support for a Kubo node with API.Authorizations."""

    def test_no_auth_header_when_token_unset(self, _with_token):
        from app.storage_provider import _auth_headers

        assert _auth_headers() == {}

    def test_bare_token_is_sent_as_bearer(self, _with_token):
        from app.storage_provider import _auth_headers

        with patch("app.storage_provider.settings", _with_token("sekrit-token")):
            assert _auth_headers() == {"Authorization": "Bearer sekrit-token"}

    @pytest.mark.parametrize(
        "token,expected",
        [
            ("Bearer sekrit-token", "Bearer sekrit-token"),
            ("bearer sekrit-token", "bearer sekrit-token"),
            ("Basic dXNlcjpwYXNz", "Basic dXNlcjpwYXNz"),
            ("  sekrit-token  ", "Bearer sekrit-token"),
        ],
    )
    def test_prefixed_token_is_preserved_verbatim(self, token, expected, _with_token):
        """A token that already carries a scheme is not double-prefixed."""
        from app.storage_provider import _auth_headers

        with patch("app.storage_provider.settings", _with_token(token)):
            assert _auth_headers() == {"Authorization": expected}

    def test_blank_token_is_ignored(self, _with_token):
        from app.storage_provider import _auth_headers

        with patch("app.storage_provider.settings", _with_token("   ")):
            assert _auth_headers() == {}

    @patch("app.storage_provider.requests.post")
    def test_put_sends_auth_header_to_a_secured_node(self, mock_post, _with_token):
        mock_post.return_value = _mock_response(200, {"Hash": VALID_CIDv1})
        with patch("app.storage_provider.settings", _with_token("sekrit-token")):
            IPFSProvider().put(MOCK_PAYLOAD, "scan.enc")
        headers = mock_post.call_args.kwargs["headers"]
        assert headers["Authorization"] == "Bearer sekrit-token"

    @patch("app.storage_provider.requests.post")
    def test_get_sends_auth_header_to_a_secured_node(self, mock_post, _with_token):
        mock_post.return_value = _mock_response(200, content=MOCK_PAYLOAD)
        with patch("app.storage_provider.settings", _with_token("sekrit-token")):
            IPFSProvider().get(VALID_CIDv1)
        assert mock_post.call_args.kwargs["headers"]["Authorization"] == "Bearer sekrit-token"

    @patch("app.storage_provider.requests.post")
    def test_token_is_never_written_to_storage_records(self, mock_post, _with_token):
        """The token must not leak into anything persisted or returned."""
        mock_post.return_value = _mock_response(200, {"Hash": VALID_CIDv1})
        with patch("app.storage_provider.settings", _with_token("sekrit-token")):
            stored = IPFSProvider().put(MOCK_PAYLOAD, "scan.enc")
        assert "sekrit-token" not in stored.reference
        assert "sekrit-token" not in str(stored)


class TestApiTimeoutConfiguration:

    def test_default_timeout_when_unset(self, _with_token):
        from app.storage_provider import _api_timeout

        with patch("app.storage_provider.settings", _with_token(timeout=None)):
            assert _api_timeout() == 20

    @pytest.mark.parametrize(
        "raw,expected",
        [(5, 5), (45, 45), (0, 20), (-3, 20), ("abc", 20), (None, 20)],
    )
    def test_timeout_is_coerced_and_sanitised(self, raw, expected, _with_token):
        from app.storage_provider import _api_timeout

        with patch("app.storage_provider.settings", _with_token(timeout=raw)):
            assert _api_timeout() == expected

    @patch("app.storage_provider.requests.post")
    def test_put_uses_the_configured_timeout(self, mock_post, _with_token):
        mock_post.return_value = _mock_response(200, {"Hash": VALID_CIDv1})
        with patch("app.storage_provider.settings", _with_token(timeout=7)):
            IPFSProvider().put(MOCK_PAYLOAD, "scan.enc")
        assert mock_post.call_args.kwargs["timeout"] == 7

    @patch("app.storage_provider.requests.post")
    def test_get_uses_the_configured_timeout(self, mock_post, _with_token):
        mock_post.return_value = _mock_response(200, content=MOCK_PAYLOAD)
        with patch("app.storage_provider.settings", _with_token(timeout=9)):
            IPFSProvider().get(VALID_CIDv1)
        assert mock_post.call_args.kwargs["timeout"] == 9


class TestVerifyStoredContent:

    @patch("app.storage_provider.requests.post")
    def test_true_when_retrieved_bytes_match_expected_digest(self, mock_post):
        import hashlib

        mock_post.return_value = _mock_response(200, content=MOCK_PAYLOAD)
        digest = hashlib.sha256(MOCK_PAYLOAD).hexdigest()
        assert verify_stored_content(VALID_CIDv1, digest, "ipfs") is True

    @patch("app.storage_provider.requests.post")
    def test_false_when_digest_does_not_match(self, mock_post):
        """Detects corruption or a truncated transfer before decryption."""
        mock_post.return_value = _mock_response(200, content=MOCK_PAYLOAD)
        assert verify_stored_content(VALID_CIDv1, "0" * 64, "ipfs") is False

    @patch("app.storage_provider.requests.post")
    def test_false_when_retrieval_fails(self, mock_post):
        """Verification reports failure rather than propagating an exception."""
        import requests as req_lib

        mock_post.side_effect = req_lib.ConnectionError("refused")
        assert verify_stored_content(VALID_CIDv1, "0" * 64, "ipfs") is False

    def test_false_for_invalid_reference(self):
        assert verify_stored_content("../../etc/passwd", "0" * 64, "ipfs") is False


class TestAssertIPFSAvailable:

    @patch("app.storage_provider.requests.post")
    def test_passes_when_node_answers(self, mock_post):
        mock_post.return_value = _mock_response(200, {"Version": "0.24.0"})
        assert assert_ipfs_available() is None

    @patch("app.storage_provider.requests.post")
    def test_raises_when_node_is_unreachable(self, mock_post):
        import requests as req_lib

        mock_post.side_effect = req_lib.ConnectionError("refused")
        with pytest.raises(RuntimeError, match="not an automatic fallback"):
            assert_ipfs_available()

    @patch("app.storage_provider.requests.post")
    def test_explicit_api_url_overrides_configuration(self, mock_post):
        mock_post.return_value = _mock_response(200, {"Version": "0.24.0"})
        assert_ipfs_available("http://10.0.0.5:5001")
        assert mock_post.call_args.args[0].startswith("http://10.0.0.5:5001")


@pytest.fixture
def _with_token():
    """Factory returning a settings copy with the given IPFS token/timeout.

    Settings is a frozen dataclass, so configuration is overridden by
    substitution rather than mutation.
    """
    def _factory(token="", timeout=20):
        import dataclasses

        from app.config import settings as live_settings

        return dataclasses.replace(
            live_settings, ipfs_api_token=token or "", ipfs_api_timeout=timeout
        )

    return _factory
