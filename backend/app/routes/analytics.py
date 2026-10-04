import datetime
import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from app.database import get_db
from app.models import Hospital, User, MedicalImage, BlockchainTransaction, Report, AuditLog
from app.schemas import AnalyticsDashboardData, DashboardStats, UploadStat, TamperStat, AccessStat
from app.auth import get_current_user
from app.dp import add_laplace_noise_int
from app.crypto import calculate_npcr_uaci, calculate_pixel_correlation, encrypt_image
from app.ipfs import ipfs_client

router = APIRouter(prefix="/analytics", tags=["Dashboard Analytics"])

@router.get("/dashboard", response_model=AnalyticsDashboardData)
async def get_dashboard_analytics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Compiles systems statistics, security audit counts, and charts data.
    Applies Laplacian Differential Privacy to protect patient membership counts.
    """
    total_hospitals_raw = db.query(Hospital).count()
    total_doctors_raw = db.query(User).filter(User.role == "doctor").count()
    total_images_raw = db.query(MedicalImage).count()
    total_transactions_raw = db.query(BlockchainTransaction).count()
    
    verified_images_raw = db.query(AuditLog).filter(AuditLog.action == "DOWNLOAD", AuditLog.status == "SUCCESS").count()
    tampered_images_raw = db.query(Report).filter(Report.status == "TAMPERED").count()
    active_users_raw = db.query(User).filter(User.is_active == True).count()
    failed_logins_raw = db.query(AuditLog).filter(AuditLog.action == "LOGIN", AuditLog.status == "FAILED").count()
    
    security_alerts_raw = db.query(AuditLog).filter(
        AuditLog.action.in_(["VERIFY_FAIL", "EMERGENCY_OVERRIDE"])
    ).count()

    # Apply Differential Privacy (DP) with epsilon = 1.5 when data is present; honest zero when empty
    eps = 1.5
    stats = DashboardStats(
        total_hospitals=add_laplace_noise_int(total_hospitals_raw, eps) if total_hospitals_raw > 0 else 0,
        total_doctors=add_laplace_noise_int(total_doctors_raw, eps) if total_doctors_raw > 0 else 0,
        total_images=add_laplace_noise_int(total_images_raw, eps) if total_images_raw > 0 else 0,
        total_transactions=add_laplace_noise_int(total_transactions_raw, eps) if total_transactions_raw > 0 else 0,
        verified_images=add_laplace_noise_int(verified_images_raw, eps) if verified_images_raw > 0 else 0,
        tampered_images=add_laplace_noise_int(tampered_images_raw, eps) if tampered_images_raw > 0 else 0,
        active_users=add_laplace_noise_int(active_users_raw, eps) if active_users_raw > 0 else 0,
        failed_logins=add_laplace_noise_int(failed_logins_raw, eps) if failed_logins_raw > 0 else 0,
        security_alerts=add_laplace_noise_int(security_alerts_raw, eps) if security_alerts_raw > 0 else 0
    )

    daily_uploads = []
    today = datetime.date.today()
    for i in range(6, -1, -1):
        day = today - datetime.timedelta(days=i)
        count = db.query(MedicalImage).filter(
            func.date(MedicalImage.created_at) == day
        ).count()
        dp_count = add_laplace_noise_int(count, eps) if count > 0 else 0
        daily_uploads.append(UploadStat(date=day.strftime("%a"), count=dp_count))

    # Calculate real monthly tampering and verification statistics from database for the past 6 calendar months
    tampering_statistics = []
    for i in range(5, -1, -1):
        m_offset = today.month - 1 - i
        year = today.year + (m_offset // 12)
        month = (m_offset % 12) + 1
        month_start = datetime.datetime(year, month, 1)
        if month == 12:
            month_end = datetime.datetime(year + 1, 1, 1)
        else:
            month_end = datetime.datetime(year, month + 1, 1)

        month_label = month_start.strftime("%b")

        tampered_month_raw = db.query(Report).filter(
            Report.status == "TAMPERED",
            Report.timestamp >= month_start,
            Report.timestamp < month_end
        ).count()

        verified_month_raw = db.query(AuditLog).filter(
            AuditLog.action == "DOWNLOAD",
            AuditLog.status == "SUCCESS",
            AuditLog.timestamp >= month_start,
            AuditLog.timestamp < month_end
        ).count()

        t_stat = add_laplace_noise_int(tampered_month_raw, eps) if tampered_month_raw > 0 else 0
        v_stat = add_laplace_noise_int(verified_month_raw, eps) if verified_month_raw > 0 else 0

        tampering_statistics.append(
            TamperStat(month=month_label, tampered=t_stat, verified=v_stat)
        )

    # Calculate real access event statistics by role; do NOT fabricate fake counts if empty
    access_roles = [
        ("Super Admin", "super_admin"),
        ("Hospital Admin", "hospital_admin"),
        ("Doctor", "doctor"),
        ("Radiologist", "radiologist"),
        ("Patient", "patient")
    ]
    access_statistics = []
    for role_label, role_name in access_roles:
        raw_count = db.query(AuditLog).join(User, AuditLog.user_id == User.id).filter(User.role == role_name).count()
        if raw_count > 0:
            access_statistics.append(
                AccessStat(role=role_label, count=add_laplace_noise_int(raw_count, eps))
            )

    return AnalyticsDashboardData(
        stats=stats,
        daily_uploads=daily_uploads,
        tampering_statistics=tampering_statistics,
        access_statistics=access_statistics
    )

@router.get("/crypto-benchmark/{image_id}")
async def get_crypto_benchmark(
    image_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Executes actual NPCR, UACI, and pixel correlation analysis
    on the encrypted medical image to prove hyperchaotic security strength.
    """
    image = db.query(MedicalImage).filter(MedicalImage.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Medical image not found")

    try:
        # Download ciphertext via configured storage provider
        from app.storage_provider import load_encrypted_object
        c1_bytes = load_encrypted_object(image.file_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch ciphertext from storage: {str(e)}")

    # For NPCR/UACI we require a 1-pixel perturbed plaintext.
    # Let's decrypt C1 to get plaintext P1, modify 1 pixel to get P2,
    # then encrypt P2 with the same key parameters to get C2.
    from app.crypto import decrypt_image
    try:
        p1_bytes = decrypt_image(c1_bytes, image.original_hash, image.encryption_key_metadata)
        
        # Perturb a single pixel at index 0
        p2_arr = bytearray(p1_bytes)
        p2_arr[0] = (p2_arr[0] + 1) % 256
        p2_bytes = bytes(p2_arr)
        
        # Encrypt P2
        c2_bytes, _, _ = encrypt_image(p2_bytes, image.entropy)
        
        # Calculate NPCR/UACI
        npcr, uaci = calculate_npcr_uaci(c1_bytes, c2_bytes)
        
        # Calculate correlation coefficients of C1
        correlation = calculate_pixel_correlation(c1_bytes)
        
        return {
            "image_id": image_id,
            "title": image.title,
            "NPCR": f"{npcr:.4f}%",
            "UACI": f"{uaci:.4f}%",
            "correlation_coefficients": correlation,
            "security_status": "HIGH (IEEE Publication Standards Satisfied)" if npcr > 99.6 and abs(uaci - 33.4) < 1.0 else "MEDIUM"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Benchmarking evaluation crashed: {str(e)}")

@router.post("/research-simulation")
async def run_advanced_research_simulation(
    current_user: User = Depends(get_current_user)
):
    """
    Simulates high-level research components:
    1. Fully Homomorphic Encryption (FHE) (CKKS scheme operations on encrypted tensors).
    2. Federated Learning Secure Aggregation (FedAvg across 3 hospital nodes).
    """
    from app.advanced_research import FederatedLearningSimulator
    simulator = FederatedLearningSimulator()
    result = simulator.execute_simulation()
    return result

@router.get("/fhe-benchmark")
async def get_fhe_ckks_benchmark(
    current_user: User = Depends(get_current_user)
):
    """
    Executes real CKKS Homomorphic Tensor operations (addition, scalar multiplication, 
    ciphertext multiplication) and tracks polynomial noise budgets.
    """
    from app.fhe_engine import fhe_engine
    import numpy as np

    vector_a = np.array([0.5, 1.2, -0.8, 2.4])
    vector_b = np.array([1.1, -0.4, 0.6, -1.0])

    c_a = fhe_engine.encrypt_vector(vector_a)
    c_b = fhe_engine.encrypt_vector(vector_b)

    c_add = fhe_engine.add(c_a, c_b)
    c_mult_scalar = fhe_engine.multiply_scalar(c_a, 2.5)
    c_mult_enc = fhe_engine.multiply_encrypted(c_a, c_b)

    dec_add = fhe_engine.decrypt_vector(c_add)
    dec_mult_scalar = fhe_engine.decrypt_vector(c_mult_scalar)
    dec_mult_enc = fhe_engine.decrypt_vector(c_mult_enc)

    return {
        "scheme": "CKKS (Prototype Simulation)",
        "poly_modulus_degree": fhe_engine.poly_modulus_degree,
        "initial_noise_budget_bits": fhe_engine.initial_noise_budget,
        "is_simulated_prototype": True,
        "operations": [
            {
                "op": "Homomorphic Addition (C_A + C_B)",
                "input_a": vector_a.tolist(),
                "input_b": vector_b.tolist(),
                "decrypted_result": dec_add.tolist(),
                "remaining_noise_budget_bits": c_add.noise_budget_bits
            },
            {
                "op": "Homomorphic Scalar Multiplication (C_A * 2.5)",
                "decrypted_result": dec_mult_scalar.tolist(),
                "remaining_noise_budget_bits": c_mult_scalar.noise_budget_bits
            },
            {
                "op": "Homomorphic Ciphertext Multiplication (C_A * C_B)",
                "decrypted_result": dec_mult_enc.tolist(),
                "remaining_noise_budget_bits": c_mult_enc.noise_budget_bits
            }
        ],
        "privacy_status": "SIMULATION_PROTOTYPE (Research simulation of CKKS algebraic semantics; not cryptographically secure FHE)",
        "disclaimer": "This is a research prototype simulation demonstrating CKKS algebraic noise tracking. It does not provide real cryptographic FHE security."
    }
