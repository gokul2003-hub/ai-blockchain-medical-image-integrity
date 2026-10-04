import os
from pathlib import Path
from app.config import ENCRYPTED_DIR

class CloudStorageDriver:
    """
    Simulated cloud storage bucket driver.
    Stores files in a local encrypted storage directory.
    Can be easily connected to AWS S3 or MinIO.
    """
    def __init__(self):
        # In a real S3 setup, we would initialize boto3:
        # self.s3_client = boto3.client('s3', ...)
        pass

    def upload_encrypted_image(self, file_bytes: bytes, filename: str) -> str:
        """
        Uploads encrypted image bytes to storage.
        Returns: Filepath/URI of the uploaded resource.
        """
        # Ensure directories exist
        ENCRYPTED_DIR.mkdir(parents=True, exist_ok=True)
        
        file_path = ENCRYPTED_DIR / filename
        with open(file_path, "wb") as f:
            f.write(file_bytes)
            
        # Return absolute path converted to string (acts as the Cloud URI)
        return str(file_path.resolve())

    def download_encrypted_image(self, uri: str) -> bytes:
        """
        Downloads encrypted image bytes from storage.
        Returns: Image byte contents.
        """
        if not os.path.exists(uri):
            raise FileNotFoundError(f"Encrypted medical image not found in cloud storage: {uri}")
            
        with open(uri, "rb") as f:
            return f.read()

    def delete_image(self, uri: str) -> bool:
        """
        Deletes image from storage.
        """
        try:
            if os.path.exists(uri):
                os.remove(uri)
                return True
        except Exception:
            pass
        return False

# Global instance of storage driver
storage_driver = CloudStorageDriver()
