from sqlalchemy.orm import Session
from loguru import logger
from typing import Dict, Any, Tuple

from app.models import MedicalImage, User, AuditLog
from app.digital_twin import get_digital_twin, update_twin_status
from app.risk_engine import calculate_tamper_risk_score, calculate_cybersecurity_trust_score

ACTION_ALLOW = "ACTION_ALLOW"
ACTION_REQUIRE_ZKP = "ACTION_REQUIRE_ZKP"
ACTION_QUARANTINE = "ACTION_QUARANTINE"

def evaluate_risk_adaptive_access(
    db: Session,
    user: User,
    image: MedicalImage,
    ai_confidence: float = 0.0,
    tampered_pixel_pct: float = 0.0,
    sha3_mismatch: bool = False,
    blockchain_mismatch: bool = False,
    zkp_verified: bool = False
) -> Tuple[str, Dict[str, Any], Dict[str, Any]]:
    """
    Evaluates Tamper Risk Score and Cybersecurity Trust Score, and returns
    a Risk-Adaptive Access Control Decision:
    - LOW RISK (0-30): ACTION_ALLOW (normal access)
    - MEDIUM RISK (31-70): ACTION_REQUIRE_ZKP (secondary verification)
    - HIGH RISK (71-100): ACTION_QUARANTINE (quarantine image & restrict access)
    """
    twin = get_digital_twin(db, image.id)
    is_recovered = (twin.verification_status == "RECOVERED") if twin else False

    # 1. Compute Tamper Risk Score
    risk_breakdown = calculate_tamper_risk_score(
        ai_confidence=ai_confidence,
        tampered_pixel_pct=tampered_pixel_pct,
        sha3_mismatch=sha3_mismatch,
        provenance_failed=False,
        blockchain_mismatch=blockchain_mismatch
    )
    risk_score = risk_breakdown["total_tamper_risk_score"]
    risk_category = risk_breakdown["category"]

    # 2. Compute Cybersecurity Trust Score
    trust_breakdown = calculate_cybersecurity_trust_score(
        integrity_verified=not sha3_mismatch,
        blockchain_verified=not blockchain_mismatch,
        access_valid=True,
        risk_score=risk_score,
        is_quarantined=image.quarantine_status,
        is_recovered=is_recovered,
        zkp_verified=zkp_verified
    )

    # 3. Determine Adaptive Access Action
    if is_recovered:
        action = ACTION_ALLOW
        reason = "Image was successfully restored via Region-Level Self-Recovery and SHA-3 re-verification."
    elif risk_category == "LOW" and not sha3_mismatch:
        action = ACTION_ALLOW
        reason = "Low tamper risk detected. Cryptographic SHA-3 verification passed."
    elif risk_category == "MEDIUM" and not sha3_mismatch:
        if zkp_verified:
            action = ACTION_ALLOW
            reason = "Medium risk scan cleared via Zero-Knowledge Proof (ZKP) authorization."
        else:
            action = ACTION_REQUIRE_ZKP
            reason = "Medium risk detected. Secondary Zero-Knowledge Proof (ZKP) authorization required."
    else:  # HIGH RISK or sha3_mismatch
        action = ACTION_QUARANTINE
        reason = f"High Tamper Risk ({risk_score}/100) or SHA-3 Cryptographic Mismatch! Scan quarantined."

        # Automatically quarantine image if not already quarantined
        if not image.quarantine_status:
            image.quarantine_status = True
            db.commit()
            if twin:
                update_twin_status(
                    db,
                    image.id,
                    status="QUARANTINED",
                    event_name="IMAGE_QUARANTINED",
                    details=f"Risk Score: {risk_score}, SHA-3 Mismatch: {sha3_mismatch}. Access restricted."
                )

    logger.info(f"Risk-Adaptive Access decision for image {image.id}: {action} (Reason: {reason})")
    return action, risk_breakdown, trust_breakdown
