"""User identity lifecycle: DID provisioning, credential issuance, and safe projection.

This module connects the pre-existing DID/VC primitives in :mod:`app.did` to the
user lifecycle. It deliberately keeps private key material out of the database:
user DID keys are re-derived on demand from the server master key, so only public
material is ever persisted or returned.

Public-surface helpers return a fixed allow-list of fields. Nothing in this module
returns a private key, a signing key, or credential signing material.
"""

from __future__ import annotations

import datetime
import json
from typing import Any

from sqlalchemy import inspect as sa_inspect, text
from sqlalchemy.orm import Session

from app import did as did_module
from app.models import User


# Columns added to `users` for decentralized identity. Kept in one place so the
# migration, the backfill, and the projection stay in agreement.
IDENTITY_COLUMNS: tuple[tuple[str, str], ...] = (
    ("did", "VARCHAR(191)"),
    ("did_document", "TEXT"),
    ("did_created_at", "DATETIME"),
    ("did_credential", "TEXT"),
    ("did_credential_status", "VARCHAR(32)"),
)

# Roles that receive a system-issued platform role credential.
CREDENTIAL_ROLES = {"doctor", "radiologist", "hospital_admin", "super_admin", "researcher"}


class IdentityProvisioningError(RuntimeError):
    """Raised when an identity could not be provisioned. Callers must roll back."""


def utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


# ---------------------------------------------------------------------------
# Schema migration
# ---------------------------------------------------------------------------

def ensure_identity_schema(engine) -> list[str]:
    """Idempotently add the identity columns to an existing `users` table.

    ``Base.metadata.create_all`` only creates whole tables, so a database created
    before Phase 3 keeps its old shape. This adds only the new nullable columns
    and never drops or rewrites existing authentication data.
    """
    inspector = sa_inspect(engine)
    if "users" not in inspector.get_table_names():
        return []

    existing = {column["name"] for column in inspector.get_columns("users")}
    added: list[str] = []
    with engine.begin() as connection:
        for name, ddl_type in IDENTITY_COLUMNS:
            if name in existing:
                continue
            connection.execute(text(f"ALTER TABLE users ADD COLUMN {name} {ddl_type}"))
            added.append(name)
    return added


# ---------------------------------------------------------------------------
# Safe projection
# ---------------------------------------------------------------------------

def public_identity_view(user: User, credential: dict | None = None) -> dict[str, Any]:
    """Return the allow-listed public identity fields for *user*.

    This is the only shape that reaches an API response or the frontend. There is
    deliberately no field for a private key, and the credential is returned
    without its proof internals beyond the public verification method.
    """
    did_document = _load_json(user.did_document)
    verification_method = None
    if isinstance(did_document, dict):
        methods = did_document.get("verificationMethod") or []
        if methods and isinstance(methods[0], dict):
            verification_method = methods[0].get("id")

    view: dict[str, Any] = {
        "user_id": user.id,
        "username": user.username,
        "role": user.role,
        "did": user.did,
        "did_document": did_document,
        "verification_method": verification_method,
        "did_created_at": user.did_created_at.isoformat() if user.did_created_at else None,
        "credential": _credential_summary(credential) if credential else None,
    }
    return view


def public_credential_view(credential: dict | None) -> dict[str, Any] | None:
    """Public projection of a credential, excluding signing material details."""
    if not credential:
        return None
    return _credential_summary(credential)


def _credential_summary(credential: dict) -> dict[str, Any]:
    """Summarise a credential without exposing signature internals."""
    proof = credential.get("proof") or {}
    subject = credential.get("credentialSubject") or {}
    types = credential.get("type")
    return {
        "credential_id": credential.get("id"),
        "credential_type": types[-1] if isinstance(types, list) and types else types,
        "issuer": credential.get("issuer"),
        "subject": subject.get("id"),
        "issued_at": credential.get("issuanceDate"),
        "expires_at": credential.get("expirationDate"),
        "role": subject.get("role"),
        "attestation": subject.get("attestation"),
        "external_verification": subject.get("external_verification"),
        "medical_license_claimed": bool(subject.get("medical_license_claimed", False)),
        "verification_method": proof.get("verificationMethod"),
        "proof_type": proof.get("type"),
    }


def _load_json(raw: str | None) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def load_user_credential(user: User) -> dict | None:
    """Return the user's stored credential document, if any."""
    return _load_json(user.did_credential)


# ---------------------------------------------------------------------------
# Provisioning
# ---------------------------------------------------------------------------

def provision_identity(db: Session, user: User, issue_credential: bool = True) -> User:
    """Create and persist the DID, DID document, and optional role credential.

    The caller owns the transaction. On any failure this raises
    :class:`IdentityProvisioningError` after rolling back, so a user is never left
    holding a DID that does not match a stored document.
    """
    try:
        did_string = did_module.build_did(user.id, user.role)
        did_document = did_module.generate_did_document(user.id, user.username, user.role)

        user.did = did_string
        user.did_document = json.dumps(did_document, sort_keys=True)
        user.did_created_at = utcnow()

        if issue_credential and user.role in CREDENTIAL_ROLES:
            credential = did_module.create_platform_role_credential(
                user_id=user.id,
                username=user.username,
                role=user.role,
                hospital_id=user.hospital_id,
            )
            user.did_credential = json.dumps(credential, sort_keys=True)
            user.did_credential_status = "issued"
        elif issue_credential:
            # Patients receive identity only; the platform asserts no clinical role.
            user.did_credential = None
            user.did_credential_status = "not_applicable"

        db.add(user)
        db.flush()
        return user
    except IdentityProvisioningError:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise IdentityProvisioningError(f"Failed to provision decentralized identity: {exc}") from exc


def ensure_user_identity(db: Session, user: User) -> User:
    """Provision identity if the user does not already have one.

    Idempotent: an existing DID is left untouched so re-running registration
    recovery or a backfill never rotates a published identifier.
    """
    if user.did:
        return user
    return provision_identity(db, user)


def backfill_identities(db: Session, issue_credentials: bool = True) -> dict[str, int]:
    """Provision identities for pre-existing users that have none.

    Backfilled credentials are system-issued platform role credentials. They do
    not assert external professional verification and never claim a licence.
    """
    created = 0
    skipped = 0
    failed = 0

    for user in db.query(User).all():
        if user.did:
            skipped += 1
            continue
        try:
            provision_identity(db, user, issue_credential=issue_credentials)
            created += 1
        except IdentityProvisioningError:
            failed += 1

    db.commit()
    return {"created": created, "skipped": skipped, "failed": failed}


# ---------------------------------------------------------------------------
# Authorization
# ---------------------------------------------------------------------------

def can_access_identity(viewer: User, target: User) -> bool:
    """Decide whether *viewer* may read *target*'s DID and credential.

    Rules, in order:
      1. A user may always read their own identity.
      2. super_admin may read any identity (platform administration).
      3. hospital_admin may read identities inside their own hospital only.
      4. Everyone else, including peer doctors and radiologists, is denied.

    Rule 4 is deliberate: peer clinicians have no automatic entitlement to another
    clinician's credential, which closes the IDOR path where changing a URL id
    would expose another user's protected credential data.
    """
    if viewer.id == target.id:
        return True
    if viewer.role == "super_admin":
        return True
    if viewer.role == "hospital_admin":
        return (
            viewer.hospital_id is not None
            and target.hospital_id is not None
            and viewer.hospital_id == target.hospital_id
        )
    return False


def identity_audit_detail(user: User) -> str:
    """Short actor descriptor for the audit trail, safe to log and persist."""
    return f"actor_did={user.did or 'none'}"