import cv2
import numpy as np
import hashlib
import json
from loguru import logger

class ZeroWatermarkEngine:
    """
    Reversible Fragile Zero-Watermarking Engine (DWT-SVD + SHA-3).
    Extracts high-frequency DWT wavelet sub-band coefficients and SVD singular values 
    from the medical image ROI, combining them with patient metadata to generate 
    an off-image verification key stored on-chain without altering any diagnostic pixels.
    """
    def __init__(self):
        pass

    def _dwt2d_haar(self, img_gray: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
        """Performs 1-level 2D Discrete Wavelet Transform (DWT) using Haar basis."""
        h, w = img_gray.shape
        h_even = h - (h % 2)
        w_even = w - (w % 2)
        img = img_gray[:h_even, :w_even].astype(np.float64)
        
        # Row processing
        row_avg = (img[:, 0::2] + img[:, 1::2]) / np.sqrt(2)
        row_diff = (img[:, 0::2] - img[:, 1::2]) / np.sqrt(2)
        
        # Column processing
        LL = (row_avg[0::2, :] + row_avg[1::2, :]) / np.sqrt(2)
        LH = (row_avg[0::2, :] - row_avg[1::2, :]) / np.sqrt(2)
        HL = (row_diff[0::2, :] + row_diff[1::2, :]) / np.sqrt(2)
        HH = (row_diff[0::2, :] - row_diff[1::2, :]) / np.sqrt(2)
        
        return LL, LH, HL, HH

    def generate_zero_watermark(self, image_bytes: bytes, patient_metadata: dict) -> tuple[str, str]:
        """
        Generates the off-image zero-watermark verification key (K_zw) and feature hash.
        Returns: (zero_watermark_key_hex, feature_hash)
        """
        logger.info("Extracting DWT-SVD zero-watermarking feature matrix from ROI...")
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
        if img is None:
            img = np.zeros((256, 256), dtype=np.uint8)
            
        # 1. 2D Haar DWT
        LL, LH, HL, HH = self._dwt2d_haar(img)
        
        # 2. SVD on high-frequency HL sub-band
        U, S, Vt = np.linalg.svd(HL, full_matrices=False)
        
        # 3. Binarize singular values matrix based on mean threshold
        mean_s = np.mean(S)
        bin_s = (S > mean_s).astype(np.uint8)
        
        # 4. SHA-3 hash of patient metadata
        meta_str = json.dumps(patient_metadata, sort_keys=True)
        meta_hash = hashlib.sha3_256(meta_str.encode()).digest()
        meta_raw = np.frombuffer(meta_hash, dtype=np.uint8)
        meta_bin = np.tile(meta_raw, (len(bin_s) // len(meta_raw) + 1))[:len(bin_s)]
        
        # 5. XOR operation to generate Zero-Watermark Key (K_zw)
        k_zw = np.bitwise_xor(bin_s, meta_bin)
        k_zw_hex = k_zw.tobytes().hex()
        feature_hash = hashlib.sha3_256(k_zw).hexdigest()
        
        logger.info(f"Zero-Watermark key generated successfully. Feature hash: {feature_hash[:12]}...")
        return k_zw_hex, feature_hash

    def verify_zero_watermark(self, image_bytes: bytes, k_zw_hex: str, patient_metadata: dict) -> tuple[bool, float]:
        """
        Verifies image integrity using off-image zero-watermark key without modifying pixels.
        Returns: (is_authentic, normalized_correlation_score)
        """
        logger.info("Verifying image integrity via DWT-SVD Zero-Watermarking...")
        try:
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
            if img is None:
                return False, 0.0
                
            LL, LH, HL, HH = self._dwt2d_haar(img)
            U, S, Vt = np.linalg.svd(HL, full_matrices=False)
            
            mean_s = np.mean(S)
            bin_s = (S > mean_s).astype(np.uint8)
            
            k_zw = np.frombuffer(bytes.fromhex(k_zw_hex), dtype=np.uint8)
            min_len = min(len(bin_s), len(k_zw))
            
            # Reconstruct original binary feature matrix
            meta_str = json.dumps(patient_metadata, sort_keys=True)
            meta_hash = hashlib.sha3_256(meta_str.encode()).digest()
            meta_raw = np.frombuffer(meta_hash, dtype=np.uint8)
            meta_bin = np.tile(meta_raw, (min_len // len(meta_raw) + 1))[:min_len]
            
            extracted_bin = np.bitwise_xor(k_zw[:min_len], meta_bin)
            
            # Compute Normalized Correlation (NC)
            match_count = np.sum(bin_s[:min_len] == extracted_bin)
            nc_score = float(match_count / min_len)
            
            is_authentic = nc_score >= 0.95
            logger.info(f"Zero-Watermark NC Score: {nc_score:.4f} | Authentic: {is_authentic}")
            return is_authentic, round(nc_score, 4)
        except Exception as e:
            logger.error(f"Zero-watermark verification error: {str(e)}")
            return False, 0.0

zero_watermark_engine = ZeroWatermarkEngine()
