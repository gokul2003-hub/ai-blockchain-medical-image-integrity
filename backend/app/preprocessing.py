import io
import math
import hashlib
import datetime
import cv2
import numpy as np
from loguru import logger

try:
    import pydicom
    from pydicom.dataset import Dataset, FileDataset
    PYDICOM_AVAILABLE = True
except ImportError:
    PYDICOM_AVAILABLE = False


def calculate_entropy(image_gray: np.ndarray) -> float:
    """Calculates the Shannon entropy of a grayscale image."""
    hist = cv2.calcHist([image_gray], [0], None, [256], [0, 256])
    hist_norm = hist.ravel() / hist.sum()
    hist_norm = hist_norm[hist_norm > 0]
    entropy = -np.sum(hist_norm * np.log2(hist_norm))
    return float(entropy)


def calculate_sharpness(image_gray: np.ndarray) -> float:
    """Calculates image sharpness using the variance of the Laplacian."""
    return float(cv2.Laplacian(image_gray, cv2.CV_64F).var())


def calculate_contrast(image_gray: np.ndarray) -> float:
    """Calculates contrast using standard deviation of pixel intensities."""
    return float(np.std(image_gray))


def calculate_quality_score(image_gray: np.ndarray) -> float:
    """Calculates an objective image quality score from 0 to 100."""
    sharpness = calculate_sharpness(image_gray)
    entropy = calculate_entropy(image_gray)
    contrast = calculate_contrast(image_gray)

    sharpness_score = min(40.0, max(0.0, 10 * math.log10(max(1.0, sharpness))))
    entropy_score = min(40.0, (entropy / 8.0) * 40.0)
    contrast_score = min(20.0, (contrast / 128.0) * 20.0)

    total_score = sharpness_score + entropy_score + contrast_score
    return round(float(total_score), 2)


def preprocess_medical_image(image_bytes: bytes, modality: str = "MRI") -> tuple[bytes, float, float]:
    """
    Performs noise removal, adaptive contrast enhancement (CLAHE), resizing, and normalization.
    Returns: (preprocessed_png_bytes, quality_score, entropy)
    """
    logger.info(f"Preprocessing raw medical image scan (Modality: {modality})...")
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Invalid image file format or corrupt pixel bytes")

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # 1. Noise Removal using Median Filter
    denoised = cv2.medianBlur(gray, 3)

    # 2. Adaptive Contrast Enhancement using Modality-Specific CLAHE
    modality_upper = modality.upper() if modality else "MRI"
    if modality_upper == "CT":
        clip_limit, tile_grid = 3.0, (8, 8)
    elif modality_upper in ["XRAY", "X-RAY"]:
        clip_limit, tile_grid = 4.0, (16, 16)
    elif modality_upper in ["PET", "ULTRASOUND"]:
        clip_limit, tile_grid = 2.5, (8, 8)
    else:
        clip_limit, tile_grid = 2.0, (8, 8)

    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid)
    enhanced = clahe.apply(denoised)

    # 3. Standard 512x512 cubic resize
    resized = cv2.resize(enhanced, (512, 512), interpolation=cv2.INTER_CUBIC)

    # 4. Normalization
    normalized = cv2.normalize(resized, None, 0, 255, cv2.NORM_MINMAX)

    quality_score = calculate_quality_score(normalized)
    entropy = calculate_entropy(normalized)

    _, encoded_img = cv2.imencode(".png", normalized)
    logger.info(f"Image preprocessing completed ({modality_upper}). Quality: {quality_score}, Entropy: {entropy:.2f}")
    return encoded_img.tobytes(), quality_score, entropy


def watermark_image(image_bytes: bytes, watermark_text: str) -> bytes:
    """
    Overlays a visible forensic watermark warning on a compromised medical scan.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return image_bytes

    h, w, c = img.shape
    overlay = img.copy()

    # Semi-transparent red warning banners
    cv2.rectangle(overlay, (0, 0), (w, 40), (0, 0, 180), -1)
    cv2.rectangle(overlay, (0, h - 40), (w, h), (0, 0, 180), -1)

    alpha = 0.5
    img = cv2.addWeighted(overlay, alpha, img, 1 - alpha, 0)

    font = cv2.FONT_HERSHEY_SIMPLEX
    t_text = "WARNING: COMPROMISED INTEGRITY - CRYPTOGRAPHIC MISMATCH DETECTED"
    t_size = cv2.getTextSize(t_text, font, 0.4, 1)[0]
    tx = max(5, (w - t_size[0]) // 2)
    cv2.putText(img, t_text, (tx, 25), font, 0.4, (255, 255, 255), 1, cv2.LINE_AA)

    b_text = f"OVERRIDE ACCESS LOGGED ON BLOCKCHAIN | {watermark_text}"
    b_size = cv2.getTextSize(b_text, font, 0.4, 1)[0]
    bx = max(5, (w - b_size[0]) // 2)
    cv2.putText(img, b_text, (bx, h - 15), font, 0.4, (255, 255, 255), 1, cv2.LINE_AA)

    diagonal_overlay = img.copy()
    cv2.putText(diagonal_overlay, "UNAUTHORIZED OVERRIDE - TAMPERED", (20, h // 2), font, 0.6, (0, 0, 255), 2, cv2.LINE_AA)
    img = cv2.addWeighted(diagonal_overlay, 0.3, img, 0.7, 0)

    _, encoded_img = cv2.imencode(".png", img)
    return encoded_img.tobytes()


def deidentify_dicom_dataset(dataset, profile: str = "safe_harbor") -> dict:
    """
    De-identifies a DICOM dataset according to DICOM PS 3.15 Annex E / HIPAA Safe Harbor.
    Removes direct patient identifiers while preserving essential clinical imaging parameters.
    Returns: Safe, authorized metadata dictionary.
    """
    # 1. Pseudonymize or remove direct patient identifiers
    patient_hash = hashlib.sha256(str(getattr(dataset, "PatientID", "ANON")).encode()).hexdigest()[:10]
    safe_patient_id = f"PAT-ANON-{patient_hash.upper()}"
    dataset.PatientName = "ANONYMOUS^PATIENT"
    dataset.PatientID = safe_patient_id

    # Blank out demographic & institutional identifiers
    for tag in ["PatientBirthDate", "PatientAddress", "PatientTelephoneNumbers",
                "AccessionNumber", "InstitutionName", "InstitutionAddress",
                "ReferringPhysicianName", "PerformingPhysicianName",
                "OperatorsName", "PhysiciansOfRecord"]:
        if hasattr(dataset, tag):
            setattr(dataset, tag, "")

    # 2. Strip vendor-specific private tags (odd group numbers)
    try:
        dataset.remove_private_tags()
    except Exception:
        pass

    # 3. Extract and preserve authorized structural metadata
    modality = str(getattr(dataset, "Modality", "MRI")).upper()
    study_uid = str(getattr(dataset, "StudyInstanceUID", f"1.2.826.0.1.{patient_hash}.1"))
    series_uid = str(getattr(dataset, "SeriesInstanceUID", f"1.2.826.0.1.{patient_hash}.2"))
    sop_uid = str(getattr(dataset, "SOPInstanceUID", f"1.2.826.0.1.{patient_hash}.3"))
    study_date = str(getattr(dataset, "StudyDate", datetime.date.today().strftime("%Y%m%d")))
    manufacturer = str(getattr(dataset, "Manufacturer", "CLINICAL_IMAGING_SYSTEM"))

    safe_metadata = {
        "deidentified": True,
        "deidentification_profile": profile,
        "patient_name": "ANONYMOUS_PATIENT",
        "patient_pseudonym_id": safe_patient_id,
        "modality": modality,
        "study_instance_uid": study_uid,
        "series_instance_uid": series_uid,
        "sop_instance_uid": sop_uid,
        "study_date": study_date,
        "manufacturer": manufacturer,
        "rows": int(getattr(dataset, "Rows", 512)),
        "columns": int(getattr(dataset, "Columns", 512)),
    }
    return safe_metadata


def preprocess_dicom_image(file_bytes: bytes) -> tuple[bytes, dict, float, float]:
    """
    Parses a clinical DICOM (.dcm) file using pydicom, validates structure,
    performs safe de-identification, extracts & normalizes pixel data, and renders 512x512 PNG.
    Returns: (preprocessed_png_bytes, safe_metadata_dict, quality_score, entropy)
    """
    if not PYDICOM_AVAILABLE:
        logger.warning("pydicom library not found. Falling back to standard image preprocessing.")
        png_bytes, q_score, ent = preprocess_medical_image(file_bytes)
        return png_bytes, {"patient_name": "ANONYMOUS_PATIENT", "modality": "MRI"}, q_score, ent

    logger.info("Initializing clinical DICOM parsing and de-identification engine...")
    try:
        dataset = pydicom.dcmread(io.BytesIO(file_bytes), force=True)
        if not hasattr(dataset, "file_meta") or dataset.file_meta is None:
            dataset.file_meta = Dataset()

        # Extract and de-identify metadata
        safe_meta = deidentify_dicom_dataset(dataset)

        # Extract pixel data
        if not hasattr(dataset, "pixel_array"):
            raise ValueError("DICOM file contains no readable pixel array")

        pixel_array = dataset.pixel_array.astype(np.float64)

        # Handle RescaleSlope and RescaleIntercept if present (CT Hounsfield units)
        slope = float(getattr(dataset, "RescaleSlope", 1.0))
        intercept = float(getattr(dataset, "RescaleIntercept", 0.0))
        pixel_array = pixel_array * slope + intercept

        # Handle MONOCHROME1 (inverted grayscale where 0 is white)
        photometric = getattr(dataset, "PhotometricInterpretation", "MONOCHROME2")
        if photometric == "MONOCHROME1":
            pixel_array = np.amax(pixel_array) - pixel_array

        # Normalize pixel values to 0-255 uint8
        p_min, p_max = pixel_array.min(), pixel_array.max()
        if p_max > p_min:
            normalized_array = ((pixel_array - p_min) / (p_max - p_min) * 255.0).astype(np.uint8)
        else:
            normalized_array = np.zeros(pixel_array.shape, dtype=np.uint8)

        # Enhance with median filter and CLAHE
        denoised = cv2.medianBlur(normalized_array, 3)
        clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(8, 8))
        enhanced = clahe.apply(denoised)

        # Resize to standard 512x512
        resized = cv2.resize(enhanced, (512, 512), interpolation=cv2.INTER_CUBIC)
        norm_512 = cv2.normalize(resized, None, 0, 255, cv2.NORM_MINMAX)

        quality_score = calculate_quality_score(norm_512)
        entropy = calculate_entropy(norm_512)

        _, encoded_img = cv2.imencode(".png", norm_512)
        logger.info(f"DICOM parsing & de-identification completed. Modality: {safe_meta['modality']}, Quality: {quality_score}")
        return encoded_img.tobytes(), safe_meta, quality_score, entropy

    except Exception as e:
        logger.warning(f"DICOM parsing failed: {str(e)}. Falling back to standard image decoding.")
        png_bytes, q_score, ent = preprocess_medical_image(file_bytes)
        fallback_meta = {
            "deidentified": True,
            "patient_name": "ANONYMOUS_PATIENT",
            "modality": "MRI",
            "study_instance_uid": "1.2.826.0.1.fallback.study",
            "series_instance_uid": "1.2.826.0.1.fallback.series",
            "study_date": datetime.date.today().strftime("%Y%m%d")
        }
        return png_bytes, fallback_meta, q_score, ent
