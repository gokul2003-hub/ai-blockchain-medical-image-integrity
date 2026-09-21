import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from loguru import logger

from app.database import get_db
from app.models import User, PatientProfile, DoctorProfile, AuditLog, MfaCredential
from app.schemas import (
    UserCreate,
    UserResponse,
    Token,
    LoginRequest,
    RefreshRequest,
    MfaConfirmRequest,
    MfaSetupResponse,
    AdminUserProvision,
)
from app.auth import (
    SAFE_PUBLIC_ROLE,
    PRIVILEGED_ROLES,
    get_password_hash,
    authenticate_user,
    create_access_token,
    create_session,
    rotate_session,
    revoke_all_sessions,
    generate_mfa_secret,
    generate_recovery_codes,
    store_mfa_credential,
    verify_mfa_code,
    get_current_user,
    get_security_state,
    RoleChecker,
    oauth2_scheme,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])
admin_provision_guard = RoleChecker(["super_admin", "hospital_admin"])


@router.post("/register", response_model=UserResponse)
async def register_user(
    user_in: UserCreate,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Public registration endpoint.
    SECURITY FIX: Role escalation is strictly prohibited.
    All public registrations are assigned the default safe role 'patient'.
    """
    logger.info(f"Incoming registration request for username: {user_in.username}")

    existing_user = db.query(User).filter(
        (User.username == user_in.username) | (User.email == user_in.email)
    ).first()
    if existing_user:
        logger.warning(f"Registration failed: Username or email {user_in.username} already registered.")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered"
        )

    # Validate password complexity & hash
    hashed_pwd = get_password_hash(user_in.password)

    # Force SAFE_PUBLIC_ROLE
    assigned_role = SAFE_PUBLIC_ROLE

    db_user = User(
        username=user_in.username,
        email=user_in.email,
        hashed_password=hashed_pwd,
        role=assigned_role,
        hospital_id=user_in.hospital_id,
        mfa_enabled=False,
        is_active=True
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    # Initialize security state
    get_security_state(db, db_user)

    # Always create PatientProfile for public registration
    prof = PatientProfile(
        user_id=db_user.id,
        date_of_birth=user_in.patient_profile.date_of_birth if user_in.patient_profile else "2000-01-01",
        gender=user_in.patient_profile.gender if user_in.patient_profile else "Unspecified",
        blood_group=user_in.patient_profile.blood_group if user_in.patient_profile else "O Positive"
    )
    db.add(prof)

    # Log registration audit event
    audit = AuditLog(
        user_id=db_user.id,
        action="REGISTER",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        status="SUCCESS",
        details=f"User {db_user.username} registered with role {assigned_role}",
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    db.commit()
    db.refresh(db_user)

    logger.info(f"Public registration completed successfully for user: {db_user.username} (Role: {assigned_role})")
    return db_user


@router.post("/provision-user", response_model=UserResponse)
async def provision_privileged_user(
    provision_in: AdminUserProvision,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(admin_provision_guard)
):
    """
    Administrative provisioning endpoint.
    Restricted to super_admin and hospital_admin for safely creating
    privileged roles (doctor, radiologist, hospital_admin, researcher).
    """
    logger.info(f"Admin {current_user.username} provisioning user: {provision_in.username} (Role: {provision_in.role})")

    if provision_in.role not in PRIVILEGED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid privileged role. Must be one of: {', '.join(PRIVILEGED_ROLES)}"
        )

    # Hospital admins can only provision staff for their own hospital
    hospital_id = provision_in.hospital_id
    if current_user.role == "hospital_admin":
        hospital_id = current_user.hospital_id
        if provision_in.role in {"super_admin", "hospital_admin"}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Hospital administrators cannot provision administrator accounts"
            )

    existing = db.query(User).filter(
        (User.username == provision_in.username) | (User.email == provision_in.email)
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered"
        )

    hashed_pwd = get_password_hash(provision_in.password)

    db_user = User(
        username=provision_in.username,
        email=provision_in.email,
        hashed_password=hashed_pwd,
        role=provision_in.role,
        hospital_id=hospital_id,
        mfa_enabled=False,
        is_active=True
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    get_security_state(db, db_user)

    if provision_in.role in {"doctor", "radiologist"}:
        doc_prof = DoctorProfile(
            user_id=db_user.id,
            specialization=provision_in.doctor_profile.specialization if provision_in.doctor_profile else "General Practice",
            license_number=provision_in.doctor_profile.license_number if provision_in.doctor_profile else f"LIC-{db_user.id:04d}"
        )
        db.add(doc_prof)

    audit = AuditLog(
        user_id=current_user.id,
        action="PROVISION_USER",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        status="SUCCESS",
        details=f"Admin {current_user.username} provisioned {db_user.username} as {db_user.role}",
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    db.commit()
    db.refresh(db_user)

    logger.info(f"User {db_user.username} successfully provisioned by {current_user.username}")
    return db_user


@router.post("/login", response_model=Token)
async def login_user(
    login_in: LoginRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Secure authentication endpoint.
    Performs rate-limited credential checks, password policy validation,
    account lockout checks, TOTP MFA validation, and active session generation.
    """
    logger.info(f"Authentication attempt for user: {login_in.username}")
    ip = request.client.host if request.client else "unknown"
    agent = request.headers.get("user-agent", "unknown")

    # Authenticate user with lockout protection
    user = authenticate_user(db, login_in.username, login_in.password, login_in.mfa_code)

    state = get_security_state(db, user)
    access_token = create_access_token(user, state)
    refresh_token, session_id = create_session(db, user, ip, agent)

    # Log successful login
    audit = AuditLog(
        user_id=user.id,
        action="LOGIN",
        ip_address=ip,
        user_agent=agent,
        status="SUCCESS",
        details="User authenticated successfully",
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    db.commit()

    logger.info(f"User {login_in.username} authenticated successfully. Session ID: {session_id}")
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "role": user.role,
        "username": user.username,
        "mfa_enabled": user.mfa_enabled
    }


@router.post("/refresh", response_model=Token)
async def refresh_access_token(
    request: Request,
    refresh_body: RefreshRequest = None,
    refresh_token: str = None,
    db: Session = Depends(get_db)
):
    """
    Rotates the active session and issues a fresh access/refresh token pair.
    Revokes the previous refresh token to prevent replay attacks.
    """
    token_str = (refresh_body.refresh_token if refresh_body and refresh_body.refresh_token else None) or refresh_token
    if not token_str:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refresh token is required"
        )

    ip = request.client.host if request.client else "unknown"
    agent = request.headers.get("user-agent", "unknown")

    user, new_refresh = rotate_session(db, token_str, ip, agent)
    state = get_security_state(db, user)
    new_access = create_access_token(user, state)
    db.commit()

    logger.info(f"Token refreshed successfully for user: {user.username}")
    return {
        "access_token": new_access,
        "refresh_token": new_refresh,
        "token_type": "bearer",
        "role": user.role,
        "username": user.username,
        "mfa_enabled": user.mfa_enabled
    }


@router.get("/mfa/setup", response_model=MfaSetupResponse)
async def setup_mfa(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Initializes TOTP MFA for the authenticated user.
    Generates an encrypted TOTP secret, QR provisioning URI, and 8 one-time recovery codes.
    """
    secret = generate_mfa_secret()
    recovery_codes = generate_recovery_codes()
    store_mfa_credential(db, current_user, secret, recovery_codes)
    db.commit()

    totp_uri = f"otpauth://totp/MedChain:{current_user.username}?secret={secret}&issuer=MedChain-Cybersecurity"
    return {
        "secret": secret,
        "totp_uri": totp_uri,
        "recovery_codes": recovery_codes
    }


@router.post("/mfa/enable")
async def enable_mfa(
    mfa_in: MfaConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Verifies the user's TOTP code and activates MFA on the account.
    """
    cred = db.get(MfaCredential, current_user.id)
    if not cred:
        raise HTTPException(status_code=400, detail="MFA setup has not been initiated. Call /mfa/setup first.")

    from app.auth import read_mfa_secret
    secret = read_mfa_secret(cred)

    if not verify_mfa_code(secret, mfa_in.code):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid TOTP code. Synchronization failed."
        )

    cred.enabled_at = datetime.now(timezone.utc)
    current_user.mfa_enabled = True
    db.commit()

    logger.info(f"MFA successfully enabled for user {current_user.username}")
    return {"success": True, "message": "MFA has been successfully activated on your account"}


@router.post("/logout")
async def logout_user(
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Logs out the user, revokes all active refresh sessions, and increments
    token_version so existing access tokens become immediately invalid.
    """
    revoke_all_sessions(db, current_user)

    audit = AuditLog(
        user_id=current_user.id,
        action="LOGOUT",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        status="SUCCESS",
        details="User logged out; active sessions and tokens revoked",
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    db.commit()

    logger.info(f"User {current_user.username} logged out and active tokens revoked.")
    return {"success": True, "message": "Successfully logged out. Active sessions revoked."}


@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns the authenticated user's profile and credentials status."""
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
    elif current_user.role in {"doctor", "radiologist"} and not current_user.doctor_profile:
        prof = DoctorProfile(
            user_id=current_user.id,
            specialization="Radiology & Medical Imaging",
            license_number=f"LIC-{current_user.id:04d}"
        )
        db.add(prof)
        db.commit()
        db.refresh(current_user)
    return current_user
