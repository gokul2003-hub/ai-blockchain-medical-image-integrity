import json
import datetime
from sqlalchemy.orm import Session
from loguru import logger
from typing import Optional, Dict, Any

from app.models import DigitalIntegrityTwin, MedicalImage, User

def create_digital_twin(
    db: Session,
    image_id: int,
    trusted_hash: str,
    ipfs_cid: str,
    owner_id: int,
    metadata_dict: dict,
    provenance_info: dict
) -> DigitalIntegrityTwin:
    """
    Creates a new Digital Integrity Twin record for a registered medical image.
    """
    logger.info(f"Creating Digital Integrity Twin for image ID: {image_id}")
    
    initial_history = [{
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "event": "TWIN_CREATED",
        "status": "VERIFIED",
        "details": f"Digital Twin instantiated with SHA-3 hash: {trusted_hash[:10]}..."
    }]
    
    initial_region_map = [{
        "region_id": "GLOBAL",
        "status": "INTACT",
        "tamper_probability": 0.0
    }]
    
    twin = DigitalIntegrityTwin(
        image_id=image_id,
        trusted_hash=trusted_hash,
        metadata_json=json.dumps(metadata_dict),
        provenance_info=json.dumps(provenance_info),
        ipfs_cid=ipfs_cid,
        owner_id=owner_id,
        verification_status="VERIFIED",
        region_integrity_map=json.dumps(initial_region_map),
        verification_history=json.dumps(initial_history),
        created_at=datetime.datetime.now(datetime.timezone.utc),
        updated_at=datetime.datetime.now(datetime.timezone.utc)
    )
    
    db.add(twin)
    db.commit()
    db.refresh(twin)
    logger.info(f"Digital Integrity Twin created successfully (ID: {twin.id}).")
    return twin

def get_digital_twin(db: Session, image_id: int) -> Optional[DigitalIntegrityTwin]:
    """Retrieves the Digital Integrity Twin for a given image ID."""
    return db.query(DigitalIntegrityTwin).filter(DigitalIntegrityTwin.image_id == image_id).first()

def update_twin_status(
    db: Session,
    image_id: int,
    status: str,
    event_name: str,
    details: str,
    region_map: Optional[list] = None
) -> DigitalIntegrityTwin:
    """
    Updates the verification status and records an event in the twin's verification history log.
    """
    twin = get_digital_twin(db, image_id)
    if not twin:
        raise ValueError(f"Digital Integrity Twin for image ID {image_id} not found.")

    twin.verification_status = status
    twin.updated_at = datetime.datetime.now(datetime.timezone.utc)

    # Parse and update history
    try:
        history = json.loads(twin.verification_history) if twin.verification_history else []
    except Exception:
        history = []

    history.append({
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "event": event_name,
        "status": status,
        "details": details
    })
    twin.verification_history = json.dumps(history)

    if region_map is not None:
        twin.region_integrity_map = json.dumps(region_map)

    db.commit()
    db.refresh(twin)
    logger.info(f"Digital Integrity Twin status updated to '{status}' for image ID: {image_id}")
    return twin
