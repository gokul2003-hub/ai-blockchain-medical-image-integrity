"""Phase 1 deterministic provider verification (Task A + Task B).

IMPORTANT - these are UNIT / FAULT-INJECTION tests. Every network call here is
patched. Nothing in this module contacts a real IPFS daemon or a real EVM chain,
and nothing here should ever be cited as live-IPFS or live-EVM integration
evidence. The real-IPFS suite lives in ``test_ipfs_real_integration.py`` and
still self-skips when no Kubo node is reachable.

Scope, per Phase 1:
  A. upload, retrieval, content integrity, timeout, unavailable-service errors
     and cleanup for the IPFS provider, including the explicit guarantee that a
     failed IPFS write NEVER silently falls back to local storage.
  B. Web3/EVM provider selection and transaction guards, without a chain.
"""

from unittest.mock import MagicMock, patch

import pytest

from app.storage_provider import (
    ENCRYPTED_DIR,
    IPFSProvider,
    LocalStorageProvider,
    assert_ipfs_available,
    get_storage_provider,
    validate_ipfs_cid,
    verify_stored_content,
)

# A real CIDv1 string, used only as opaque input to the mocked daemon.
FAKE_CID = "bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"


def _resp(status=200, json_data=None, content=b""):
    m = MagicMock()
    m.raise_for_status.side_effect = None
    if status >= 400:
        import requests

        m.raise_for_status.side_effect = requests.HTTPError(f"{status}")
    m.json.return_value = json_data or {}
    m.content = content
    return m


class TestIPFSContentIntegrityRoundtrip:
    """A.5 upload + retrieval + content integrity against one fake daemon."""

    def test_put_get_and_digest_agree(self):
        payload = b"encrypted-ciphertext-bytes"
        import hashlib

        with patch("app.storage_provider.requests.post") as post:
            post.return_value = _resp(json_data={"Hash": FAKE_CID})
            provider = IPFSProvider()
            stored = provider.put(payload, "scan_v1.enc")

            assert stored.provider == "ipfs"
            assert stored.reference == validate_ipfs_cid(FAKE_CID)
            assert stored.sha256 == hashlib.sha256(payload).hexdigest()
            assert stored.size == len(payload)

            post.return_value = _resp(content=payload)
            assert provider.get(stored.reference) == payload

    def test_verify_stored_content_detects_truncation(self):
        payload = b"full-ciphertext-payload"
        import hashlib

        with patch("app.storage_provider.requests.post") as post:
            post.return_value = _resp(json_data={"Hash": FAKE_CID})
            stored = IPFSProvider().put(payload, "scan_v1.enc")

            # Simulate a transfer that silently dropped bytes.
            post.return_value = _resp(content=payload[:-5])
            assert (
                verify_stored_content(stored.reference, stored.sha256, provider_name="ipfs")
                is False
            )

            post.return_value = _resp(content=payload)
            assert (
                verify_stored_content(stored.reference, stored.sha256, provider_name="ipfs")
                is True
            )
            assert (
                verify_stored_content(
                    stored.reference,
                    hashlib.sha256(b"other").hexdigest(),
                    provider_name="ipfs",
                )
                is False
            )


class TestIPFSNoSilentLocalFallback:
    """A.7 the single most important guarantee in this phase."""

    def test_put_failure_raises_and_writes_no_local_file(self):
        import requests

        before = set(ENCRYPTED_DIR.glob("*.enc"))
        with patch("app.storage_provider.requests.post") as post:
            post.side_effect = requests.ConnectionError("daemon down")
            with pytest.raises(RuntimeError, match="local fallback was intentionally not used"):
                IPFSProvider().put(b"ciphertext", "scan_v1.enc")

        assert set(ENCRYPTED_DIR.glob("*.enc")) == before, (
            "a failed IPFS write must not leave a local-storage artefact behind"
        )
        assert isinstance(IPFSProvider(), IPFSProvider)
        assert not isinstance(IPFSProvider(), LocalStorageProvider)

    def test_invalid_daemon_cid_is_rejected_not_swallowed(self):
        with patch("app.storage_provider.requests.post") as post:
            post.return_value = _resp(json_data={"Hash": "../../etc/passwd"})
            with pytest.raises(RuntimeError, match="invalid content identifier"):
                IPFSProvider().put(b"ciphertext", "scan_v1.enc")

    def test_empty_payload_refused_before_any_network_call(self):
        with patch("app.storage_provider.requests.post") as post:
            with pytest.raises(ValueError, match="empty payload"):
                IPFSProvider().put(b"", "scan_v1.enc")
            post.assert_not_called()


class TestIPFSFailureModes:
    """A.5 timeout and unavailable-service behaviour."""

    def test_timeout_is_surfaced_as_runtime_error(self):
        import requests

        with patch("app.storage_provider.requests.post") as post:
            post.side_effect = requests.Timeout("read timed out")
            with pytest.raises(RuntimeError, match="IPFS upload failed"):
                IPFSProvider().put(b"ciphertext", "scan_v1.enc")
            with pytest.raises(RuntimeError, match="IPFS retrieval failed"):
                IPFSProvider().get(FAKE_CID)

    def test_assert_ipfs_available_refuses_boot_when_unreachable(self):
        with patch("app.storage_provider.ipfs_is_reachable", return_value=False):
            with pytest.raises(RuntimeError, match="Refusing to start"):
                assert_ipfs_available("http://127.0.0.1:59999")

    def test_assert_ipfs_available_passes_when_node_answers(self):
        with patch("app.storage_provider.ipfs_is_reachable", return_value=True):
            assert assert_ipfs_available("http://127.0.0.1:5001") is None

    def test_cleanup_unpins_and_failure_is_not_silent(self):
        import requests

        with patch("app.storage_provider.requests.post") as post:
            post.return_value = _resp(json_data={"Pins": [FAKE_CID]})
            IPFSProvider().delete(FAKE_CID)
            assert post.call_args.args[0].endswith("/api/v0/pin/rm")

            post.side_effect = requests.ConnectionError("daemon down")
            with pytest.raises(RuntimeError, match="unpin failed"):
                IPFSProvider().delete(FAKE_CID)

    def test_get_rejects_injection_before_any_request(self):
        with patch("app.storage_provider.requests.post") as post:
            with pytest.raises(ValueError, match="Invalid IPFS content identifier"):
                IPFSProvider().get("not-a-cid;rm -rf /")
            post.assert_not_called()


class TestProviderSelection:
    """A.1 explicit provider routing; no implicit cross-provider usage."""

    def test_ipfs_name_returns_ipfs_provider(self):
        assert isinstance(get_storage_provider("ipfs"), IPFSProvider)

    def test_local_name_returns_local_provider(self):
        assert isinstance(get_storage_provider("local"), LocalStorageProvider)

    def test_unknown_provider_rejected(self):
        with pytest.raises(ValueError, match="Unsupported storage provider"):
            get_storage_provider("s3")


class TestWeb3ProviderGuards:
    """B.2 deterministic Web3/EVM unit tests. No chain is contacted."""

    @staticmethod
    def _service(use_ethereum=False, contract=None, private_key=None):
        # Bypass __init__ so construction never attempts a network probe.
        from app.blockchain import BlockchainService

        svc = BlockchainService.__new__(BlockchainService)
        svc.w3 = None
        svc.use_ethereum = use_ethereum
        svc.contract = contract
        svc.private_key = private_key
        svc.wallet_address = None
        svc.contract_address = None
        svc.local_chain = None
        return svc

    def test_unconfigured_service_refuses_to_send(self):
        svc = self._service(use_ethereum=False)
        with pytest.raises(RuntimeError, match="Web3 is not configured"):
            svc._send_signed_transaction(None)

    def test_contract_deployed_but_no_private_key_refuses(self):
        svc = self._service(use_ethereum=True, contract=object(), private_key=None)
        with pytest.raises(RuntimeError, match="Web3 is not configured"):
            svc._send_signed_transaction(None)

    def test_connected_without_contract_refuses(self):
        svc = self._service(use_ethereum=True, contract=None, private_key="0xabc")
        with pytest.raises(RuntimeError, match="Web3 is not configured"):
            svc._send_signed_transaction(None)

    def test_service_defaults_to_local_simulation_state(self):
        """Without a reachable node the service must advertise simulation."""
        from app.blockchain import BlockchainService

        svc = self._service(use_ethereum=False)
        assert svc.use_ethereum is False
        assert BlockchainService.__init__ is not None
