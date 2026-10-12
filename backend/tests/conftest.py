"""Pytest session bootstrap.

The environment overrides below must be applied before any test module imports
``app.*``, because ``app.config.load_settings()`` runs at import time and reads
them. pytest loads this file before collecting test modules, so that ordering
holds.

Without this, the suite executes against the developer database
(``backend/medical_sharing.db``) and permanently corrupts the audit ledger: tests
insert raw ``BlockchainTransaction`` rows and ad-hoc users, so a single test run
leaves the local chain unverifiable and the admin audit page reporting tampering
that never happened.

``TestClient`` is used as a plain object throughout the suite rather than as a
context manager, so FastAPI's startup hook never fires and ``seed_database`` is
never called. The ``seed_test_database`` fixture supplies the baseline hospital
and user rows that the foreign keys require.
"""

import os
import shutil
import tempfile
import uuid

import pytest

_TEST_DB = os.path.join(
    tempfile.gettempdir(),
    f"medical_sharing_test_{os.getpid()}_{uuid.uuid4().hex[:8]}.db",
)

os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB}"

# Keep test runs off production cryptography and administrative bootstrap paths.
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("MFA_TEST_MODE", "true")
os.environ.setdefault("MFA_TEST_OTP", "000000")
os.environ.setdefault("STORAGE_PROVIDER", "local")
os.environ.setdefault("BLOCKCHAIN_PROVIDER", "development")

# --- Phase 14: isolate every test artifact write from backend/storage -------
#
# ``app.config`` derives STORAGE_DIR and all of its sub-directories from a
# hard-coded project path, and app modules bind those values at import time
# (``storage_provider`` takes ENCRYPTED_DIR, ``ai_model`` takes STORAGE_DIR,
# ``artifact_provenance`` freezes HEATMAP_DIR). Patching the module attributes
# here -- before any ``app.*`` import -- therefore redirects EVERY generated
# file: encrypted objects, PDFs, heatmaps, localization masks and provenance
# sidecars. Without this the suite silently writes into the real
# ``backend/storage``, where test image ids collide with real demo studies.
#
# Production defaults are untouched: outside pytest nothing imports this module,
# so config.py keeps pointing at backend/storage.
from pathlib import Path as _Path  # noqa: E402
import shutil as _shutil  # noqa: E402

_TEST_STORAGE = _Path(tempfile.mkdtemp(prefix="medisecure_test_storage_"))

import app.config as _app_config  # noqa: E402

# Only the directories tests WRITE to are redirected. AI_DIR / AI_MODEL_PATH are
# deliberately left pointing at the real storage: they hold the pretrained
# Swin-UNet weights (backend/storage/ai/unet_tamper.pth, ~4.3 MB), which are
# read-only model inputs, not generated artifacts. Redirecting them makes the
# model look for weights in an empty temp directory and fall back to a network
# download that blocks the whole suite.
_app_config.STORAGE_DIR = _TEST_STORAGE
_app_config.ENCRYPTED_DIR = _TEST_STORAGE / "objects"
_app_config.REPORTS_DIR = _TEST_STORAGE / "reports"
_app_config.HEATMAPS_DIR = _TEST_STORAGE / "heatmaps"
for _d in (
    _app_config.ENCRYPTED_DIR,
    _app_config.REPORTS_DIR,
    _app_config.HEATMAPS_DIR,
    _TEST_STORAGE / "srm",
    _TEST_STORAGE / "ai",
):
    _d.mkdir(parents=True, exist_ok=True)

# Sanity guard: fail loudly rather than let a run write into production storage.
assert not str(_TEST_STORAGE).startswith(str(_app_config.BASE_DIR)), (
    f"test storage {_TEST_STORAGE} is inside the project tree"
)


@pytest.fixture(scope="session")
def test_storage_root():
    """Session-scoped isolated storage root (Phase 14).

    Every test that generates artifacts writes under this directory, never
    under ``backend/storage``.
    """
    return _TEST_STORAGE


@pytest.fixture()
def isolated_storage(test_storage_root):
    """Per-test subdirectory so concurrent tests cannot share filenames."""
    subdir = test_storage_root / f"test_{uuid.uuid4().hex[:8]}"
    subdir.mkdir(parents=True, exist_ok=True)
    yield subdir
    try:
        shutil.rmtree(subdir, ignore_errors=True)
    except Exception:
        pass


@pytest.fixture(scope="session", autouse=True)
def seed_test_database():
    """Create the schema and baseline rows the foreign keys point at."""
    from app.database import Base, SessionLocal, engine
    from app.main import seed_database

    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        seed_database(db)
        db.commit()
    finally:
        db.close()

    yield


def pytest_sessionfinish(session, exitstatus):
    """Delete the throwaway database and test storage so runs leave nothing."""
    try:
        from app.database import engine

        # Windows refuses to unlink a file that is still open, and SQLite keeps
        # the handle in the connection pool until the engine is disposed.
        engine.dispose()
    except Exception:
        pass

    for suffix in ("", "-wal", "-shm"):
        try:
            os.remove(_TEST_DB + suffix)
        except OSError:
            pass

    # Remove ONLY the isolated test storage. The real backend/storage is never
    # referenced by this process, and a failed rmtree must never touch it.
    try:
        if _TEST_STORAGE.exists() and str(_TEST_STORAGE).startswith(tempfile.gettempdir()):
            _shutil.rmtree(_TEST_STORAGE, ignore_errors=True)
    except Exception:
        pass