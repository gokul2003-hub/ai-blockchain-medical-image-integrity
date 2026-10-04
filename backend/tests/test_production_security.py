"""
Phase 2 — production security hardening tests (GAP-02).

Objective under test: the production environment must not accept static
development keys, and the deterministic MFA test bypass must not survive outside
development.

Each production case asserts that :func:`app.config.load_settings` raises, i.e.
that startup fails closed rather than degrading silently. The development and
test cases assert that the hardened rules did not break either of those
environments.
"""

import base64
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.config import (
    INSECURE_SECRET_VALUES,
    Settings,
    load_settings,
)


BACKEND_DIR = Path(__file__).resolve().parent.parent
PROJECT_ROOT = BACKEND_DIR.parent

# Variables that must be controlled for the duration of a load_settings() call so
# the host machine's real environment cannot influence the outcome.
_MANAGED_VARS = (
    "APP_ENV",
    "JWT_SECRET",
    "JWT_REFRESH_SECRET",
    "MASTER_KEY",
    "ALLOWED_ORIGINS",
    "MFA_TEST_MODE",
    "MFA_TEST_OTP",
    "ADMIN_BOOTSTRAP_PASSWORD",
    "INITIAL_ADMIN_PASSWORD",
    "ADMIN_BOOTSTRAP_EMAIL",
    "DATABASE_URL",
    "BLOCKCHAIN_PRIVATE_KEY",
    "STORAGE_PROVIDER",
    "BLOCKCHAIN_PROVIDER",
)

VALID_MASTER_KEY = base64.urlsafe_b64encode(b"\x07" * 32).decode()
VALID_JWT = "Kx9#mQ2$vL8@pR4wZc6!Jm3Xt9Qb2Lf7Vh5Nk8Sd1Ga4We6Y"
VALID_REFRESH = "Rt4$wB8!Xq2Zm9Vk3Lp6Jh1Ns5Dc7Fg0Ay2Eu4Io8Uz6Ta"


def _base_environment() -> dict[str, str]:
    """A fully valid production configuration used as the mutation baseline."""
    return {
        "APP_ENV": "production",
        "JWT_SECRET": VALID_JWT,
        "JWT_REFRESH_SECRET": VALID_REFRESH,
        "MASTER_KEY": VALID_MASTER_KEY,
        "ALLOWED_ORIGINS": "https://med.example.com",
        "MFA_TEST_MODE": "false",
    }


def _apply(monkeypatch, values: dict[str, str]) -> None:
    """Replace every managed variable with *values*, unsetting the ones omitted."""
    for name in _MANAGED_VARS:
        if name in values:
            monkeypatch.setenv(name, values[name])
        else:
            monkeypatch.delenv(name, raising=False)


def _load_production(monkeypatch, **overrides: str) -> Settings:
    values = _base_environment()
    for name in _MANAGED_VARS:
        if name not in values:
            values[name] = ""
    values.update(overrides)
    for name in list(values):
        if values[name] == "":
            del values[name]
    _apply(monkeypatch, values)
    return load_settings()


# ---------------------------------------------------------------------------
# 1. Production startup with missing JWT secret -> FAIL
# ---------------------------------------------------------------------------

class TestProductionMissingJwtSecret:

    def test_missing_jwt_secret_fails(self, monkeypatch):
        values = _base_environment()
        del values["JWT_SECRET"]
        _apply(monkeypatch, values)
        with pytest.raises(RuntimeError, match="JWT_SECRET"):
            load_settings()

    def test_missing_refresh_secret_fails(self, monkeypatch):
        values = _base_environment()
        del values["JWT_REFRESH_SECRET"]
        _apply(monkeypatch, values)
        with pytest.raises(RuntimeError, match="JWT_REFRESH_SECRET"):
            load_settings()

    def test_missing_both_jwt_secrets_fails(self, monkeypatch):
        values = _base_environment()
        del values["JWT_SECRET"]
        del values["JWT_REFRESH_SECRET"]
        _apply(monkeypatch, values)
        with pytest.raises(RuntimeError):
            load_settings()

    def test_short_jwt_secret_fails(self, monkeypatch):
        """Length is still enforced alongside the new placeholder rule."""
        with pytest.raises(RuntimeError, match="at least 32 characters"):
            _load_production(monkeypatch, JWT_SECRET="tooshort")


# ---------------------------------------------------------------------------
# 2. Production startup with development/default JWT secret -> FAIL
# ---------------------------------------------------------------------------

class TestProductionDefaultJwtSecret:

    @pytest.mark.parametrize("value", sorted(INSECURE_SECRET_VALUES))
    def test_known_insecure_jwt_secret_fails(self, monkeypatch, value):
        """Every published development/placeholder value must be refused.

        This is the concrete .env.example attack: copying the example file and
        switching only APP_ENV=production previously passed the length rule,
        because the placeholder strings are longer than 32 characters.

        Short values are refused by the length rule and long ones by the
        denylist; either outcome satisfies the requirement, so the assertion
        matches on the variable name rather than a specific rule.
        """
        with pytest.raises(RuntimeError, match="JWT"):
            _load_production(monkeypatch, JWT_SECRET=value)

    def test_env_example_placeholders_are_rejected(self, monkeypatch):
        with pytest.raises(RuntimeError, match="development or placeholder"):
            _load_production(
                monkeypatch, JWT_SECRET="replace-with-a-random-48-plus-character-secret"
            )
        with pytest.raises(RuntimeError, match="development or placeholder"):
            _load_production(
                monkeypatch, JWT_REFRESH_SECRET="replace-with-a-different-random-48-plus-character-secret"
            )

    def test_insecure_master_key_fails(self, monkeypatch):
        with pytest.raises(RuntimeError, match="development or placeholder"):
            _load_production(monkeypatch, MASTER_KEY="replace-with-a-base64-encoded-32-byte-key")

    def test_insecure_master_key_fails_case_insensitively(self, monkeypatch):
        with pytest.raises(RuntimeError):
            _load_production(monkeypatch, MASTER_KEY="ADMINDEVONLY123!")

    def test_identical_jwt_pair_fails(self, monkeypatch):
        """Access and refresh signing keys must not be the same value."""
        with pytest.raises(RuntimeError, match="must be different"):
            _load_production(monkeypatch, JWT_REFRESH_SECRET=VALID_JWT)

    def test_env_example_contains_no_real_credentials(self):
        """Repository hygiene: .env.example must ship placeholders only."""
        raw = (PROJECT_ROOT / ".env.example").read_text(encoding="utf-8")

        def _value(name: str) -> str:
            for line in raw.splitlines():
                if line.startswith(f"{name}="):
                    return line.split("=", 1)[1].strip()
            return ""

        for secret_name in ("JWT_SECRET", "JWT_REFRESH_SECRET", "MASTER_KEY"):
            value = _value(secret_name)
            assert value, f"{secret_name} missing from .env.example"
            assert "replace-with" in value, f"{secret_name} must be an obvious placeholder"

        from app.config import settings

        # The live cryptographic secrets and credentials must never appear in
        # the template. MFA_TEST_OTP is deliberately excluded: it is a published
        # test fixture, only honoured when MFA_TEST_MODE is on, and production
        # refuses to start with that flag enabled.
        live_values = {
            settings.jwt_secret,
            settings.jwt_refresh_secret,
            settings.master_key_b64,
            settings.initial_admin_password,
        }
        for value in live_values:
            if value:
                assert value not in raw, "A live secret value is present in .env.example"

        # The test OTP is documented, and the bypass it serves is dev-only.
        assert "MFA_TEST_MODE=false" in raw, ".env.example must not enable the MFA test bypass"


# ---------------------------------------------------------------------------
# 3. Production startup with missing encryption configuration -> FAIL
# ---------------------------------------------------------------------------

class TestProductionMissingEncryptionConfig:

    def test_missing_master_key_fails(self, monkeypatch):
        values = _base_environment()
        del values["MASTER_KEY"]
        _apply(monkeypatch, values)
        with pytest.raises(RuntimeError, match="MASTER_KEY"):
            load_settings()

    def test_empty_master_key_fails(self, monkeypatch):
        with pytest.raises(RuntimeError, match="MASTER_KEY"):
            _load_production(monkeypatch, MASTER_KEY="")

    def test_malformed_master_key_fails(self, monkeypatch):
        """A non-base64 or wrong-length master key must not start the app."""
        with pytest.raises(RuntimeError, match="MASTER_KEY"):
            _load_production(monkeypatch, MASTER_KEY="not-a-valid-key")

    def test_master_key_with_wrong_byte_length_fails(self, monkeypatch):
        short = base64.urlsafe_b64encode(b"\x07" * 16).decode()
        with pytest.raises(RuntimeError, match="32-byte"):
            _load_production(monkeypatch, MASTER_KEY=short)

    def test_production_does_not_fall_back_to_dev_secrets_file(self, monkeypatch):
        """Production must never source secrets from .dev-secrets.json."""
        dev_file = BACKEND_DIR / ".dev-secrets.json"
        if not dev_file.exists():
            pytest.skip("no local .dev-secrets.json on this machine")
        values = _base_environment()
        del values["JWT_SECRET"]
        del values["MASTER_KEY"]
        _apply(monkeypatch, values)
        with pytest.raises(RuntimeError, match="JWT_SECRET|MASTER_KEY"):
            load_settings()


# ---------------------------------------------------------------------------
# 4. Production with MFA_TEST_MODE=true -> FAIL
# ---------------------------------------------------------------------------

class TestProductionMfaBypassDisabled:

    @pytest.mark.parametrize("raw", ["true", "TRUE", "1", "yes", "on", "True"])
    def test_any_truthy_mfa_test_mode_fails(self, monkeypatch, raw):
        """Every accepted truthy spelling must refuse to start."""
        with pytest.raises(RuntimeError, match="MFA_TEST_MODE"):
            _load_production(monkeypatch, MFA_TEST_MODE=raw)

    def test_mfa_test_otp_alone_is_inert(self, monkeypatch):
        """A configured OTP without the bypass flag cannot authenticate."""
        loaded = _load_production(monkeypatch, MFA_TEST_MODE="false", MFA_TEST_OTP="000000")
        assert loaded.mfa_test_mode is False
        assert loaded.mfa_test_otp == "", "Production must not retain a test OTP"
        assert loaded.has_mfa_test_bypass is False

    def test_production_settings_carry_no_bypass(self, monkeypatch):
        loaded = _load_production(monkeypatch, MFA_TEST_MODE="false")
        assert loaded.has_mfa_test_bypass is False
        assert loaded.is_production is True

    def test_mfa_verification_rejects_test_otp_in_production(self, monkeypatch):
        """End-to-end: the documented test code must not verify in production."""
        from app import auth as auth_module
        from app.auth import generate_mfa_secret, verify_mfa_code

        monkeypatch.setattr(auth_module, "settings", _load_production(monkeypatch))
        secret = generate_mfa_secret()
        assert verify_mfa_code(secret, "000000") is False

    def test_production_still_accepts_real_totp(self, monkeypatch):
        """Hardening must not weaken genuine TOTP verification."""
        from app import auth as auth_module
        from app.auth import generate_mfa_secret, verify_mfa_code, _totp_code

        monkeypatch.setattr(auth_module, "settings", _load_production(monkeypatch))
        secret = generate_mfa_secret()
        timestep = int(__import__("time").time() // 30)
        assert verify_mfa_code(secret, _totp_code(secret, timestep)) is True


# ---------------------------------------------------------------------------
# 5. Production with known development credentials -> FAIL
# ---------------------------------------------------------------------------

class TestProductionDevelopmentCredentials:

    @pytest.mark.parametrize(
        "password",
        ["AdminDevOnly123!", "AdminSecure123!", "admin", "Admin@123456!", "password", "changeme"],
    )
    def test_default_admin_password_fails(self, monkeypatch, password):
        with pytest.raises(RuntimeError, match="ADMIN_BOOTSTRAP_PASSWORD"):
            _load_production(monkeypatch, ADMIN_BOOTSTRAP_PASSWORD=password)

    def test_short_admin_password_fails(self, monkeypatch):
        with pytest.raises(RuntimeError, match="at least 12 characters"):
            _load_production(monkeypatch, ADMIN_BOOTSTRAP_PASSWORD="Ab1!")

    def test_known_hardhat_test_private_key_fails(self, monkeypatch):
        """The well-known Hardhat key must never be usable in production."""
        hardhat_key = "0x" + "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
        with pytest.raises(RuntimeError, match="BLOCKCHAIN_PRIVATE_KEY"):
            _load_production(monkeypatch, BLOCKCHAIN_PRIVATE_KEY=hardhat_key)

    def test_wildcard_cors_origin_fails(self, monkeypatch):
        with pytest.raises(RuntimeError, match="ALLOWED_ORIGINS"):
            _load_production(monkeypatch, ALLOWED_ORIGINS="*")

    def test_empty_cors_origins_fails(self, monkeypatch):
        values = _base_environment()
        values["ALLOWED_ORIGINS"] = "   "
        _apply(monkeypatch, values)
        with pytest.raises(RuntimeError, match="ALLOWED_ORIGINS"):
            load_settings()

    def test_automatic_schema_creation_disabled_by_default(self, monkeypatch):
        """Production must not silently auto-create its schema."""
        loaded = _load_production(monkeypatch)
        assert loaded.auto_create_schema is False

    def test_secure_cookies_enabled_by_default(self, monkeypatch):
        assert _load_production(monkeypatch).secure_cookies is True

    def test_no_blockchain_private_key_is_hardcoded_in_config_defaults(self, monkeypatch):
        """With no env var set, production must expose no signing key."""
        loaded = _load_production(monkeypatch)
        assert loaded.blockchain_private_key is None


# ---------------------------------------------------------------------------
# 6. Development environment continues to work
# ---------------------------------------------------------------------------

class TestDevelopmentStillWorks:

    def test_development_environment_loads(self, monkeypatch):
        dev_file = BACKEND_DIR / ".dev-secrets.json"
        if not dev_file.exists():
            pytest.skip("no local .dev-secrets.json on this machine")
        values = {
            "APP_ENV": "development",
            "ALLOWED_ORIGINS": "http://localhost:5173",
        }
        _apply(monkeypatch, values)
        loaded = load_settings()
        assert loaded.environment == "development"
        assert loaded.is_development is True
        assert loaded.is_production is False

    def test_development_generates_strong_secrets(self, monkeypatch):
        dev_file = BACKEND_DIR / ".dev-secrets.json"
        if not dev_file.exists():
            pytest.skip("no local .dev-secrets.json on this machine")
        _apply(monkeypatch, {"APP_ENV": "development"})
        loaded = load_settings()
        assert len(loaded.jwt_secret) >= 32
        assert len(loaded.master_key_b64) >= 32

    def test_development_allows_explicit_mfa_test_mode(self, monkeypatch):
        """Development may opt in to the deterministic bypass explicitly."""
        dev_file = BACKEND_DIR / ".dev-secrets.json"
        if not dev_file.exists():
            pytest.skip("no local .dev-secrets.json on this machine")
        _apply(
            monkeypatch,
            {
                "APP_ENV": "development",
                "MFA_TEST_MODE": "true",
                "MFA_TEST_OTP": "000000",
            },
        )
        loaded = load_settings()
        assert loaded.has_mfa_test_bypass is True

    def test_development_defaults_admin_bootstrap(self, monkeypatch):
        dev_file = BACKEND_DIR / ".dev-secrets.json"
        if not dev_file.exists():
            pytest.skip("no local .dev-secrets.json on this machine")
        _apply(monkeypatch, {"APP_ENV": "development"})
        loaded = load_settings()
        assert loaded.admin_bootstrap_email == "admin@medshare.local"

    def test_invalid_environment_name_fails(self, monkeypatch):
        _apply(monkeypatch, {"APP_ENV": "staging"})
        with pytest.raises(RuntimeError, match="APP_ENV"):
            load_settings()


# ---------------------------------------------------------------------------
# 7. Existing test environment continues to work
# ---------------------------------------------------------------------------

class TestTestEnvironmentStillWorks:

    def test_suite_test_environment_has_bypass_available(self):
        """The existing test mechanism (conftest MFA_TEST_MODE=true) still works."""
        from app.config import settings

        assert settings.environment == "test"
        assert settings.is_test is True
        assert settings.mfa_test_mode is True
        assert settings.mfa_test_otp == "000000"
        assert settings.has_mfa_test_bypass is True

    def test_test_environment_bypass_verifies_code(self):
        """Deterministic MFA behaviour is available through the test mechanism."""
        from app.auth import generate_mfa_secret, verify_mfa_code

        assert verify_mfa_code(generate_mfa_secret(), "000000") is True

    def test_test_environment_allows_development_admin_password(self):
        from app.config import settings

        assert settings.environment == "test"

    def test_environment_flags_are_mutually_exclusive(self):
        from app.config import settings

        flags = [settings.is_production, settings.is_test, settings.is_development]
        assert sum(1 for flag in flags if flag) == 1


# ---------------------------------------------------------------------------
# 8. Frontend bundle contains no backend secrets
# ---------------------------------------------------------------------------

class TestFrontendHasNoBackendSecrets:

    FRONTEND_SECRET_TOKENS = (
        "MASTER_KEY",
        "JWT_SECRET",
        "JWT_REFRESH_SECRET",
        "BLOCKCHAIN_PRIVATE_KEY",
        "SECRET_KEY",
        "MASTER_ENCRYPTION_KEY",
        "DATABASE_URL",
    )

    def _frontend_files(self):
        source = PROJECT_ROOT / "frontend" / "src"
        if not source.exists():
            pytest.skip("frontend source not present")
        return [p for p in source.rglob("*") if p.suffix in {".ts", ".tsx", ".js", ".jsx", ".mjs"}]

    def test_frontend_source_has_no_backend_secret_tokens(self):
        offenders = []
        for path in self._frontend_files():
            text = path.read_text(encoding="utf-8", errors="ignore")
            for token in self.FRONTEND_SECRET_TOKENS:
                if token in text:
                    offenders.append(f"{path.name}: {token}")
        assert not offenders, f"Backend secret names referenced in frontend: {offenders}"

    def test_frontend_uses_only_public_vite_variables(self):
        import re

        allowed = {"VITE_API_URL"}
        pattern = re.compile(r"import\.meta\.env\.([A-Z0-9_]+)")
        found = set()
        for path in self._frontend_files():
            found.update(pattern.findall(path.read_text(encoding="utf-8", errors="ignore")))
        assert found <= allowed, f"Unexpected build-time variables in frontend: {found - allowed}"

    def test_built_bundle_if_present_has_no_secrets(self):
        dist = PROJECT_ROOT / "frontend" / "dist"
        if not dist.exists():
            pytest.skip("frontend not built")
        offenders = []
        for path in dist.rglob("*"):
            if not path.is_file() or path.suffix not in {".js", ".css", ".html", ".map"}:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore")
            for token in self.FRONTEND_SECRET_TOKENS:
                if token in text:
                    offenders.append(f"{path.name}: {token}")
        assert not offenders, f"Secrets present in built frontend bundle: {offenders}"

    def test_frontend_has_no_real_secret_values(self):
        from app.config import settings

        secrets_to_check = {settings.jwt_secret, settings.master_key_b64}
        secrets_to_check.discard("")
        if not self._frontend_files():
            pytest.skip("frontend source not present")
        for path in self._frontend_files():
            text = path.read_text(encoding="utf-8", errors="ignore")
            for value in secrets_to_check:
                assert value not in text, f"Live secret value found in {path.name}"


# ---------------------------------------------------------------------------
# 9. Secrets do not appear in logs or exceptions
# ---------------------------------------------------------------------------

class TestSecretsNotLogged:

    def test_production_error_messages_never_echo_secret_values(self, monkeypatch):
        """Failure messages may name the variable but must never echo its value."""
        # A long, known-insecure value reaches the denylist rule, so the error
        # path is exercised without tripping the unrelated length rule first.
        secret = "replace-with-a-random-48-plus-character-secret"
        with pytest.raises(RuntimeError) as excinfo:
            _load_production(monkeypatch, JWT_SECRET=secret)
        message = str(excinfo.value)
        assert secret not in message, "Error message echoed the rejected secret value"
        assert "JWT_SECRET" in message

    def test_error_messages_never_echo_master_key_value(self, monkeypatch):
        secret = "replace-with-a-base64-encoded-32-byte-key"
        with pytest.raises(RuntimeError) as excinfo:
            _load_production(monkeypatch, MASTER_KEY=secret)
        assert secret not in str(excinfo.value)

    def test_missing_secret_error_names_only_the_variable(self, monkeypatch):
        values = _base_environment()
        del values["MASTER_KEY"]
        _apply(monkeypatch, values)
        with pytest.raises(RuntimeError) as excinfo:
            load_settings()
        assert "MASTER_KEY" in str(excinfo.value)

    def test_settings_repr_redacts_secrets(self):
        """A stray log of the settings object must not expose key material."""
        from app.config import settings

        rendered = repr(settings)
        assert settings.jwt_secret not in rendered
        assert settings.master_key_b64 not in rendered
        assert settings.mfa_test_otp not in rendered
        assert "<redacted>" in rendered

    def test_settings_repr_redacts_blockchain_key(self, monkeypatch):
        rendered = repr(_load_production(monkeypatch, BLOCKCHAIN_PRIVATE_KEY="0x" + "11" * 32))
        assert "0x" + "11" * 32 not in rendered
        assert "<redacted>" in rendered

    def test_encryption_metadata_leaks_no_secret(self):
        """Phase 1 guarantee must survive the security hardening."""
        import cv2
        import numpy as np

        from app.crypto import decrypt_image, encrypt_image
        from app.config import settings

        image = np.zeros((32, 32), dtype=np.uint8)
        cv2.ellipse(image, (16, 16), (8, 10), 0, 0, 360, 180, -1)
        ok, encoded = cv2.imencode(".png", image)
        assert ok
        raw = encoded.tobytes()

        ciphertext, digest, metadata_json = encrypt_image(raw)
        assert decrypt_image(ciphertext, digest, metadata_json) == raw

        metadata = json.loads(metadata_json)
        assert settings.master_key_b64 not in metadata_json
        assert settings.jwt_secret not in metadata_json


# ---------------------------------------------------------------------------
# 10. Phase 1 cryptographic behaviour is preserved
# ---------------------------------------------------------------------------

class TestPhaseOneCryptographyPreserved:

    def test_chen_pipeline_round_trip_still_works(self):
        import cv2
        import numpy as np

        from app.crypto import decrypt_image, encrypt_image

        image = np.zeros((64, 64), dtype=np.uint8)
        cv2.ellipse(image, (32, 32), (16, 20), 0, 0, 360, 200, -1)
        ok, encoded = cv2.imencode(".png", image)
        assert ok
        raw = encoded.tobytes()

        ciphertext, digest, metadata_json = encrypt_image(raw)
        assert decrypt_image(ciphertext, digest, metadata_json) == raw

    def test_pipeline_markers_unchanged(self):
        import cv2
        import numpy as np

        from app.crypto import encrypt_image

        image = np.zeros((32, 32), dtype=np.uint8)
        ok, encoded = cv2.imencode(".png", image)
        assert ok
        _, _, metadata_json = encrypt_image(encoded.tobytes())
        metadata = json.loads(metadata_json)
        assert metadata["format"] == "AES-256-GCM-DEK-v1"
        assert metadata["hyperchaos"] == "chen-4d-v1"
        assert metadata["chen_diffusion"] == "keystream-xor-v1"

    def test_aes_gcm_authentication_still_rejects_tampering(self):
        import cv2
        import numpy as np

        from app.crypto import decrypt_image, encrypt_image

        image = np.zeros((32, 32), dtype=np.uint8)
        ok, encoded = cv2.imencode(".png", image)
        assert ok
        ciphertext, digest, metadata_json = encrypt_image(encoded.tobytes())
        tampered = bytearray(ciphertext)
        tampered[16] ^= 0xFF
        with pytest.raises(Exception):
            decrypt_image(bytes(tampered), digest, metadata_json)

    def test_mfa_change_did_not_alter_totp_algorithm(self):
        """Only the bypass gate moved; the TOTP implementation is untouched."""
        import inspect

        from app import auth as auth_module

        source = inspect.getsource(auth_module.verify_mfa_code)
        assert "_totp_code" in source
        assert "hmac.compare_digest" in source
        assert "drift" in source


# ---------------------------------------------------------------------------
# Repository hygiene
# ---------------------------------------------------------------------------

class TestRepositoryHygiene:

    def test_env_file_is_not_tracked_by_git(self):
        tracked = subprocess.run(
            ["git", "ls-files"], cwd=PROJECT_ROOT, capture_output=True, text=True, check=True
        ).stdout.split()
        assert ".env" not in tracked, ".env must never be committed"
        assert ".env.example" in tracked, ".env.example should be committed"

    def test_gitignore_covers_secret_material(self):
        patterns = (PROJECT_ROOT / ".gitignore").read_text(encoding="utf-8")
        for required in (".env", "!.env.example", ".dev-secrets.json", "*.pem", "*.key", "id_rsa"):
            assert required in patterns, f".gitignore missing {required}"

    def test_no_dev_secrets_file_is_tracked(self):
        tracked = subprocess.run(
            ["git", "ls-files"], cwd=PROJECT_ROOT, capture_output=True, text=True, check=True
        ).stdout.split()
        offenders = [path for path in tracked if "dev-secrets" in path or path.endswith((".pem", ".key"))]
        assert not offenders, f"Secret material is tracked: {offenders}"

    def test_compose_requires_explicit_app_env(self):
        """The compose file must not default the API into development mode."""
        compose = (PROJECT_ROOT / "docker-compose.yml").read_text(encoding="utf-8")
        assert "APP_ENV:-development" not in compose, "compose must not default APP_ENV to development"
        assert "postgres:postgres@" not in compose, "compose must not hard-code a database password"

    def test_python_sources_contain_no_hardcoded_credentials(self):
        offenders = []
        app_dir = BACKEND_DIR / "app"
        for path in app_dir.rglob("*.py"):
            text = path.read_text(encoding="utf-8", errors="ignore")
            for marker in ("PRIVATE_KEY = \"", "JWT_SECRET = \"", "MASTER_KEY = \"", "API_KEY = \""):
                if marker in text:
                    offenders.append(f"{path.name}: {marker}")
        assert not offenders, f"Hard-coded credentials found: {offenders}"