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
    validate_password_policy,
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
from app.identity import IdentityProvisioningError, ensure_user_identity
from app.identity_registry import (
    IdentityRegistryService,
    DoctorRegistrationRequest,
    PatientRegistrationRequest,
    ResearcherRegistrationRequest,
    AdminRegistrationRequest,
    IdentityVerificationRequest,
    IdentityVerificationResponse,
    IdentityVerificationStatus,
    validate_id_format,
    get_id_format_description,
    DoctorIdentity,
    PatientIdentity,
    ResearcherIdentity,
    AdminIdentity,
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
    # Flush only: the user row is not committed until the decentralized identity
    # has been provisioned successfully, so a DID failure cannot leave a partially
    # created account behind.
    db.flush()
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

    # Provision the DID, DID document, and role credential before committing.
    try:
        ensure_user_identity(db, db_user)
    except IdentityProvisioningError as exc:
        db.rollback()
        logger.error(f"Registration aborted: identity provisioning failed for {user_in.username}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Account could not be provisioned with a decentralized identity. Please retry.",
        )

    # Log registration audit event
    audit = AuditLog(
        user_id=db_user.id,
        action="REGISTER",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        status="SUCCESS",
        details=f"User {db_user.username} registered with role {assigned_role}; actor_did={db_user.did}",
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    db.commit()
    db.refresh(db_user)

    logger.info(f"Public registration completed successfully for user: {db_user.username} (Role: {assigned_role}, DID: {db_user.did})")
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
    db.flush()
    db.refresh(db_user)

    get_security_state(db, db_user)

    if provision_in.role in {"doctor", "radiologist"}:
        doc_prof = DoctorProfile(
            user_id=db_user.id,
            specialization=provision_in.doctor_profile.specialization if provision_in.doctor_profile else "General Practice",
            license_number=provision_in.doctor_profile.license_number if provision_in.doctor_profile else f"LIC-{db_user.id:04d}"
        )
        db.add(doc_prof)

    # Privileged accounts receive a system-issued platform role credential. It
    # asserts the platform role only and is not evidence of a medical licence.
    try:
        ensure_user_identity(db, db_user)
    except IdentityProvisioningError as exc:
        db.rollback()
        logger.error(f"Provisioning aborted: identity provisioning failed for {provision_in.username}: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Account could not be provisioned with a decentralized identity. Please retry.",
        )

    audit = AuditLog(
        user_id=current_user.id,
        action="PROVISION_USER",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        status="SUCCESS",
        details=f"Admin {current_user.username} provisioned {db_user.username} as {db_user.role}; subject_did={db_user.did}",
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    db.commit()
    db.refresh(db_user)

    logger.info(f"User {db_user.username} successfully provisioned by {current_user.username}")
    return db_user


@router.post("/verify-identity", response_model=IdentityVerificationResponse)
async def verify_identity(
    verify_in: IdentityVerificationRequest,
    db: Session = Depends(get_db)
):
    """
    Verify a role-specific identity ID against the authorized registry.
    This endpoint allows the frontend to validate an identity before attempting registration.
    """
    logger.info(f"Identity verification request for role: {verify_in.role}, ID: {verify_in.identity_id}")

    # Validate ID format first
    if not validate_id_format(verify_in.role, verify_in.identity_id):
        return IdentityVerificationResponse(
            success=False,
            status=IdentityVerificationStatus.INVALID_FORMAT.value,
            message=f"Invalid ID format for role {verify_in.role}. Expected: {get_id_format_description(verify_in.role)}",
            role=verify_in.role,
            identity_id=verify_in.identity_id,
            details={"expected_format": get_id_format_description(verify_in.role)}
        )

    # Validate against registry
    registry = IdentityRegistryService(db)
    result = registry.validate_identity(verify_in.role, verify_in.identity_id)

    return IdentityVerificationResponse(
        success=result.success,
        status=result.status.value,
        message=result.message,
        role=verify_in.role,
        identity_id=verify_in.identity_id,
        details={
            "expected_format": get_id_format_description(verify_in.role),
            "identity_record_id": result.identity_record.id if result.identity_record else None
        } if result.success else {"expected_format": get_id_format_description(verify_in.role)}
    )


@router.post("/register/doctor", response_model=UserResponse)
async def register_doctor(
    reg_in: DoctorRegistrationRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Doctor registration with server-side identity validation.
    Requires a verified Doctor ID (format: DR-XXXXXX) from the authorized registry.
    """
    logger.info(f"Doctor registration attempt: identity={reg_in.identity_id}, username={reg_in.username}")

    # Identity verification is OPTIONAL: skipped entirely when no ID is supplied.
    # When an ID IS supplied it is still strictly validated against the registry.
    registry = IdentityRegistryService(db)
    identity_provided = bool(reg_in.identity_id)
    validation = registry.validate_doctor_id(reg_in.identity_id) if identity_provided else None
    if validation is not None and not validation.success:
        logger.warning(f"Doctor registration rejected: {validation.message} (ID: {reg_in.identity_id})")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unable to verify the supplied identity information."
        )

    # Check for existing user
    existing_user = db.query(User).filter(
        (User.username == reg_in.username) | (User.email == reg_in.email)
    ).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered"
        )

    # Validate password
    validate_password_policy(reg_in.password)
    hashed_pwd = get_password_hash(reg_in.password)

    # Create user with doctor role
    db_user = User(
        username=reg_in.username,
        email=reg_in.email,
        hashed_password=hashed_pwd,
        role="doctor",
        hospital_id=reg_in.hospital_id,
        mfa_enabled=False,
        is_active=True
    )
    db.add(db_user)
    db.flush()
    db.refresh(db_user)

    # Initialize security state
    get_security_state(db, db_user)

    # Create doctor profile (registry record is only available when identity was verified)
    doctor_profile = validation.identity_record if validation else None
    doc_prof = DoctorProfile(
        user_id=db_user.id,
        specialization=reg_in.specialization or (doctor_profile.specialization if doctor_profile else None) or "Radiology & Medical Imaging",
        license_number=reg_in.license_number or (doctor_profile.license_number if doctor_profile else None) or f"LIC-{db_user.id:04d}"
    )
    db.add(doc_prof)

    # Provision DID and credential
    try:
        ensure_user_identity(db, db_user)
    except IdentityProvisioningError as exc:
        db.rollback()
        logger.error(f"Doctor registration aborted: identity provisioning failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Account could not be provisioned with a decentralized identity. Please retry."
        )

    # Mark identity as registered (only when a verified ID was supplied)
    if identity_provided:
        registry.register_identity("doctor", reg_in.identity_id, db_user)

    # Audit log
    audit = AuditLog(
        user_id=db_user.id,
        action="REGISTER",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        status="SUCCESS",
        details=f"Doctor {db_user.username} registered with verified identity {reg_in.identity_id}; actor_did={db_user.did}" if identity_provided
                else f"Doctor {db_user.username} registered without identity verification (optional); actor_did={db_user.did}",
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    db.commit()
    db.refresh(db_user)

    logger.info(f"Doctor registration completed: {db_user.username} (DID: {db_user.did})")
    return db_user


@router.post("/register/patient", response_model=UserResponse)
async def register_patient(
    reg_in: PatientRegistrationRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Patient registration with server-side identity validation.
    Requires a verified Patient ID (format: PT-XXXXXX) from the authorized registry.
    """
    logger.info(f"Patient registration attempt: identity={reg_in.identity_id}, username={reg_in.username}")

    # Identity verification is OPTIONAL: skipped entirely when no ID is supplied.
    # When an ID IS supplied it is still strictly validated against the registry.
    registry = IdentityRegistryService(db)
    identity_provided = bool(reg_in.identity_id)
    validation = registry.validate_patient_id(reg_in.identity_id) if identity_provided else None
    if validation is not None and not validation.success:
        logger.warning(f"Patient registration rejected: {validation.message} (ID: {reg_in.identity_id})")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unable to verify the supplied identity information."
        )

    # Check for existing user
    existing_user = db.query(User).filter(
        (User.username == reg_in.username) | (User.email == reg_in.email)
    ).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered"
        )

    # Validate password
    validate_password_policy(reg_in.password)
    hashed_pwd = get_password_hash(reg_in.password)

    # Create user with patient role
    db_user = User(
        username=reg_in.username,
        email=reg_in.email,
        hashed_password=hashed_pwd,
        role="patient",
        hospital_id=None,
        mfa_enabled=False,
        is_active=True
    )
    db.add(db_user)
    db.flush()
    db.refresh(db_user)

    # Initialize security state
    get_security_state(db, db_user)

    # Create patient profile (registry record is only available when identity was verified)
    patient_profile = validation.identity_record if validation else None
    prof = PatientProfile(
        user_id=db_user.id,
        date_of_birth=reg_in.date_of_birth or (patient_profile.date_of_birth if patient_profile else None) or "2000-01-01",
        gender=reg_in.gender or (patient_profile.gender if patient_profile else None) or "Unspecified",
        blood_group=reg_in.blood_group or (patient_profile.blood_group if patient_profile else None) or "O Positive"
    )
    db.add(prof)

    # Provision DID and credential
    try:
        ensure_user_identity(db, db_user)
    except IdentityProvisioningError as exc:
        db.rollback()
        logger.error(f"Patient registration aborted: identity provisioning failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Account could not be provisioned with a decentralized identity. Please retry."
        )

    # Mark identity as registered (only when a verified ID was supplied)
    if identity_provided:
        registry.register_identity("patient", reg_in.identity_id, db_user)

    # Audit log
    audit = AuditLog(
        user_id=db_user.id,
        action="REGISTER",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        status="SUCCESS",
        details=f"Patient {db_user.username} registered with verified identity {reg_in.identity_id}; actor_did={db_user.did}" if identity_provided
                else f"Patient {db_user.username} registered without identity verification (optional); actor_did={db_user.did}",
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    db.commit()
    db.refresh(db_user)

    logger.info(f"Patient registration completed: {db_user.username} (DID: {db_user.did})")
    return db_user


@router.post("/register/researcher", response_model=UserResponse)
async def register_researcher(
    reg_in: ResearcherRegistrationRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Researcher registration with server-side identity validation.
    Requires a verified Researcher ID (format: RES-XXXXXX) from the authorized registry.
    Only approved researchers can register.
    """
    logger.info(f"Researcher registration attempt: identity={reg_in.identity_id}, username={reg_in.username}")

    # Identity verification is OPTIONAL: skipped entirely when no ID is supplied.
    # When an ID IS supplied it is still strictly validated against the registry.
    registry = IdentityRegistryService(db)
    identity_provided = bool(reg_in.identity_id)
    validation = registry.validate_researcher_id(reg_in.identity_id) if identity_provided else None
    if validation is not None and not validation.success:
        logger.warning(f"Researcher registration rejected: {validation.message} (ID: {reg_in.identity_id})")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Unable to verify the supplied identity information."
        )

    # Check for existing user
    existing_user = db.query(User).filter(
        (User.username == reg_in.username) | (User.email == reg_in.email)
    ).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered"
        )

    # Validate password
    validate_password_policy(reg_in.password)
    hashed_pwd = get_password_hash(reg_in.password)

    # Create user with researcher role
    db_user = User(
        username=reg_in.username,
        email=reg_in.email,
        hashed_password=hashed_pwd,
        role="researcher",
        hospital_id=None,
        mfa_enabled=False,
        is_active=True
    )
    db.add(db_user)
    db.flush()
    db.refresh(db_user)

    # Initialize security state
    get_security_state(db, db_user)

    # Provision DID and credential
    try:
        ensure_user_identity(db, db_user)
    except IdentityProvisioningError as exc:
        db.rollback()
        logger.error(f"Researcher registration aborted: identity provisioning failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Account could not be provisioned with a decentralized identity. Please retry."
        )

    # Mark identity as registered (only when a verified ID was supplied)
    if identity_provided:
        registry.register_identity("researcher", reg_in.identity_id, db_user)

    # Audit log
    audit = AuditLog(
        user_id=db_user.id,
        action="REGISTER",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        status="SUCCESS",
        details=f"Researcher {db_user.username} registered with verified identity {reg_in.identity_id}; actor_did={db_user.did}" if identity_provided
                else f"Researcher {db_user.username} registered without identity verification (optional); actor_did={db_user.did}",
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    db.commit()
    db.refresh(db_user)

    logger.info(f"Researcher registration completed: {db_user.username} (DID: {db_user.did})")
    return db_user


@router.post("/register/admin", response_model=UserResponse)
async def register_admin(
    reg_in: AdminRegistrationRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Hospital Administrator registration with strict pre-authorized identity validation.
    Requires a pre-provisioned Admin ID (format: ADM-XXXXXX) from the authorized registry.
    This is the most restricted registration endpoint - no arbitrary admin signup.
    """
    logger.info(f"Admin registration attempt: identity={reg_in.identity_id}, username={reg_in.username}")

    # Verify identity against registry
    registry = IdentityRegistryService(db)
    validation = registry.validate_admin_id(reg_in.identity_id)
    if not validation.success:
        logger.warning(f"Admin registration rejected: {validation.message} (ID: {reg_in.identity_id})")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin registration requires pre-authorized identity provisioning."
        )

    # Check for existing user
    existing_user = db.query(User).filter(
        (User.username == reg_in.username) | (User.email == reg_in.email)
    ).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already registered"
        )

    # Validate password
    validate_password_policy(reg_in.password)
    hashed_pwd = get_password_hash(reg_in.password)

    # Create user with hospital_admin role
    db_user = User(
        username=reg_in.username,
        email=reg_in.email,
        hashed_password=hashed_pwd,
        role=reg_in.role_level,  # hospital_admin or super_admin
        hospital_id=None,
        mfa_enabled=False,
        is_active=True
    )
    db.add(db_user)
    db.flush()
    db.refresh(db_user)

    # Initialize security state
    get_security_state(db, db_user)

    # Provision DID and credential
    try:
        ensure_user_identity(db, db_user)
    except IdentityProvisioningError as exc:
        db.rollback()
        logger.error(f"Admin registration aborted: identity provisioning failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Account could not be provisioned with a decentralized identity. Please retry."
        )

    # Mark identity as registered
    registry.register_identity("hospital_admin", reg_in.identity_id, db_user)

    # Audit log
    audit = AuditLog(
        user_id=db_user.id,
        action="REGISTER",
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        status="SUCCESS",
        details=f"Admin {db_user.username} registered with pre-authorized identity {reg_in.identity_id}; actor_did={db_user.did}",
        timestamp=datetime.now(timezone.utc)
    )
    db.add(audit)
    db.commit()
    db.refresh(db_user)

    logger.info(f"Admin registration completed: {db_user.username} (Role: {db_user.role}, DID: {db_user.did})")
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
