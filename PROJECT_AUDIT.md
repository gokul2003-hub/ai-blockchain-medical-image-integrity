# PROJECT AUDIT REPORT

**Project Name**: AI-Driven Secure Medical Image Sharing, Continuous Integrity Verification, Tamper Forensics, and Self-Recovery Platform  
**Location**: `C:\Users\gokul\OneDrive\Desktop\capstone project`  
**Audit Date**: September 20, 2026  
**Auditor**: Lead Software Architect, Cybersecurity, AI/ML & Healthcare Systems Engineer  

---

## 1. Current Architecture

The project is structured as a full-stack client-server healthcare cybersecurity platform:
- **Backend**: FastAPI (Python 3.10) with SQLAlchemy ORM, Pydantic v2, SlowAPI rate limiting, Loguru structured logging, PyTorch for neural network inference, OpenCV/NumPy for image processing, PyCryptodome/Cryptography for encryption, and Web3.py for blockchain integration.
- **Database**: SQLite default local database (`medical_sharing.db`) with relational schemas for users, profiles, images, permissions, audit logs, digital integrity twins, and recovery records.
- **Decentralized Storage**: Dual-tier storage provider interface (`LocalStorageProvider` in `storage/objects/` and `IPFSProvider` connecting to IPFS API daemon).
- **Decentralized Ledger**: Dual-mode blockchain service (`DevelopmentIntegrityLedger` with SHA-3 proof-of-work chain verification, and EVM/Hyperledger Besu Web3 client with Solidity smart contract `MedicalAccessControl`).
- **AI Forensics**: Hybrid dual-stream network combining Spatial Rich Model (SRM) high-frequency noise residual filtering, Swin Transformer hierarchical blocks, and Attention-Gated U-Net decoder with bottleneck Grad-CAM attribution hooks.
- **Frontend**: Vite 5 + React 19 + TypeScript + TailwindCSS + Lucide Icons + Recharts, organized into role-specific dashboard views.

---

## 2. Working Features

1. **AI Model Architecture & SRM Filtering**:
   - `SrmNoiseFilter` with 3 discrete kernels extracts high-frequency noise residuals.
   - `HybridSwinUNet` (dual-stream RGB + SRM) loads, performs forward passes, and produces sigmoid segmentation masks.
   - `calculate_segmentation_metrics` evaluates Dice, IoU, Precision, Recall, F1, MCC, and ROC-AUC.
2. **Cryptographic Core (AES-256-GCM & SHA-3)**:
   - Authenticated encryption using AES-256-GCM with per-image random 256-bit DEK, 12-byte random nonce, and HKDF-derived KEK wrapping.
   - SHA-3-256 and SHA-256 deterministic hashing for integrity verification.
3. **Multi-Factor Risk & Trust Engines**:
   - Transparent mathematical score calculation in `risk_engine.py` producing `Tamper Risk Score` (0-100) and `Cybersecurity Trust Score` (0-100).
4. **Digital Integrity Twin Data Model**:
   - `DigitalIntegrityTwin` entity tracking trusted hash, IPFS CID, verification history, and region-level ROI integrity maps.
5. **Region-Level Self-Recovery Core**:
   - `recovery.py` extracts AI-localized tampered bounding boxes, retrieves trusted backup, and performs ROI replacement with Poisson seamless cloning.
6. **Frontend UI Build**:
   - Vite + React compiles cleanly with TypeScript without bundling errors.

---

## 3. Broken Features & Architectural Bugs

1. **Authentication API Route & Helper Contract Mismatches**:
   - `routes/auth.py` calls `create_access_token(data={"sub": user.username, "role": user.role})`, but `app/auth.py` defines `create_access_token(user: User, state: UserSecurityState)` expecting User and UserSecurityState models.
   - `routes/auth.py` imports `revoke_token` from `app.auth` which does not exist (`revoke_all_sessions` exists).
2. **Startup Seeding Crash on Password Complexity**:
   - `auth.py` enforces a strict 12+ character password policy with uppercase, lowercase, and digits.
   - `main.py` seed script called `get_password_hash("admin123")` which raises `HTTPException 422` and crashes startup when the database is empty.
3. **Frontend Token Storage Key Inconsistency**:
   - `App.tsx` and `Login.tsx` stored tokens under `"med_token"`.
   - `TamperViewer.tsx` looked for `localStorage.getItem("token")`, resulting in `null` and failing recovery requests.
4. **Protected Media Rendering Failure (HTTP 401 on Images)**:
   - Heatmap overlays and SRM noise residual maps were embedded via standard `<img src="http://localhost:8000/api/images/heatmap/...">` tags.
   - Because standard `<img>` tags cannot include HTTP Bearer tokens, the browser received `401 Unauthorized`.
5. **Fabricated Multi-Slice DICOM Loop**:
   - `routes/images.py` arbitrarily generated 3 fake slices (`for slice_idx in range(3): DicomSlice(...)`) even for 2D single-frame images.
6. **Hardcoded Report Values**:
   - `report.py` and error handlers contained hardcoded defaults (`tampered_percentage = 15.4`, `confidence_score = 0.92`), obscuring real inference outputs.
7. **Pytest Plugin Crash**:
   - Running `pytest` failed at collection due to an `ImportError` in `eth_typing 6.0.0` (`web3.tools.pytest_ethereum` looking for `ContractName`).
   - `test_crypto.py` imported removed legacy chaos functions (`derive_chaos_parameters`, etc.).

---

## 4. Security Vulnerabilities

1. **Role Escalation via Public Registration**:
   - `POST /api/v1/auth/register` accepted arbitrary `"role"` values in the JSON body, allowing anyone to register directly as `super_admin`, `doctor`, or `radiologist`.
2. **Hardcoded Secrets in Docker Compose**:
   - `docker-compose.yml` hardcoded production JWT secrets (`b39afccb...`) and master encryption key strings (`super-secret-key...`).
3. **Insecure Client Emergency Override**:
   - `routes/images.py` allowed clients to pass `is_emergency=true` without server-side policy enforcement, role verification, or clinical justification.
4. **Missing Resource-Level IDOR / BOLA Checks on Certain Routes**:
   - Patient image listings and downloads did not universally verify active patient consent grants (`ConsentGrant`) or permission validity periods.
5. **Incomplete DICOM De-Identification**:
   - `preprocessing.py` extracted raw patient name strings directly into metadata records without applying anonymization profiles.

---

## 5. Missing Dependencies & Environment Status

- **Windows Version**: Windows 11 (build-compatible)
- **Python**: Python 3.10.10 in `backend/venv`
- **Node.js**: v24.14.0, npm 11.11.0
- **Pytest**: Version 8.3.2 installed, requires `-p no:pytest_ethereum` configuration.
- **Dependencies**: `pydicom`, `torch`, `fastapi`, `cryptography`, `web3`, `reportlab`, `opencv-python` are installed.

---

## 6. Detailed Domain Problems

### Backend & API
- API endpoints split between legacy `/api` and `/api/v1` with inconsistent request schemas.
- Lack of centralized `AuthService` on frontend.
- Error handling occasionally exposes raw traceback details in debug mode.

### Database
- New security entities (`UserSecurityState`, `MfaCredential`, `AuthSession`, `ConsentGrant`, `ImageVersion`, `AIInference`, `IntegrityEvent`) were partially declared in `models.py` but not connected to primary image API routes.

### AI Forensics & Training
- Dataset generator simulated only 40 synthetic images over 5 epochs; labeled as general model instead of training/demonstration infrastructure.
- No confusion matrix or ROC/PR curve generation utilities for research benchmarking.

### Blockchain & Storage
- Solidity contract `MedicalAccessControl` defined `onlyOwner` modifier but failed to apply it to state-changing functions `registerImage` and `grantAccess`.
- `ipfs.py` claimed IPFS upload even when silently falling back to local file simulation.

### Documentation
- `capstone_project_report.md` was completely mismatched, describing a diabetes and heart-disease prediction system instead of medical image security.

---

## 7. Recommended Architecture

1. **Authentication & Authorization**:
   - Public registration strictly locked to `patient`.
   - Administrative endpoint `POST /api/v1/auth/provision-user` for staff onboarding.
   - TOTP MFA + recovery codes with environment-controlled development test mode.
   - Resource-level authorization checking ownership, active consent grant, purpose, and expiration.
2. **Cryptographic Architecture**:
   - Pure AES-256-GCM authenticated encryption with per-image random DEKs, KEK wrapping, random nonces, and authenticated associated data (AAD).
   - Plaintext, ciphertext, and metadata SHA-256 / SHA-3 hashing.
3. **Storage & Blockchain Abstraction**:
   - Unified `StorageProvider` with explicit UI status (`Storage: LOCAL` vs `Storage: IPFS`).
   - Unified `BlockchainProvider` with local EVM / development ledger support and authorized smart contracts.
4. **DICOM & AI Pipeline**:
   - Safe de-identification removing 18 HIPAA identifiers while maintaining UIDs.
   - Real model outputs persisted to `AIInference` and `Report` tables.
   - Authenticated media delivery via Blob Object URLs in frontend.
5. **Frontend Redesign**:
   - Unified healthcare cybersecurity theme with centralized auth service, image vault, integrity center, forensics comparator, consent manager, and audit explorer.

---

## 8. Implementation Roadmap

- **Phase 0**: Stabilize environment, create `pytest.ini`, fix test collection.
- **Phase 1**: Security & configuration hardening, secret management, Docker cleanup.
- **Phase 2**: Authentication & session management, role elevation lockdown, TOTP MFA.
- **Phase 3**: Resource-level authorization & fine-grained consent management.
- **Phase 4**: Cryptographic key hierarchy (AES-256-GCM, DEK/KEK) & integrity hashing.
- **Phase 5**: Real DICOM validation, de-identification profiles, metadata handling.
- **Phase 6**: AI tamper detection modularization, Grad-CAM hooks, evaluation metrics.
- **Phase 7**: Storage provider abstraction (Local & IPFS) with explicit status.
- **Phase 8**: Blockchain provider abstraction & authorized smart contracts.
- **Phase 9**: Digital Integrity Twin continuous/on-demand lifecycle & versioning.
- **Phase 10**: Region-level self-recovery workflow with post-recovery verification.
- **Phase 11**: Backend API integration, error boundaries, rate limiting, and CORS.
- **Phase 12**: Professional healthcare cybersecurity frontend redesign & protected media loader.
- **Phase 13**: Real database-driven digital forensic reports & certificates.
- **Phase 14**: Automated unit & security test suites.
- **Phase 15**: End-to-end verification workflow.
- **Phase 16**: Documentation overhaul (`capstone_project_report.md`, `README.md`) & `FINAL_IMPLEMENTATION_REPORT.md`.
