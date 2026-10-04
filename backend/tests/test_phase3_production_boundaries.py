"""Test suite for Phase 3: Elimination of hardcoded/fake data and explicit prototype boundaries.

Covers:
1. Admin password configuration and rejection of dev defaults in production
2. Static scan verifying no default Hardhat private keys in backend/frontend application source
3. Production rejection of well-known Hardhat private keys
4. Analytics aggregations: empty dataset, populated dataset, date range isolation, role counts
5. AI image dimension preprocessing: square, landscape, portrait, non-256 inputs, bounding box mapping
6. Storage provider separation: local mode, IPFS unavailable error, invalid provider, no fake Qm CIDs
7. User profile integrity: /users/me does not silently fabricate profile records
8. Research prototype metadata: zk-SNARK and FHE prototype disclaimers
"""

import os
import sys
import pytest
import numpy as np
import datetime
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import BASE_DIR, Settings, load_settings, AI_IMAGE_SIZE
from app.ai_model import (
    prepare_image_for_ai_model,
    map_bounding_boxes_to_original,
    localize_tampering,
)
from app.zk_snark import zk_snark_engine, SimulatedGroth16ZkSnarkEngine
from app.models import User, Report, AuditLog, Hospital, MedicalImage, PatientProfile, DoctorProfile
from app.database import Base, engine, SessionLocal
from app.auth import get_password_hash


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture
def clean_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        db.query(AuditLog).delete()
        db.query(Report).delete()
        db.query(MedicalImage).delete()
        db.query(PatientProfile).delete()
        db.query(DoctorProfile).delete()
        db.query(User).delete()
        db.query(Hospital).delete()
        db.commit()
        yield db
    finally:
        db.rollback()
        try:
            db.query(AuditLog).delete()
            db.query(Report).delete()
            db.query(MedicalImage).delete()
            db.query(PatientProfile).delete()
            db.query(DoctorProfile).delete()
            db.query(User).delete()
            db.query(Hospital).delete()
            db.commit()
            from app.main import seed_database
            seed_database(db)
        except Exception:
            db.rollback()
        finally:
            db.close()


# ---------------------------------------------------------------------------
# 1. Admin Password & Credentials Tests
# ---------------------------------------------------------------------------
def test_production_rejects_default_dev_passwords(monkeypatch):
    """Verify production environment refuses to boot with known development passwords."""
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "super-secret-jwt-key-minimum-32-chars-long!")
    monkeypatch.setenv("JWT_REFRESH_SECRET", "super-secret-refresh-key-minimum-32-chars!")
    # Valid 32-byte base64 key
    monkeypatch.setenv("MASTER_KEY", "2NMxJSffIPFnDAZ8Z2a9eOTmzu1mD-etQQUhAwqvjHU=")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://hospital.org")
    # See the note in test_production_accepts_valid_configured_bootstrap: the
    # session-wide MFA test bypass must be off for any production assertion.
    monkeypatch.setenv("MFA_TEST_MODE", "false")

    # In production, default dev password must trigger RuntimeError
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "AdminSecure123!")
    with pytest.raises(RuntimeError, match="Production ADMIN_BOOTSTRAP_PASSWORD cannot use default"):
        load_settings()

    # Short password must also fail
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "short")
    with pytest.raises(RuntimeError, match="at least 12 characters"):
        load_settings()


def test_production_accepts_valid_configured_bootstrap(monkeypatch):
    """Verify production environment accepts strong, custom configured admin bootstrap password."""
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "super-secret-jwt-key-minimum-32-chars-long!")
    monkeypatch.setenv("JWT_REFRESH_SECRET", "super-secret-refresh-key-minimum-32-chars!")
    monkeypatch.setenv("MASTER_KEY", "2NMxJSffIPFnDAZ8Z2a9eOTmzu1mD-etQQUhAwqvjHU=")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://hospital.org")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "SuperSecureProdPassword#2026!")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_EMAIL", "ciso@hospital.org")
    # The conftest session enables the MFA test bypass for the MFA suite. A
    # production configuration must disable it explicitly, so each production test
    # in this file sets it to keep the assertion focused on the rule under test.
    monkeypatch.setenv("MFA_TEST_MODE", "false")

    st = load_settings()
    assert st.admin_bootstrap_password == "SuperSecureProdPassword#2026!"
    assert st.admin_bootstrap_email == "ciso@hospital.org"


def test_development_defaults_allowed_in_dev_mode(monkeypatch):
    """Verify development mode retains offline default fallback for convenience."""
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("ADMIN_BOOTSTRAP_PASSWORD", raising=False)
    monkeypatch.delenv("INITIAL_ADMIN_PASSWORD", raising=False)

    st = load_settings()
    assert st.admin_bootstrap_password is not None
    assert len(st.admin_bootstrap_password) > 0


# ---------------------------------------------------------------------------
# 2. Hardhat Key & Private Key Static Validation
# ---------------------------------------------------------------------------
def test_static_check_no_default_hardhat_key_in_app_source():
    """Verify application source code files do not contain the default Hardhat private key."""
    known_key = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80".lower()

    app_dirs = [
        BASE_DIR / "app",
        BASE_DIR.parent / "frontend" / "src"
    ]

    for app_dir in app_dirs:
        if not app_dir.exists():
            continue
        for root, _, files in os.walk(app_dir):
            for file in files:
                if file.endswith((".py", ".ts", ".tsx", ".js", ".json")):
                    file_path = Path(root) / file
                    content = file_path.read_text(encoding="utf-8", errors="ignore").lower()
                    assert known_key not in content, f"Found hardcoded Hardhat test key in {file_path}"


def test_production_rejects_hardhat_private_key(monkeypatch):
    """Verify production environment rejects the known Hardhat private key."""
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "super-secret-jwt-key-minimum-32-chars-long!")
    monkeypatch.setenv("JWT_REFRESH_SECRET", "super-secret-refresh-key-minimum-32-chars!")
    monkeypatch.setenv("MASTER_KEY", "2NMxJSffIPFnDAZ8Z2a9eOTmzu1mD-etQQUhAwqvjHU=")
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://hospital.org")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "SuperSecureProdPassword#2026!")
    monkeypatch.setenv("BLOCKCHAIN_PRIVATE_KEY", "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80")
    # The conftest session sets MFA_TEST_MODE=true for the MFA test suite. Production
    # now refuses to start while that bypass is active, so each production rule under
    # test must disable it explicitly or it masks the assertion below.
    monkeypatch.setenv("MFA_TEST_MODE", "false")

    with pytest.raises(RuntimeError, match="Production BLOCKCHAIN_PRIVATE_KEY cannot use the well-known Hardhat"):
        load_settings()


# ---------------------------------------------------------------------------
# 3. Analytics Aggregations Tests
# ---------------------------------------------------------------------------
def test_analytics_dashboard_empty_dataset(clean_db):
    """Verify empty database returns honest zero statistics and empty access roles."""
    from app.routes.analytics import get_dashboard_analytics
    from unittest.mock import MagicMock

    mock_user = MagicMock()
    mock_user.id = 1
    mock_user.role = "super_admin"

    import asyncio
    data = asyncio.run(get_dashboard_analytics(db=clean_db, current_user=mock_user))

    # All counts should be 0
    assert data.stats.total_images == 0
    assert data.stats.total_hospitals == 0
    assert data.stats.total_doctors == 0
    assert data.stats.tampered_images == 0
    assert data.stats.verified_images == 0

    # Tampering history should all be 0 for each month
    assert len(data.tampering_statistics) == 6
    for stat in data.tampering_statistics:
        assert stat.tampered == 0
        assert stat.verified == 0

    # Access stats should be empty, not fake fallback numbers
    assert data.access_statistics == []


def test_analytics_dashboard_populated_dataset(clean_db):
    """Verify database records are correctly aggregated into monthly statistics."""
    from app.routes.analytics import get_dashboard_analytics
    from unittest.mock import MagicMock

    now = datetime.datetime.now(datetime.timezone.utc)

    # Create Hospital
    hosp = Hospital(
        name="Test Hosp",
        license_number="HOSP-TEST-001",
        address="100 Test St",
        contact_email="test@hosp.org"
    )
    clean_db.add(hosp)
    clean_db.commit()

    # Create patient user & profile
    patient_user = User(
        username="pat_test",
        email="pat_test@hospital.org",
        hashed_password=get_password_hash("PatSecure123!"),
        role="patient",
        hospital_id=hosp.id,
        is_active=True
    )
    clean_db.add(patient_user)
    clean_db.commit()

    pat_profile = PatientProfile(
        user_id=patient_user.id,
        date_of_birth="1990-01-01",
        gender="Other",
        blood_group="O+"
    )
    clean_db.add(pat_profile)
    clean_db.commit()

    # Create doctor user
    user = User(
        username="doc_test",
        email="doc_test@hospital.org",
        hashed_password=get_password_hash("DocSecure123!"),
        role="doctor",
        hospital_id=hosp.id,
        is_active=True
    )
    clean_db.add(user)
    clean_db.commit()

    # Create image
    img = MedicalImage(
        title="Head Scan",
        patient_id=pat_profile.id,
        uploader_id=user.id,
        hospital_id=hosp.id,
        image_type="MRI",
        file_path="scan.enc",
        original_hash="orig_hash_1",
        encrypted_hash="enc_hash_1",
        quality_score=90.0,
        entropy=7.5,
        encryption_key_metadata="dummy_key_b64",
        created_at=now
    )
    clean_db.add(img)
    clean_db.commit()

    # Create Tampered Report for current month
    report = Report(
        image_id=img.id,
        generated_by_id=user.id,
        file_path="report.pdf",
        status="TAMPERED",
        tampered_percentage=12.5,
        confidence_score=0.92,
        timestamp=now
    )
    clean_db.add(report)

    # Create verified download audit log for current month
    audit = AuditLog(
        user_id=user.id,
        action="DOWNLOAD",
        status="SUCCESS",
        timestamp=now
    )
    clean_db.add(audit)
    clean_db.commit()

    mock_user = MagicMock()
    mock_user.id = user.id
    mock_user.role = "doctor"

    import asyncio
    with patch("app.routes.analytics.add_laplace_noise_int", side_effect=lambda val, eps: int(val)):
        data = asyncio.run(get_dashboard_analytics(db=clean_db, current_user=mock_user))

    # Current month should reflect tampered and verified records (non-zero)
    current_month_label = now.strftime("%b")
    current_stat = next(s for s in data.tampering_statistics if s.month == current_month_label)
    assert current_stat.tampered >= 1
    assert current_stat.verified >= 1

    # Access stat should include Doctor
    doc_access = next((s for s in data.access_statistics if s.role == "Doctor"), None)
    assert doc_access is not None
    assert doc_access.count >= 1


# ---------------------------------------------------------------------------
# 4. AI Image Dimension Handling Tests
# ---------------------------------------------------------------------------
def test_ai_image_dimension_square():
    """Verify square image dimensions are correctly handled without distortion."""
    img = np.zeros((512, 512), dtype=np.uint8)
    prepared, meta = prepare_image_for_ai_model(img, target_size=(256, 256), preserve_aspect_ratio=True)

    assert prepared.shape == (256, 256)
    assert meta["original_dimensions"] == (512, 512)
    assert meta["model_input_dimensions"] == (256, 256)
    assert meta["original_aspect_ratio"] == 1.0


def test_ai_image_dimension_landscape():
    """Verify landscape image (e.g. 512x256) aspect ratio is preserved with letterbox padding."""
    img = np.zeros((256, 512), dtype=np.uint8)  # height=256, width=512
    prepared, meta = prepare_image_for_ai_model(img, target_size=(256, 256), preserve_aspect_ratio=True)

    assert prepared.shape == (256, 256)
    assert meta["original_dimensions"] == (512, 256)
    assert meta["model_input_dimensions"] == (256, 256)
    assert meta["original_aspect_ratio"] == 2.0
    # Scaled height should be 128, padded by 64 top and bottom
    assert meta["scaled_w"] == 256
    assert meta["scaled_h"] == 128
    assert meta["pad_y"] == 64
    assert meta["pad_x"] == 0


def test_ai_image_dimension_portrait():
    """Verify portrait image (e.g. 256x512) aspect ratio is preserved with letterbox padding."""
    img = np.zeros((512, 256), dtype=np.uint8)  # height=512, width=256
    prepared, meta = prepare_image_for_ai_model(img, target_size=(256, 256), preserve_aspect_ratio=True)

    assert prepared.shape == (256, 256)
    assert meta["original_dimensions"] == (256, 512)
    assert meta["model_input_dimensions"] == (256, 256)
    assert meta["original_aspect_ratio"] == 0.5
    # Scaled width should be 128, padded by 64 left and right
    assert meta["scaled_w"] == 128
    assert meta["scaled_h"] == 256
    assert meta["pad_x"] == 64
    assert meta["pad_y"] == 0


def test_ai_image_dimension_non_256_input():
    """Verify non-standard resolution (e.g. 300x400) maps dimensions accurately."""
    img = np.zeros((400, 300), dtype=np.uint8)  # h=400, w=300
    prepared, meta = prepare_image_for_ai_model(img, target_size=(256, 256), preserve_aspect_ratio=True)

    assert prepared.shape == (256, 256)
    assert meta["original_dimensions"] == (300, 400)
    assert meta["model_input_dimensions"] == (256, 256)

    # Test coordinate mapping
    boxes = [{"x": 32, "y": 32, "width": 40, "height": 40}]
    mapped = map_bounding_boxes_to_original(boxes, meta)
    assert len(mapped) == 1
    assert 0 <= mapped[0]["x"] <= 300
    assert 0 <= mapped[0]["y"] <= 400


# ---------------------------------------------------------------------------
# 5. Storage Provider & IPFS Fallback Elimination Tests
# ---------------------------------------------------------------------------
def test_storage_local_mode(clean_db):
    """Verify local storage mode stores payload with explicit local reference."""
    import dataclasses
    from app.ipfs import ipfs_client
    from app.config import settings

    mock_settings = dataclasses.replace(settings, storage_provider="local")
    with patch("app.config.settings", mock_settings):
        ref = ipfs_client.upload_bytes(b"sample_encrypted_data", "test.enc")
        # Must be local .enc reference, never a simulated Qm CID
        assert ref.endswith(".enc")
        assert not ref.startswith("QmSimulatedCID")

        # Must download correctly
        downloaded = ipfs_client.download_bytes(ref)
        assert downloaded == b"sample_encrypted_data"


def test_storage_ipfs_unavailable_raises_error():
    """Verify when STORAGE_PROVIDER=ipfs and daemon is unreachable, it raises explicit error."""
    import dataclasses
    from app.ipfs import ipfs_client
    from app.config import settings

    mock_settings = dataclasses.replace(settings, storage_provider="ipfs")
    with patch("app.config.settings", mock_settings):
        with patch("requests.post", side_effect=Exception("Connection refused")):
            with pytest.raises(RuntimeError, match="STORAGE_PROVIDER=ipfs is selected, but the IPFS daemon"):
                ipfs_client.upload_bytes(b"data", "test.enc")


def test_storage_invalid_provider():
    """Verify unsupported storage provider raises ValueError."""
    import dataclasses
    from app.ipfs import ipfs_client
    from app.config import settings

    mock_settings = dataclasses.replace(settings, storage_provider="invalid_provider")
    with patch("app.config.settings", mock_settings):
        with pytest.raises(ValueError, match="Invalid storage configuration"):
            ipfs_client.upload_bytes(b"data", "test.enc")


# ---------------------------------------------------------------------------
# 6. User Profile Defaults Elimination Tests
# ---------------------------------------------------------------------------
def test_users_me_does_not_fabricate_patient_profile(clean_db):
    """Verify GET /users/me does NOT fabricate dummy patient profile with fake DOB."""
    from app.routes.users import get_current_user_profile
    import asyncio

    patient_user = User(
        username="new_patient",
        email="patient@example.com",
        hashed_password=get_password_hash("Password12345!"),
        role="patient",
        is_active=True
    )
    clean_db.add(patient_user)
    clean_db.commit()
    clean_db.refresh(patient_user)

    res = asyncio.run(get_current_user_profile(current_user=patient_user, db=clean_db))
    # Must remain None, not silently fabricated as DOB 2000-01-01
    assert res.patient_profile is None


def test_users_me_does_not_fabricate_doctor_profile(clean_db):
    """Verify GET /users/me does NOT fabricate dummy doctor profile with fake license."""
    from app.routes.users import get_current_user_profile
    import asyncio

    doctor_user = User(
        username="new_doctor",
        email="doctor@example.com",
        hashed_password=get_password_hash("Password12345!"),
        role="doctor",
        is_active=True
    )
    clean_db.add(doctor_user)
    clean_db.commit()
    clean_db.refresh(doctor_user)

    res = asyncio.run(get_current_user_profile(current_user=doctor_user, db=clean_db))
    # Must remain None, not silently fabricated as General Practice
    assert res.doctor_profile is None


# ---------------------------------------------------------------------------
# 7. Prototype Disclaimers & Labels Tests
# ---------------------------------------------------------------------------
def test_zk_snark_prototype_metadata():
    """Verify zk-SNARK engine declares simulated prototype metadata."""
    assert getattr(zk_snark_engine, "is_simulated_prototype", False) is True

    proof_data = zk_snark_engine.generate_proof(1, "LIC-123", "secret-witness")
    assert proof_data.get("is_simulated_prototype") is True
    assert "RESEARCH PROTOTYPE" in proof_data.get("disclaimer", "")


def test_fhe_benchmark_prototype_metadata():
    """Verify FHE benchmark endpoint declares prototype simulation."""
    from app.routes.analytics import get_fhe_ckks_benchmark
    from unittest.mock import MagicMock
    import asyncio

    mock_user = MagicMock()
    data = asyncio.run(get_fhe_ckks_benchmark(current_user=mock_user))
    assert data.get("is_simulated_prototype") is True
    assert "SIMULATION_PROTOTYPE" in data.get("privacy_status", "")
    assert "research prototype simulation" in data.get("disclaimer", "")
