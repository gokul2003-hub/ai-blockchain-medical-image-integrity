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
    """Delete the throwaway database so test runs leave no artifacts behind."""
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