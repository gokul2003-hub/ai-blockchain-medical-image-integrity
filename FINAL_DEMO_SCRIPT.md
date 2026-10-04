# MediSecure AI — 12-Minute Academic Viva Demonstration Script

**Project**: MediSecure AI — An AI-Driven Blockchain Framework for Continuous Medical Image Integrity Verification, Tamper Forensics, and Self-Recovery  
**Target Duration**: 10–15 Minutes  
**Presentation Setting**: PhD / Master's Dissertation Defense, External Examiner Viva, or Technical Review Panel  

---

## Demonstration Sequence Overview

```
[00:00 - 01:00] Step 1: System Introduction & Architectural Philosophy
[01:00 - 02:00] Step 2: Patient Portal & Sovereign Consent Governance
[02:00 - 03:00] Step 3: Doctor / Radiologist Login & Clinical Repository
[03:00 - 04:00] Step 4: Medical Image Ingestion & Cryptographic Pipeline
[04:00 - 04:45] Step 5: Digital Integrity Twin Instantiation
[04:45 - 05:30] Step 6: Normal Continuous Integrity Verification
[05:30 - 06:30] Step 7: Controlled Tampering Event & Cryptographic Mismatch
[06:30 - 07:30] Step 8: AI Forensic Localization (SRM + Hybrid Swin-UNet)
[07:30 - 08:15] Step 9: Explainable AI via Grad-CAM Visual Activation
[08:15 - 09:00] Step 10: Multi-Factor Tamper Risk & Platform Trust Scoring
[09:00 - 09:30] Step 11: Risk-Adaptive Access Control & Visual Quarantine
[09:30 - 10:15] Step 12: Region-Level Self-Recovery Mechanics
[10:15 - 10:45] Step 13: Post-Recovery Cryptographic SHA-3 Re-Verification
[10:45 - 11:15] Step 14: Distributed Blockchain Ledger Audit Trail
[11:15 - 11:45] Step 15: Multi-Dimensional Forensic Evidence API Dossier
[11:45 - 12:15] Step 16: Automated Cryptographic PDF Forensic Report
[12:15 - 12:45] Step 17: Hospital Administrator Security & Node Governance
[12:45 - 13:15] Step 18: Authorized Researcher View (De-identified & FHE Simulation)
[13:15 - 14:00] Step 19: Transparent Academic Limitations Disclosure
[14:00 - 14:30] Step 20: Conclusion & Examiner Q&A Transition
```

---

## Detailed Step-by-Step Demonstration Script

### Step 1: System Introduction & Architectural Philosophy [00:00 - 01:00]
- **What to Display**: MediSecure AI Home Screen / Architecture Overview (`FINAL_ARCHITECTURE.md`).
- **What to Explain**: 
  - The fundamental vulnerability in modern healthcare imaging: PACS and DICOM files stored across untrusted cloud repositories are vulnerable to sophisticated cyberattacks (ransomware, silent adversarial manipulation, and unauthorized modification).
  - MediSecure AI introduces a four-pillar defense-in-depth model:
    1. Pre-encryption hyperchaotic diffusion (4D Chen) + AES-256-GCM authenticated cipher.
    2. Dynamic Digital Integrity Twins anchored to a blockchain provenance ledger.
    3. AI-driven forensic tamper localization using SRM high-pass residual filtering and Hybrid Swin-UNet.
    4. Surgical region-level self-recovery restoring original anatomical pixels without requiring total re-transmission.
- **Evidence Reference**: `phase5_final_evidence/08_dissertation_traceability/dissertation_traceability_matrix.md`.

---

### Step 2: Patient Portal & Sovereign Consent Governance [01:00 - 02:00]
- **What to Click**: Login as `alice` (Patient). Navigate to `/patient/consent`.
- **What Appears**: Patient Dashboard showing authorized medical scans, active consent grants with countdown timers, and an access revocation button.
- **What to Explain**:
  - Compliance with HIPAA and GDPR patient data sovereignty.
  - Patients hold ultimate authority to grant fine-grained, time-bounded access to specific clinicians with explicit purpose limitation (`CLINICAL_TREATMENT`).
  - Demonstrate clicking "Revoke Access" — show that revocation is recorded immediately at the database and smart contract levels.
- **Evidence Reference**: `phase5_final_evidence/01_patient_workflow/patient_workflow_evidence.json`.

---

### Step 3: Doctor / Radiologist Login & Clinical Repository [02:00 - 03:00]
- **What to Click**: Logout, log in as `drsmith` (Doctor / Radiologist). Navigate to `/doctor/images`.
- **What Appears**: Clinical Image Repository displaying accessible patient scans authorized via active patient consent.
- **What to Explain**:
  - Strict RBAC: Doctor only sees images where active consent exists or images registered under their hospital.
  - Each scan displays its cryptographic status badge: `VERIFIED`, `QUARANTINED`, or `RECOVERED`.
- **Evidence Reference**: `phase5_final_evidence/02_doctor_workflow/doctor_workflow_evidence.json`.

---

### Step 4: Medical Image Ingestion & Cryptographic Pipeline [03:00 - 04:00]
- **What to Click**: Navigate to `/doctor/upload`. Select a DICOM scan or brain MRI phantom. Click "Upload & Secure".
- **What Appears**: Upload progress showing three pipeline stages:
  1. *4D Chen Hyperchaotic Diffusion*: Adjacent pixel correlation eliminated (Horizontal: 0.0011, Vertical: -0.0002).
  2. *AES-256-GCM Encryption*: Ciphertext payload with 128-bit authentication tag and authenticated additional data (AAD).
  3. *SHA3-256 Anchoring*: Cryptographic digest calculated on preprocessed plaintext.
- **What to Explain**:
  - Explain why standard AES alone is insufficient for medical images: high spatial redundancy in DICOM scans can leak contours. The 4D Chen hyperchaotic map provides non-linear pseudo-random diffusion, achieving IEEE-compliant NPCR (>99.6%) and UACI (~33.5%).
- **Evidence Reference**: `phase5_final_evidence/09_performance/performance_summary.json`.

---

### Step 5: Digital Integrity Twin Instantiation [04:00 - 04:45]
- **What to Click**: Click on the newly uploaded image; navigate to `/doctor/verify/:id`.
- **What Appears**: Digital Integrity Twin Card displaying:
  - Trusted SHA3-256 Hash: `a4e33e3fce5a979e...`
  - Storage Reference / IPFS CID: `32ec0f8fc2c447c1...`
  - Lifecycle Status: `VERIFIED`
  - Provenance: Uploader ID, Hospital ID, UTC Timestamp.
- **What to Explain**:
  - The Digital Twin is an off-chain/on-chain synchronized state machine tracking the authoritative integrity baseline of the medical object throughout its entire archival lifecycle.
- **Evidence Reference**: `backend/app/digital_twin.py`.

---

### Step 6: Normal Continuous Integrity Verification [04:45 - 05:30]
- **What to Click**: Click "Verify Image Integrity".
- **What Appears**: Verification animation; green confirmation banner: `"Integrity Verified: Authoritative SHA-3 Digest matches stored ciphertext."`
- **What to Explain**:
  - Continuous on-access verification re-computes the SHA-3 hash of the decrypted image and compares it to the Digital Twin's trusted hash in 0.02ms.
  - Zero performance overhead for routine clinical workflows.
- **Evidence Reference**: `phase5_final_evidence/05_image_security_lifecycle/lifecycle_evidence.json`.

---

### Step 7: Controlled Tampering Event & Cryptographic Mismatch [05:30 - 06:30]
- **What to Click**: In demonstration interface or execution terminal, trigger "Simulate Malicious Tampering" (controlled synthetic lesion injection: a 18-pixel circular perturbation inserted into brain tissue).
- **What Appears**: 
  - Re-computed SHA-3 hash: `f0c822749e...` (Mismatch detected!).
  - System immediately triggers red alert banner: `"CRYPTOGRAPHIC TAMPERING DETECTED"`.
- **What to Explain**:
  - Avalanche effect of SHA-3: modifying even a single bit in a 256x256 image completely changes the 256-bit cryptographic digest.
  - The system detects the tamper event before the image is displayed to the clinician, preventing diagnostic misinterpretation.
- **Evidence Reference**: `phase5_final_evidence/06_security_negative_tests/negative_test_results.json` (Test 6).

---

### Step 8: AI Forensic Localization (SRM + Hybrid Swin-UNet) [06:30 - 07:30]
- **What to Click**: Click "Analyze AI Forensics" or navigate to `/doctor/forensics/:id`.
- **What Appears**: AI Forensic Panel showing:
  - *SRM Residual Noise Map*: Exposes high-frequency filtering artifacts along the manipulated boundary.
  - *Swin-UNet Heatmap*: Shifted-window transformer segmenting the exact manipulated region.
  - *Tamper Metrics*: Coverage: `95.9%`, AI Confidence: `97.57% (HIGH_CONFIDENCE_TAMPER)`.
  - *Bounding Box Coordinates*: `[x: 102, y: 102, w: 36, h: 36]`.
- **What to Explain**:
  - Traditional perceptual hashing only detects *that* tampering occurred, not *where*.
  - MediSecure AI's SRM layer filters out anatomical structures, leaving only microscopic sensor noise anomalies. The Swin-UNet transformer then accurately segments the manipulated boundary.
- **Evidence Reference**: `backend/app/ai_model.py`.

---

### Step 9: Explainable AI via Grad-CAM Visual Activation [07:30 - 08:15]
- **What to Click**: Toggle "Show Grad-CAM Explainability".
- **What Appears**: Jet-colormap gradient activation overlay showing focused model attention centered on the tampered lesion.
- **What to Explain**:
  - Medical AI must not be a black box. Grad-CAM computes gradients with respect to the final convolutional bottleneck, visually proving to the radiologist *why* the AI flagged this specific region as malicious.
- **Evidence Reference**: `phase5_final_evidence/05_image_security_lifecycle/lifecycle_evidence.json`.

---

### Step 10: Multi-Factor Tamper Risk & Platform Trust Scoring [08:15 - 09:00]
- **What to Click**: View Risk Breakdown Card.
- **What Appears**:
  - *Tamper Risk Score*: `99.47 / 100` (Category: `HIGH`).
  - *Cybersecurity Trust Score*: `0.0 / 100` (Level: `CRITICAL`).
- **What to Explain**:
  - Explain the multi-factor scoring formula: combines AI confidence ($C_{ai}$), tampered pixel percentage ($P_{cov}$), SHA-3 mismatch flag ($F_{sha3}$), and blockchain provenance verification ($F_{bc}$).
  - A single cryptographic failure caps the trust score at 0 until recovery is certified.
- **Evidence Reference**: `backend/app/risk_engine.py`.

---

### Step 11: Risk-Adaptive Access Control & Visual Quarantine [09:00 - 09:30]
- **What to Click**: Attempt to click "Download Decrypted Image" on the tampered scan.
- **What Appears**: Modal blocked with `HTTP 409 Conflict: Download restricted for quarantined scan`. The preview displays a diagonal watermark: `"SECURITY ALERT: QUARANTINED SCAN"`.
- **What to Explain**:
  - Zero-trust principle: compromised diagnostic images must never enter clinical records. The system dynamically enforces quarantine, preventing clinical misdiagnosis while retaining the scan for legal forensics.
- **Evidence Reference**: `phase5_final_evidence/06_security_negative_tests/negative_test_results.json` (Tests 14 & 15).

---

### Step 12: Region-Level Self-Recovery Mechanics [09:30 - 10:15]
- **What to Click**: Click "Initiate Region-Level Self-Recovery" (`/doctor/recover/:id`).
- **What Appears**: Recovery execution modal displaying:
  1. *ROI Coordinate Extraction*: `(102, 102, 36, 36)`.
  2. *Secure Backup Retrieval*: Fetched trusted slice from encrypted storage using Digital Twin CID.
  3. *Surgical Inpainting*: Replaced corrupted pixels with authentic backup pixels.
  4. *Reconstructed Image Generated*.
- **What to Explain**:
  - Highlight the core novelty: Instead of discarding the scan or re-transmitting gigabytes of 3D DICOM volumes, MediSecure AI performs surgical region-level restoration using the bounding boxes supplied by the Swin-UNet model.
- **Evidence Reference**: `backend/app/recovery.py`.

---

### Step 13: Post-Recovery Cryptographic SHA-3 Re-Verification [10:15 - 10:45]
- **What to Click**: View post-recovery verification status.
- **What Appears**:
  - Post-Recovery SHA-3 Hash: `a4e33e3fce5a979e...`
  - Authoritative Trusted Hash: `a4e33e3fce5a979e...`
  - Match: **100% Cryptographic Parity** (`True`).
  - Digital Twin Status: Updated to `RECOVERED`.
  - Quarantine Status: Automatically reset to `False`.
- **What to Explain**:
  - Recovery is not considered successful until the post-recovery SHA-3 hash matches the pre-tamper trusted hash bit-for-bit.
- **Evidence Reference**: `phase5_final_evidence/05_image_security_lifecycle/lifecycle_evidence.json`.

---

### Step 14: Distributed Blockchain Ledger Audit Trail [10:45 - 11:15]
- **What to Click**: Navigate to `/admin/blockchain` and `/admin/verify-ledger`.
- **What Appears**:
  - Blockchain transaction table showing `UPLOAD`, `TAMPER_ALERT`, and `RECOVERY_COMPLETED` transactions.
  - "Verify Entire Ledger" output: `"Blockchain ledger integrity verified successfully. 574 blocks traversed, 0 broken links."`
- **What to Explain**:
  - Proof of immutability: Every state transition (upload, alert, recovery) is timestamped and cryptographically linked to the preceding block. An attacker cannot retroactively alter hospital audit logs.
- **Evidence Reference**: `phase5_final_evidence/03_admin_workflow/admin_workflow_evidence.json`.

---

### Step 15: Multi-Dimensional Forensic Evidence API Dossier [11:15 - 11:45]
- **What to Click**: Navigate to `/doctor/evidence/:id`.
- **What Appears**: Comprehensive JSON forensic dossier displaying 14 structured attributes: original hash, current hash, AI bounding boxes, risk metrics, blockchain transaction IDs, and IPFS CIDs.
- **What to Explain**:
  - Standardized forensic evidence interchange suitable for legal admissibility and cyber-incident regulatory reporting (e.g., HHS OCR breach investigations).
- **Evidence Reference**: `GET /api/v1/images/{id}/integrity-evidence`.

---

### Step 16: Automated Cryptographic PDF Forensic Report [11:45 - 12:15]
- **What to Click**: Click "Download Forensic PDF Report".
- **What Appears**: PDF opens in viewer (`Phase5_Forensic_Report_22.pdf`). Features:
  - Header: Hospital name, patient MRN, timestamp.
  - Cryptographic verification table: Original SHA-3, current SHA-3, match status.
  - Embedded AI heatmap image and bounding box coordinates.
  - Blockchain verification stamp with transaction hash and block height.
- **What to Explain**:
  - Fully automated, court-admissible audit document generated in 15.09ms via ReportLab.
- **Evidence Reference**: `phase5_final_evidence/12_forensic_reports/Phase5_Forensic_Report_22.pdf`.

---

### Step 17: Hospital Administrator Security & Node Governance [12:15 - 12:45]
- **What to Click**: Logout, log in as `superadmin`. Navigate to `/admin/dashboard`.
- **What Appears**: Enterprise admin dashboard:
  - Registered Hospitals & Active Clinical Nodes.
  - User Provisioning & DID Credential Status.
  - Global Security Alert Feed.
- **What to Explain**:
  - Hospital administrators maintain sovereign management over their clinical nodes and practitioner credentials without having direct access to decrypt private patient images without consent.
- **Evidence Reference**: `phase5_final_evidence/03_admin_workflow/admin_workflow_evidence.json`.

---

### Step 18: Authorized Researcher View (De-identified & FHE Simulation) [12:45 - 13:15]
- **What to Click**: Logout, log in as `researcher_eval`. Navigate to `/researcher/fhe-benchmarks`.
- **What Appears**:
  - De-identified research dataset (patient names and identifiers strictly stripped).
  - CKKS Homomorphic Encryption simulation benchmarks (addition, scalar multiplication).
  - Federated Learning simulation showing local hospital node training without central raw data aggregation.
- **What to Explain**:
  - Demonstrates privacy-preserving medical AI research paradigms while maintaining strict de-identification.
- **Evidence Reference**: `phase5_final_evidence/04_researcher_workflow/researcher_workflow_evidence.json`.

---

### Step 19: Transparent Academic Limitations Disclosure [13:15 - 14:00]
- **What to Display**: `FINAL_LIMITATIONS.md`.
- **What to Explain**:
  - Formally and proactively disclose all project limitations before examiners ask:
    1. AI is a research prototype trained on synthetic phantoms; clinical PACS validation has not been performed.
    2. Blockchain runs on a local simulated SHA-3 PoW fallback; live public EVM deployment is not connected.
    3. PACS DIMSE (C-STORE/C-MOVE on port 104) is omitted in favor of authenticated HTTP/DICOM Part 10 parsing.
    4. FHE and Groth16 are algebraic research simulations.
    5. Physical HSM and FIDO2 hardware tokens are not integrated.
- **Evidence Reference**: `FINAL_LIMITATIONS.md`.

---

### Step 20: Conclusion & Examiner Q&A Transition [14:00 - 14:30]
- **Concluding Remarks**:
  - MediSecure AI successfully proves that continuous cryptographic verification, Digital Integrity Twins, and AI-driven self-recovery can eliminate single-point-of-failure vulnerabilities in medical image archival.
  - The implementation is completely reproducible, backed by 421 passing backend tests, 0 TypeScript frontend build errors, and comprehensive empirical evidence.
  - Open the floor for examiner questions.
