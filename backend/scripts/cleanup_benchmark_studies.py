"""
Remove ONLY the synthetic benchmark studies created while implementing and
validating the asynchronous upload pipeline.

Safety rules:
  * EXPLICIT id allowlist. Titles are never used to select rows - "MRI" is a
    real clinical study title (image 29) and a title-only match would have
    destroyed it. Every row is verified before anything is deleted.
  * The database must already be backed up by the caller.
  * Dependent rows are deleted EXPLICITLY inside ONE transaction, because
    SQLite foreign-key enforcement is not reliably enabled in this project.
  * blockchain_transactions are DELIBERATELY PRESERVED: the ledger is an
    append-only audit record and rewriting it would invalidate the chain.
  * Encrypted objects / heatmaps / masks / SRM artifacts are deleted from disk
    only AFTER the database transaction commits.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from sqlalchemy import text

from app.config import STORAGE_DIR
from app.database import SessionLocal

# Explicit allowlist of ids created by the async-upload benchmarks and by the
# browser verification of the upload UI.
# NOTE: title-only matching is unsafe here - "MRI" is also a real clinical study
# title (image 29), so ids are always verified explicitly.
# EXPLICIT id allowlist - never a range, never title-only. A range is unsafe:
# "MRI" is also a real clinical study title (image 29), so any future study
# that lands in the same id range with a familiar title could be destroyed.
TARGET_IDS = [30, 31, 32, 33, 34, 35, 36, 37, 38, 39]
EXPECTED_TITLES = {
    "LoadProbe Warmup",
    "LoadProbe 1",
    "LoadProbe 2",
    "LoadProbe 3",
    "LoadProbe 4",
    "FinalVerify 1",
    "FinalVerify 2",
    "FinalVerify 3",
    "Post Optimization UI Check MRI",
}
# Retained for reference - ids/titles created earlier in this same session and
# already removed: AsyncBench MRI, SecurityProbe, E2E Broker Test and the three
# UI verification studies (ids 30-32 at the time).

db = SessionLocal()
try:
    rows = db.execute(
        text(
            "SELECT id, title, file_path FROM medical_images WHERE id IN ("
            + ",".join(str(i) for i in TARGET_IDS)
            + ") ORDER BY id"
        )
    ).fetchall()

    found = {r[0]: r for r in rows}
    unexpected = [
        (r[0], r[1]) for r in rows if r[1] not in EXPECTED_TITLES or r[0] not in TARGET_IDS
    ]
    missing = [i for i in TARGET_IDS if i not in found]

    if unexpected:
        print("ABORT - rows outside the synthetic allowlist:", unexpected)
        raise SystemExit(1)
    if missing:
        print("NOTE - already absent:", missing)

    ids = sorted(found)
    if not ids:
        print("Nothing to remove.")
        raise SystemExit(0)

    print("Verified synthetic studies to remove:")
    for i in ids:
        print(f"  image {i}: {found[i][1]!r} -> {found[i][2]}")

    ilist = ",".join(str(i) for i in ids)
    vids = [
        r[0]
        for r in db.execute(
            text(f"SELECT id FROM image_versions WHERE image_id IN ({ilist})")
        ).fetchall()
    ]
    # UUIDs are TEXT columns - they must be quoted as SQL string literals.
    vlist = ",".join("'" + str(v) + "'" for v in vids) if vids else "NULL"

    artifact_refs = []
    for v in vids:
        for r in db.execute(
            text(
                "SELECT heatmap_storage_reference, mask_storage_reference FROM ai_inferences "
                "WHERE image_version_id = :v"
            ),
            {"v": v},
        ).fetchall():
            artifact_refs.extend([x for x in r if x])

    ledger_entries = 0
    for i in ids:
        ledger_entries += db.execute(
            text("SELECT COUNT(*) FROM blockchain_transactions WHERE payload LIKE :p"),
            {"p": f'%"image_id": {i}%'},
        ).scalar_one()

    try:
        db.execute(text(f"DELETE FROM ai_inferences WHERE image_version_id IN ({vlist})"))
        db.execute(text(f"DELETE FROM integrity_events WHERE image_version_id IN ({vlist})"))
        db.execute(text(f"DELETE FROM image_versions WHERE image_id IN ({ilist})"))
        db.execute(text(f"DELETE FROM tamper_risk_logs WHERE image_id IN ({ilist})"))
        db.execute(text(f"DELETE FROM recovery_records WHERE image_id IN ({ilist})"))
        db.execute(text(f"DELETE FROM reports WHERE image_id IN ({ilist})"))
        db.execute(text(f"DELETE FROM consent_grants WHERE image_id IN ({ilist})"))
        db.execute(text(f"DELETE FROM audit_logs WHERE image_id IN ({ilist})"))
        db.execute(text(f"DELETE FROM dicom_slices WHERE image_id IN ({ilist})"))
        db.execute(text(f"DELETE FROM dicom_metadata_records WHERE image_id IN ({ilist})"))
        db.execute(text(f"DELETE FROM digital_integrity_twins WHERE image_id IN ({ilist})"))
        db.execute(text(f"DELETE FROM medical_images WHERE id IN ({ilist})"))
        db.commit()
        print("COMMITTED: synthetic studies removed from the database.")
    except Exception as exc:
        db.rollback()
        print("ROLLBACK - database unchanged:", exc)
        raise SystemExit(1)

    removed = 0
    for i in ids:
        ref = found[i][2]
        if ref:
            p = Path(STORAGE_DIR) / ref
            if p.exists():
                p.unlink()
                removed += 1

    for ref in artifact_refs:
        p = Path(str(ref))
        if p.is_file():
            p.unlink()
            removed += 1

    for sub in ("heatmaps", "srm"):
        d = Path(STORAGE_DIR) / sub
        if not d.exists():
            continue
        for f in d.iterdir():
            if any(f.name == f"heatmap_img_{i}.png" or f.name == f"srm_img_{i}.png" for i in ids):
                f.unlink()
                removed += 1

    print(f"Removed {removed} stored object(s) from disk.")
    print(f"PRESERVED {ledger_entries} blockchain_transactions row(s) (append-only audit ledger).")

    remaining = db.execute(text("SELECT COUNT(*) FROM medical_images")).scalar_one()
    orphan_ai = db.execute(
        text(
            "SELECT COUNT(*) FROM ai_inferences WHERE image_version_id NOT IN "
            "(SELECT id FROM image_versions)"
        )
    ).scalar_one()
    orphan_v = db.execute(
        text(
            "SELECT COUNT(*) FROM image_versions WHERE image_id NOT IN "
            "(SELECT id FROM medical_images)"
        )
    ).scalar_one()
    keep29 = db.execute(text("SELECT id, title FROM medical_images WHERE id=29")).fetchall()
    print(f"medical_images remaining: {remaining}")
    print(f"orphan ai_inferences: {orphan_ai}   orphan image_versions: {orphan_v}")
    print(f"image 29 intact: {keep29}")
finally:
    db.close()