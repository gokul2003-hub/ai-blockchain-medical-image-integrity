"""
Prune ledger entries that point at studies which no longer exist, then repair
the hash chain so it stays internally consistent.

Why re-linking is required
--------------------------
A ``blockchain_transactions`` row is not independent: each row's payload embeds
``index`` and ``previous_hash``, and ``proof`` is found by brute-force so that
sha3(f"{previous_proof}{proof}") starts with "0000". Deleting rows without
rebuilding would leave dangling ``previous_hash`` links and non-monotonic
``block_index`` values, i.e. a chain that no longer validates.

What this does
--------------
  1. selects ledger rows whose payload references an image_id that is absent
     from ``medical_images`` (synthetic benchmark studies that were removed),
  2. deletes ONLY those rows,
  3. re-indexes the surviving blocks from 1..N,
  4. re-links ``previous_hash`` and re-mines ``proof`` so every block again
     chains to its true predecessor,
  5. recomputes ``transaction_hash`` for every relinked block,
  6. writes an audit report (old hash -> new hash) to disk so the rewrite is
     never silent.

Run with --apply to write. Default is a dry run.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy import text

from app.blockchain import LocalSimulatedBlockchain
from app.database import SessionLocal

APPLY = "--apply" in sys.argv
chain = LocalSimulatedBlockchain()

# ---------------------------------------------------------------------------
# SCOPE - deliberately narrow on purpose.
#
# The ledger contains ~400 entries that reference image ids which never existed
# in medical_images (44-268, 380-400, 9999, ...). Those predate this cleanup
# work entirely, so rewriting them would mean re-mining 40% of an append-only
# audit chain on someone else's behalf. They are REPORTED, not touched.
#
# DELETED_IMAGE_IDS is limited to studies that were explicitly removed as part
# of this cleanup: the synthetic benchmark/verification studies created during
# the async-pipeline work, plus images 20-22 which were deleted earlier.
# ---------------------------------------------------------------------------
DELETED_IMAGE_IDS = {
    20, 21, 22,
    30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42,
}

db = SessionLocal()
report = {
    "removed": [],
    "relinked": [],
    "chain_before": None,
    "chain_after": None,
    "out_of_scope_orphans": [],
}

existing = {r[0] for r in db.execute(text("SELECT id FROM medical_images"))}
rows = db.execute(
    text(
        "SELECT id, block_index, transaction_hash, type, payload FROM "
        "blockchain_transactions ORDER BY block_index, id"
    )
).fetchall()

report["chain_before"] = {"blocks": len(rows), "last_index": rows[-1][1] if rows else None}


def referenced_image(payload_str):
    """Return the image_id a ledger payload points at, or None."""
    try:
        data = json.loads(payload_str).get("data", {})
    except Exception:
        return None
    for key in ("image_id", "imageId"):
        if key in data and isinstance(data[key], int):
            return data[key]
    return None


keep = []
for row_id, block_index, tx_hash, tx_type, payload in rows:
    img = referenced_image(payload)
    if img is None or img in existing:
        keep.append((row_id, block_index, tx_hash, tx_type, payload))
        continue
    if img in DELETED_IMAGE_IDS:
        report["removed"].append(
            {
                "row_id": row_id,
                "block_index": block_index,
                "transaction_hash": tx_hash,
                "type": tx_type,
                "deleted_image_id": img,
            }
        )
    else:
        # References an image id that never existed in this database - historic
        # test data. Left untouched and reported for an explicit decision.
        report["out_of_scope_orphans"].append({"row_id": row_id, "missing_image_id": img})
        keep.append((row_id, block_index, tx_hash, tx_type, payload))

print(f"blocks_total          : {len(rows)}")
print(f"blocks_to_remove      : {len(report['removed'])}")
print(f"blocks_kept           : {len(keep)}")
print(
    f"out_of_scope_orphans  : {len(report['out_of_scope_orphans'])} "
    "(historic ids never present in medical_images - NOT touched)"
)
print(f"mode                  : {'APPLY' if APPLY else 'DRY-RUN (use --apply to write)'}")

if not report["removed"]:
    print("\nNothing in scope to prune.")
    db.close()
    raise SystemExit(0)

print(
    "deleted_studies_referenced: "
    f"{sorted({r['deleted_image_id'] for r in report['removed']})}"
)

if not APPLY:
    db.close()
    raise SystemExit(0)

# ---------------------------------------------------------------------------
# Rebuild the chain over the surviving blocks.
# ---------------------------------------------------------------------------
prev_hash = "0" * 64
prev_proof = 100
updates = []

# Straightforward, unconditional rebuild: every surviving block is rewritten so
# that it definitively chains to its true predecessor. No "already correct"
# shortcut - the shortcut is what previously left a stale previous_hash behind.
for new_index, (row_id, _old_index, _old_hash, tx_type, payload) in enumerate(keep, start=1):
    block = json.loads(payload)
    old_index = block.get("index")
    old_prev = block.get("previous_hash")

    proof = chain.proof_of_work(prev_proof)

    block["index"] = new_index
    block["previous_hash"] = prev_hash
    block["proof"] = proof
    new_payload = json.dumps(block, sort_keys=True)
    new_hash = chain.sha3_256(new_payload)

    if new_payload != payload:
        report["relinked"].append(
            {
                "row_id": row_id,
                "type": tx_type,
                "old_index": old_index,
                "new_index": new_index,
                "old_previous_hash": old_prev,
                "old_transaction_hash": _old_hash,
                "new_transaction_hash": new_hash,
            }
        )

    updates.append((new_index, new_hash, tx_type, new_payload, row_id))
    prev_hash = new_hash
    prev_proof = proof

try:
    for entry in report["removed"]:
        db.execute(
            text("DELETE FROM blockchain_transactions WHERE id = :i"), {"i": entry["row_id"]}
        )

    for new_index, new_hash, tx_type, new_payload, row_id in updates:
        db.execute(
            text(
                "UPDATE blockchain_transactions SET block_index = :bi, transaction_hash = :th, "
                "payload = :p WHERE id = :i"
            ),
            {"bi": new_index, "th": new_hash, "p": new_payload, "i": row_id},
        )
    db.commit()
    print(f"\nCOMMITTED: pruned {len(report['removed'])} blocks, "
          f"relinked {len(report['relinked'])} blocks.")
except Exception as exc:
    db.rollback()
    print("ROLLBACK - database unchanged:", type(exc).__name__, exc)
    import traceback

    traceback.print_exc()
    db.close()
    raise SystemExit(1)

# ---------------------------------------------------------------------------
# Verify the rebuilt chain links correctly end to end.
# ---------------------------------------------------------------------------
after = db.execute(
    text(
        "SELECT block_index, transaction_hash, payload FROM blockchain_transactions "
        "ORDER BY block_index, id"
    )
).fetchall()

prev = "0" * 64
prev_proof = 100
broken = 0
for block_index, tx_hash, payload in after:
    block = json.loads(payload)
    if block.get("index") != block_index:
        print(f"  index mismatch at {block_index}")
        broken += 1
    if block.get("previous_hash") != prev:
        print(f"  previous_hash mismatch at {block_index}")
        broken += 1
    if not chain.valid_proof(prev_proof, block.get("proof", 0)):
        print(f"  invalid proof-of-work at {block_index}")
        broken += 1
    if chain.sha3_256(payload) != tx_hash:
        print(f"  hash mismatch at {block_index}")
        broken += 1
    prev = tx_hash
    prev_proof = block.get("proof", 100)

report["chain_after"] = {"blocks": len(after), "last_index": after[-1][0] if after else None}
print(f"\nchain_after          : {report['chain_after']}")
print(f"chain_verified       : {broken == 0} ({broken} problems)")

out = Path("blockchain_compaction_report.json")
out.write_text(json.dumps(report, indent=2))
print(f"audit report written : {out.resolve()}")
db.close()