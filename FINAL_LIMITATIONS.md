# MediSecure AI — Final Explicit Academic Limitations Disclosure

**Project**: MediSecure AI — An AI-Driven Blockchain Framework for Continuous Medical Image Integrity Verification, Tamper Forensics, and Self-Recovery  
**Document**: Final Limitations Disclosure  
**Date**: October 4, 2026  
**Audience**: Dissertation Committee, Academic Examiners, and Viva / Defense Panel  

---

## 1. Context and Academic Integrity Statement

In adherence to strict academic honesty, scientific rigor, and research ethics, this document formally records all known technical limitations, architectural boundaries, and research prototype constraints of the MediSecure AI platform.

The system has been designed and evaluated as an **advanced research prototype**. While the core cryptographic transformations (4D Chen hyperchaotic systems, AES-256-GCM authenticated encryption, SHA-3 hashing), digital integrity twin state tracking, region-level self-recovery, and risk-adaptive access control are fully operational and verified by 421 unit/integration tests, several peripheral components are simulations, prototypes, or research approximations as documented below.

---

## 2. Explicit System Limitations

### 1. AI Trained on Synthetic Phantom Perturbations
- **Nature**: The AI forensic pipeline (SRM noise extraction layer, Hybrid Swin-UNet segmentation backbone, AttentionGate refinement, and Grad-CAM explainability) was trained and evaluated on **programmatic, synthetic mathematical phantoms** (such as Shepp-Logan geometric brain phantoms with controlled elliptical perturbations).
- **Academic Impact**: The model demonstrates mathematical and algorithmic proof-of-concept for detecting localized pixel tampering. However, it has **not been trained on clinical, multi-center PACS radiology repositories** (e.g., real histological slides, clinical CT scans with real tumor resections). Performance under clinical imaging noise, scanner motion artifacts, or varying slice thicknesses must be investigated in future clinical trials.

### 2. Lack of Clinical Diagnostic Validation
- **Nature**: The software has **not been submitted to or cleared by clinical regulatory bodies** (e.g., FDA 510(k), CE-MDR Class IIa/IIb certification).
- **Academic Impact**: MediSecure AI is strictly a cybersecurity and data integrity framework; it must **never be used as a primary diagnostic medical device** in active patient care without prospective clinical trials and regulatory approval.

### 3. PACS DIMSE Networking is Not Implemented
- **Nature**: The DICOM processing pipeline parses valid DICOM Part 10 binary files (`.dcm`), extracts standard DICOM tags (PatientID, StudyInstanceUID, Modality, Manufacturer), de-identifies PHI, and renders 2D volumetric slices.
- **Academic Impact**: **Network-level DICOM Message Service Element (DIMSE) protocols** (specifically `C-ECHO`, `C-STORE`, `C-FIND`, and `C-MOVE`) over TCP/IP port 104 are **not implemented**. Images must be ingested through the authenticated web application or RESTful upload API rather than via direct hospital PACS broadcast.

### 4. Blockchain Operates via Local Simulated Proof-of-Work Fallback
- **Nature**: The architecture includes complete, compilable Solidity smart contracts (`MedicalAccessControl.sol`) with events for `AccessGranted`, `AccessRevoked`, and `ImageRegistered`.
- **Academic Impact**: In evaluation environments where an active public Ethereum Virtual Machine (EVM) RPC node (e.g., Sepolia testnet or local Ganache/Anvil node) is offline, the system automatically falls back to an internal **Local Simulated Blockchain Ledger**. This fallback uses Python-based Proof-of-Work (PoW) with SHA3-256 block hashing and previous-hash chaining (574 blocks verified). It is not an active public multi-validator consensus network.

### 5. Fully Homomorphic Encryption (FHE) is an Algebraic Simulation
- **Nature**: The research analytics module includes a Cheon-Kim-Kim-Song (CKKS) prototype engine (`fhe_engine.py`) configured with polynomial degree $N=8192$ and scale $\Delta = 2^{40}$.
- **Academic Impact**: This engine simulates the **algebraic properties of approximate arithmetic over encrypted real numbers** (addition and scalar multiplication). It does not implement full ring learning-with-errors (RLWE) bootstrapping or relinearization noise management, and is **not cryptographically secure for production multi-tenant environments**.

### 6. Zero-Knowledge Proofs (ZKP) are Prototypes / Simulations
- **Nature**: The platform implements two ZKP modules:
  - `zkp.py`: A functional non-interactive **Schnorr zero-knowledge protocol** over discrete logarithms for secondary access clearance.
  - `zk_snark.py`: An algebraic prototype of the **Groth16 protocol** over simulated elliptic curve pairings.
- **Academic Impact**: While the Schnorr protocol provides real discrete-log proof verification, the Groth16 implementation is an educational simulation rather than a production libsnark/circom circuit deployment.

### 7. Physical Hardware Security Module (HSM) & FIDO2 Not Integrated
- **Nature**: Key encryption keys (KEKs) are derived and unwrapped using HKDF-SHA256 from application-level master keys. Multi-factor authentication is enforced via software RFC 6238 Time-based One-Time Passwords (TOTP).
- **Academic Impact**: **Physical tamper-resistant cryptographic hardware** (e.g., PKCS#11 HSMs, TPM 2.0 chips, or physical WebAuthn/FIDO2 hardware security keys) is not integrated.

### 8. External Telecommunications Gateways are Mock Stubs
- **Nature**: Real-time alerting within the browser is operational via asynchronous WebSockets (`/ws`).
- **Academic Impact**: Outbound SMS notifications (e.g., Twilio API) and external SMTP email alerts are implemented as **logging stubs**; they do not transmit physical cellular SMS or external emails.

### 9. Single-Server Deployment Model
- **Nature**: The demonstration deployment uses an embedded SQLite database with WAL journaling, local thread pools, and local storage provider directory trees.
- **Academic Impact**: While architected for horizontal scaling via PostgreSQL, Celery, and distributed IPFS nodes, the prototype environment runs as a unified server process on a single host.

---

## 3. Summary Table for Defense Presentation

| Subsystem | Dissertation Claim | Current Implementation State | Explicit Limitation |
|---|---|---|---|
| **Cryptographic Pipeline** | 4D Chen + AES-256-GCM + SHA-3 | **OPERATIONAL** | Key wrapping is software-based (No physical HSM) |
| **Digital Twin & Recovery** | DIT State Tracking + ROI Self-Recovery | **OPERATIONAL** | Requires intact encrypted backup reference |
| **AI Forensics** | SRM + Swin-UNet + Attention + Grad-CAM | **RESEARCH PROTOTYPE** | Trained on synthetic phantoms; no clinical trials |
| **Blockchain** | Immutable Provenance & Smart Contracts | **SIMULATED FALLBACK** | Local SHA-3 PoW chain; live EVM node not connected |
| **FHE Privacy** | Privacy-Preserving Analytics | **SIMULATION** | CKKS algebraic simulation; not secure for production |
| **ZKP Verification** | Zero-Knowledge Access Challenge | **PROTOTYPE** | Schnorr prototype; Groth16 pairing simulated |
| **Imaging Network** | DICOM Parsing & De-identification | **OPERATIONAL** | File upload only; PACS DIMSE network listener missing |
| **Identity & MFA** | DID / VC & TOTP MFA | **OPERATIONAL** | Local verification; physical FIDO2 keys not integrated |
