from loguru import logger
from typing import Dict, Any

def calculate_tamper_risk_score(
    ai_confidence: float = 0.0,
    tampered_pixel_pct: float = 0.0,
    sha3_mismatch: bool = False,
    provenance_failed: bool = False,
    blockchain_mismatch: bool = False
) -> Dict[str, Any]:
    """
    Computes a transparent multi-factor Tamper Risk Score (0 - 100 scale).
    Categories: 0-30 = LOW, 31-70 = MEDIUM, 71-100 = HIGH.
    """
    risk_from_sha3 = 60.0 if sha3_mismatch else 0.0
    risk_from_blockchain = 25.0 if blockchain_mismatch else 0.0
    risk_from_provenance = 10.0 if provenance_failed else 0.0
    risk_from_ai_pixels = (min(100.0, max(0.0, tampered_pixel_pct)) / 100.0) * 10.0
    risk_from_ai_conf = (min(1.0, max(0.0, ai_confidence))) * 5.0 if tampered_pixel_pct > 0 else 0.0

    total_risk = round(min(100.0, max(0.0, (
        risk_from_sha3 + risk_from_blockchain + risk_from_provenance + risk_from_ai_pixels + risk_from_ai_conf
    ))), 2)

    if total_risk <= 30.0:
        category = "LOW"
    elif total_risk <= 70.0:
        category = "MEDIUM"
    else:
        category = "HIGH"

    breakdown = {
        "sha3_hash_mismatch_penalty": risk_from_sha3,
        "blockchain_audit_mismatch_penalty": risk_from_blockchain,
        "provenance_validation_penalty": risk_from_provenance,
        "ai_tampered_pixel_percentage_penalty": round(risk_from_ai_pixels, 2),
        "ai_model_confidence_penalty": round(risk_from_ai_conf, 2),
        "total_tamper_risk_score": total_risk,
        "category": category
    }
    logger.info(f"Tamper Risk Score evaluated: {total_risk} ({category})")
    return breakdown

def calculate_cybersecurity_trust_score(
    integrity_verified: bool = True,
    blockchain_verified: bool = True,
    access_valid: bool = True,
    risk_score: float = 0.0,
    is_quarantined: bool = False,
    is_recovered: bool = False,
    zkp_verified: bool = False
) -> Dict[str, Any]:
    """
    Computes an independent Cybersecurity Trust Score (0 - 100 scale).
    Levels: 80-100 = OPTIMAL, 50-79 = GUARDED, 0-49 = CRITICAL.
    """
    base_trust = 100.0
    deductions = 0.0

    if not integrity_verified:
        deductions += 40.0
    if not blockchain_verified:
        deductions += 25.0
    if not access_valid:
        deductions += 15.0
    if is_quarantined and not is_recovered:
        deductions += 30.0

    # Risk score impact deduction
    deductions += (risk_score * 0.25)

    additions = 0.0
    if blockchain_verified:
        additions += 5.0
    if zkp_verified:
        additions += 10.0
    if is_recovered:
        additions += 35.0  # Significant trust restoration upon verified self-recovery

    trust_score = round(min(100.0, max(0.0, base_trust - deductions + additions)), 2)

    if trust_score >= 80.0:
        level = "OPTIMAL"
    elif trust_score >= 50.0:
        level = "GUARDED"
    else:
        level = "CRITICAL"

    breakdown = {
        "base_trust": base_trust,
        "integrity_penalty": 40.0 if not integrity_verified else 0.0,
        "blockchain_penalty": 25.0 if not blockchain_verified else 0.0,
        "access_validity_penalty": 15.0 if not access_valid else 0.0,
        "quarantine_penalty": 30.0 if (is_quarantined and not is_recovered) else 0.0,
        "tamper_risk_impact_deduction": round(risk_score * 0.25, 2),
        "post_recovery_trust_restoration_bonus": 35.0 if is_recovered else 0.0,
        "zkp_verification_bonus": 10.0 if zkp_verified else 0.0,
        "cybersecurity_trust_score": trust_score,
        "trust_level": level
    }
    logger.info(f"Cybersecurity Trust Score evaluated: {trust_score} ({level})")
    return breakdown
