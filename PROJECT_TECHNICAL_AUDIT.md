# PROJECT TECHNICAL AUDIT & ARCHITECTURE DECISION REPORT

**Project Title**: An AI-Driven Blockchain Framework for Continuous Medical Image Integrity Verification, Tamper Forensics, and Self-Recovery  
**Date**: August 26, 2026  
**Auditor**: Senior AI/ML, Cybersecurity, Blockchain & Research Software Architect  

---

## 1. CURRENT PROJECT AUDIT TABLE (PHASE 1 & 2)

| FEATURE | STATUS | IMPLEMENTATION QUALITY | EVIDENCE | ACTION REQUIRED |
| :--- | :--- | :--- | :--- | :--- |
| **Medical Image Preprocessing** | Fully Working | High Quality | `backend/app/preprocessing.py`: Noise removal (Median filter), CLAHE contrast enhancement, 512x512 cubic resize, DICOM parsing via pydicom. | **KEEP** |
| **4D Chen Hyperchaotic Encryption** | Fully Working | High Quality | `backend/app/crypto.py`: RK4 numerical integration of 4D Chen system ($x_0, y_0, z_0, w_0$), permutation vector, XOR diffusion, tested in `test_crypto.py`. | **KEEP & PRESERVE** |
| **AES-256 Encryption** | Fully Working | High Quality | `backend/app/crypto.py`: AES-256-CBC for scrambled bytes + AES-GCM for metadata encapsulation key management. | **KEEP** |
| **SHA-3 Integrity Verification** | Fully Working | High Quality | `backend/app/crypto.py`: `sha3_hash()` using native `hashlib.sha3_256`. Verified in tests. | **KEEP** |
| **Digital Integrity Twin** | Missing / Mock | Low (Implicit DB columns only) | No dedicated `DigitalIntegrityTwin` entity or lifecycle tracking region-level integrity history & twin state. | **IMPLEMENT** |
| **IPFS / Decentralized Storage** | Fully Working | Production + Fallback | `backend/app/ipfs.py`: Multi-gateway HTTP client + local `storage/ipfs_sim` fallback cache. | **KEEP** |
| **Blockchain Integration** | Fully Working | Production + Fallback | `backend/app/blockchain.py`: Web3 connector (EVM / Besu IBFT 2.0 zero-gas) + local PoW `LocalSimulatedBlockchain`. | **KEEP** |
| **Smart Contracts** | Fully Working | High Quality | `backend/app/blockchain.py`: `MedicalAccessControl` Solidity contract (`registerImage`, `grantAccess`, `revokeAccess`, `verifyAccess`, `logAudit`). | **KEEP** |
| **Role-Based Access Control (RBAC)** | Fully Working | High Quality | `backend/app/auth.py`, `routes/permissions.py`: Roles (`super_admin`, `hospital_admin`, `doctor`, `radiologist`, `patient`). | **KEEP** |
| **Time-Bound Permissions** | Fully Working | High Quality | `backend/app/models.py`, `blockchain.py`: `expires_at` column enforced during contract & DB access verification. | **KEEP** |
| **Continuous Integrity Verification** | Partially Working | Medium | Hash check performed on download in `routes/images.py`. Needs expansion across upload, share, & post-recovery. | **IMPROVE & EXPAND** |
| **SRM / Noise Forensic Filter** | Partially Working | Medium | `backend/app/ai_model.py`: `SrmNoiseFilter` with 3 kernels. SRM residual extraction is NOT visually exposed for debugging. | **IMPROVE & EXPOSE UI** |
| **Hybrid Swin-UNet Model** | Fully Working | High Quality | `backend/app/ai_model.py`: `HybridSwinUNet` combining SRM stream + Swin Transformer blocks + Attention Gates + U-Net decoder. | **KEEP & REFINE** |
| **Attention Mechanism** | Fully Working | High Quality | `backend/app/ai_model.py`: `AttentionGate` filtering skip connections with gating signals. | **KEEP** |
| **Grad-CAM Explainability** | Fully Working | High Quality | `backend/app/ai_model.py`: Bottleneck activation hooks generating Jet-colormap overlays. | **KEEP** |
| **Tamper Risk Score** | Missing / Mock | Low | Hardcoded percentage/confidence returned without multi-factor Risk Score engine (0–100 scale: Low, Med, High). | **IMPLEMENT** |
| **Cybersecurity Trust Score** | Missing | Low | No independent Trust Score calculating system health, provenance, and authorization validity. | **IMPLEMENT** |
| **Risk-Adaptive Access Control** | Missing | Low | Access is binary (allow/deny) rather than adaptive (Low -> Normal, Med -> Verification, High -> Quarantine). | **IMPLEMENT** |
| **Image Quarantine** | Missing | Low | Compromised images are not automatically moved to a `QUARANTINED` state to block unauthorized distribution. | **IMPLEMENT** |
| **Region-Level Self-Recovery** | Missing | Low | No self-recovery engine. Tampered images are flagged but ROI replacement from trusted IPFS backup is missing. | **IMPLEMENT** |
| **Post-Recovery Integrity Check** | Missing | Low | No SHA-3 re-hashing, twin updating, or post-recovery verification after recovery. | **IMPLEMENT** |
| **Blockchain Forensic Audit** | Partially Working | Medium | Logs basic actions. Missing specific audit events (`RECOVERY_STARTED`, `RECOVERY_COMPLETED`, `IMAGE_QUARANTINED`). | **EXPAND** |
| **Security Alerts & PDF Reporting** | Fully Working | High Quality | `backend/app/report.py` (ReportLab PDF), `notifications.py` (WebSockets). | **KEEP** |
| **Synthetic Dataset & Training** | Fully Working | High Quality | `backend/app/ai_model.py`: `SyntheticMedicalDataset` with brain MRI simulation + copy-move/blur/lesion tampering. | **KEEP** |

---

## 2. GITHUB RESEARCH REPOSITORIES ANALYSIS (PHASE 3)

| REPOSITORY | PURPOSE | USEFUL IDEAS / CODE | WHAT NOT TO COPY | SELECTION DECISION |
| :--- | :--- | :--- | :--- | :--- |
| **1. HuCaoFighting/Swin-Unet** | Medical Image Segmentation using Swin Transformer U-Net | Shifted Window Self-Attention (W-MSA / SW-MSA) blocks for spatial representation. | Standard Swin-Unet is for organ segmentation, not noise forensic analysis. Do not copy non-forensic backbone directly. | Adapted Swin Transformer encoder block into our dual-stream architecture. |
| **2. free1dom1/TBFormer** | Image Forgery Localization via Two-Branch Transformer | Dual-branch concept: **Branch 1 (RGB spatial)** + **Branch 2 (SRM Noise residuals)** + **Hierarchical Attention Fusion**. | Full heavy multi-stage training dependencies for general photography images. | **SELECTED AS CORE INSPIRATION**: Dual-branch (RGB + SRM Noise) + Attention Fusion. |
| **3. multimediaFor/ProFact** | Progressive Feedback-Enhanced Transformer | Iterative feedback loops between decoder and encoder for boundary refinement. | High computational overhead, recursive inference passes inappropriate for real-time medical API response. | **NOT SELECTED**: Too slow for real-time clinical API integration. |
| **4. jacobgil/pytorch-grad-cam** | Grad-CAM and Explainability for PyTorch | Bottleneck gradient & activation hook mechanism for attribution heatmap generation. | Complex multi-layer wrapper classes for basic U-Net structures. | Reused clean native PyTorch activation/gradient hook pattern inside our AI model. |
| **5. Riadh-Bouarroudj/Image-encryption** | Chaotic and Hyperchaotic Image Encryption | 4D Chen hyperchaotic system equations, RK4 numerical solver concepts. | Naive image pixel shuffling without standard AES wrapper (vulnerable to known-plaintext attacks). | Preserved our existing **4D Chen Map + AES-256 Hybrid** system which is cryptographically superior. |
| **6. Itshyphen/meDossier** | Blockchain + IPFS Medical Record Architecture | IPFS CID off-chain storage pattern with hash pointer on smart contract. | Monolithic Solidity structures without time-bound expiry. | Kept our existing Web3 + IPFS architecture pattern. |
| **7. Vedant2254/EHR-LockChain** | Blockchain + IPFS + Access Control Smart Contracts | On-chain permission validation prior to IPFS retrieval execution. | Hardcoded RPC endpoints and lack of simulated fallback mode. | Integrated on-chain smart contract permission checking in `check_smart_contract_permission()`. |
| **8. openwallet-foundation-labs/ehr-wallet** | Modern Healthcare Blockchain Architecture | Granular role permissions, time-bound validity, decentralized data handling principles. | Heavy identity wallet frontend dependencies. | Adapted time-bound access invalidation & granular RBAC structure into our backend. |
| **9. orekiiftw/frieren** | Healthcare Full-Stack AI + Blockchain + IPFS | Unified full-stack pipeline flow from client upload to IPFS/Blockchain and AI verification. | Redundant boilerplate code. | Used to validate overall single-system pipeline cohesion. |

---

## 3. TECHNICAL ARCHITECTURE DECISIONS (PHASE 4 & 5)

### AI Forensics Architecture Decision
* **Selected Approach**: **Hybrid Medical Image Tamper Localization Network**
* **Justification**: Combines TBFormer's dual-branch concept (RGB spatial stream + SRM noise residual stream) with Swin-UNet's hierarchical transformer blocks and Attention Gates. Medical image tampering (e.g. copy-move, splicing, inpainting) leaves high-frequency noise inconsistencies detectable by SRM filter banks, while Swin Transformer blocks capture global spatial anatomical context.

### Encryption Architecture Decision
* **Selected Approach**: **4D Chen Hyperchaotic System + AES-256-CBC + AES-GCM Metadata KEM**
* **Justification**: Our existing implementation derives initial state parameters $(x_0, y_0, z_0, w_0)$ from the SHA-3 hash of the image, runs RK4 numerical integration to generate permutation indices and XOR diffusion masks, applies standard AES-256-CBC encryption to scrambled bytes, and encapsulates metadata using AES-GCM. This fulfills all cryptographic requirements and matches top-tier security standards.

### Blockchain Architecture Decision
* **Selected Approach**: **Web3 Ethereum EVM / Besu PoA Client with Local PoW Simulation Fallback**
* **Justification**: Stores light metadata (image ID, SHA-3 original hash, IPFS CID, patient ID, timestamps, audit events) on-chain while keeping heavy medical images off-chain in IPFS. Provides seamless fallback to local Python POW blockchain ledger when a live blockchain node is not connected.

### Storage Architecture Decision
* **Selected Approach**: **IPFS Decentralized Storage with Multi-Gateway Failover & Local Cache**
* **Justification**: Guarantees high availability for encrypted medical scans via multi-gateway failover (`ipfs.io`, `cloudflare-ipfs`, `pinata`) and local simulation cache.

### Digital Integrity Twin Architecture Decision
* **Selected Approach**: **First-Class DB Entity & Verification Engine**
* **Justification**: Real data structure containing image ID, trusted SHA-3 hash, metadata, provenance, IPFS CID, verification history, and region-level ROI integrity maps.

### Risk & Access Control Architecture Decision
* **Selected Approach**: **Dual Risk/Trust Engine with Risk-Adaptive Access Control & Image Quarantine**
* **Justification**: Computes **Tamper Risk Score** ($0-100$) and **Cybersecurity Trust Score** ($0-100$) independently using transparent mathematical formulas. Enforces adaptive policies: Low Risk -> Normal Access; Medium Risk -> Secondary ZKP Verification; High Risk -> Automatic Image Quarantine & Self-Recovery Workflow.

### Self-Recovery Architecture Decision
* **Selected Approach**: **Region-Level Masked ROI Self-Recovery Engine**
* **Justification**: Uses AI tamper mask to bound tampered regions, retrieves trusted original encrypted backup from IPFS, decrypts it, extracts matching trusted ROI coordinates, and blends them into the compromised image. Re-computes SHA-3 hash, updates Digital Integrity Twin, and logs post-recovery audit event on blockchain.

---

## 4. ACTION PLAN FOR PHASE 6 THROUGH 24

1. **Phase 6 & 7 (AI & SRM Noise Residual)**:
   - Expose SRM noise residual visual extraction in AI inference response & UI.
2. **Phase 8 (Grad-CAM)**:
   - Verify Grad-CAM operates on actual model predictions and bottleneck features.
3. **Phase 10 (Digital Integrity Twin)**:
   - Implement `DigitalIntegrityTwin` model and service in backend.
4. **Phase 14 & 15 (Risk & Trust Scores)**:
   - Implement `backend/app/risk_engine.py` to calculate transparent multi-factor scores.
5. **Phase 16 (Risk-Adaptive Access & Quarantine)**:
   - Implement automatic quarantine state and risk-adaptive access policy checks.
6. **Phase 17 & 18 (Region-Level Self-Recovery & Blockchain Audit)**:
   - Implement `backend/app/recovery.py` for region-level ROI replacement, post-recovery SHA-3 verification, twin update, and blockchain event logging.
7. **Phase 20 & 24 (Evaluation & End-to-End Test)**:
   - Execute full end-to-end verification flow and record clean empirical metrics.
