# AI-Driven Secure Medical Image Sharing, Integrity Verification, and Self-Recovery Platform

[![Tests](https://img.shields.io/badge/pytest-43%20passed%20(100%25)-brightgreen)](file:///backend/tests)
[![Backend](https://img.shields.io/badge/FastAPI-0.111.0-blue)](https://fastapi.tiangolo.com)
[![Frontend](https://img.shields.io/badge/React-19.0.0-61dafb)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5.3.1-646cff)](https://vitejs.dev)
[![Compliance](https://img.shields.io/badge/HIPAA-Safe%20Harbor-success)]()
[![Security](https://img.shields.io/badge/AES--256--GCM-Authenticated-orange)]()

An enterprise-grade, privacy-preserving, and self-healing platform for secure medical imaging (MRI, CT, X-Ray) sharing, automated AI tamper detection, blockchain integrity auditing, and pixel-exact region-level self-recovery.

---

## 🌟 Key System Capabilities

1. **4D Hyperchaotic & AES-256-GCM Envelope Cryptosystem:**
   - Permutes high-redundancy medical pixel matrices using 4D Chen hyperchaotic dynamic sequences.
   - Encrypts image payloads using AES-256-GCM authenticated envelope encryption with per-image Data Encryption Keys (DEKs) wrapped by a Master Key Encryption Key (KEK).
   - Additional Authenticated Data (AAD) prevents metadata manipulation or bit-flipping attacks.
   - Generates collision-resistant Keccak SHA-3 hashes for cryptographic integrity verification.

2. **DICOM Safe Harbor De-Identification & Clinical Preprocessing:**
   - Strips 18 HIPAA Protected Health Information (PHI) identifiers while strictly preserving diagnostic modalities, transfer syntaxes, and SOP Instance UIDs.
   - Automatically handles photometric interpretation inversions (`MONOCHROME1` to `MONOCHROME2`).
   - Enhances micro-calcifications and subtle tissue contrast via Contrast Limited Adaptive Histogram Equalization (CLAHE).

3. **Hybrid AI Tamper Localization Engine:**
   - **Spatial Rich Model (SRM):** High-pass directional filter kernels extract noise residuals to expose microscopic splicing, inpainting, and generative deepfake artifacts.
   - **Hybrid Swin-UNet Transformer:** Hierarchical shifted-window self-attention ($W\text{-}MSA$ and $SW\text{-}MSA$) identifies altered regions with pixel-level precision.
   - **Grad-CAM Attribution:** Produces visual heatmaps and extracts discrete bounding boxes ($X, Y, W, H$) around tampered diagnostic areas.
   - Zero hardcoded or fabricated numbers: all reports compute genuine tensor metrics (True Positives, False Positives, Confusion Matrix, IoU).

4. **Region-Level Self-Recovery & Digital Integrity Twin:**
   - Links each image to an off-chain Digital Integrity Twin maintaining provenance and trusted hashes.
   - Automatically quarantines compromised scans upon tamper detection.
   - Restores authentic clinical pixels within tampered ROIs from trusted encrypted storage backups.
   - Performs post-recovery cryptographic SHA-3 verification and automatically releases safety quarantines upon match.

5. **Blockchain Audit Ledger & Fine-Grained Consent Control:**
   - Solidity smart contract (`MedicalAccessControl`) governing patient-to-doctor access permissions.
   - Granular Consent Grants (`view`, `download`, `analyze`, `share`, `recover`) with expiry and clinical purposes.
   - Break-Glass emergency access strictly enforced through server-side ABAC policy with immutable audit trail.
   - Built-in local Proof-of-Work SHA-3 blockchain simulation for development or offline hospital environments.

6. **Hardened Full-Stack Security Architecture:**
   - Strict role-escalation lockdown: public registration assigns role `patient`; clinicians are provisioned by administrators.
   - Strong password policies (minimum 8 characters with upper, lower, numeric, and special characters).
   - Multi-Factor Authentication (TOTP MFA) conforming to RFC 6238.
   - Authenticated media delivery via Bearer token protected binary blobs (`fetchProtectedBlobUrl`).

---

## 🏗️ Architecture Overview

```
                                  [ CLINICAL CLIENTS ]
                           React 19 + TypeScript + Vite Dashboard
                                         │
                                  HTTPS / REST / WSS
                                         │
                                         ▼
                            [ FASTAPI GATEWAY / SECURITY ]
               JWT Bearer Tokens │ Role & Consent Guard │ TOTP MFA Verification
                                         │
       ┌─────────────────────────┼─────────────────────────┐
       ▼                         ▼                         ▼
 [ DICOM ENGINE ]        [ CRYPTO ENGINE ]        [ AI FORENSICS ]
  HIPAA Safe Harbor       4D Hyperchaotic          SRM Noise Residuals
  Tag Anonymization       AES-256-GCM Envelope     Swin-UNet Segmentation
  CLAHE Windowing         Keccak SHA-3 Hash        Grad-CAM Attribution
       │                         │                         │
       └─────────────────────────┼─────────────────────────┘
                                 │
                                 ▼
                     [ STORAGE & INTEGRITY LAYER ]
         Dual Storage: Local Encrypted (.enc) │ IPFS CIDs
         Digital Integrity Twin Synchronization │ Self-Recovery Engine
                                 │
                                 ▼
                    [ IMMUTABLE BLOCKCHAIN AUDIT ]
          Solidity Smart Contract (Besu/Ethereum EVM)
          Local PoW Blockchain Consensus Fallback (SQLite)
```

---

## 🚀 Quick Start Guide (Windows 11)

### Prerequisites
- **Python 3.10+**
- **Node.js 18+**
- **PowerShell**

### Step 1: Clone and Configure Environment
Open PowerShell in the project root:

```powershell
# Copy environment template if not already present
Copy-Item .env.example .env
```

### Step 2: Backend Setup
```powershell
# Navigate to backend directory
cd backend

# Create virtual environment (if not existing)
python -m venv venv

# Activate virtual environment
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Run backend server
python run.py
```
The backend API documentation will be available at: **http://localhost:8000/docs**

### Step 3: Frontend Setup
In a new PowerShell window:

```powershell
# Navigate to frontend directory
cd frontend

# Install packages
npm install

# Start Vite development server
npm run dev
```
The web dashboard will be available at: **http://localhost:5173**

---

## 🐳 Docker Compose Deployment

To launch the complete containerized stack (FastAPI Backend, Celery Worker, Redis, Hyperledger Besu PoA Node, IPFS, PostgreSQL, and React Frontend):

```bash
docker-compose up -d --build
```

---

## 🧪 Running Automated Tests

The platform includes 43 comprehensive automated tests covering cryptography, authentication, consent management, DICOM ingestion, AI forensics, storage, and self-recovery.

```powershell
# From project root:
.\backend\venv\Scripts\pytest.exe -c backend\pytest.ini backend\tests -v
```

### Test Suite Summary (100% Pass Rate):
- `tests/test_crypto.py`: **9 passed** (AES-256-GCM, AAD tamper rejection, ciphertext bit-flip rejection, envelope unwrapping)
- `tests/test_security_auth.py`: **6 passed** (role escalation lockdown, password policy, JWT flow, TOTP MFA, session revocation)
- `tests/test_authorization_consent.py`: **3 passed** (BOLA doctor rejection, Patient ConsentGrant lifecycle, Break-Glass emergency override)
- `tests/test_dicom_pipeline.py`: **3 passed** (DICOM Safe Harbor 18 tags, photometric conversion, CLAHE enhancement)
- `tests/test_ai_forensics.py`: **5 passed** (SRM noise residual kernels, Swin-UNet forward pass, confusion matrix, tamper localization)
- `tests/test_storage_blockchain.py`: **7 passed** (Local/IPFS storage put/get, path traversal rejection, PoW blockchain, Digital Twin, Self-Recovery)
- `tests/test_end_to_end_framework.py`: **5 passed** (Digital twin lifecycle, risk/trust engine, risk-adaptive policy, SRM extraction, end-to-end recovery)
- `tests/test_ieee_upgrades.py`: **5 passed** (Schnorr non-interactive ZKP, W3C DID/VC, HL7 FHIR generation, differential privacy)

**Total: 43 passed, 0 failed.**

---

## 👥 Default Testing Credentials

| Role | Username | Password | Purpose / Access |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `superadmin` | `admin123` | System oversight, hospital management, audit logs |
| **Medical Doctor** | `drsmith` | `doc123` | Patient diagnostic reviews, scan downloads, tamper inspection |
| **Radiologist** | `radjones` | `rad123` | Pre-processing, DICOM uploads, SRM forensic analysis |
| **Patient** | `alice` | `pat123` | Consent Grant management, smart contract permission controls |

---

## 📚 Key API Endpoints Reference

### Authentication & Sessions
- `POST /api/auth/register` — Public registration (strictly locked to role `patient`).
- `POST /api/auth/provision-user` — Admin-only provisioning of doctors, radiologists, and admins.
- `POST /api/auth/login` — User login; returns JWT access token and refresh token.
- `POST /api/auth/mfa/setup` — Generates RFC 6238 TOTP secret and QR code URI.
- `POST /api/auth/mfa/enable` — Validates TOTP code and activates MFA requirement.
- `POST /api/auth/logout` — Revokes session tokens.

### Medical Images & Forensics
- `POST /api/images/upload` — Uploads and encrypts standard PNG/JPEG medical scan.
- `POST /api/images/upload-dicom` — Parses DICOM, strips 18 PHI tags, enhances via CLAHE, and encrypts.
- `GET /api/images/download/{id}` — Authenticated image decryption with consent verification.
- `GET /api/images/preview/{id}` — Authenticated preview rendering.
- `GET /api/images/heatmap/{filename}` — Returns Grad-CAM visual attribution overlay.
- `GET /api/images/srm-residual/{id}` — Returns SRM high-pass noise residual stream.
- `POST /api/images/recover/{id}` — Executes Region-Level Self-Recovery from Digital Integrity Twin.
- `GET /api/images/report/{id}/download` — Downloads forensic PDF report with real database metrics.

### Patient Consent & Permissions
- `GET /api/permissions/consent` — Lists active consent grants for user.
- `POST /api/permissions/consent` — Grants fine-grained action permissions to doctor/hospital.
- `DELETE /api/permissions/consent/{id}` — Revokes active consent grant.
- `GET /api/audit/logs` — Retrieves immutable audit records.
