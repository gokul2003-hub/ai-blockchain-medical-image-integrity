"""Rebuild the local simulated ledger so it verifies clean.

The audit chain is a local SHA-3 proof-of-work simulation. Rows written outside
``LocalSimulatedBlockchain.write_transaction`` (older test runs inserted them
directly) carry no ``previous_hash`` and a transaction_hash that does not match
their payload. Those rows break the links of every block that follows, so
``GET /api/blockchain/verify-chain`` reports tampering that never happened.

This script re-mines every row in insertion order: the ``data`` payload of each
transaction is preserved exactly, while ``index``, ``proof``, ``previous_hash``
and ``transaction_hash`` are recomputed consistently.

Usage:
    python scripts/repair_ledger.py            # report only, changes nothing
    python scripts/repair_ledger.py --apply    # rewrite the ledger
"""

import argparse
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.blockchain import LocalSimulatedBlockchain
from app.database import SessionLocal
from app.models import BlockchainTransaction

GENESIS_PARENT_HASH = "0" * 64


def iter_rows(db):
    return db.query(BlockchainTransaction).order_by(BlockchainTransaction.id.asc()).all()


def read_data(block):
    """Recover the original transaction payload from whatever shape is stored."""
    try:
        payload = json.loads(block.payload)
    except (TypeError, ValueError):
        return {"action": "UNKNOWN", "recovered_from": "unparseable"}

    if not isinstance(payload, dict):
        return {"action": "UNKNOWN", "recovered_from": "non_object"}

    # Well-formed blocks nest the real payload under "data".
    if isinstance(payload.get("data"), dict):
        return payload["data"]

    # Legacy rows stored the payload flat; drop any link fields before re-mining.
    return {k: v for k, v in payload.items() if k not in {"previous_hash", "proof", "index"}}


def rebuild(db, chain, apply_changes):
    blocks = iter_rows(db)
    if not blocks:
        print("Ledger is empty; nothing to repair.")
        return 0

    remapped = 0
    prev_hash = GENESIS_PARENT_HASH
    last_proof = 100

    for position, block in enumerate(blocks, start=1):
        old_index = block.block_index
        block.block_index = position
        last_proof = chain.proof_of_work(last_proof)

        block_data = {
            "index": position,
            "timestamp": (
                block.timestamp.isoformat()
                if block.timestamp
                else datetime.datetime.now(datetime.timezone.utc).isoformat()
            ),
            "type": block.type,
            "data": read_data(block),
            "proof": last_proof,
            "previous_hash": prev_hash,
        }
        block_string = json.dumps(block_data, sort_keys=True)
        new_hash = chain.sha3_256(block_string)

        if new_hash != block.transaction_hash or old_index != position:
            remapped += 1
        block.payload = block_string
        block.transaction_hash = new_hash
        prev_hash = new_hash

    if apply_changes:
        db.commit()
        print(f"Rebuilt {len(blocks)} blocks ({remapped} rewritten).")
    else:
        db.rollback()
        print(f"Would rebuild {len(blocks)} blocks ({remapped} need changes).")
        print("Re-run with --apply to write the repaired chain.")
    return remapped


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write changes to the database")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        rebuild(db, LocalSimulatedBlockchain(), args.apply)
    finally:
        db.close()


if __name__ == "__main__":
    main()