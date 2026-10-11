# PROJECT BASELINE REPORT

**Project:** AI-Driven Blockchain Framework for Secure Medical Image Sharing  
**Baseline captured:** 2026-09-21  
**Python version:** 3.10.10  
**Platform:** Windows 11 (win32)

---

## Test Suite Baseline

| Metric | Value |
|--------|-------|
| Total tests collected | 43 |
| Passed | 43 |
| Failed | 0 |
| Errors | 0 |
| Warnings | 1 (urllib3 version mismatch, non-critical) |
| Run time | 25.32 seconds |

### Passing Tests by File

| Test File | Tests | Status |
|-----------|-------|--------|
| test_ai_forensics.py | 5 | ✅ All pass |
| test_authorization_consent.py | 3 | ✅ All pass |
| test_crypto.py | 9 | ✅ All pass |
| test_dicom_pipeline.py | 3 | ✅ All pass |
| test_end_to_end_framework.py | 5 | ✅ All pass |
| test_ieee_upgrades.py | 5 | ✅ All pass |
| test_security_auth.py | 6 | ✅ All pass |
| test_storage_blockchain.py | 7 | ✅ All pass |

---

## Module Implementation Status (Pre-Fix)

| Module | File | Implementation | Real/Simulated | Issues Found |
|--------|------|----------------|----------------|--------------|
| Authentication | auth.py | bcrypt, TOTP, JWT rotation, lockout | **REAL** | HS256 (asymmetric RS256 would be stronger) |
| Cryptography | crypto.py | AES-256-GCM DEK/KEK envelope | **REAL** | 4D hyperchaotic permutation claimed but absent |
| AI Tamper Detection | ai_model.py | HybridSwinUNet, SRM, Grad-CAM | **REAL** (architecture) | Trained only on 40 synthetic images |
| DICOM Preprocessing | preprocessing.py | HIPAA Safe Harbor, CLAHE | **REAL** | Missing StudyDate year-only de-ID |
| Blockchain | blockchain.py | Solidity contract + SQLite fallback | **SIMULATED** (SQLite only by default) | No deployed Hardhat node |
| IPFS | ipfs.py / storage_provider.py | Local encrypted storage | **SIMULATED** | CIDs are SHA-256 hashes, not real IPFS |
| Self-Recovery | recovery.py | Region-level ROI replacement | **BROKEN** | Recovers copy of trusted_img instead of actual compromised file |
| ZKP (Schnorr) | zkp.py | Schnorr protocol structure | **SIMULATED** | SHA-256 hashes replace EC point multiplication |
| FHE (CKKS) | fhe_engine.py | CKKS noise budget tracking | **SIMULATED** | Scale * noise ≠ encryption; no real keys |
| Differential Privacy | dp.py | Laplace noise mechanism | **REAL** | ✅ Already integrated in analytics dashboard |
| Database Models | models.py | 20+ tables, indexes, constraints | **REAL** | Redundant mfa_secret column on User |
| Risk Engine | risk_engine.py | Multi-factor score | **REAL** | Works correctly |
| Digital Twin | digital_twin.py | Integrity twin tracking | **REAL** | Works correctly |

---

## Architecture (Current)

```
React 19 + TypeScript + Vite (Frontend)
    │
    ▼
FastAPI (Backend)
    │
    ├── auth.py          ← JWT + bcrypt + TOTP [REAL]
    ├── crypto.py        ← AES-256-GCM [REAL, missing hyperchaos]
    ├── ai_model.py      ← HybridSwinUNet [REAL arch, synthetic training]
    ├── preprocessing.py ← DICOM de-ID + CLAHE [REAL]
    ├── blockchain.py    ← SQLite simulation [NEEDS Hardhat]
    ├── ipfs.py          ← Local simulation [NEEDS real IPFS]
    ├── recovery.py      ← Logic bug [NEEDS FIX]
    ├── zkp.py           ← Hash simulation [NEEDS real EC]
    ├── fhe_engine.py    ← Not real FHE [NEEDS correction]
    └── dp.py            ← Real Laplace DP [ALREADY INTEGRATED]
    │
    ├── SQLite DB (medical_sharing.db)
    └── Local Storage (backend/storage/)
```

---

## Environment

- **Backend:** FastAPI 0.111.0, SQLAlchemy 2.0.31, PyTorch 2.3.1, pydicom 2.4.4
- **Frontend:** React 19.0.0, MUI v6, Vite 5.3.1, TypeScript 5.5.2
- **Database:** SQLite (dev), PostgreSQL (prod via alembic)
- **Storage:** Local encrypted filesystem (IPFS simulation)
- **Blockchain:** LocalSimulatedBlockchain via SQLite

---

## Identified Fixes Required (Priority Order)

1. 🔴 **recovery.py** — Load actual compromised file; fix logic gap (Phase 2)
2. 🔴 **zkp.py** — Replace SHA-256 simulation with real SECP256K1 Schnorr (Phase 3)
3. 🟠 **hyperchaos.py** — Create 4D Chen system + integrate into crypto.py (Phase 4)
4. 🟠 **blockchain.py** — Hardhat local blockchain setup and deployment (Phase 5)
5. 🟠 **fhe_engine.py** — Correct to clearly labeled simulation OR real TenSEAL (Phase 8)
6. 🟡 **ai_model.py** — Add validation split, metrics, model confidence indicator (Phase 9)
7. 🟡 **ipfs.py** — Real IPFS CID validation and integration mode flags (Phase 6)
