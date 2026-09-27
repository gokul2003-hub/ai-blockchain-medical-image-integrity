import io
import os
import sys
import asyncio
import uuid
import numpy as np
import pytest
import pydicom
import cv2
from fastapi import UploadFile
from starlette.datastructures import Headers
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
from app.database import SessionLocal, engine
from app.models import (
    AuditLog, Base, BlockchainTransaction, DicomMetadata, DicomSlice,
    DigitalIntegrityTwin, DoctorProfile, Hospital, MedicalImage, PatientProfile, User,
)
from app.routes import images as image_routes
from app.routes.images import upload_dicom_image, upload_medical_image
from app.storage_provider import store_encrypted_object


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

    # 2. Persistable metadata uses valid pseudonymous UIDs, not source UIDs.
    assert safe_metadata["study_instance_uid"] != orig_study_uid
    assert safe_metadata["series_instance_uid"] != orig_series_uid
    assert safe_metadata["study_instance_uid"].startswith("2.25.")
    assert safe_metadata["study_date"] is None
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


def create_multiframe_dicom_bytes() -> bytes:
    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = SecondaryCaptureImageStorage
    file_meta.MediaStorageSOPInstanceUID = generate_uid()
    file_meta.TransferSyntaxUID = ExplicitVRLittleEndian

    ds = Dataset()
    ds.file_meta = file_meta
    ds.is_little_endian = True
    ds.is_implicit_VR = False
    ds.PatientName = "Vol^Patient"
    ds.PatientID = "VOL-1"
    ds.StudyInstanceUID = generate_uid()
    ds.SeriesInstanceUID = generate_uid()
    ds.SOPInstanceUID = file_meta.MediaStorageSOPInstanceUID
    ds.SOPClassUID = file_meta.MediaStorageSOPClassUID
    ds.Modality = "CT"
    ds.NumberOfFrames = 3
    ds.Rows = 32
    ds.Columns = 32
    ds.BitsAllocated = 16
    ds.BitsStored = 12
    ds.HighBit = 11
    ds.PixelRepresentation = 0
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    frames = np.zeros((3, 32, 32), dtype=np.uint16)
    frames[0, 8:24, 8:24] = 1500
    frames[1, :, :] = 400
    frames[2, :, :] = 900
    ds.PixelData = frames.tobytes()
    buf = io.BytesIO()
    pydicom.dcmwrite(buf, ds, write_like_original=False)
    return buf.getvalue()


def test_invalid_dicom_does_not_fallback_to_jpeg():
    with pytest.raises(ValueError, match="Invalid or unreadable DICOM|no readable pixel array"):
        preprocess_dicom_image(b"this is not a dicom file")


def test_jpeg_bytes_rejected_as_dicom():
    import cv2
    img = np.full((32, 32), 90, dtype=np.uint8)
    _, encoded = cv2.imencode(".png", img)
    with pytest.raises(ValueError):
        preprocess_dicom_image(encoded.tobytes())


def test_multiframe_dicom_uses_first_slice():
    png_bytes, metadata, quality_score, entropy = preprocess_dicom_image(create_multiframe_dicom_bytes())
    assert png_bytes[:8] == b"\x89PNG\r\n\x1a\n"
    assert metadata["modality"] == "CT"
    assert 0.0 <= quality_score <= 100.0
    assert entropy >= 0.0


def _upload_test_context():
    """Create a same-hospital clinician/patient pair for direct route tests."""
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    suffix = uuid.uuid4().hex[:10]
    hospital = Hospital(
        name=f"Upload Test Hospital {suffix}", license_number=f"UP-{suffix}",
        address="1 Test Way", contact_email=f"upload-{suffix}@example.test",
    )
    patient_user = User(
        username=f"upload_patient_{suffix}", email=f"patient-{suffix}@example.test",
        hashed_password="not-used", role="patient", hospital=hospital, is_active=True,
    )
    uploader = User(
        username=f"upload_doctor_{suffix}", email=f"doctor-{suffix}@example.test",
        hashed_password="not-used", role="doctor", hospital=hospital, is_active=True,
    )
    db.add_all([hospital, patient_user, uploader])
    db.flush()
    patient = PatientProfile(user_id=patient_user.id, date_of_birth="1990-01-01", gender="Other", blood_group="O+")
    doctor = DoctorProfile(user_id=uploader.id, specialization="Radiology", license_number=f"LIC-{suffix}")
    db.add_all([patient, doctor])
    db.commit()
    db.refresh(patient)
    db.refresh(uploader)
    return db, patient, uploader


def _upload_file(filename: str, content_type: str, contents: bytes) -> UploadFile:
    return UploadFile(
        file=io.BytesIO(contents), filename=filename, headers=Headers({"content-type": content_type})
    )


def test_normal_and_dicom_route_ingestion_store_only_decryptable_ciphertext():
    """Exercise each ingestion route through DB mapping and encrypted object storage."""
    db, patient, uploader = _upload_test_context()
    try:
        plain = np.full((32, 32), 128, dtype=np.uint8)
        _, standard_png = cv2.imencode(".png", plain)
        standard = asyncio.run(upload_medical_image(
            title="Route Normal", patient_id=patient.id, image_type="MRI",
            file=_upload_file("route.png", "image/png", standard_png.tobytes()), db=db, current_user=uploader,
        ))
        dicom = asyncio.run(upload_dicom_image(
            title="Route DICOM", patient_id=patient.id,
            file=_upload_file("route.dcm", "application/dicom", create_synthetic_dicom_bytes()),
            db=db, current_user=uploader,
        ))

        from app.crypto import decrypt_image, sha3_hash
        from app.storage_provider import load_encrypted_object
        for result in (standard, dicom):
            stored = db.get(MedicalImage, result.id)
            assert stored is not None
            assert stored.patient_id == patient.id
            assert db.query(DigitalIntegrityTwin).filter_by(image_id=stored.id).one_or_none() is not None
            assert db.query(AuditLog).filter_by(image_id=stored.id, action="UPLOAD").one_or_none() is not None
            assert db.query(BlockchainTransaction).filter(
                BlockchainTransaction.payload.contains(f'"image_id": {stored.id}')
            ).one_or_none() is not None
            encrypted = load_encrypted_object(stored.file_path)
            assert sha3_hash(encrypted) == stored.encrypted_hash
            decrypted = decrypt_image(encrypted, stored.original_hash, stored.encryption_key_metadata)
            assert decrypted[:8] == b"\x89PNG\r\n\x1a\n"
        assert db.query(DicomMetadata).filter_by(image_id=dicom.id).one_or_none() is not None
        assert db.query(DicomSlice).filter_by(image_id=dicom.id, slice_index=0).one_or_none() is not None
    finally:
        db.close()


def _capture_stored_object(monkeypatch):
    created = []

    def capture(payload, filename, provider_name=None):
        result = store_encrypted_object(payload, filename, provider_name)
        created.append(result)
        return result

    monkeypatch.setattr(image_routes, "store_encrypted_object", capture)
    return created


@pytest.mark.parametrize("upload_kind", ["normal", "dicom"])
def test_upload_compensates_ciphertext_when_twin_creation_fails(monkeypatch, upload_kind):
    """Neither route may leave a committed image or ciphertext after twin failure."""
    db, patient, uploader = _upload_test_context()
    created = _capture_stored_object(monkeypatch)
    monkeypatch.setattr(image_routes, "create_digital_twin", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("twin failure")))
    try:
        if upload_kind == "normal":
            image = np.full((32, 32), 128, dtype=np.uint8)
            _, payload = cv2.imencode(".png", image)
            operation = upload_medical_image(
                title="Twin Failure", patient_id=patient.id, image_type="MRI",
                file=_upload_file("fail.png", "image/png", payload.tobytes()), db=db, current_user=uploader,
            )
        else:
            operation = upload_dicom_image(
                title="Twin Failure", patient_id=patient.id,
                file=_upload_file("fail.dcm", "application/dicom", create_synthetic_dicom_bytes()),
                db=db, current_user=uploader,
            )
        with pytest.raises(Exception, match="registration failed"):
            asyncio.run(operation)
        assert len(created) == 1
        assert db.query(MedicalImage).filter_by(file_path=created[0].reference).one_or_none() is None
        with pytest.raises(FileNotFoundError):
            image_routes.load_encrypted_object(created[0].reference)
    finally:
        db.close()


def test_normal_upload_compensates_on_ledger_failure_and_retry_is_clean(monkeypatch):
    """A failed local registration can be retried without stale image/object state."""
    db, patient, uploader = _upload_test_context()
    created = _capture_stored_object(monkeypatch)
    image = np.full((32, 32), 128, dtype=np.uint8)
    _, payload = cv2.imencode(".png", image)
    title = f"Ledger Failure Retry {uuid.uuid4().hex}"
    common = dict(
        title=title, patient_id=patient.id, image_type="MRI",
        db=db, current_user=uploader,
    )
    monkeypatch.setattr(
        image_routes.blockchain_service, "record_upload",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("ledger failure")),
    )
    try:
        with pytest.raises(Exception, match="registration failed"):
            asyncio.run(upload_medical_image(
                **common, file=_upload_file("retry.png", "image/png", payload.tobytes()),
            ))
        failed_ref = created[0].reference
        assert db.query(MedicalImage).filter_by(file_path=failed_ref).one_or_none() is None
        with pytest.raises(FileNotFoundError):
            image_routes.load_encrypted_object(failed_ref)

        monkeypatch.undo()
        successful = asyncio.run(upload_medical_image(
            **common, file=_upload_file("retry.png", "image/png", payload.tobytes()),
        ))
        assert db.query(MedicalImage).filter_by(id=successful.id).one_or_none() is not None
        assert db.query(MedicalImage).filter_by(title=title).count() == 1
    finally:
        db.close()


def test_normal_upload_compensates_on_medical_image_insert_failure(monkeypatch):
    """A DB failure immediately after ciphertext creation removes that ciphertext."""
    db, patient, uploader = _upload_test_context()
    created = _capture_stored_object(monkeypatch)
    image = np.full((32, 32), 128, dtype=np.uint8)
    _, payload = cv2.imencode(".png", image)
    monkeypatch.setattr(db, "flush", lambda: (_ for _ in ()).throw(RuntimeError("insert failure")))
    try:
        with pytest.raises(Exception, match="registration failed"):
            asyncio.run(upload_medical_image(
                title="Insert Failure", patient_id=patient.id, image_type="MRI",
                file=_upload_file("insert.png", "image/png", payload.tobytes()), db=db, current_user=uploader,
            ))
        assert len(created) == 1
        assert db.query(MedicalImage).filter_by(file_path=created[0].reference).one_or_none() is None
        with pytest.raises(FileNotFoundError):
            image_routes.load_encrypted_object(created[0].reference)
    finally:
        db.close()


def test_normal_upload_compensates_when_final_commit_fails(monkeypatch):
    """A late audit/commit failure rolls back all staged local records and ciphertext."""
    db, patient, uploader = _upload_test_context()
    created = _capture_stored_object(monkeypatch)
    image = np.full((32, 32), 128, dtype=np.uint8)
    _, payload = cv2.imencode(".png", image)
    original_commit = db.commit
    monkeypatch.setattr(db, "commit", lambda: (_ for _ in ()).throw(RuntimeError("final commit failure")))
    try:
        with pytest.raises(Exception, match="registration failed"):
            asyncio.run(upload_medical_image(
                title="Commit Failure", patient_id=patient.id, image_type="MRI",
                file=_upload_file("commit.png", "image/png", payload.tobytes()), db=db, current_user=uploader,
            ))
        assert len(created) == 1
        assert db.query(MedicalImage).filter_by(file_path=created[0].reference).one_or_none() is None
        with pytest.raises(FileNotFoundError):
            image_routes.load_encrypted_object(created[0].reference)
    finally:
        monkeypatch.setattr(db, "commit", original_commit)
        db.close()


def test_dicom_upload_compensates_on_insert_failure(monkeypatch):
    """A DB insert/flush failure during DICOM upload removes the newly generated ciphertext."""
    db, patient, uploader = _upload_test_context()
    created = _capture_stored_object(monkeypatch)
    monkeypatch.setattr(db, "flush", lambda: (_ for _ in ()).throw(RuntimeError("dicom flush failure")))
    try:
        with pytest.raises(Exception, match="DICOM registration failed"):
            asyncio.run(upload_dicom_image(
                title="DICOM Insert Failure", patient_id=patient.id,
                file=_upload_file("dicom_insert_fail.dcm", "application/dicom", create_synthetic_dicom_bytes()),
                db=db, current_user=uploader,
            ))
        assert len(created) == 1
        failed_ref = created[0].reference
        assert db.query(MedicalImage).filter_by(file_path=failed_ref).one_or_none() is None
        assert db.query(DicomSlice).filter_by(ipfs_cid=failed_ref).one_or_none() is None
        with pytest.raises(FileNotFoundError):
            image_routes.load_encrypted_object(failed_ref)
    finally:
        db.close()


def test_dicom_upload_compensates_on_ledger_failure_and_retry_is_clean(monkeypatch):
    """A ledger registration failure during DICOM upload rolls back DB, unlinks file, and retries cleanly."""
    db, patient, uploader = _upload_test_context()
    created = _capture_stored_object(monkeypatch)
    title = f"DICOM Ledger Retry {uuid.uuid4().hex}"
    common = dict(
        title=title, patient_id=patient.id, db=db, current_user=uploader,
    )
    monkeypatch.setattr(
        image_routes.blockchain_service, "record_upload",
        lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("dicom ledger failure")),
    )
    try:
        with pytest.raises(Exception, match="DICOM registration failed"):
            asyncio.run(upload_dicom_image(
                **common, file=_upload_file("retry.dcm", "application/dicom", create_synthetic_dicom_bytes()),
            ))
        failed_ref = created[0].reference
        assert db.query(MedicalImage).filter_by(file_path=failed_ref).one_or_none() is None
        assert db.query(DicomMetadata).join(MedicalImage).filter(MedicalImage.file_path == failed_ref).one_or_none() is None
        with pytest.raises(FileNotFoundError):
            image_routes.load_encrypted_object(failed_ref)

        # Retry after resolving transient failure
        monkeypatch.undo()
        successful = asyncio.run(upload_dicom_image(
            **common, file=_upload_file("retry.dcm", "application/dicom", create_synthetic_dicom_bytes()),
        ))
        assert db.query(MedicalImage).filter_by(id=successful.id).one_or_none() is not None
        assert db.query(MedicalImage).filter_by(title=title).count() == 1
        assert db.query(DicomMetadata).filter_by(image_id=successful.id).one_or_none() is not None
        assert db.query(DicomSlice).filter_by(image_id=successful.id, slice_index=0).one_or_none() is not None
        assert db.query(DigitalIntegrityTwin).filter_by(image_id=successful.id).one_or_none() is not None
    finally:
        db.close()


def test_dicom_upload_compensates_when_final_commit_fails(monkeypatch):
    """A final commit failure during DICOM upload rolls back metadata, slices, twin, and ciphertext."""
    db, patient, uploader = _upload_test_context()
    created = _capture_stored_object(monkeypatch)
    original_commit = db.commit
    monkeypatch.setattr(db, "commit", lambda: (_ for _ in ()).throw(RuntimeError("dicom final commit failure")))
    try:
        with pytest.raises(Exception, match="DICOM registration failed"):
            asyncio.run(upload_dicom_image(
                title="DICOM Commit Failure", patient_id=patient.id,
                file=_upload_file("dicom_commit_fail.dcm", "application/dicom", create_synthetic_dicom_bytes()),
                db=db, current_user=uploader,
            ))
        assert len(created) == 1
        failed_ref = created[0].reference
        assert db.query(MedicalImage).filter_by(file_path=failed_ref).one_or_none() is None
        assert db.query(DicomSlice).filter_by(ipfs_cid=failed_ref).one_or_none() is None
        with pytest.raises(FileNotFoundError):
            image_routes.load_encrypted_object(failed_ref)
    finally:
        monkeypatch.setattr(db, "commit", original_commit)
        db.close()


def test_compensate_refuses_to_delete_committed_image_or_slice_or_twin():
    """_compensate_failed_upload must never delete an object referenced by an existing committed record."""
    db, patient, uploader = _upload_test_context()
    try:
        # Create and successfully register an image
        image = np.full((32, 32), 128, dtype=np.uint8)
        _, payload = cv2.imencode(".png", image)
        registered = asyncio.run(upload_medical_image(
            title="Existing Image", patient_id=patient.id, image_type="MRI",
            file=_upload_file("existing.png", "image/png", payload.tobytes()), db=db, current_user=uploader,
        ))
        committed_ref = registered.file_path

        # Encrypted object must exist
        assert len(image_routes.load_encrypted_object(committed_ref)) > 0

        # Attempting compensation with the committed reference must be rejected and preserve ciphertext
        image_routes._compensate_failed_upload(db, "local", committed_ref)

        # Confirm ciphertext was NOT deleted
        assert len(image_routes.load_encrypted_object(committed_ref)) > 0
        assert db.query(MedicalImage).filter_by(id=registered.id).one_or_none() is not None
    finally:
        db.close()


def test_compensate_resilient_to_storage_delete_exception(monkeypatch):
    """_compensate_failed_upload handles storage deletion exceptions gracefully without crashing."""
    db, patient, uploader = _upload_test_context()
    monkeypatch.setattr(
        image_routes, "delete_encrypted_object",
        lambda ref, provider: (_ for _ in ()).throw(RuntimeError("storage backend network partition")),
    )
    try:
        # Should execute rollback and catch the delete error without raising an unhandled exception
        image_routes._compensate_failed_upload(db, "local", "non_existent_fake_ref.enc")
    finally:
        db.close()

