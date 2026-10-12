"""Durable provenance for on-disk forensic artifacts (Phase 13).

Derived artifacts are written to disk as ``{kind}_img_{image.id}.png``. An
autoincrement ``image.id`` can be reused across database lifecycles, so the
filename alone never proves the bytes belong to the requested study. This
module records provenance *at generation time* and validates it at retrieval.

Binding is anchored on the source image's ``original_hash`` (content identity)
rather than the id alone, so a stale file left behind by an earlier image that
happened to reuse the id cannot validate against the current study.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path
from typing import Optional

from .config import STORAGE_DIR

logger = logging.getLogger(__name__)

PROVENANCE_SCHEMA = "medisecure.artifact.provenance.v1"
HEATMAP_DIR = STORAGE_DIR / "heatmaps"


class ArtifactProvenanceError(Exception):
    """Raised when provenance could not be persisted for a generated artifact."""


def provenance_path_for(artifact_path: Path) -> Path:
    """Sidecar path that travels with an artifact file."""
    return Path(str(artifact_path) + ".prov.json")


def _normalize(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip().lower()
    return text or None


def artifact_filename(kind: str, image_id: int) -> str:
    """Existing naming convention, unchanged: ``{kind}_img_{image.id}.png``."""
    return f"{kind}_img_{image_id}.png"


def write_provenance(
    artifact_path: Path,
    *,
    kind: str,
    image_id: int,
    original_hash: Optional[str],
    version_id: Optional[str] = None,
    job_id: Optional[str] = None,
) -> Path:
    """Persist provenance for one artifact.

    Raises :class:`ArtifactProvenanceError` on any failure so callers can fail
    closed instead of leaving an unbound artifact reachable.
    """
    payload = {
        "schema": PROVENANCE_SCHEMA,
        "kind": kind,
        "image_id": int(image_id),
        "original_hash": _normalize(original_hash),
        "image_version_id": version_id,
        "job_id": job_id,
    }
    sidecar = provenance_path_for(Path(artifact_path))
    try:
        sidecar.parent.mkdir(parents=True, exist_ok=True)
        tmp = sidecar.with_suffix(sidecar.suffix + ".tmp")
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, separators=(",", ":"), sort_keys=True)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, sidecar)
    except Exception as exc:  # noqa: BLE001 - fail closed, never leak details
        raise ArtifactProvenanceError(f"failed to persist {kind} provenance") from exc
    return sidecar


def read_provenance(artifact_path: Path) -> Optional[dict]:
    sidecar = provenance_path_for(Path(artifact_path))
    try:
        with open(sidecar, "r", encoding="utf-8") as fh:
            data = json.load(fh)
    except Exception:  # noqa: BLE001 - missing/corrupt sidecar == no provenance
        return None
    return data if isinstance(data, dict) else None


def provenance_is_valid(
    artifact_path: Path,
    *,
    kind: str,
    image_id: int,
    original_hash: Optional[str],
) -> bool:
    """True only when the sidecar matches BOTH the requested id and content.

    Neither the filename, the id, nor a job status is trusted on its own.
    """
    data = read_provenance(artifact_path)
    if not data:
        return False
    if data.get("schema") != PROVENANCE_SCHEMA:
        return False
    if data.get("kind") != kind:
        return False
    try:
        if int(data.get("image_id")) != int(image_id):
            return False
    except (TypeError, ValueError):
        return False
    recorded = _normalize(data.get("original_hash"))
    expected = _normalize(original_hash)
    if recorded is None or expected is None:
        return False
    return recorded == expected


def _unlink_quietly(path: Path) -> None:
    try:
        Path(path).unlink(missing_ok=True)
    except OSError:
        logger.warning("Could not remove unbound artifact %s", Path(path).name)


def bind_generated_artifacts(
    image,
    *,
    heatmap_filename: str,
    mask_filename: str,
    job_id: Optional[str] = None,
    version_id: Optional[str] = None,
) -> None:
    """Record provenance for BOTH artifacts produced by one pipeline run.

    ``localize_tampering()`` writes the heatmap and the mask together, so both
    must be bound within the same success path -- a request for one artifact
    must never leave the other unbound. If any provenance write fails, both
    files are removed so no unverified artifact stays reachable.
    """
    heatmap_path = HEATMAP_DIR / os.path.basename(heatmap_filename)
    mask_path = HEATMAP_DIR / os.path.basename(mask_filename)

    bound: list[Path] = []
    try:
        for kind, path in (("heatmap", heatmap_path), ("mask", mask_path)):
            if not path.exists():
                continue
            bound.append(
                write_provenance(
                    path,
                    kind=kind,
                    image_id=image.id,
                    original_hash=image.original_hash,
                    version_id=version_id,
                    job_id=job_id,
                )
            )
    except ArtifactProvenanceError:
        # Fail closed: an artifact without provenance must not be served.
        _unlink_quietly(heatmap_path)
        _unlink_quietly(mask_path)
        for sidecar in bound:
            _unlink_quietly(sidecar)
        raise
