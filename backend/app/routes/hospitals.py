from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.models import Hospital, User
from app.schemas import HospitalCreate, HospitalResponse
from app.auth import RoleChecker, get_current_user

router = APIRouter(prefix="/hospitals", tags=["Hospitals"])
admin_guard = RoleChecker(["super_admin"])

@router.post("", response_model=HospitalResponse)
async def create_hospital(
    hospital_in: HospitalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_guard)
):
    # Check if name or license already exists
    exists = db.query(Hospital).filter(
        (Hospital.name == hospital_in.name) | (Hospital.license_number == hospital_in.license_number)
    ).first()
    if exists:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Hospital with this name or license number already exists"
        )
        
    hospital_data = hospital_in.model_dump() if hasattr(hospital_in, "model_dump") else hospital_in.dict()
    db_hospital = Hospital(**hospital_data)
    db.add(db_hospital)
    db.commit()
    db.refresh(db_hospital)
    return db_hospital

@router.get("", response_model=List[HospitalResponse])
async def list_hospitals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(Hospital).all()

@router.get("/{hospital_id}", response_model=HospitalResponse)
async def get_hospital(
    hospital_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    hospital = db.query(Hospital).filter(Hospital.id == hospital_id).first()
    if not hospital:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Hospital not found"
        )
    return hospital
