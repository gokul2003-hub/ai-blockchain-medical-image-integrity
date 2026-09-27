"""Explicit encrypted-object storage providers.

There is deliberately no silent local fallback when IPFS is selected.  The
provider recorded with each image version is the provider actually used.
"""

from __future__ import annotations

import hashlib
import os
import tempfile
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass
from pathlib import Path

import requests

from app.config import ENCRYPTED_DIR, STORAGE_DIR, settings


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
        try:
            response = requests.post(
                f"{settings.ipfs_api_url.rstrip('/')}/api/v0/add",
                files={"file": (object_name, payload)},
                params={"pin": "true", "cid-version": "1"},
                timeout=20,
            )
            response.raise_for_status()
            cid = response.json().get("Hash")
        except (requests.RequestException, ValueError) as exc:
            raise RuntimeError("IPFS upload failed; local fallback was intentionally not used") from exc
        if not cid or any(char.isspace() for char in cid):
            raise RuntimeError("IPFS returned an invalid content identifier")
        return StoredObject(self.name, cid, hashlib.sha256(payload).hexdigest(), len(payload))

    def get(self, reference: str) -> bytes:
        if not reference or any(char.isspace() for char in reference):
            raise ValueError("Invalid IPFS content identifier")
        try:
            response = requests.post(
                f"{settings.ipfs_api_url.rstrip('/')}/api/v0/cat",
                params={"arg": reference}, timeout=20,
            )
            response.raise_for_status()
            return response.content
        except requests.RequestException as exc:
            raise RuntimeError("IPFS retrieval failed") from exc

    def delete(self, reference: str) -> None:
        if not reference or any(char.isspace() for char in reference):
            raise ValueError("Invalid IPFS content identifier")
        try:
            response = requests.post(
                f"{settings.ipfs_api_url.rstrip('/')}/api/v0/pin/rm",
                params={"arg": reference}, timeout=20,
            )
            response.raise_for_status()
        except requests.RequestException as exc:
            # IPFS is content-addressed: unpinning retracts this node's newly
            # created retention but cannot erase a CID from other peers.
            raise RuntimeError("IPFS compensation unpin failed") from exc



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
