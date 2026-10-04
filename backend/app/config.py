"""Centralised, environment-driven application configuration.

Development can generate local secrets in ``.dev-secrets.json``. Production
never falls back to generated or embedded secrets: it fails fast instead.
"""

from __future__ import annotations

import base64
import hashlib
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


# Publicly known placeholder and development credential values. These are the
# exact strings shipped in .env.example together with the long-standing
# development defaults. Production must reject them outright: several of them are
# longer than the production minimum-length rule, so length alone will not catch
# a deployment that copied .env.example and only switched APP_ENV.
INSECURE_SECRET_VALUES = frozenset({
    "replace-with-a-random-48-plus-character-secret",
    "replace-with-a-different-random-48-plus-character-secret",
    "replace-with-a-base64-encoded-32-byte-key",
    "replace-with-a-secure-password-min-12-chars",
    "AdminDevOnly123!",
    "AdminSecure123!",
    "changeme",
    "change-me",
    "password",
    "secret",
    "supersecret",
    "development",
    "devsecret",
    "your-secret-here",
    "your-secret-key",
    "your-master-key",
    "0123456789abcdef0123456789abcdef",
})

# Compared case-insensitively so a mixed-case credential such as
# "AdminDevOnly123!" is still recognised as a known development default.
_INSECURE_SECRET_VALUES_CI = frozenset(value.strip().lower() for value in INSECURE_SECRET_VALUES)


def _is_insecure(value: str) -> bool:
    """True when *value* is a known placeholder or development credential."""
    return value.strip().lower() in _INSECURE_SECRET_VALUES_CI


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


@dataclass(frozen=True, repr=False)
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
    # When enabled, protected medical-image actions additionally require a valid
    # system-issued credential for the caller's DID. It can only ever refuse, so it
    # never widens the existing RBAC/consent model. Defaults off to keep existing
    # deployments working; enable it once identities have been backfilled.
    did_enforce_credential_on_image_access: bool
    storage_provider: str
    ipfs_api_url: str
    ipfs_gateway: str
    # Optional Authorization value for a secured Kubo RPC (API.Authorizations).
    # Never hard-coded; empty means the node is unauthenticated (localhost dev).
    ipfs_api_token: str
    ipfs_api_timeout: int
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
    admin_bootstrap_password: str | None
    admin_bootstrap_email: str | None

    # ------------------------------------------------------------------
    # Environment separation
    # ------------------------------------------------------------------

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def is_test(self) -> bool:
        return self.environment == "test"

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def has_mfa_test_bypass(self) -> bool:
        """Whether the deterministic MFA test bypass is active in this environment."""
        return self.mfa_test_mode and self.mfa_test_otp != ""

    def __repr__(self) -> str:
        """Redact secret material so a stray log or traceback cannot leak it."""
        return (
            f"Settings(environment={self.environment!r}, "
            f"jwt_secret='<redacted>', jwt_refresh_secret='<redacted>', "
            f"master_key_b64='<redacted>', mfa_test_otp='<redacted>', "
            f"blockchain_private_key={'<redacted>' if self.blockchain_private_key else None!r})"
        )


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
    if is_production:
        for label, value in (
            ("JWT_SECRET", jwt_secret),
            ("JWT_REFRESH_SECRET", refresh_secret),
            ("MASTER_KEY", master_key),
        ):
            if _is_insecure(value):
                raise RuntimeError(
                    f"Production {label} cannot use a known development or placeholder value; "
                    "generate a fresh secret before starting"
                )
        if jwt_secret == refresh_secret:
            raise RuntimeError("Production JWT_SECRET and JWT_REFRESH_SECRET must be different values")
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

    admin_bootstrap_password = (
        os.getenv("ADMIN_BOOTSTRAP_PASSWORD")
        or os.getenv("INITIAL_ADMIN_PASSWORD")
        or (None if is_production else "AdminDevOnly123!")
    )
    admin_bootstrap_email = (
        os.getenv("ADMIN_BOOTSTRAP_EMAIL")
        or os.getenv("INITIAL_ADMIN_EMAIL")
        or ("admin@medshare.local" if not is_production else None)
    )

    if is_production and admin_bootstrap_password:
        if _is_insecure(admin_bootstrap_password) or admin_bootstrap_password in {"admin", "Admin@123456!"}:
            raise RuntimeError("Production ADMIN_BOOTSTRAP_PASSWORD cannot use default development credentials")
        if len(admin_bootstrap_password) < 12:
            raise RuntimeError("Production ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters")

    # Deterministic MFA bypass. The test OTP is a second factor bypass and must
    # never exist in production, so this fails startup rather than degrading
    # quietly. Both values are additionally forced inert below as defence in depth
    # for the case where this check is ever bypassed.
    mfa_test_mode = _as_bool(os.getenv("MFA_TEST_MODE"), False)
    if is_production and mfa_test_mode:
        raise RuntimeError(
            "MFA_TEST_MODE must be disabled in production; the deterministic MFA "
            "test bypass is development/test only"
        )
    mfa_test_otp = os.getenv("MFA_TEST_OTP", "000000")
    if is_production:
        mfa_test_mode = False
        mfa_test_otp = ""

    blockchain_private_key = os.getenv("BLOCKCHAIN_PRIVATE_KEY") or None
    KNOWN_HARDHAT_TEST_KEY_HASH = "60a09e4357868c1e9b801052726d061c370429f723db84523ed58ac354f6eb8a"
    if is_production and blockchain_private_key:
        key_hash = hashlib.sha256(blockchain_private_key.strip().lower().encode()).hexdigest()
        if key_hash == KNOWN_HARDHAT_TEST_KEY_HASH:
            raise RuntimeError("Production BLOCKCHAIN_PRIVATE_KEY cannot use the well-known Hardhat development test key")

    return Settings(
        environment=environment,
        database_url=os.getenv("DATABASE_URL", db_default),
        jwt_secret=jwt_secret,
        jwt_refresh_secret=refresh_secret,
        master_key_b64=master_key,
        allowed_origins=origins,
        access_token_minutes=int(os.getenv("ACCESS_TOKEN_MINUTES", "15")),
        refresh_token_days=int(os.getenv("REFRESH_TOKEN_DAYS", "7")),
        mfa_test_mode=mfa_test_mode,
        auto_create_schema=_as_bool(os.getenv("AUTO_CREATE_SCHEMA"), not is_production),
        did_enforce_credential_on_image_access=_as_bool(
            os.getenv("DID_ENFORCE_CREDENTIAL_ON_IMAGE_ACCESS"), False
        ),
        storage_provider=storage_provider,
        ipfs_api_url=os.getenv("IPFS_API_URL", "http://127.0.0.1:5001"),
        ipfs_gateway=os.getenv("IPFS_GATEWAY", "http://127.0.0.1:8080/ipfs/"),
        ipfs_api_token=os.getenv("IPFS_API_TOKEN", ""),
        ipfs_api_timeout=max(1, int(os.getenv("IPFS_API_TIMEOUT", "20"))),
        blockchain_provider=blockchain_provider,
        blockchain_rpc_url=os.getenv("BLOCKCHAIN_RPC_URL") or None,
        blockchain_contract_address=os.getenv("BLOCKCHAIN_CONTRACT_ADDRESS") or None,
        blockchain_private_key=blockchain_private_key,
        secure_cookies=_as_bool(os.getenv("SECURE_COOKIES"), is_production),
        max_image_bytes=int(os.getenv("MAX_IMAGE_BYTES", str(10 * 1024 * 1024))),
        max_dicom_bytes=int(os.getenv("MAX_DICOM_BYTES", str(50 * 1024 * 1024))),
        mfa_test_otp=mfa_test_otp,
        emergency_access_enabled=_as_bool(os.getenv("EMERGENCY_ACCESS_ENABLED"), True),
        initial_admin_password=admin_bootstrap_password or "",
        admin_bootstrap_password=admin_bootstrap_password,
        admin_bootstrap_email=admin_bootstrap_email,
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
AI_BATCH_SIZE = int(os.getenv("AI_BATCH_SIZE", "5"))
AI_LEARNING_RATE = float(os.getenv("AI_LEARNING_RATE", "0.001"))
AI_WEIGHT_DECAY = float(os.getenv("AI_WEIGHT_DECAY", "0.0001"))
AI_RANDOM_SEED = int(os.getenv("AI_RANDOM_SEED", "42"))
AI_EARLY_STOPPING_PATIENCE = int(os.getenv("AI_EARLY_STOPPING_PATIENCE", "5"))
AI_IMAGE_SIZE = (256, 256)
AI_TAMPER_THRESHOLD = float(os.getenv("AI_TAMPER_THRESHOLD", "0.5"))
AI_MIN_REGION_AREA = int(os.getenv("AI_MIN_REGION_AREA", "20"))
AI_EXPERIMENTS_DIR = AI_DIR / "experiments"
AI_DATASET_ROOT = Path(os.getenv("AI_DATASET_ROOT", "")) if os.getenv("AI_DATASET_ROOT") else None
AI_RESEARCH_MODEL_RUN_ID = os.getenv("AI_RESEARCH_MODEL_RUN_ID", "").strip() or None

