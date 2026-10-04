# PROJECT_ANALYSIS — MediSecure AI (Stitch Frontend Template)

**Analysed path:** `C:\Users\gokul\Downloads\stitch_medisecure_ai_platform`
**Dissertation:** "An AI-Driven Blockchain Framework for Continuous Medical Image Integrity Verification, Tamper Forensics, and Self-Recovery"
**Phase:** 0 — analysis only. No file in the analysed tree was modified.
**Date:** October 2026

---

## ⚠️ Headline finding

**This is not a frontend project. There is no application here.**

It is the raw export from **Google Stitch** — a collection of **8 standalone single-file HTML mockups** plus **1 screenshot folder** and **1 design-token document**. Total: 10 directories, 17 files, ~6.4 MB, of which ~1.2 MB is a single JPEG and the rest are PNG screenshots.

There is **no** package.json, no build tooling, no framework, no router, no state management, no API layer, no database, no authentication, no AI integration, no blockchain integration, no IPFS integration, and no database of any kind.

To answer the 20 analysis questions directly: items **1–17** and **20** are "does not exist." Item **18** (AI) and **19** (blockchain) exist only as **static text and static numbers in HTML markup**.

This is not a criticism of the work — the mockups are genuinely detailed and the design work is good. It is a category difference. They are **UI reference designs**, not a codebase. Phase 1 must therefore begin with scaffolding a real application, not with connecting an existing one.

---

## A. Current project structure

```
stitch_medisecure_ai_platform/
└── stitch_medisecure_ai_platform/          ← double-nested folder
    ├── ai_tamper_forensics_analysis_studio/
    │   ├── code.html                        35,612 B   346 lines
    │   └── screen.png                      774,727 B
    ├── clinical_authentication_role_gateway/
    │   ├── code.html                        21,062 B   270 lines
    │   └── screen.png                      529,338 B
    ├── clinical_integrity_intelligence/
    │   └── DESIGN.md                        11,136 B   224 lines   ← design tokens only
    ├── doctor_image_review_verification/
    │   ├── code.html                        38,803 B   444 lines
    │   └── screen.png                      514,829 B
    ├── doctor_radiologist_dashboard/
    │   ├── code.html                        43,895 B   550 lines
    │   └── screen.png                      590,526 B
    ├── hospital_admin_blockchain_audit_security/
    │   ├── code.html                        49,195 B   651 lines
    │   └── screen.png                      503,124 B
    ├── medical_image_self_recovery_studio/
    │   ├── code.html                        38,117 B   427 lines
    │   └── screen.png                      596,135 B
    ├── medisecure_ai_logo/
    │   ├── code.html                            994 B    12 lines   ← pure SVG
    │   └── screen.png                       24,195 B
    ├── patient_portal_images_consent/
    │   ├── code.html                        41,371 B   454 lines
    │   └── screen.png                      618,177 B
    └── professional_headshot_of_a_friendly_confident_female_radiologist_doctor_in_her/
        └── screen.png                    1,248,138 B             ← orphan asset, no code
```

### 1–20: direct answers

| # | Question | Finding |
|---|---|---|
| 1 | Frontend framework | **None.** Plain HTML5 + Tailwind CSS via CDN JIT (`cdn.tailwindcss.com`), no bundler, no framework |
| 2 | Package manager | **None.** No `package.json`, no `package-lock.json`, no `node_modules`, no `yarn.lock`, no `pnpm-lock.yaml` |
| 3 | Entry point | None. Each `code.html` is independently openable. `index.html` does not exist |
| 4 | Routing | **None.** 9 `data-path` attributes are decorative metadata only; every `<a>` has `href="#"` and no handler |
| 5 | Pages | 7 screen mockups + 1 SVG asset (see §B) |
| 6 | Components | **No component files.** Shared markup is copy-pasted into each file. Largest example: the sidebar + topbar shell is duplicated verbatim across 6 files, ~4 KB each |
| 7 | CSS/styling | Inline `<style>` (1 block/file, ~10 lines) + Tailwind utility classes inline. Full token set inlined as a `tailwind.config` JSON in a `<script id="tailwind-config">` |
| 8 | Theme | **Light-only** Material 3 palette, fully specified in `DESIGN.md` (60+ tokens). `darkMode: "class"` is declared but no `dark` class is ever applied |
| 9 | Icons | **Material Symbols Outlined** via Google Fonts, used as `<span class="material-symbols-outlined">ligature_name</span>` |
| 10 | Images/assets | 21 remote images, all `lh3.googleusercontent.com` (18 medical/brand, 3 avatars). **Zero local assets.** No image optimisation, no `alt` coverage audit done, no responsive `srcset` |
| 11 | Existing API calls | **Zero.** No `fetch`, `XMLHttpRequest`, `axios`, `WebSocket`, `EventSource`, or `indexedDB` in any file |
| 12 | Backend connection | **None.** No API URL, no `localhost`, no env var, no base URL, no proxy config |
| 13 | Authentication | **A mockup only.** One `<form>` that calls `preventDefault()` then fakes success via `setTimeout`. No token, no session, no credential validation |
| 14 | Existing dashboard | One **static** dashboard mockup (`doctor_radiologist_dashboard`) |
| 15 | Existing image upload | A **drop-zone and file input with no handler.** No drag/drop listener, no `FormData`, no `FileReader`, no upload |
| 16 | State management | **None.** Local `let`/`const` in two IIFEs and top-level functions. No store, no context, no signals |
| 17 | Database integration | **None** |
| 18 | AI functionality | **None executable.** Model names, confidences and verdicts are hardcoded strings in markup |
| 19 | Blockchain functionality | **None executable.** One `WebSocket` occurrence is *prose* describing the product, inside a `<p>`. No client library, no contract address used in code, no key material |
| 20 | IPFS functionality | **None.** The word "IPFS" does not appear in any file |

---

## B. Existing frontend pages

Seven screens, plus one asset and one orphan screenshot. **Each is an independent HTML document, not a route.**

| # | Directory | Screen | Role | Lines | `h1` |
|---|---|---|---|---|---|
| 1 | `clinical_authentication_role_gateway` | Login / role gateway | All 4 personas | 270 | `Continuous Medical Image Integrity, Tamper Forensics & Self-Recovery` |
| 2 | `doctor_radiologist_dashboard` | Worklist overview | Doctor | 550 | `Good morning, Dr. Sharma` |
| 3 | `doctor_image_review_verification` | Single-study DICOM viewer + sign-off | Doctor | 444 | **none** (context bar only) |
| 4 | `ai_tamper_forensics_analysis_studio` | Forensic deep-dive on one case | Doctor | 346 | `Forensic Investigation: Patient #PT-8821 • Marcus Chen` |
| 5 | `medical_image_self_recovery_studio` | Reconstruction attestation | Doctor | 427 | `Self-Recovery Studio • Reversible Fragile Watermark & Blockchain Inpainting Reconstruction` |
| 6 | `hospital_admin_blockchain_audit_security` | Ledger + governance console | Hospital admin | 651 | `Hospital Administrator Workspace` |
| 7 | `patient_portal_images_consent` | Scans, upload, consent | Patient | 454 | `Welcome back, Sarah Miller` |
| 8 | `medisecure_ai_logo` | Brand mark (inline SVG) | — | 12 | n/a |
| 9 | `professional_headshot_.../screen.png` | **Orphan.** No `code.html` | — | — | — |

### Navigation model (identical in 6 of 7 screens)

The sidebar declares 9 destinations. **None of them is implemented.** Every anchor is `href="#"` with no click handler, so all navigation is dead.

```
CLINICAL WORKSPACE
  dashboard                        (brand link, no label)
  doctor-dashboard                 badge: 14
  assigned-images
  image-review-and-verification
  ai-tamper-forensics
  risk-analysis                    ← no corresponding screen exists
  self-recovery-studio
GOVERNANCE & TRUST
  blockchain-audit-and-reports
  patient-consent-directory
```

Two gaps: `risk-analysis` has no screen, and the admin console is reachable by no nav item at all. The `researcher` persona on the login screen has no corresponding screen either.

---

## C. Existing reusable components

**There are none as code.** No `.jsx`, `.tsx`, `.vue`, `.svelte`, or partials. Nothing is importable.

What exists instead is a *visual vocabulary* consistent enough across files to be treated as a component inventory. Reconstructing these is the main Phase 1 opportunity:

| Component (implied) | Occurrences | Notes |
|---|---|---|
| App shell: sidebar + topbar + user card | 6 files, duplicated verbatim | ~4 KB duplicated 6×. Prime extraction candidate |
| Status pill | ~40 | `Node #428 • Active Cluster`, `Self-Recovery Complete` |
| Forensic chip | ~12 | Lavender AI-inference pill (`AI ROI`, `Tamper Suspected (p=0.91)`) |
| Integrity badge | ~15 | `Verified Hash Match`, `SHA-3 Hash Matched`, `Genesis Mismatch` |
| Metric card | ~14 | 4 per screen × 3 screens + KPI row |
| Filter pill row | 2 | Doctor dashboard buckets |
| Forensic image panel | ~9 | Label + 4–6 annotation rows + image |
| Ledger table | 1 | 8 columns, the most complex table in the set |
| Verification queue row | 1 | 6 columns |
| Scan consent card | 5 | Patient portal |
| Attestation checklist | 1 | 2 checked assertions |
| Pipeline step tracker | 2 | 5-step, 2 states |
| Receipt modal | 1 | Cryptographic certificate |
| Slider / zoom control | 2 | Filmstrip + viewport |
| Sparkline / gauge | 3 | Inline SVG |

---

## D. Existing working features

Genuinely functional when opened in a browser — i.e. code that runs:

| Feature | Where | What it does |
|---|---|---|
| Role selector | Login | 4 buttons rewrite the credential hint text and prefill a different identity per persona |
| Password visibility toggle | Login | Swaps `type=password` ↔ `text`, flips icon glyph |
| "Fast Biometric" | Login | Writes a hardcoded key into the token field, shows a toast |
| Filter-pill active state | Dashboard, Tamper studio | Class swap on click |
| Ledger filtering | Admin console | `applyFilters()` filters rows by event, node and free text via `data-event` / `data-node` attributes. **The best-implemented logic in the set** |
| Receipt modal | Admin console | Opens with the clicked row's block/tx/event/node/study |
| JSON audit export | Admin console | Generates a real Blob-less data-URI JSON download via a synthetic `<a download>` |
| Tabs | Patient portal | `switchTab()` hides/shows three sections |
| Modality selection | Patient portal | Pill class swap |
| Zoom | Image review | `scale()` on the image, clamped to 300% |
| Invert | Image review | Toggles a `.invert` class **that is never defined in CSS — so it does nothing** |
| Split-view toggle | Image review | Swaps a label string |
| ROI box toggle | Image review | Opacity toggle |
| Tamper-mask toggle | Self-recovery | Opacity toggle |
| Consent decline | Patient portal | Removes the request card from the DOM |
| Consent approve | Patient portal | Relabels the button to `Approved` |

**All 16 are cosmetic.** None performs I/O, none validates, none persists. The admin console's JSON export is the only one that produces a real artefact, and it exports hardcoded constants.

---

## E. Partially implemented features

Stubbed to the point of UI but with the wiring absent:

| Feature | What exists | What's missing |
|---|---|---|
| **Authentication** | Form, 4 personas, credential hints, prefilled identities | `action`/`method` absent, `preventDefault()`, no request, no token, no session, no role-based redirect, no error path |
| **Image upload** | Drop zone, `accept=".dcm,.png,.jpg,.jpeg" multiple`, 4-step guarantee copy | No `change` listener, no drag/drop listener, no `FormData`, no progress, no validation, no server |
| **DICOM viewer** | Toolbar, zoom that works, filmstrip, DICOM overlay text, ROI box | Slice navigation dead, pan/crosshair/rotate/flip dead, invert broken, no real image pipeline, no DICOM parsing, no window/level |
| **Ledger table** | 8 columns, 5 rows, filtering works | Pagination dead (`Previous/1/2/3/Next`), no sorting, hash "click to copy" has no handler, no live updates |
| **Sign-off** | Buttons, checklist, prefilled attestation text, success toast | No handler on checklist or textarea, no signature, no ledger write |
| **Tamper forensics** | 4-channel viewport, metrics, model-spec accordion | Accordion works; everything else static. `Focus Nodule` and `LUT Window` dead |
| **Self-recovery** | 5-step pipeline, bilateral comparison, PSNR/SSIM, hash block | Certification button fakes broadcast; download button fakes a zip; checklist not enforced |
| **Consent management** | 3 cards, 2 active grants, 1 pending request | `Manage Access` is `alert()`. Revoke is `confirm()` + `alert()`. No grant form exists |
| **Patient scans** | 3 scan cards with metadata and accessors | `View Scan` and `Doctor Report` dead |
| **Node health** | 3 peer cards, latency, sync %, progress bar | Static. No health endpoint, no polling |

---

## F. Missing features

Everything functional. Grouped by dissertation claim:

**Absent entirely**

- Backend of any kind. No API, no server, no database, no schema, no migration
- Real authentication. No password hashing, no MFA, no session, no FIDO2/WebAuthn despite the checkbox and the "Fast Biometric" button
- Role-based access control. The 4 personas gate nothing
- Medical image **ingestion** pipeline. The upload is inert
- DICOM parsing. No PS3.10 reader, no pixel access, no slice extraction, no real multiplanar reconstruction
- Image rendering pipeline. Images are remote JPEGs, not DICOM
- Any AI model. No inference, no weights, no SRM filter, no Swin-UNet, no Grad-CAM. Every number is a literal
- Any cryptography. No SHA-3 computation, no AES-256-GCM, no hyperchaos, no Merkle tree construction. Every hash is a hardcoded string
- Any blockchain. No client library, no node connection, no contract ABI, no transaction submission, no event subscription, no key management. "PBFT", "Proof of Authority", "12/12 validators" are text
- Any IPFS. The word does not appear
- Any self-recovery implementation. The reversible fragile watermark, dual-tree wavelet transform and contextual inpainting are described in prose only
- Any persistence. No localStorage, no sessionStorage, no IndexedDB. A page refresh loses all state
- Error handling. No network layer means no error layer
- Loading states. No skeletons, no spinners except two cosmetic ones
- Empty states. Static markup shows content even when there is none
- Notifications. Bell icon has no handler
- Internationalisation. English only, hardcoded
- Accessibility audit. No `scope` on any table header, no `aria-live`, no focus management, no skip link, no `prefers-reduced-motion` block. One screen has no `h1` at all
- Testing. No test files, no framework, no CI
- Documentation. Only the Stitch `DESIGN.md`
- Responsive behaviour beyond Tailwind breakpoints. No mobile nav, no drawer, no hamburger. The 288px fixed sidebar plus `pl-72` layout is desktop-only
- Legal/compliance artefacts. HIPAA, GDPR, DICOM PS3.15, ISO 27001, FDA 21 CFR Part 11 are asserted in copy with nothing behind them

---

## G. Duplicate / unnecessary code

Phase 1 should treat this as a **source of truth**, not as code to port.

**Duplicated**

| Duplication | Scale |
|---|---|
| App shell (sidebar + topbar + user card) | Verbatim in 6 files, ~4 KB each, ~24 KB total |
| `tailwind.config` token object | Verbatim in 6 files, ~2.5 KB each, ~15 KB total |
| Inline `<style>` reset | Identical in 7 files |
| Google Fonts `<link>` tags | 3 near-identical links per file, ~21 total; Material Symbols is loaded **twice in one file** (`doctor_radiologist_dashboard`) with different `opsz` axes |
| Material Symbols ligature names | Manually typed per icon, no component abstraction |
| Logo + avatar images | Same 2 remote URLs repeated in 6 files |
| Hardcoded patient/doctor/identity names | See inconsistency table below |
| Hardcoded block heights, hashes, percentages | Repeated across screens, inconsistently |

**Unnecessary / dead**

- `darkMode: "class"` in every Tailwind config with no `dark` class ever applied — the entire dark theme is unreachable
- `Invert Grayscale` button applying an undefined `.invert` class
- 40+ `<a href="#">` anchors with no handler
- 35+ `<button>` elements with no handler
- `title="Click to copy hash"` spans that do not copy
- `border-slate-850` class — **not a valid Tailwind colour**. Appears in `Dicom3DViewer`-adjacent patterns and at least one shell file. Silently no-ops
- Hidden `<input type="file">` with no listener
- `Professional Headshot` folder: a 1.2 MB PNG with no `code.html`, no reference from any file. Nothing links to it
- `clinical_integrity_intelligence/` contains **only** `DESIGN.md` and **no** `code.html` or `screen.png` — an incomplete Stitch generation
- `medisecure_ai_logo/code.html` is not an HTML document (no `<!DOCTYPE>`, no `<html>`, no `<head>`). It is a bare `<svg>` fragment

### Cross-file data inconsistencies to resolve before seeding

These matter because the mockups will become the seed dataset. Seed them consistently or consciously preserve the drift.

| Entity | Conflicting values |
|---|---|
| Doctor identity | Shell: `Dr. Eleanor Vance, MD` · Dashboard h1: `Dr. Sharma` · Login persona: `dr.sharma@medisecure.health` · Sign-off badge: `Dr. Vance, MD (RAD-44)` |
| Patient `#PT-9042` age | Dashboard: `42y F` · Image review: `47F`, `ROSTOVA, ELENA • 47F` |
| Block height | Admin / image review / self-recovery: `19,402,18x` · Tamper studio: `#19,402,184` · Dashboard feed: `#1,829,04x` (different magnitude entirely) |
| Brand green | `DESIGN.md` secondary: `#3a6752` · Logo SVG: `#3E6B56` · Shell: `#3a6752` |
| Referring physician | `Dr. Marcus Chen, MD` is also the *patient* `#PT-8821` in other screens |

---

## H. Backend requirements

Nothing exists. Minimum viable backend, derived from what the screens actually claim to show:

**Services**

| Service | Endpoints implied by the screens |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/mfa`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/break-glass` |
| Images | `GET /images`, `GET /images/:id`, `POST /images` (upload), `GET /images/:id/download`, `GET /images/:id/preview`, `GET /images/:id/slices/:n`, `GET /images/:id/dicom-meta`, `DELETE /images/:id` |
| Integrity | `POST /images/:id/verify`, `GET /images/:id/hash-comparison`, `GET /images/:id/timeline` |
| Forensics | `POST /images/:id/analyze` (SRM), `GET /images/:id/srm-residual`, `POST /images/:id/localize` (Swin-UNet), `GET /images/:id/segmentation-mask`, `GET /images/:id/gradcam`, `GET /forensics/:reportId` |
| Recovery | `POST /images/:id/recover`, `GET /images/:id/recovery-status`, `GET /images/:id/before-after`, `POST /images/:id/sign-off` |
| Ledger | `GET /ledger/blocks`, `GET /ledger/blocks/:height`, `GET /ledger/verify`, `GET /ledger/nodes`, `GET /ledger/receipt/:tx`, `WS /ledger/stream`, `GET /ledger/export` |
| Consent | `GET /consents`, `POST /consents/grant`, `POST /consents/:id/revoke`, `POST /consents/:id/approve`, `POST /consents/:id/decline` |
| Analytics | `GET /analytics/doctor`, `GET /analytics/hospital`, `GET /analytics/telemetry` |
| Notifications | `GET /notifications`, `PATCH /notifications/:id/read` |

**Non-functional**

- Serve DICOM slices as tiles, not full-size images. A 320-slice CT at native resolution will exhaust browser memory.
- `WS /ledger/stream` must handle reconnection with `Last-Event-ID` replay, since the admin console claims "Live Stream Active."
- Signed-URL or stream-through access for medical images. Never expose a public path.
- PDF/XML report generation for the two "download report" actions.
- Audit log on every mutating endpoint. The screens assert FDA 21 CFR Part 11 non-repudiation.

---

## I. Database requirements

**None exist.** Minimum schema, driven by the fields the screens render:

| Table | Key fields |
|---|---|
| `users` | `id`, `role` (patient/doctor/radiologist/hospital_admin/researcher), `email`, `password_hash`, `mfa_secret`, `full_name`, `specialization`, `license_number`, `hospital_id`, `orcid`, `mrn`, `dob`, `blood_group` |
| `hospitals` | `id`, `name`, `consortium_node_id`, `ae_title`, `region` |
| `images` | `id`, `patient_id`, `uploader_id`, `study_uid`, `modality`, `title`, `original_filename`, `storage_ref`, `storage_provider` (local/ipfs), `cid`, `sha3_original`, `sha3_current`, `quality_score`, `entropy`, `quarantine_status`, `taken_at`, `created_at` |
| `image_slices` | `image_id`, `index`, `dicom_path`, `sha3`, `width`, `height` |
| `dicom_metadata` | `image_id`, `patient_ref`, `referring_physician`, `protocol`, `slice_thickness`, `manufacturer`, `model`, `institution`, `kvp`, `ma`, `tr`, `te`, `fov`, `window_center`, `window_width` |
| `digital_integrity_twins` | `id`, `image_id`, `owner_id`, `trusted_hash`, `storage_reference`, `verification_status`, `created_at` |
| `verifications` | `id`, `image_id`, `computed_hash`, `trusted_hash`, `match`, `status`, `verified_at`, `verified_by` |
| `tamper_reports` | `id`, `image_id`, `tamper_percentage`, `confidence`, `risk_score`, `risk_category`, `trust_score`, `trust_level`, `access_decision`, `classification`, `regions` (JSON), `model_name`, `model_version`, `heatmap_ref`, `created_at` |
| `recoveries` | `id`, `image_id`, `method`, `attempts`, `pre_hash`, `post_hash`, `verified`, `psnr`, `ssim`, `blockchain_tx`, `status`, `created_at` |
| `consents` | `id`, `image_id`, `grantee_id`, `grantee_role`, `permitted_scopes`, `status`, `granted_at`, `expires_at`, `revoked_at`, `research_study_ref` |
| `ledger_blocks` | `height`, `tx_hash`, `timestamp`, `study_uid`, `event_type`, `validator_node`, `consensus`, `merkle_root`, `payload` (JSON) |
| `audit_events` | `id`, `actor_id`, `action`, `entity_type`, `entity_id`, `status`, `details`, `ip`, `timestamp` |
| `signoffs` | `id`, `image_id`, `signer_id`, `note`, `checklist` (JSON), `token_ref`, `block_height`, `signed_at` |
| `notifications` | `id`, `user_id`, `type`, `payload`, `read`, `created_at` |

**Notes.** Every hash column must store a real SHA-3 digest, not a display string, because the UI needs to *compare* them. `regions` and `checklist` are JSONB. Index `images(study_uid)`, `ledger_blocks(tx_hash)`, `audit_events(entity_type, entity_id)`.

---

## J. AI requirements

The screens specify a specific architecture. Reproducing the claims requires all of it:

| Component | Claimed spec | Realistic path |
|---|---|---|
| **SRM residual filter** | 30 sub-bands, Truncation `T=3`, order `q ∈ [1,2,3]`, MinMax/KV/Edge kernels, spatial finite-difference residuals | **Most tractable.** Classical CV, no training. Implementable in OpenCV/Numpy in a day and produces the claimed `SNR Variance` and `PRNU Delta` numbers honestly |
| **Swin-UNet segmentation** | Patch 4×4, window 7, depth `[2,2,6,2]`, latent dim 768, IoU 0.94 | Needs PyTorch and a trained checkpoint. Either train on a small public tampering dataset or serve a pretrained model. If untrained, the UI **must** say so |
| **Grad-CAM** | Stage-4 attention, `λ = 0.986` | Straightforward given the Swin-UNet backbone. Same training dependency |
| **GAN attribution** | "StyleGAN-Med v2 signature detected" | **Not implementable credibly.** Fingerprinting a specific GAN checkpoint is a research project. Remove or relabel as "GAN-suspicion heuristic" |
| **Reversible fragile watermark** | RFW-v4, LSB subband payload, 128 KB payload, 16-bit lossless | Real watermarking is achievable but lossless 16-bit reconstruction is a strong claim. Prototype and label it |
| **Contextual attention inpainting** | Restores alveolar tissue | Requires either a pretrained inpainting model or training one. GAN-based inpainting raises its own detection-evasion question |
| **Dual-tree complex wavelet** | "Lossless PSNR 44.8 dB" | Implementable in PyWavelets. Realistic |
| **PSNR / SSIM** | `44.8 dB`, `0.9984` | Trivial once you have before/after pairs. **Compute these for real** — they are the easiest credibility win |
| **Merkle tree** | Depth 24, root `0x48f...b299e` | Trivial and fully implementable. Strong dissertation value |
| **ZK-SNARK** | "Zero-Knowledge Proof Layer 2" | Do **not** claim. If pursued, needs a circuit compiler and a verifier contract. Otherwise remove the claim |

**Infrastructure**

- Inference service separate from the web API (the screens imply async analysis: "Stage 5 of 5", "Analysis In Progress")
- Job queue so analysis is not synchronous
- Model registry with version strings, because the UI displays `v4.2`, `v3.4-FiducialLock`
- Every inference must return provenance metadata (`model_name`, `model_version`, `dataset_type`, `is_clinically_validated: false`) — the mockups already declare this shape

**Honesty requirement.** The mockups assert `98.6%` confidence, `+4.81` z-score, `99.4%` fake. Once models are real, these must be genuine model outputs. Until a model is trained, showing them as live values is a research-integrity problem. Phase 1 should render them from the database and, if no model is wired, display `null` with an explicit "model not loaded" state.

---

## K. Blockchain requirements

| Requirement | Screen claim | Implementation path |
|---|---|---|
| SHA-3 hashing | `SHA3-512`, `SHA3-256`, hex `0x…` | `hashlib.sha3_512()` / `sha3_256()`. Trivial, do it properly |
| Merkle tree | Depth 24, `0x48fa9128…` | Implement and display the real root |
| Immutable ledger | 142,890 blocks, block height ~19.4M | **Hardhat + ethers.js**, or a local Ganache/Anvil chain |
| Consensus | "PBFT Strict", "12/12 Nodes", "32/32" | PBFT needs ≥3 replicas. A single-node dev chain cannot show real consensus. Show `1/1` locally and label it |
| Smart contract | "Smart Contract v2.4", event `TamperAlertLogged` | Solidity contract: `registerImage`, `recordVerification`, `logTamperAlert`, `mintRecovery`, `recordConsent` with events |
| Transaction receipts | Merkle witness proof, PBFT signatures | Real receipts from the local chain |
| Wallet / signing | FIDO2 / PKI PIV checkbox | Browser needs a wallet (MetaMask) or a server-side signer. For a dissertation, a **server-side signer** is far more reliable |
| Gas | "78,410 units" | Real gas from real transactions |

**Recommendation.** Target **Hyperledger Besu or a Hardhat local chain** with a Solidity contract, and let the backend hold the signing key. Wallet-based signing will make the demo fragile. Verify every claim in the UI against real chain state, and where the chain is a single local node, say so on screen.

**Critical.** The admin console shows `19,402,185` block height. A fresh local chain starts at 0. Either seed a realistic chain, or show the real height and accept the small number. A fake height in a ledger UI defeats the entire dissertation premise.

---

## L. IPFS requirements

**Zero.** The word "IPFS" does not appear in any file. `DESIGN.md` mentions "Consortium Peer-to-Peer Ledger", and the login screen mentions "Federated Node", but neither is an IPFS integration.

If IPFS is in scope, it needs:

| Requirement | Detail |
|---|---|
| Node | Private IPFS node (Kubo). `ipfs-http-client` or the REST API on `127.0.0.1:5001` |
| Content addressing | Store the **encrypted** artefact, never plaintext PHI. The `design` doc's own principle |
| Pinning | `pin.add`, and poll `pin.status` so the UI can show "Pinned" vs "Unconfirmed" |
| Gateway policy | **No public gateway.** `gateway.ipfs.io` must never be used for medical data |
| Retrieval | Fetch via the authenticated API, which proxies from the local node |
| Metadata | CIDs stored on the image record; store `Qm…` and display truncated with full-hash expansion |
| Garbage collection | `ipfs.repo gc` will remove unpinned content. Pin everything or the images vanish |

The self-recovery screen already implies a "pristine baseline" stored off the primary chain. That is exactly the IPFS use case: store the pre-tamper encrypted baseline, retrieve it during recovery, verify its hash against the trusted twin.

---

## M. Security requirements

**Security is the dissertation's central claim and is currently entirely absent.** Nothing below exists in any form.

**Authentication and session**

- Password hashing: Argon2id or bcrypt. Never store plaintext or MD5.
- MFA: TOTP (RFC 6238) via `pyotp`. The login screen asserts `6-digit authenticator code` nowhere, but the "Fast Biometric" button and `HSM Enclave Online` badge imply it.
- FIDO2/WebAuthn: the checkbox and the "Fast Biometric" button promise this. Implementing it needs `@simplewebauthn/*` plus a server challenge store. **Either implement it or remove the claims** — a non-functional FIDO2 button is worse than none.
- JWT access + refresh, short-lived access token, rotating refresh token, revocation list.
- Session binding to role and hospital. A patient must never be able to address another patient's image id.

**Authorisation**

- Role enforcement **server-side on every endpoint**. The four personas currently gate nothing.
- Object-level authorisation: verify `image.patient_id` or an active consent grant before every read. `GET /images/:id` with a guessable integer id is a classic IDOR.
- Break-glass: separate elevated role, mandatory justification, automatic expiry, mandatory audit entry, and alerting. The screens have a "break-glass" link on login and a `HSOC` concept.
- Row-level scoping by `hospital_id` so one hospital admin cannot read another's ledger.

**Data protection**

- Encryption at rest: AES-256-GCM per image, unique nonce per record. The screens claim `AES-256-GCM + 4D Chen Hyperchaos`.
- Encryption in transit: TLS 1.3, enforced HSTS. The shell claims `TLS 1.3 Strict Mutual Auth`.
- **PHI must never reach the browser unencrypted unless the viewer is authorised.** DICOM headers contain patient name, DOB and MRN. The image review screen overlays `ROSTOVA, ELENA • 47F` on the canvas, so PHI is rendered client-side by design. That is acceptable only behind authorisation, and it must be logged.
- De-identification for research: the patient portal claims identity is "removed completely before sharing". Implement a real de-identification pipeline (tag removal per PS3.15 Annex E), or remove the claim.
- Secure media delivery: short-lived signed URLs or authenticated streaming. No world-readable static paths.

**Input validation and injection**

- Pydantic schemas on every request. No ORM string interpolation for SQL.
- Validate DICOM uploads: magic bytes, declared size vs actual, decompression-bomb guard, pixel-data sanity. **A malformed DICOM parser is a classic RCE vector** — isolate it in a container.
- Filename sanitisation on upload.
- CSP and `Strict-Transport-Security`. Note: the Stitch files load `cdn.tailwindcss.com` and `lh3.googleusercontent.com`, neither of which belongs in a production CSP for a medical system. Bundle assets locally.

**Audit and compliance**

- Immutable audit log for every read of a medical image and every write. The screens claim `21 CFR Part 11` non-repudiation.
- Hash-chain the audit log so tampering is detectable — this dovetails with the Merkle tree work in §J.
- Access logging with actor, IP, timestamp, resource, decision.
- Session timeout, absolute and idle.
- Rate limiting on login, break-glass and upload.

**Supply chain**

- Pin dependency versions, commit a lockfile, generate an SBOM.
- `pip-audit` / `npm audit` in CI.
- Do not ship `@mui/*` and `@emotion/*` if unused (relevant to the *other* project in this workspace, not this one).

---

## Consolidated findings

**What this template is worth.** The design system in `DESIGN.md` is thorough and internally consistent: a complete Material 3 token set, a defined type scale with paired mobile variants, an explicit 12/8/4-column responsive strategy, and a clear rule that medical imaging viewports break the ivory theme for optical neutrality. That last decision is correct and shows real domain understanding.

The screens are also unusually good at *stating what data exists*. The field labels, DICOM attributes, ledger columns, model specs and consent states are specific enough that §H and §I could be written almost directly from them. That is genuine value.

**What it is not worth treating as.** It is not code. 100% of the security, AI, blockchain, IPFS and authentication claims in this project are currently **text**. A reader of any of these screens would reasonably believe there is a working tamper-detection pipeline behind them. There is not. There is a JPEG and a `<div>`.

**Recommendation for Phase 1.** Scaffold a real application (React + TypeScript + Vite, or Next.js if SSR is wanted), extract the design tokens from `DESIGN.md` into a real theme file, and rebuild the seven screens as components against a live API. Treat the HTML as a **visual specification**, not a starting codebase. Budget for the backend, database, AI and blockchain work in §H–§L as genuinely new engineering — it is 100% of the project.

**Highest-risk items**, in order: (1) real DICOM ingest and slice serving, (2) a real trained tamper model or an honest "model not loaded" state, (3) a working ledger with real block heights, (4) server-side authorisation with no IDOR, (5) PHI'displayed client-side behind authorisation.

---

*End of Phase 0. Awaiting Phase 1 instructions. No files were modified.*
