import uvicorn
import datetime
import time
import os
from fastapi import FastAPI, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from loguru import logger
import sys

# Slowapi rate limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.config import STORAGE_DIR
from app.database import engine, Base, SessionLocal
import app.models
from app.models import Hospital, User, PatientProfile, DoctorProfile, Permission
Base.metadata.create_all(bind=engine)
from app.auth import get_password_hash
from app.ai_model import get_ai_model

# Routers
from app.routes import auth, hospitals, users, images, permissions, blockchain, analytics

# --- 1. Configure Loguru Structured Logging ---
logger.remove() # Remove default handler
logger.add(
    sys.stdout,
    format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
    level="INFO"
)
logger.add(
    "storage/logs/backend.log",
    rotation="10 MB",
    retention="10 days",
    compression="zip",
    level="INFO"
)

# --- 2. Initialize FastAPI Application ---
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(
    title="AI-Driven Blockchain Medical Sharing Framework",
    description="Production-grade secure backend with 4D hyperchaotic encryption and decentralized ledger audit trails.",
    version="1.1.0"
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# --- 3. CORS Policy Configuration ---
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173")
allowed_origins_list = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins_list if allowed_origins_list else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 4. Centralized Structured Logging Middleware ---
@app.middleware("http")
async def log_requests_middleware(request: Request, call_next):
    start_time = time.time()
    request_id = request.headers.get("x-request-id", f"req_{int(start_time*1000)}")
    logger.info(f"Incoming Request [{request_id}] | Method: {request.method} | Path: {request.url.path} | IP: {request.client.host}")
    
    try:
        response = await call_next(request)
        process_time = (time.time() - start_time) * 1000
        formatted_process_time = f"{process_time:.2f}ms"
        response.headers["x-process-time"] = formatted_process_time
        response.headers["x-request-id"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        
        logger.info(f"Completed Request [{request_id}] | Status: {response.status_code} | Latency: {formatted_process_time}")
        return response
    except Exception as e:
        process_time = (time.time() - start_time) * 1000
        logger.exception(f"Unhandled Exception [{request_id}] | Path: {request.url.path} | Error: {str(e)} | Latency: {process_time:.2f}ms")
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "success": False,
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An unexpected error occurred on the server.",
                    "details": str(e) if app.debug else None
                }
            }
        )

# --- 5. Centralized Error Handlers ---
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Centralized Handler intercepted exception: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": {
                "code": "SERVER_ERROR",
                "message": "A server error occurred during processing.",
                "details": str(exc)
            }
        }
    )

# --- 6. Include API Module Routes (Versioned under /api/v1 and legacy /api) ---
api_routers = [auth.router, hospitals.router, users.router, images.router, permissions.router, blockchain.router, analytics.router]
for r in api_routers:
    app.include_router(r, prefix="/api/v1")
    app.include_router(r, prefix="/api", include_in_schema=False)

# --- 7. WebSocket Live Alert Broadcaster ---
from fastapi import WebSocket, WebSocketDisconnect
from app.notifications import ws_manager

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Maintain connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)

@app.on_event("startup")
def on_startup():
    # 1. Initialize DB structures
    Base.metadata.create_all(bind=engine)
    logger.info("SQL database structures checked/initialized.")

    # 2. Seed database
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()

    # 3. Cache U-Net weights
    logger.info("Warming up Residual Attention U-Net inference engine...")
    get_ai_model()
    logger.info("Residual Attention U-Net loaded and ready.")

    # 4. Start background blockchain event listener thread
    from app.event_listener import event_listener
    event_listener.start()

@app.on_event("shutdown")
def on_shutdown():
    from app.event_listener import event_listener
    event_listener.stop()

@app.get("/")
def read_root():
    return {
        "success": True,
        "message": "AI-Driven Blockchain Medical Sharing API (v1.1.0) is running."
    }

def seed_database(db: Session):
    """Pre-populates database with mock hospitals, doctors, and users for easy testing."""
    if db.query(User).count() > 0:
        return
        
    logger.info("Database is empty. Seeding mock entries...")

    # 1. Create Hospital branches
    h1 = Hospital(
        name="City General Hospital",
        license_number="HOSP-CGH-001",
        address="100 Medical Plaza, Metro City",
        contact_email="admin@citygeneral.org"
    )
    h2 = Hospital(
        name="Metro Radiology Imaging Center",
        license_number="HOSP-MRIC-002",
        address="404 Scanner Ave, Tech District",
        contact_email="support@metrorad.com"
    )
    db.add_all([h1, h2])
    db.commit()
    db.refresh(h1)
    db.refresh(h2)

    # 2. Create Users with policy-compliant passwords
    super_admin = User(
        username="superadmin",
        email="super@medshare.org",
        hashed_password=get_password_hash("AdminSecure123!"),
        role="super_admin",
        is_active=True
    )
    hosp_admin = User(
        username="hospadmin",
        email="admin@citygeneral.org",
        hashed_password=get_password_hash("HospAdmin123!"),
        role="hospital_admin",
        hospital_id=h1.id,
        is_active=True
    )
    doctor = User(
        username="drsmith",
        email="smith@citygeneral.org",
        hashed_password=get_password_hash("DocSecure123!"),
        role="doctor",
        hospital_id=h1.id,
        is_active=True
    )
    radiologist = User(
        username="radjones",
        email="jones@metrorad.com",
        hashed_password=get_password_hash("RadSecure123!"),
        role="radiologist",
        hospital_id=h2.id,
        is_active=True
    )
    patient = User(
        username="alice",
        email="alice@gmail.com",
        hashed_password=get_password_hash("PatSecure123!"),
        role="patient",
        hospital_id=h1.id,
        is_active=True
    )

    db.add_all([super_admin, hosp_admin, doctor, radiologist, patient])
    db.commit()

    from app.auth import get_security_state
    for u in [super_admin, hosp_admin, doctor, radiologist, patient]:
        get_security_state(db, u)
    db.commit()
    
    # 3. Create Profiles
    doc_profile = DoctorProfile(
        user_id=doctor.id,
        specialization="Cardiology & Thoracic Imaging",
        license_number="LIC-MD-SMITH-777"
    )
    db.add(doc_profile)
    
    pat_profile = PatientProfile(
        user_id=patient.id,
        date_of_birth="1995-04-15",
        gender="Female",
        blood_group="O Positive"
    )
    db.add(pat_profile)
    db.commit()

    # 4. Grant initial permissions
    initial_perm = Permission(
        patient_id=pat_profile.id,
        doctor_id=doc_profile.id,
        access_type="DOWNLOAD",
        is_active=True,
        is_emergency=False,
        expires_at=datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=3650)
    )
    db.add(initial_perm)
    db.commit()
    logger.info("Database seeding complete.")

if __name__ == "__main__":
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
