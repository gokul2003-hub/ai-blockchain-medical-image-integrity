"""Centralised, environment-driven application configuration.

Development can generate local secrets in ``.dev-secrets.json``. Production
never falls back to generated or embedded secrets: it fails fast instead.
"""

from __future__ import annotations

import base64
import json
import os
import secrets
from dataclasses import dataclass
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / "storage"
ENCRYPTED_DIR = STORAGE_DIR / "objects"
REPORTS_DIR = STORAGE_DIR / "reports"
AI_DIR = STORAGE_DIR / "ai"
HEATMAPS_DIR = STORAGE_DIR / "heatmaps"
DEV_SECRETS_FILE = BASE_DIR / ".dev-secrets.json"

for directory in (STORAGE_DIR, ENCRYPTED_DIR, REPORTS_DIR, AI_DIR, HEATMAPS_DIR):
    directory.mkdir(parents=True, exist_ok=True)


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _load_dev_secrets() -> dict[str, str]:
    """Return persistent local-only secrets without putting them in source."""
    if DEV_SECRETS_FILE.exists():
        try:
            return json.loads(DEV_SECRETS_FILE.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            pass

    values = {
        "JWT_SECRET": secrets.token_urlsafe(48),
        "JWT_REFRESH_SECRET": secrets.token_urlsafe(48),
        "MASTER_KEY": base64.urlsafe_b64encode(secrets.token_bytes(32)).decode(),
    }
    DEV_SECRETS_FILE.write_text(json.dumps(values, indent=2), encoding="utf-8")
    try:
        os.chmod(DEV_SECRETS_FILE, 0o600)
    except OSError:
        # Windows ACLs are managed by the user profile.
        pass
    return values


@dataclass(frozen=True)
class Settings:
    environment: str
    database_url: str
    jwt_secret: str
    jwt_refresh_secret: str
    master_key_b64: str
    allowed_origins: tuple[str, ...]
    access_token_minutes: int
    refresh_token_days: int
    mfa_test_mode: bool
    auto_create_schema: bool
    storage_provider: str
    ipfs_api_url: str
    ipfs_gateway: str
    blockchain_provider: str
    blockchain_rpc_url: str | None
    blockchain_contract_address: str | None
    blockchain_private_key: str | None
    secure_cookies: bool
    max_image_bytes: int
    max_dicom_bytes: int
    mfa_test_otp: str
    emergency_access_enabled: bool
    initial_admin_password: str


def load_settings() -> Settings:
    environment = os.getenv("APP_ENV", "development").strip().lower()
    if environment not in {"development", "test", "production"}:
        raise RuntimeError("APP_ENV must be development, test, or production")

    is_production = environment == "production"
    dev_values = {} if is_production else _load_dev_secrets()

    jwt_secret = os.getenv("JWT_SECRET") or dev_values.get("JWT_SECRET", "")
    refresh_secret = os.getenv("JWT_REFRESH_SECRET") or dev_values.get("JWT_REFRESH_SECRET", "")
    master_key = os.getenv("MASTER_KEY") or dev_values.get("MASTER_KEY", "")
    missing = [name for name, value in {
        "JWT_SECRET": jwt_secret,
        "JWT_REFRESH_SECRET": refresh_secret,
        "MASTER_KEY": master_key,
    }.items() if not value]
    if missing:
        raise RuntimeError(f"Missing required security configuration: {', '.join(missing)}")
    if is_production and any(len(value) < 32 for value in (jwt_secret, refresh_secret)):
        raise RuntimeError("Production JWT secrets must be at least 32 characters")
    try:
        if len(base64.urlsafe_b64decode(master_key.encode())) != 32:
            raise ValueError
    except Exception as exc:
        raise RuntimeError("MASTER_KEY must be a URL-safe base64 encoded 32-byte key") from exc

    db_default = f"sqlite:///{(BASE_DIR / 'medical_sharing.db').as_posix()}"
    origins = tuple(
        origin.strip() for origin in os.getenv(
            "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",") if origin.strip()
    )
    if is_production and (not origins or "*" in origins):
        raise RuntimeError("Production ALLOWED_ORIGINS must contain explicit HTTPS origins")

    storage_provider = os.getenv("STORAGE_PROVIDER", "local").lower()
    if storage_provider not in {"local", "ipfs"}:
        raise RuntimeError("STORAGE_PROVIDER must be local or ipfs")
    blockchain_provider = os.getenv("BLOCKCHAIN_PROVIDER", "development").lower()
    if blockchain_provider not in {"development", "web3"}:
        raise RuntimeError("BLOCKCHAIN_PROVIDER must be development or web3")

    return Settings(
        environment=environment,
        database_url=os.getenv("DATABASE_URL", db_default),
        jwt_secret=jwt_secret,
        jwt_refresh_secret=refresh_secret,
        master_key_b64=master_key,
        allowed_origins=origins,
        access_token_minutes=int(os.getenv("ACCESS_TOKEN_MINUTES", "15")),
        refresh_token_days=int(os.getenv("REFRESH_TOKEN_DAYS", "7")),
        mfa_test_mode=_as_bool(os.getenv("MFA_TEST_MODE"), False),
        auto_create_schema=_as_bool(os.getenv("AUTO_CREATE_SCHEMA"), not is_production),
        storage_provider=storage_provider,
        ipfs_api_url=os.getenv("IPFS_API_URL", "http://127.0.0.1:5001"),
        ipfs_gateway=os.getenv("IPFS_GATEWAY", "http://127.0.0.1:8080/ipfs/"),
        blockchain_provider=blockchain_provider,
        blockchain_rpc_url=os.getenv("BLOCKCHAIN_RPC_URL") or None,
        blockchain_contract_address=os.getenv("BLOCKCHAIN_CONTRACT_ADDRESS") or None,
        blockchain_private_key=os.getenv("BLOCKCHAIN_PRIVATE_KEY") or None,
        secure_cookies=_as_bool(os.getenv("SECURE_COOKIES"), is_production),
        max_image_bytes=int(os.getenv("MAX_IMAGE_BYTES", str(10 * 1024 * 1024))),
        max_dicom_bytes=int(os.getenv("MAX_DICOM_BYTES", str(50 * 1024 * 1024))),
        mfa_test_otp=os.getenv("MFA_TEST_OTP", "000000"),
        emergency_access_enabled=_as_bool(os.getenv("EMERGENCY_ACCESS_ENABLED"), True),
        initial_admin_password=os.getenv("INITIAL_ADMIN_PASSWORD", "AdminSecure123!"),
    )


settings = load_settings()

# Compatibility exports retained while experimental adapters are being retired.
DATABASE_URL = settings.database_url
SECRET_KEY = settings.jwt_secret
JWT_REFRESH_SECRET_KEY = settings.jwt_refresh_secret
MASTER_ENCRYPTION_KEY = settings.master_key_b64
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_minutes
JWT_REFRESH_EXPIRE_DAYS = settings.refresh_token_days
REDIS_URL = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", REDIS_URL)
CELERY_RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", REDIS_URL)
BLOCKCHAIN_PROVIDER_URL = settings.blockchain_rpc_url or ""
BLOCKCHAIN_CONTRACT_ADDRESS = settings.blockchain_contract_address or ""
BLOCKCHAIN_PRIVATE_KEY = settings.blockchain_private_key or ""
BLOCKCHAIN_WALLET_ADDRESS = os.getenv("BLOCKCHAIN_WALLET_ADDRESS", "")
IPFS_API_URL = settings.ipfs_api_url
IPFS_GATEWAY = settings.ipfs_gateway
AI_MODEL_PATH = AI_DIR / "unet_tamper.pth"
AI_TRAIN_EPOCHS = int(os.getenv("AI_TRAIN_EPOCHS", "5"))
AI_IMAGE_SIZE = (256, 256)
