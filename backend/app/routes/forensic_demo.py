"""Forensic Dataset Demo API — serves the real forensic chain for dataset samples."""
from fastapi import APIRouter, Depends, HTTPException, Request
from loguru import logger
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user, RoleChecker
from app.models import User
from app.forensic_dataset import (
    build_forensic_dataset,
    run_forensic_analysis,
    validate_dataset,
)

router = APIRouter(prefix="/forensic-demo", tags=["Forensic Dataset Demo"])

# Doctor + admin + researcher may run demo analysis (synthetic de-identified data)
_demo_guard = RoleChecker(["doctor", "radiologist", "super_admin", "hospital_admin", "researcher"])


@router.get("/samples")
async def list_samples(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List available dataset samples (original / tampered / mask + metadata)."""
    manifest = build_forensic_dataset()
    return {
        "dataset": manifest["dataset"],
        "source": manifest["source"],
        "license": manifest["license"],
        "modality": manifest["modality"],
        "privacy": manifest["privacy"],
        "samples": [
            {
                "image_id": s["image_id"],
                "tamper_type": s["tamper_type"],
                "region": s["region"],
                "affected_area_percentage": s["affected_area_percentage"],
                "original_sha3": s["original_sha3"],
                "tampered_sha3": s["tampered_sha3"],
                "width": s["width"],
                "height": s["height"],
                "split": s["split"],
            }
            for s in manifest["samples"]
        ],
    }


@router.get("/samples/{image_id}/image/{kind}")
async def get_sample_image(
    image_id: str,
    kind: str,
    current_user: User = Depends(get_current_user),
):
    """Return raw PNG bytes for original | tampered | mask of a sample."""
    if kind not in {"original", "tampered", "mask"}:
        raise HTTPException(status_code=400, detail="kind must be original, tampered, or mask")
    import os
    from fastapi.responses import FileResponse
    from app.forensic_dataset import DATASET_ROOT

    manifest = build_forensic_dataset()
    sample = next((s for s in manifest["samples"] if s["image_id"] == image_id), None)
    if not sample:
        raise HTTPException(status_code=404, detail="Sample not found")
    rel = sample[{"original": "original_image", "tampered": "tampered_image", "mask": "mask"}[kind]]
    path = os.path.join(DATASET_ROOT, rel)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Image file missing")
    return FileResponse(path, media_type="image/png")


@router.post("/analyze/{image_id}")
async def analyze_sample(
    image_id: str,
    request: Request,
    current_user: User = Depends(_demo_guard),
    db: Session = Depends(get_db),
):
    """Run the FULL forensic chain on a dataset sample.

    SHA-3 -> DIT state -> AI forensics -> Grad-CAM -> GT vs prediction
    metrics -> risk/trust -> recovery -> post-recovery SHA-3.
    All values computed at runtime from real bytes / model output.
    When record_audit=true, the forensic event is written to the
    project's local simulated blockchain ledger (real transaction).
    """
    try:
        result = run_forensic_analysis(image_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:  # security-safe: no internals leaked
        raise HTTPException(status_code=500, detail="Forensic analysis could not be completed.")

    # Optionally record a REAL transaction on the local simulated ledger
    audit = None
    if request.query_params.get("record_audit") == "true":
        try:
            from app.blockchain import blockchain_service
            local = blockchain_service.local_chain
            tx_hash = local.write_transaction(
                db,
                "FORENSIC_PROOF",
                {
                    "image_ref": image_id,
                    "trusted_sha3": result["sha3"]["trusted_original"],
                    "current_sha3": result["sha3"]["current"],
                    "sha3_match": result["sha3"]["match"],
                    "dit_state": result["dit_state"],
                    "tamper_detected": result["ai"]["tamper_detected"],
                    "risk_category": result["risk"].get("category"),
                    "trust_level": result["trust"].get("trust_level"),
                    "post_recovery_match": result["recovery"]["post_recovery_match"],
                    "performed_by": current_user.username,
                    "action": "FORENSIC_PROOF_VERIFICATION",
                },
            )
            block = local.get_last_block(db)
            audit = {
                "tx_hash": tx_hash,
                "block_index": block.block_index if block else None,
                "timestamp": block.timestamp.isoformat() if block and block.timestamp else None,
                "implementation": "Local Blockchain Simulation",
            }
        except Exception as exc:  # honest: report absence rather than fabricate
            logger.warning(f"Forensic proof audit record failed: {exc}")
            audit = None

    return {"success": True, "result": result, "blockchain_audit": audit}


@router.get("/dataset-validation")
async def dataset_validation(current_user: User = Depends(get_current_user)):
    """Dataset quality validation report (files, masks, SHA-3, duplicates)."""
    report = validate_dataset()
    return {"success": report["status"] == "PASS", "report": report}


@router.get("/evidence/{image_id}")
async def forensic_evidence_bundle(
    image_id: str,
    current_user: User = Depends(_demo_guard),
):
    """Forensic evidence bundle for download (all values from real analysis)."""
    import time as _time
    try:
        result = run_forensic_analysis(image_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception:
        raise HTTPException(status_code=500, detail="Evidence bundle could not be generated.")

    # Strip large base64 payloads from the downloadable text evidence
    def _strip(obj):
        if isinstance(obj, dict):
            return {k: _strip(v) for k, v in obj.items()
                    if not (isinstance(v, str) and v.startswith("data:image"))}
        if isinstance(obj, list):
            return [_strip(v) for v in obj]
        return obj

    return {
        "report_type": "MediSecure AI Forensic Evidence Bundle",
        "generated_at": _time.strftime("%Y-%m-%dT%H:%M:%SZ", _time.gmtime()),
        "generated_by": current_user.username,
        "disclaimer": (
            "Academic research prototype. SHA-3 = cryptographic integrity evidence; "
            "AI localization = forensic region prediction; Grad-CAM = model explainability. "
            "Blockchain implementation: Local Blockchain Simulation."
        ),
        "evidence": _strip(result),
    }
