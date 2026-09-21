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
        Uploads encrypted file bytes to IPFS.
        Returns: The IPFS Content Identifier (CID).
        """
        logger.info(f"Attempting to upload encrypted bytes to IPFS for file: {filename}")
        try:
            # Try connecting to local IPFS API daemon
            files = {'file': (filename, file_bytes)}
            response = requests.post(f"{self.api_url}/api/v0/add", files=files, timeout=5)
            
            if response.status_code == 200:
                cid = response.json().get("Hash")
                if cid:
                    logger.info(f"Successfully uploaded to IPFS. CID: {cid}")
                    return cid
            logger.warning("Local IPFS daemon returned non-200 status. Falling back to local IPFS simulation.")
        except Exception as e:
            logger.warning(f"Could not connect to IPFS node at {self.api_url} ({str(e)}). Falling back to simulation.")

        # Fallback simulation: save file locally in storage/ipfs_sim named by its SHA-256 hash (acting as mock CID)
        import hashlib
        mock_cid = f"QmSimulatedCID{hashlib.sha256(file_bytes).hexdigest()[:32]}"
        sim_path = IPFS_SIM_DIR / mock_cid
        with open(sim_path, "wb") as f:
            f.write(file_bytes)
            
        logger.info(f"Simulated IPFS upload complete. Mock CID: {mock_cid}")
        return mock_cid

    def download_bytes(self, cid: str) -> bytes:
        """
        Downloads encrypted file bytes from IPFS using the CID.
        Rotates through public gateways if local gateway fails.
        """
        logger.info(f"Attempting to retrieve bytes from IPFS CID: {cid}")
        # Try local simulation check first to avoid slow gateway timeouts
        sim_path = IPFS_SIM_DIR / cid
        if sim_path.exists():
            logger.info(f"Found IPFS resource in simulation cache: {cid}")
            with open(sim_path, "rb") as f:
                return f.read()

        # Iterate over multiple IPFS gateways to avoid single-point retrieval failures
        for gw in self.gateways:
            try:
                gateway_url = f"{gw.rstrip('/')}/{cid}"
                logger.info(f"Trying IPFS gateway: {gateway_url}")
                response = requests.get(gateway_url, timeout=8)
                if response.status_code == 200:
                    logger.info(f"Successfully downloaded bytes from IPFS gateway {gw} for CID: {cid}")
                    return response.content
            except Exception as e:
                logger.warning(f"IPFS gateway {gw} failed for CID {cid}: {str(e)}")
            
        raise FileNotFoundError(f"IPFS content CID: {cid} could not be resolved from any configuration gateway or local simulation cache.")

# Global IPFS client instance
ipfs_client = IPFSStorageClient()
