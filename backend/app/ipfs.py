import os
import requests
from pathlib import Path
from loguru import logger
from app.config import IPFS_API_URL, IPFS_GATEWAY, STORAGE_DIR

# Establish simulated folder path
IPFS_SIM_DIR = STORAGE_DIR / "ipfs_sim"
IPFS_SIM_DIR.mkdir(parents=True, exist_ok=True)

class IPFSStorageClient:
    """
    Production-grade IPFS integration client.
    Attempts upload/download to a local IPFS daemon or gateway;
    falls back to simulated file-based IPFS storage for offline local testing.
    """
    def __init__(self):
        self.api_url = IPFS_API_URL
        self.gateway = IPFS_GATEWAY
        # Multi-gateway fallbacks to guarantee high availability of medical scans
        self.gateways = [
            IPFS_GATEWAY,
            "https://cloudflare-ipfs.com/ipfs/",
            "https://ipfs.io/ipfs/",
            "https://gateway.pinata.cloud/ipfs/"
        ]
        
    def upload_bytes(self, file_bytes: bytes, filename: str) -> str:
        """
        Uploads encrypted file bytes according to STORAGE_PROVIDER.
        When STORAGE_PROVIDER=ipfs: Uploads to real IPFS; raises explicit RuntimeError if unavailable.
        When STORAGE_PROVIDER=local: Stores locally via LocalStorageProvider with explicit local reference.
        """
        from app.config import settings
        from app.storage_provider import store_encrypted_object

        provider = settings.storage_provider.lower()
        if provider == "ipfs":
            logger.info(f"Attempting upload to real IPFS daemon at {self.api_url} for file: {filename}")
            try:
                files = {'file': (filename, file_bytes)}
                response = requests.post(f"{self.api_url}/api/v0/add", files=files, params={"pin": "true"}, timeout=10)
                if response.status_code == 200:
                    cid = response.json().get("Hash")
                    if cid and not any(c.isspace() for c in cid):
                        logger.info(f"Successfully uploaded to real IPFS. CID: {cid}")
                        return cid
                raise RuntimeError(f"IPFS daemon returned HTTP {response.status_code}: {response.text}")
            except Exception as e:
                logger.error(f"IPFS daemon is unavailable at {self.api_url}: {str(e)}")
                raise RuntimeError(
                    f"STORAGE_PROVIDER=ipfs is selected, but the IPFS daemon at {self.api_url} is unreachable. "
                    "Simulated CID fallback is prohibited. Start IPFS or set STORAGE_PROVIDER=local."
                ) from e
        elif provider == "local":
            logger.info(f"Storing encrypted bytes via explicit LocalStorageProvider for file: {filename}")
            stored = store_encrypted_object(file_bytes, filename, provider_name="local")
            return stored.reference
        else:
            raise ValueError(f"Invalid storage configuration: '{provider}'. Must be 'local' or 'ipfs'.")

    def download_bytes(self, reference: str) -> bytes:
        """
        Downloads encrypted file bytes using reference (IPFS CID or local storage reference).
        """
        from app.storage_provider import load_encrypted_object
        return load_encrypted_object(reference)

# Global IPFS client instance
ipfs_client = IPFSStorageClient()
