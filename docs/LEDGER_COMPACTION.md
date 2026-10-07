# Ledger Compaction Record

## What happened

`blockchain_transactions` is an append-only audit ledger. Removing studies left
behind blocks whose `payload` referenced image ids that no longer existed, and
`blockchain_compaction_report.json` (generated per run, git-ignored) records the
old→new mapping for each rewrite.

Because each block embeds `index`, `previous_hash`, a brute-force `proof`, and
its own `transaction_hash`, deleting rows alone would leave dangling links. The
chain is therefore rebuilt: surviving blocks are re-indexed from `1..N`,
re-linked to their true predecessor, the proof-of-work is re-mined, and the
transaction hash recomputed. Only then does the chain validate.

## Scope — deliberately narrow

The ledger contained **403** entries referencing image ids absent from
`medical_images`. Only **79** were in scope: studies that were explicitly
deleted during this cleanup (the synthetic benchmark/verification studies, plus
images 20-22 deleted earlier).

The remaining **324** reference ids that never existed in `medical_images`
(44-268, 380-400, 9999, …) and predate this work entirely. They were **not**
touched. Removing them would have re-mined ~40% of an append-only audit chain on
someone else's behalf, which is a decision for the ledger owner, not a cleanup.

## Net effect

| | Before | After |
|---|---|---|
| Blocks | 990 | 915 |
| Orphan blocks (in scope) | 79 | 0 |
| Historic orphans (out of scope) | 324 | 324 (untouched) |

Chain verification after the rebuild: **0 problems** — every surviving block has
a correct `index`, a `previous_hash` matching its predecessor's hash, a valid
proof-of-work (`sha3(prev_proof + proof)` starts with `0000`), and a
`transaction_hash` equal to `sha3_256(payload)`.

## Reproducing

```bat
cd backend
venv\Scripts\python scripts\prune_orphan_ledger.py            REM dry run
venv\Scripts\python scripts\prune_orphan_ledger.py --apply    REM writes
```

The script prints the chain verdict after every apply and rolls back on any
error. Back up `medical_sharing.db` first.

## Caveat

The audit report is rewritten on each run, so it only describes the most recent
compaction. The current committed state reflects the cumulative result above.