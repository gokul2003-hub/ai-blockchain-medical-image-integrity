# Tamper Forensics Implementation Report — MediSecure AI

**Date:** 2026-10-04
**Final Status:** PASS

## 1. APIs Discovered (existing, reused)

| API | Purpose | Reused |
|---|---|---|
| `GET /api/images/{id}/integrity-evidence` | SHA-3 + DIT + blockchain + risk/trust + recovery evidence chain | ✅ existing |
| `GET /api/images/digital-twin/{id}` | DIT state | ✅ existing |
| `POST /api/images/recover/{id}` | Region-level self-recovery | ✅ existing |
| `GET /api/images/heatmap/by-image/{id}` | Grad-CAM heatmap blob | ✅ existing |
| `GET /api/images/srm-residual/{id}` | SRM residual blob | ✅ existing |
| `GET /api/forensic-demo/samples` | **NEW** — dataset samples + metadata | ➕ new |
| `POST /api/forensic-demo/analyze/{id}` | **NEW** — full forensic chain on a sample | ➕ new |
| `GET /api/forensic-demo/samples/{id}/image/{kind}` | **NEW** — original/tampered/mask PNG | ➕ new |
| `GET /api/forensic-demo/dataset-validation` | **NEW** — dataset quality report | ➕ new |

## 2. Backend Changes

| File | Change |
|---|---|
| `backend/app/forensic_dataset.py` | **NEW** — deterministic dataset builder, validator, full-chain `run_forensic_analysis()` |
| `backend/app/routes/forensic_demo.py` | **NEW** — 4 endpoints, RBAC-guarded (`doctor/radiologist/super_admin/hospital_admin/researcher`), 401 without auth |
| `backend/app/main.py` | Registered `forensic_demo.router` |

No existing module was rewritten, replaced, or mocked.

## 3. Forensic Pipeline (all steps real)

```
Medical Sample
  → SHA-3 (app.crypto.sha3_hash on real bytes)
  → DIT state (computed: VERIFIED iff hashes match, else TAMPERED)
  → AI forensics (run_ai_tamper_pipeline: SRM + Hybrid Swin-UNet + Attention)
  → Grad-CAM (generate_grad_cam — real model gradients; fallback disclosed honestly)
  → GT vs prediction metrics (calculate_segmentation_metrics — real confusion matrix)
  → Risk (calculate_tamper_risk_score) / Trust (calculate_cybersecurity_trust_score)
  → Region self-recovery (trusted-reference ROI replacement, same logic as app.recovery)
  → Post-recovery SHA-3 verification
```

## 4. Ground Truth vs AI Prediction

- **Ground truth:** pixel mask produced by the same controlled tampering operation; region coords derived from actual mask pixels (`np.where`).
- **AI prediction:** binary mask reconstructed from model `bounding_boxes`.
- **Metrics calculated live:** IoU, Dice, Precision, Recall, F1, pixel accuracy, MCC, ROC-AUC, confusion matrix. Verified consistent: `tp+fp+fn+tn == 65536` (256×256).
- Overlay image color-codes: green = GT only, red = prediction only, yellow = agreement.

## 5. Frontend Changes

| File | Change |
|---|---|
| `frontend/src/views/ForensicStudio.tsx` | **NEW** — AI Tamper Forensics Studio: dataset demo selector, Run button, 7-tab viewer (Original/Tampered/Ground Truth/AI Mask/Overlay/Grad-CAM/Recovered), zoom/opacity controls, SHA-3 proof panel, DIT badge, AI stats + region coords, GT-vs-prediction metrics, risk/trust, Grad-CAM, recovery + post-recovery SHA-3 |
| `frontend/src/App.tsx` | Registered `forensic-studio` route |
| `frontend/src/components/Sidebar.tsx` | Added "Forensic Studio" nav item (doctor/admin roles) |
| `frontend/src/components/Navbar.tsx` | Added breadcrumb label |
| `frontend/src/views/AIForensics.tsx` | Added "Forensic Studio" jump button |

Design follows the existing Stitch/MediSecure dark-navy + teal/cyan + emerald/amber/red/purple token system; no unrelated UI changes.

## 6. Security

- All forensic-demo endpoints require a valid JWT (401 otherwise).
- `POST /analyze` requires privileged role via existing `RoleChecker`.
- Error messages are security-safe (no stack traces/SQL/internal paths).
- RBAC elsewhere unchanged; backend remains authoritative.
- No private/identifiable medical data used — dataset is fully synthetic.

## 7. Tests Executed

Focused suite `tests/test_forensic_dataset_demo.py` (17 tests):

| # | Test | Result |
|---|---|---|
| 1 | Dataset builds + SHA-3 differ + regions valid | PASS |
| 2 | Dataset validation PASS | PASS |
| 3 | Original SHA-3 verified / tampered mismatch | PASS |
| 4 | Full chain: MISMATCH + DIT TAMPERED + AI output | PASS |
| 5 | Localization bounding boxes | PASS |
| 6 | GT vs prediction metrics real + confusion matrix consistent | PASS |
| 7 | Grad-CAM available (or honestly flagged) | PASS |
| 8 | Risk/trust computed by engines | PASS |
| 9 | Recovery + post-recovery SHA-3 | PASS |
| 10 | API auth required (401) | PASS |
| 11 | API samples OK | PASS |
| 12 | API analyze endpoint real chain | PASS |
| 13 | Unknown sample → 404 | PASS |
| 14 | RBAC guard | PASS |
| 15 | Dataset validation endpoint | PASS |
| 16 | Sample image bytes (real PNG) | PASS |
| 17 | Invalid kind → 400 | PASS |

Combined focused run (forensic demo + AI forensics + phase7 + E2E + recovery):

```
60 passed, 1 warning in 48.34s
```

Frontend: `tsc --noEmit` → **0 errors**; `npm run build` → **PASS**.

## 8. Honest Claim Boundaries

- **SHA-3** = cryptographic integrity evidence (detects change, does not localize pixels).
- **DIT** = integrity state tracking (CREATED/VERIFIED/TAMPERED/QUARANTINED/RECOVERED).
- **AI localization** = forensic region *prediction* — "identifies regions that are suspicious for tampering," not proof of maliciousness.
- **Ground truth** = controlled experimental reference.
- **Grad-CAM** = model-level explainability — does not prove exact malicious pixels.
- **IoU/Dice** = localization evaluation on synthetic data only.
- Academic research prototype; no clinical validation claimed.

## 9. Limitations

- Dataset is a synthetic phantom (documented fallback — see `docs/MEDICAL_IMAGE_DATASET_REPORT.md`); no public dataset download was performed within the benchmark window.
- Model is the existing synthetic-trained checkpoint; no retraining performed (per rules).
- Recovery in the demo operates on dataset files with trusted-reference ROI replacement (same algorithm as `app.recovery`); full DB/IPFS recovery path remains via `POST /api/images/recover/{id}`.
- Grad-CAM depends on model gradients; if it fails the UI shows it as unavailable rather than fabricating a heatmap.
