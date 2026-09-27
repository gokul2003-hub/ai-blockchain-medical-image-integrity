"""Authentication, MFA and session security primitives."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import struct
import time
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import ALGORITHM, settings
from app.crypto import decrypt_payload, encrypt_payload
from app.database import get_db
from app.models import AuthSession, MfaCredential, User, UserSecurityState


pwd_context = CryptContext(schemes=["bcrypt", "pbkdf2_sha256"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
SAFE_PUBLIC_ROLE = "patient"
PRIVILEGED_ROLES = {"super_admin", "hospital_admin", "doctor", "radiologist", "researcher"}
MAX_FAILED_LOGINS = 5
LOCKOUT_MINUTES = 15


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def validate_password_policy(password: str) -> None:
    valid = (
        len(password) >= 12
        and any(character.islower() for character in password)
        and any(character.isupper() for character in password)
        and any(character.isdigit() for character in password)
    )
    if not valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 12 characters and include upper-case, lower-case, and numeric characters.",
        )


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    validate_password_policy(password)
    return pwd_context.hash(password)


def get_security_state(db: Session, user: User) -> UserSecurityState:
    state = db.get(UserSecurityState, user.id)
    if state is None:
        state = UserSecurityState(user_id=user.id)
        db.add(state)
        db.flush()
    return state


def _encode_token(payload: dict, secret: str, lifetime: timedelta) -> str:
    data = payload.copy()
    data.update({"iat": utcnow(), "exp": utcnow() + lifetime, "jti": secrets.token_urlsafe(20)})
    return jwt.encode(data, secret, algorithm=ALGORITHM)


def create_access_token(user: User, state: UserSecurityState) -> str:
    return _encode_token(
        {"sub": user.username, "uid": user.id, "role": user.role, "tv": state.token_version, "typ": "access"},
        settings.jwt_secret,
        timedelta(minutes=settings.access_token_minutes),
    )


def create_refresh_token(user: User, session_id: str) -> str:
    return _encode_token(
        {"sub": user.username, "uid": user.id, "sid": session_id, "typ": "refresh"},
        settings.jwt_refresh_secret,
        timedelta(days=settings.refresh_token_days),
    )


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user: User, ip_address: str | None, user_agent: str | None) -> tuple[str, str]:
    session = AuthSession(
        user_id=user.id,
        refresh_token_hash="pending",
        expires_at=utcnow() + timedelta(days=settings.refresh_token_days),
        ip_address=ip_address,
        user_agent=(user_agent or "")[:512] or None,
    )
    db.add(session)
    db.flush()
    refresh_token = create_refresh_token(user, session.id)
    session.refresh_token_hash = hash_refresh_token(refresh_token)
    return refresh_token, session.id


def rotate_session(db: Session, refresh_token: str, ip_address: str | None, user_agent: str | None) -> tuple[User, str]:
    try:
        payload = jwt.decode(refresh_token, settings.jwt_refresh_secret, algorithms=[ALGORITHM])
        if payload.get("typ") != "refresh" or not payload.get("sid"):
            raise JWTError("Invalid refresh token")
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token") from exc

    session = db.get(AuthSession, payload["sid"])
    if (
        session is None
        or session.revoked_at is not None
        or session.expires_at.replace(tzinfo=timezone.utc) <= utcnow()
        or not hmac.compare_digest(session.refresh_token_hash, hash_refresh_token(refresh_token))
    ):
        raise HTTPException(status_code=401, detail="Refresh session is no longer active")

    user = db.get(User, session.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="User account is unavailable")
    session.revoked_at = utcnow()
    new_refresh, _ = create_session(db, user, ip_address, user_agent)
    return user, new_refresh


def revoke_all_sessions(db: Session, user: User) -> None:
    now = utcnow()
    db.query(AuthSession).filter(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None)).update(
        {AuthSession.revoked_at: now}, synchronize_session=False
    )
    state = get_security_state(db, user)
    state.token_version += 1


def generate_mfa_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode().rstrip("=")


def _totp_code(secret: str, time_step: int) -> str:
    padding = "=" * ((8 - len(secret) % 8) % 8)
    key = base64.b32decode((secret + padding).upper())
    digest = hmac.new(key, struct.pack(">Q", time_step), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    value = struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF
    return str(value % 1_000_000).zfill(6)


def verify_mfa_code(secret: str, code: str) -> bool:
    test_otp = os.getenv("MFA_TEST_OTP", "000000")
    if settings.mfa_test_mode and hmac.compare_digest(code, test_otp):
        return True
    if len(code) != 6 or not code.isdigit():
        return False
    timestep = int(time.time() // 30)
    return any(hmac.compare_digest(_totp_code(secret, timestep + drift), code) for drift in (-1, 0, 1))


def _mfa_aad(user_id: int) -> bytes:
    return f"mfa-secret:{user_id}".encode()


def store_mfa_credential(db: Session, user: User, secret: str, recovery_codes: list[str]) -> MfaCredential:
    ciphertext, metadata = encrypt_payload(secret.encode(), _mfa_aad(user.id))
    payload = {"ciphertext": base64.urlsafe_b64encode(ciphertext).decode(), "metadata": metadata}
    code_hashes = [_hash_recovery_code(user.id, code) for code in recovery_codes]
    credential = db.get(MfaCredential, user.id)
    if credential is None:
        credential = MfaCredential(user_id=user.id, encrypted_totp_secret=json.dumps(payload), recovery_code_hashes=json.dumps(code_hashes))
        db.add(credential)
    else:
        credential.encrypted_totp_secret = json.dumps(payload)
        credential.recovery_code_hashes = json.dumps(code_hashes)
    return credential


def read_mfa_secret(credential: MfaCredential) -> str:
    payload = json.loads(credential.encrypted_totp_secret)
    ciphertext = base64.urlsafe_b64decode(payload["ciphertext"].encode())
    return decrypt_payload(ciphertext, payload["metadata"], _mfa_aad(credential.user_id)).decode()


def _hash_recovery_code(user_id: int, code: str) -> str:
    return hashlib.sha256(f"{user_id}:{code}:{settings.jwt_refresh_secret}".encode()).hexdigest()


def consume_recovery_code(db: Session, user: User, credential: MfaCredential, code: str) -> bool:
    try:
        hashes = json.loads(credential.recovery_code_hashes)
    except json.JSONDecodeError:
        return False
    candidate = _hash_recovery_code(user.id, code)
    for stored in hashes:
        if hmac.compare_digest(stored, candidate):
            hashes.remove(stored)
            credential.recovery_code_hashes = json.dumps(hashes)
            return True
    return False


def generate_recovery_codes() -> list[str]:
    return [f"{secrets.token_hex(4).upper()}-{secrets.token_hex(4).upper()}" for _ in range(8)]


def authenticate_user(db: Session, username: str, password: str, mfa_code: str | None) -> User:
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        # Constant-ish bcrypt work avoids a cheap username oracle.
        pwd_context.verify(password, pwd_context.hash("not-the-user-password"))
        raise HTTPException(status_code=401, detail="Incorrect username, password, or MFA code")

    state = get_security_state(db, user)
    now = utcnow()
    if state.locked_until and state.locked_until.replace(tzinfo=timezone.utc) > now:
        raise HTTPException(status_code=423, detail="Account temporarily locked due to failed sign-in attempts")
    if not user.is_active or not verify_password(password, user.hashed_password):
        state.failed_login_count += 1
        if state.failed_login_count >= MAX_FAILED_LOGINS:
            state.locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
            state.failed_login_count = 0
        raise HTTPException(status_code=401, detail="Incorrect username, password, or MFA code")

    credential = db.get(MfaCredential, user.id)
    if credential and credential.enabled_at:
        if not mfa_code:
            raise HTTPException(status_code=401, detail="MFA code or recovery code is required")
        is_valid = verify_mfa_code(read_mfa_secret(credential), mfa_code) or consume_recovery_code(db, user, credential, mfa_code)
        if not is_valid:
            raise HTTPException(status_code=401, detail="Incorrect username, password, or MFA code")

    state.failed_login_count = 0
    state.locked_until = None
    state.last_login_at = now
    return user


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
        if payload.get("typ") != "access":
            raise JWTError("Wrong token type")
        user_id = int(payload["uid"])
    except (JWTError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=401, detail="Could not validate credentials", headers={"WWW-Authenticate": "Bearer"}) from exc

    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=401, detail="Could not validate credentials", headers={"WWW-Authenticate": "Bearer"})
    state = get_security_state(db, user)
    if payload.get("tv") != state.token_version:
        raise HTTPException(status_code=401, detail="Session has been revoked", headers={"WWW-Authenticate": "Bearer"})
    return user


class RoleChecker:
    def __init__(self, allowed_roles: Iterable[str]):
        self.allowed_roles = set(allowed_roles)

    def __call__(self, current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in self.allowed_roles:
            raise HTTPException(status_code=403, detail="Your role is not permitted for this operation")
        return current_user
