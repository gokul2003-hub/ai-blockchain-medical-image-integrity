# AI-Driven Secure Medical Image Sharing, Integrity Verification, and Self-Recovery Platform

[![Tests](https://img.shields.io/badge/pytest-107%20passed%20(100%25)-brightgreen)](file:///backend/tests)
[![Backend](https://img.shields.io/badge/FastAPI-0.111.0-blue)](https://fastapi.tiangolo.com)
[![Frontend](https://img.shields.io/badge/React-19.0.0-61dafb)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-5.3.1-646cff)](https://vitejs.dev)
[![Compliance](https://img.shields.io/badge/HIPAA-Safe%20Harbor%20Tags-success)]()
[![Security](https://img.shields.io/badge/AES--256--GCM-Authenticated-orange)]()

A prototype platform for secure medical imaging (MRI, CT, X-Ray) sharing, automated AI tamper detection, blockchain integrity auditing, and pixel-exact region-level self-recovery.

---

## 🌟 Key System Capabilities

1. **4D Hyperchaotic & AES-256-GCM Envelope Cryptosystem:**
   - Permutes high-redundancy medical pixel matrices using 4D Chen hyperchaotic dynamic sequences.
   - Encrypts image payloads using AES-256-GCM authenticated envelope encryption with per-image Data Encryption Keys (DEKs) wrapped by a Master Key Encryption Key (KEK).
   - Additional Authenticated Data (AAD) prevents metadata manipulation or bit-flipping attacks.
   - Generates collision-resistant Keccak SHA-3 hashes for cryptographic integrity verification.

2. **DICOM Safe Harbor Tag De-Identification & Clinical Preprocessing:**
   - Strips 18 HIPAA Protected Health Information (PHI) header identifiers while preserving diagnostic modality metadata.
   - Automatically handles photometric interpretation inversions (`MONOCHROME1` to `MONOCHROME2`).
   - Extracts 2D slice representations (2D/frame-0 DICOM limitation: multi-frame volumes are rendered from frame 0; no burned-in pixel OCR redaction is performed on the pixel matrix).
   - Enhances micro-calcifications and subtle tissue contrast via Contrast Limited Adaptive Histogram Equalization (CLAHE).

3. **Hybrid AI Tamper Localization Engine (Research Prototype):**
   - **Spatial Rich Model (SRM):** High-pass directional filter kernels extract noise residuals to expose microscopic splicing, inpainting, and generative deepfake artifacts.
   - **Hybrid Swin-UNet Transformer:** Hierarchical shifted-window self-attention ($W\text{-}MSA$ and $SW\text{-}MSA$) identifies altered regions with pixel-level precision.
   - **Grad-CAM Attribution:** Produces visual heatmaps and extracts discrete bounding boxes ($X, Y, W, H$) around tampered diagnostic areas.
   - *Advisory Note:* Synthetic AI training only; no clinical validation has been performed for diagnostic reliance. All metrics reflect genuine tensor calculations.

4. **Region-Level Self-Recovery & Digital Integrity Twin:**
   - Links each image to an off-chain Digital Integrity Twin maintaining provenance and trusted hashes.
   - Automatically quarantines compromised scans upon tamper detection.
   - Restores authentic clinical pixels within tampered ROIs from trusted encrypted storage backups.
   - Performs post-recovery cryptographic SHA-3 verification and automatically releases safety quarantines upon match.

5. **Blockchain Audit Ledger & Fine-Grained Consent Control:**
   - Solidity smart contract (`MedicalAccessControl`) governing patient-to-doctor access permissions.
   - Granular Consent Grants (`view`, `download`, `analyze`, `share`, `recover`) with expiry and clinical purposes.
   - Break-Glass emergency access strictly enforced through server-side ABAC policy with immutable audit trail.
   - Built-in local Proof-of-Work SHA-3 blockchain simulation enabled by default for development/offline evaluation; external Web3 provider and EVM node required for live blockchain deployment.

6. **Hardened Full-Stack Security Architecture:**
   - Strict role-escalation lockdown: public registration assigns role `patient`; clinicians are provisioned by administrators.
   - Strong password policies (minimum 12 characters with upper-case, lower-case, and numeric characters).
   - Multi-Factor Authentication (TOTP MFA) conforming to RFC 6238.
   - Authenticated media delivery via Bearer token protected binary blobs (`fetchProtectedBlobUrl`).

7. **Zero-Knowledge Proofs (Schnorr ZKP over SECP256K1):**
   - Implements non-interactive Schnorr Zero-Knowledge Proofs of Knowledge using the Fiat-Shamir transform over the SECP256K1 elliptic curve.
   - Enables cryptographic proof of ownership/privilege without disclosing secret keys or sensitive patient identity parameters.
   - Incorporates replay context protection and domain separation tags (`schnorr-zkp-v1`).

---

## 🔬 Research Scope & System Limitations

This platform is a research prototype developed for academic evaluation and cryptographic validation. The following architectural limitations are explicitly defined:

1. **Synthetic AI Training:** Forensics models (SRM filter extraction and Swin-UNet segmentation) are trained on synthetic image datasets for evaluation and proof of concept.
2. **No Clinical Validation:** The system, AI localization heatmaps, and recovery algorithms have not been clinically validated or cleared for medical diagnostic use.
3. **2D / Frame-0 DICOM Limitation:** Multi-frame DICOM series ingest and render the primary 2D slice representation (frame 0); full 3D volumetric tensor reconstruction is not implemented.
4. **No Burned-in Pixel OCR Redaction:** DICOM de-identification applies strictly to DICOM PS 3.15 / HIPAA Safe Harbor header metadata tags. Burned-in pixel annotations or visual text overlays within image matrices are not scrubbed.
5. **Local Blockchain Simulation by Default:** The ledger operates with an internal SHA-3 Proof-of-Work SQLite simulation by default for local development and offline environments.
6. **External Web3 Required for Live Deployment:** Connecting to an immutable live ledger requires an external Web3 provider and EVM-compatible node (such as Hyperledger Besu or Ethereum) with secure key management.

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

The platform includes 107 comprehensive automated tests covering cryptography, authentication, consent management, DICOM ingestion, AI forensics, storage compensation, and self-recovery.

```powershell
# From project root:
.\backend\venv\Scripts\pytest.exe -c backend\pytest.ini backend\tests -v
```

### Test Suite Summary (100% Pass Rate - 107/107):
- `tests/test_crypto.py`: **9 passed** (AES-256-GCM, AAD tamper rejection, ciphertext bit-flip rejection, envelope unwrapping)
- `tests/test_hyperchaos.py`: **23 passed** (4D Chen dynamical system, RK4 integration, Lyapunov exponent parameters, invertible permutation)
- `tests/test_security_auth.py`: **6 passed** (role escalation lockdown, password policy, JWT flow, TOTP MFA, session revocation)
- `tests/test_authorization_consent.py`: **3 passed** (BOLA doctor rejection, Patient ConsentGrant lifecycle, Break-Glass emergency override)
- `tests/test_dicom_pipeline.py`: **17 passed** (DICOM Safe Harbor de-identification, photometric conversion, CLAHE, multi-frame extraction, atomic upload compensation)
- `tests/test_ai_forensics.py`: **5 passed** (SRM noise residual kernels, Swin-UNet forward pass, confusion matrix, tamper localization)
- `tests/test_storage_blockchain.py`: **8 passed** (Local/IPFS storage put/get, path traversal rejection, PoW blockchain, Digital Twin, Self-Recovery)
- `tests/test_end_to_end_framework.py`: **5 passed** (Digital twin lifecycle, risk/trust engine, risk-adaptive policy, SRM extraction, end-to-end recovery)
- `tests/test_ieee_upgrades.py`: **5 passed** (Schnorr non-interactive ZKP, W3C DID/VC, HL7 FHIR generation, differential privacy)
- `tests/test_recovery_engine.py`: **9 passed** (Region-level ROI reconstruction, trusted backup retrieval, post-recovery SHA-3 verification, quarantine release)
- `tests/test_zkp_security.py`: **17 passed** (SECP256K1 elliptic curve math, Fiat-Shamir challenge, response verification, replay context prevention)

**Total: 107 passed, 0 failed.**

---

## 👥 Development Testing Accounts & Safe Setup

For security, default passwords are not published in this public repository. Account credentials and initialization secrets are configured locally via your environment (`.env`).

To configure and run with local development accounts:
1. Copy `.env.example` to `.env`.
2. Configure your local administrator password (`INITIAL_ADMIN_PASSWORD`) and cryptographic keys in `.env`.
3. In local development environments (`APP_ENV=development`), the platform initializes the following role identities using passwords configured in your environment or provisioned through the administrative API:

| Role | Username | Password Source | Purpose / Access |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `superadmin` | Set via `INITIAL_ADMIN_PASSWORD` in `.env` | System oversight, hospital management, full audit logs |
| **Hospital Admin** | `hospadmin` | Provisioned by Super Admin | Hospital branch management and clinician provisioning |
| **Medical Doctor** | `drsmith` | Provisioned by Admin (`/api/v1/auth/provision-user`) | Patient diagnostic reviews, scan downloads, tamper inspection |
| **Radiologist** | `radjones` | Provisioned by Admin (`/api/v1/auth/provision-user`) | Pre-processing, DICOM uploads, SRM forensic analysis |
| **Patient** | `alice` | Registered via `/api/v1/auth/register` | Consent Grant management, smart contract permission controls |

> 🔒 **Security Notice:** Never commit actual passwords, JWT secrets, or private keys to version control. Keep `.env` and `.dev-secrets.json` gitignored.

---

## 🎬 End-to-End Demonstration Walkthrough

Follow these steps for academic presentation or reproducible evaluation:

1. **Login:**
   - Open `http://localhost:5173`.
   - Sign in with your configured clinician account (e.g. Doctor `drsmith` or Radiologist `radjones`).

2. **Upload Medical Scan:**
   - Navigate to **Upload Image**.
   - Select either a standard format (PNG/JPEG) or DICOM scan (`.dcm`).
   - Assign to patient **Alice** (ID: 1).
   - Click **Upload & Encrypt**. The system anonymizes HIPAA PHI tags, applies CLAHE contrast enhancement, permutes the pixel matrix using 4D Chen hyperchaos, encrypts with AES-256-GCM, saves the `.enc` ciphertext to storage, and anchors the SHA-3 hash to the blockchain ledger.

3. **Inspect Image:**
   - Go to **Medical Images** / **Image Viewer**.
   - Select the uploaded scan. The image is retrieved, authenticated, and decrypted in-memory for clinical review.

4. **Verify Cryptographic Integrity:**
   - Go to **Integrity Verification**.
   - Select the scan and initiate verification.
   - The system re-hashes the decrypted scan with Keccak SHA-3 and compares it with the blockchain record.
   - Initial status: **VERIFIED (Authentic)**.

5. **Simulate Tampering (Evaluation Step):**
   - In PowerShell or file explorer, locate the ciphertext file in `backend/storage/objects/`.
   - Modify or flip any byte in the `.enc` file (e.g., using Python: `with open('...', 'r+b') as f: f.seek(32); b = f.read(1); f.seek(32); f.write(bytes([b[0] ^ 0xFF]))`).
   - Return to **Integrity Verification** or **Medical Images** and attempt to verify/download.
   - The server detects the integrity violation, raises an HTTP 409 security alert, logs a tamper alert on the blockchain, and automatically transitions the image to **QUARANTINED**.

6. **AI Forensic Analysis & Localization:**
   - Open **Tamper Localization** / **AI Forensics**.
   - Review the high-pass SRM (Spatial Rich Model) directional noise residual map highlighting microscopic boundaries.
   - Review the Hybrid Swin-UNet attention overlay and Grad-CAM heatmap showing the exact altered diagnostic region with bounding box coordinates.

7. **Region-Level Self-Recovery:**
   - Navigate to **Recovery Center**.
   - Select the quarantined scan and click **Initiate Recovery**.
   - The engine loads the authentic pixel regions from the trusted Digital Integrity Twin backup, reconstructs the altered ROI coordinates, re-computes the SHA-3 hash, verifies mathematical match, releases the quarantine, and logs a `RECOVERY_COMPLETED` block to the ledger.

8. **Blockchain Audit Inspection:**
   - Navigate to **Blockchain Audit**.
   - Verify the immutable audit sequence: `UPLOAD` → `VERIFIED` → `TAMPER_ALERT` → `IMAGE_QUARANTINED` → `RECOVERY_COMPLETED`.

---

## 📚 Key API Endpoints Reference

### Authentication & Sessions
- `POST /api/v1/auth/register` — Public registration (strictly locked to role `patient`).
- `POST /api/v1/auth/provision-user` — Admin-only provisioning of doctors, radiologists, and admins.
- `POST /api/v1/auth/login` — User login; returns JWT access token and refresh token.
- `POST /api/v1/auth/mfa/setup` — Generates RFC 6238 TOTP secret and QR code URI.
- `POST /api/v1/auth/mfa/enable` — Validates TOTP code and activates MFA requirement.
- `POST /api/v1/auth/logout` — Revokes session tokens.

### Medical Images & Forensics
- `POST /api/v1/images/upload` — Uploads and encrypts standard PNG/JPEG medical scan.
- `POST /api/v1/images/upload-dicom` — Parses DICOM, strips 18 PHI tags, enhances via CLAHE, and encrypts.
- `GET /api/v1/images/download/{id}` — Authenticated image decryption with consent verification.
- `GET /api/v1/images/preview/{id}` — Authenticated preview rendering.
- `GET /api/v1/images/heatmap/{filename}` — Returns Grad-CAM visual attribution overlay.
- `GET /api/v1/images/srm-residual/{id}` — Returns SRM high-pass noise residual stream.
- `POST /api/v1/images/recover/{id}` — Executes Region-Level Self-Recovery from Digital Integrity Twin.
- `GET /api/v1/images/report/{id}/download` — Downloads forensic PDF report with real database metrics.

### Patient Consent & Permissions
- `GET /api/v1/permissions/consent` — Lists active consent grants for user.
- `POST /api/v1/permissions/consent` — Grants fine-grained action permissions to doctor/hospital.
- `DELETE /api/v1/permissions/consent/{id}` — Revokes active consent grant.
- `GET /api/v1/audit/logs` — Retrieves immutable audit records.
