"""Backfill decentralized identities for users created before Phase 3.

Usage:

    python backend/scripts/backfill_dids.py              # report only, changes nothing
    python backend/scripts/backfill_dids.py --apply      # provision missing identities

The migration in :func:`app.identity.ensure_identity_schema` adds the identity
columns; this script fills them in for existing accounts.

Backfilled credentials are *system-issued platform role credentials*. They assert
that the platform created an account with a given role. They do not verify any
external professional credential and do not claim a medical licence.
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import Base, SessionLocal, engine  # noqa: E402
import app.models  # noqa: F401,E402
from app.identity import backfill_identities, ensure_identity_schema  # noqa: E402
from app.models import User  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill DID identities for existing users")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually write identities. Without this flag the script only reports.",
    )
    args = parser.parse_args()

    Base.metadata.create_all(bind=engine)
    added = ensure_identity_schema(engine)
    print(f"Schema migration: added columns {added or 'none (already present)'}")

    db = SessionLocal()
    try:
        total = db.query(User).count()
        without_identity = db.query(User).filter(User.did.is_(None)).count()

        print(f"Total users: {total}")
        print(f"Users without a DID: {without_identity}")

        if not args.apply:
            print("\nDry run only. Re-run with --apply to provision the missing identities.")
            return 0

        if without_identity == 0:
            print("\nNothing to backfill.")
            return 0

        result = backfill_identities(db, issue_credentials=True)
        print(
            f"\nBackfill complete: created={result['created']} "
            f"skipped={result['skipped']} failed={result['failed']}"
        )
        if result["failed"]:
            print("Some identities failed to provision. Re-run to retry them.")
            return 1
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())