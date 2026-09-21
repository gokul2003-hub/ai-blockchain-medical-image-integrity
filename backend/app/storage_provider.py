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
    return provider.put(payload, filename)


def load_encrypted_object(reference: str) -> bytes:
    """
    Safely retrieves encrypted payload regardless of whether it was stored locally or on IPFS.
    Supports local .enc files, absolute paths, simulated IPFS files, and live IPFS CIDs.
    """
    if not reference or not reference.strip():
        raise ValueError("Empty storage reference")

    clean_ref = reference.strip()

    # 1. Direct absolute/relative file path check
    ref_path = Path(clean_ref)
    if ref_path.is_file() and ref_path.exists():
        return ref_path.read_bytes()

    # 2. Local ENCRYPTED_DIR check
    local_target = ENCRYPTED_DIR / ref_path.name
    if local_target.exists():
        return local_target.read_bytes()

    # 3. Local simulated IPFS directory check
    sim_target = STORAGE_DIR / "ipfs_sim" / ref_path.name
    if sim_target.exists():
        return sim_target.read_bytes()

    # 4. Live IPFS retrieval
    try:
        ipfs_provider = IPFSProvider()
        return ipfs_provider.get(clean_ref)
    except Exception as exc:
        raise FileNotFoundError(f"Failed to retrieve encrypted object for reference '{clean_ref}': {exc}") from exc

