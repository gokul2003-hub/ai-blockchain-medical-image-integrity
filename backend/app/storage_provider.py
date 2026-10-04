"""Explicit encrypted-object storage providers.

There is deliberately no silent local fallback when IPFS is selected.  The
provider recorded with each image version is the provider actually used.

Phase 6 additions:
- validate_ipfs_cid()  — rejects malformed CIDs and URL/path injection
- verify_ipfs_pin()    — confirms a CID is actually pinned on the local node
- ipfs_is_reachable()  — daemon connectivity health check

Phase 8 additions:
- Optional Authorization header support for secured Kubo deployments, supplied
  only through configuration (never hard-coded).
- verify_stored_content() — re-hashes retrieved bytes against the digest recorded
  at upload time, so retrieval is verified rather than assumed.
- The timeout budget is configurable so a slow node fails loudly instead of
  hanging a request thread.
"""

from __future__ import annotations

import hashlib
import os
import re
import tempfile
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import requests

from app.config import ENCRYPTED_DIR, STORAGE_DIR, settings


# Default RPC budget. Overridable per deployment via IPFS_API_TIMEOUT.
_DEFAULT_TIMEOUT = 20


def _api_timeout() -> int:
    """Return the configured RPC timeout, falling back to the default."""
    raw = getattr(settings, "ipfs_api_timeout", None)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return _DEFAULT_TIMEOUT
    return value if value > 0 else _DEFAULT_TIMEOUT


def _auth_headers() -> dict[str, str]:
    """Build the optional Authorization header for a secured Kubo RPC.

    Kubo only requires this when the deployment configures
    ``API.Authorizations``; the token is read from configuration and is never
    hard-coded or logged.
    """
    token = getattr(settings, "ipfs_api_token", None)
    if not token:
        return {}
    token = token.strip()
    if not token:
        return {}
    if token.lower().startswith(("bearer ", "basic ")):
        return {"Authorization": token}
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# CID validation
# ---------------------------------------------------------------------------

# CIDv0: Qm + 44 base-58 chars (total 46).  Base-58 alphabet: [1-9A-HJ-NP-Za-km-z].
_CIDv0_RE = re.compile(r"^Qm[1-9A-HJ-NP-Za-km-z]{44}$")

# CIDv1: starts with b (base32), z (base58btc), or f (base16); followed by
# alphanumerics only.  We enforce a sane length range [10, 200].
_CIDv1_RE = re.compile(r"^[a-zA-Z0-9]{10,200}$")

def validate_ipfs_cid(cid: str) -> str:
    """Return the CID if it is well-formed, otherwise raise ValueError.

    Rejects:
    - Empty or whitespace-only strings
    - CIDs containing slashes, dots, or other path/URL characters
    - Values that are clearly not CIDv0 or CIDv1
    """
    if not cid or not cid.strip():
        raise ValueError("IPFS CID must not be empty")
    cid = cid.strip()
    if any(c in cid for c in ("/", "\\", ":", "?", "#", "@", " ", "\t", "\n")):
        raise ValueError(f"IPFS CID contains disallowed characters: {cid!r}")
    if _CIDv0_RE.match(cid):
        return cid
    if _CIDv1_RE.match(cid):
        return cid
    raise ValueError(f"Value does not appear to be a valid IPFS CID: {cid!r}")


# ---------------------------------------------------------------------------
# IPFS daemon health check
# ---------------------------------------------------------------------------

def ipfs_is_reachable(api_url: Optional[str] = None, timeout: int = 5) -> bool:
    """Return True if the IPFS daemon responds to /api/v0/version within *timeout* seconds."""
    url = (api_url or settings.ipfs_api_url).rstrip("/")
    try:
        resp = requests.post(
            f"{url}/api/v0/version", headers=_auth_headers(), timeout=timeout
        )
        return resp.status_code == 200
    except requests.RequestException:
        return False


# ---------------------------------------------------------------------------
# Pin verification
# ---------------------------------------------------------------------------

def verify_ipfs_pin(cid: str, api_url: Optional[str] = None, timeout: int = 10) -> bool:
    """Return True only if *cid* is confirmed pinned on the local IPFS node.

    Uses /api/v0/pin/ls?arg=<cid>&type=recursive.  Returns False (not raises)
    when the daemon is unreachable or returns an unexpected response, so callers
    can safely display "Pinned: Unknown" rather than crashing.
    """
    try:
        clean = validate_ipfs_cid(cid)
    except ValueError:
        return False
    url = (api_url or settings.ipfs_api_url).rstrip("/")
    try:
        resp = requests.post(
            f"{url}/api/v0/pin/ls",
            params={"arg": clean, "type": "recursive"},
            headers=_auth_headers(),
            timeout=timeout,
        )
        if resp.status_code == 200:
            data = resp.json()
            return clean in data.get("Keys", {})
        return False
    except requests.RequestException:
        return False


@dataclass(frozen=True)
class StoredObject:
    provider: str
    reference: str
    sha256: str
    size: int


class StorageProvider(ABC):
    name: str

    @abstractmethod
    def put(self, payload: bytes, object_name: str) -> StoredObject: ...

    @abstractmethod
    def get(self, reference: str) -> bytes: ...

    @abstractmethod
    def delete(self, reference: str) -> None: ...


class LocalStorageProvider(StorageProvider):
    name = "local"

    def put(self, payload: bytes, object_name: str) -> StoredObject:
        object_id = f"{uuid.uuid4().hex}.enc"
        destination = ENCRYPTED_DIR / object_id
        fd, temp_path = tempfile.mkstemp(prefix="upload-", suffix=".tmp", dir=ENCRYPTED_DIR)
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(payload)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temp_path, destination)
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)
        return StoredObject(self.name, object_id, hashlib.sha256(payload).hexdigest(), len(payload))

    def get(self, reference: str) -> bytes:
        if Path(reference).name != reference or not reference.endswith(".enc"):
            raise ValueError("Invalid local object reference")
        path = ENCRYPTED_DIR / reference
        try:
            return path.read_bytes()
        except FileNotFoundError as exc:
            raise FileNotFoundError("Encrypted object is unavailable") from exc

    def delete(self, reference: str) -> None:
        if Path(reference).name != reference or not reference.endswith(".enc"):
            raise ValueError("Invalid local object reference")
        path = ENCRYPTED_DIR / reference
        # This method is only used with the just-created reference returned by
        # put(), never an arbitrary database-supplied storage path.
        path.unlink(missing_ok=True)


class IPFSProvider(StorageProvider):
    name = "ipfs"

    def put(self, payload: bytes, object_name: str) -> StoredObject:
        if not payload:
            raise ValueError("Refusing to store an empty payload")
        timeout = _api_timeout()
        try:
            response = requests.post(
                f"{settings.ipfs_api_url.rstrip('/')}/api/v0/add",
                files={"file": (object_name, payload)},
                params={"pin": "true", "cid-version": "1"},
                headers=_auth_headers(),
                timeout=timeout,
            )
            response.raise_for_status()
            raw_cid = response.json().get("Hash")
        except (requests.RequestException, ValueError) as exc:
            raise RuntimeError("IPFS upload failed; local fallback was intentionally not used") from exc
        # Validate the CID returned by the daemon — reject malformed values and
        # prevent any path/URL injection from reaching the database.
        try:
            cid = validate_ipfs_cid(raw_cid or "")
        except ValueError as exc:
            raise RuntimeError(f"IPFS returned an invalid content identifier: {exc}") from exc
        return StoredObject(self.name, cid, hashlib.sha256(payload).hexdigest(), len(payload))

    def get(self, reference: str) -> bytes:
        # Validate before making any network request to prevent URL injection.
        try:
            clean = validate_ipfs_cid(reference)
        except ValueError as exc:
            raise ValueError(f"Invalid IPFS content identifier: {exc}") from exc
        timeout = _api_timeout()
        try:
            response = requests.post(
                f"{settings.ipfs_api_url.rstrip('/')}/api/v0/cat",
                params={"arg": clean},
                headers=_auth_headers(),
                timeout=timeout,
            )
            response.raise_for_status()
            return response.content
        except requests.RequestException as exc:
            raise RuntimeError("IPFS retrieval failed") from exc

    def delete(self, reference: str) -> None:
        try:
            clean = validate_ipfs_cid(reference)
        except ValueError as exc:
            raise ValueError(f"Invalid IPFS content identifier: {exc}") from exc
        try:
            response = requests.post(
                f"{settings.ipfs_api_url.rstrip('/')}/api/v0/pin/rm",
                params={"arg": clean},
                headers=_auth_headers(),
                timeout=_api_timeout(),
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            # IPFS is content-addressed: unpinning retracts this node's newly
            # created retention but cannot erase a CID from other peers.
            raise RuntimeError("IPFS compensation unpin failed") from exc



def verify_stored_content(
    reference: str,
    expected_sha256: str,
    provider_name: str | None = None,
) -> bool:
    """Confirm retrieved ciphertext still hashes to the digest recorded at upload.

    Content addressing means the CID already binds the bytes, so this is a
    defence-in-depth check that also detects a truncated or corrupted transfer
    before the value is handed to the decryption stage.
    """
    try:
        payload = get_storage_provider(provider_name).get(reference)
    except (RuntimeError, ValueError, FileNotFoundError):
        return False
    return hashlib.sha256(payload).hexdigest() == expected_sha256


def assert_ipfs_available(api_url: Optional[str] = None) -> None:
    """Fail fast when IPFS is the configured provider but the daemon is unusable.

    Called at startup in production so a misconfigured or absent node is a
    refusal to boot rather than a per-request surprise. It never falls back to
    local storage.
    """
    url = (api_url or settings.ipfs_api_url).rstrip("/")
    if not ipfs_is_reachable(url, timeout=_api_timeout()):
        raise RuntimeError(
            "STORAGE_PROVIDER=ipfs but the IPFS node at the configured API URL "
            "is unreachable. Refusing to start; local storage is not an automatic "
            "fallback for IPFS."
        )


def get_storage_provider(name: str | None = None) -> StorageProvider:
    selected = (name or settings.storage_provider).lower()
    if selected == "local":
        return LocalStorageProvider()
    if selected == "ipfs":
        return IPFSProvider()
    raise ValueError(f"Unsupported storage provider: {selected}")


def store_encrypted_object(payload: bytes, filename: str, provider_name: str | None = None) -> StoredObject:
    """Stores payload using the configured or specified StorageProvider."""
    provider = get_storage_provider(provider_name)
    safe_name = Path(filename or "object.enc").name.replace("\x00", "") or "object.enc"
    return provider.put(payload, safe_name)


def delete_encrypted_object(reference: str, provider_name: str) -> None:
    """Compensate a failed registration using only its newly-created object reference."""
    get_storage_provider(provider_name).delete(reference)


def _is_within_directory(path: Path, root: Path) -> bool:
    try:
        resolved = path.resolve()
        root_resolved = root.resolve()
        return os.path.commonpath([str(resolved), str(root_resolved)]) == str(root_resolved)
    except (OSError, ValueError):
        return False


def load_encrypted_object(reference: str) -> bytes:
    """Retrieve ciphertext only from approved encrypted-object locations."""
    if not reference or not reference.strip():
        raise ValueError("Empty storage reference")

    clean_ref = reference.strip()
    ref_path = Path(clean_ref)
    encrypted_root = ENCRYPTED_DIR.resolve()
    ipfs_sim_root = (STORAGE_DIR / "ipfs_sim").resolve()

    # UUID-style local object id (current LocalStorageProvider format)
    if ref_path.name == clean_ref and clean_ref.endswith(".enc"):
        local_target = encrypted_root / clean_ref
        if local_target.is_file():
            return local_target.read_bytes()

    # Legacy absolute/relative paths must still resolve inside encrypted storage
    if _is_within_directory(ref_path, encrypted_root) and ref_path.resolve().is_file():
        return ref_path.resolve().read_bytes()

    sim_target = ipfs_sim_root / ref_path.name
    if ref_path.name == Path(ref_path.name).name and _is_within_directory(sim_target, ipfs_sim_root) and sim_target.is_file():
        return sim_target.read_bytes()

    if settings.storage_provider == "ipfs" or (clean_ref and "/" not in clean_ref and "\\" not in clean_ref and not clean_ref.endswith(".enc")):
        try:
            return IPFSProvider().get(clean_ref)
        except Exception as exc:
            raise FileNotFoundError(f"Failed to retrieve encrypted object for reference '{clean_ref}': {exc}") from exc

    raise FileNotFoundError("Encrypted object is unavailable")
