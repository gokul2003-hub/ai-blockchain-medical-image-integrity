from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import User, PatientProfile, DoctorProfile
from app.schemas import UserResponse
from app.auth import get_current_user, RoleChecker

router = APIRouter(prefix="/users", tags=["Users"])
staff_guard = RoleChecker(["super_admin", "hospital_admin", "doctor"])

@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if current_user.role == "patient" and not current_user.patient_profile:
        prof = PatientProfile(
            user_id=current_user.id,
            date_of_birth="2000-01-01",
            gender="Unspecified",
            blood_group="O Positive"
        )
        db.add(prof)
        db.commit()
        db.refresh(current_user)
    elif current_user.role == "doctor" and not current_user.doctor_profile:
        prof = DoctorProfile(
            user_id=current_user.id,
            specialization="General Practice",
            license_number=f"LIC-{current_user.id:04d}"
        )
        db.add(prof)
        db.commit()
        db.refresh(current_user)
    return current_user

@router.get("/doctors", response_model=List[UserResponse])
async def list_doctors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lists all registered doctors in the system."""
    doctors = db.query(User).filter(User.role == "doctor").all()
    return doctors

@router.get("/patients", response_model=List[UserResponse])
async def list_patients(
    db: Session = Depends(get_db),
    current_user: User = Depends(staff_guard)
):
    """Lists all patients (restricted to hospital staff)."""
    # If hospital admin, only show patients registered under their hospital
    if current_user.role == "hospital_admin":
        patients = db.query(User).filter(
            User.role == "patient",
            User.hospital_id == current_user.hospital_id
        ).all()
    else:
        patients = db.query(User).filter(User.role == "patient").all()
    return patients
