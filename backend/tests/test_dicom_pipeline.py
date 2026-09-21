import io
import os
import sys
import numpy as np
import pytest
import pydicom
from pydicom.dataset import Dataset, FileMetaDataset
from pydicom.uid import ExplicitVRLittleEndian, SecondaryCaptureImageStorage, generate_uid

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.preprocessing import (
    preprocess_medical_image,
    preprocess_dicom_image,
    deidentify_dicom_dataset,
    calculate_entropy,
    calculate_quality_score,
)


def create_synthetic_dicom_bytes() -> bytes:
    """Creates an in-memory valid DICOM file for pipeline verification."""
    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = SecondaryCaptureImageStorage
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian

    ds = Dataset()
    ds.file_meta = file_meta
    ds.is_little_endian = True
    ds.is_implicit_VR = False

    # Metadata
    ds.PatientName = "Doe^John^A"
    ds.PatientID = "PHI-998877"
    ds.PatientBirthDate = "19800101"
    ds.PatientSex = "M"
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    ds.SOPClassUID = file_meta.MediaStorageSOPClassUID
    ds.Modality = "MR"
    ds.Manufacturer = "Siemens Magnetom"
    ds.StudyDate = "20260115"
    ds.StudyTime = "103000"

    # Image properties
    ds.Rows = 64
    ds.Columns = 64
    ds.BitsAllocated = 16
    ds.BitsStored = 12
    ds.HighBit = 11
    ds.PixelRepresentation = 0
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"

    # Synthetic circle pixel data
    pixels = np.zeros((64, 64), dtype=np.uint16)
    for r in range(64):
        for c in range(64):
            if (r - 32) ** 2 + (c - 32) ** 2 < 20 ** 2:
                pixels[r, c] = 2048
    ds.PixelData = pixels.tobytes()

    buf = io.BytesIO()
    pydicom.dcmwrite(buf, ds, write_like_original=False)
    return buf.getvalue()


def test_dicom_safe_harbor_deidentification():
    """Verify HIPAA Safe Harbor de-identification rules on DICOM dataset."""
    dicom_bytes = create_synthetic_dicom_bytes()
    ds = pydicom.dcmread(io.BytesIO(dicom_bytes))

    orig_study_uid = str(ds.StudyInstanceUID)
    orig_series_uid = str(ds.SeriesInstanceUID)

    safe_metadata = deidentify_dicom_dataset(ds)

    # 1. Direct identifiers must be replaced/removed in dataset and in metadata
    assert "Doe" not in str(ds.PatientName)
    assert "998877" not in str(ds.PatientID)
    assert not hasattr(ds, "PatientBirthDate") or ds.PatientBirthDate in ("", None)
    assert safe_metadata["patient_name"] == "ANONYMOUS_PATIENT"

    # 2. Critical clinical identifiers must be preserved
    assert str(ds.StudyInstanceUID) == orig_study_uid
    assert str(ds.SeriesInstanceUID) == orig_series_uid
    assert safe_metadata["modality"] == "MR"


def test_dicom_preprocessing_pipeline():
    """Verify end-to-end preprocess_dicom_image returning PNG bytes, metadata, quality, and entropy."""
    dicom_bytes = create_synthetic_dicom_bytes()
    png_bytes, metadata, quality_score, entropy = preprocess_dicom_image(dicom_bytes)

    assert len(png_bytes) > 0
    # PNG signature check
    assert png_bytes[:8] == b"\x89PNG\r\n\x1a\n"
    assert metadata["modality"] == "MR"
    assert metadata["study_instance_uid"] != ""
    assert 0.0 <= quality_score <= 100.0
    assert entropy > 0.0


def test_standard_image_preprocessing():
    """Verify standard medical image preprocessing with entropy and quality score."""
    # Create simple 64x64 test image PNG
    import cv2
    img = np.full((64, 64), 128, dtype=np.uint8)
    cv2.circle(img, (32, 32), 16, 255, -1)
    _, encoded = cv2.imencode(".png", img)

    preprocessed_bytes, quality_score, entropy = preprocess_medical_image(encoded.tobytes())
    assert len(preprocessed_bytes) > 0
    assert preprocessed_bytes[:8] == b"\x89PNG\r\n\x1a\n"
    assert 0.0 <= quality_score <= 100.0
    assert entropy > 0.0
