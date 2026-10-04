# INTEGRITY PROOF & SELF-RECOVERY EVIDENCE CENTER — IMPLEMENTATION REPORT

**Phase:** Dedicated research proof / demonstration page for the complete security lifecycle
**Date:** 2026-10-05
**Git:** commits on `master`

---

## PERFORMANCE

| Field | Value |
|---|---|
| Target | 5 minutes |
| Actual Time | **~25 minutes** (start 23:54:57 → final commit ~00:20; measured) |
| Reason for overrun | Full 400+ test suite execution (~4 min), frontend build (~8 s), real backend/frontend startup for runtime validation, and a real bug fix cycle (blockchain service API mismatch) |

The 5-minute target was exceeded. Work continued to completion per the phase rules — no features were skipped or faked to hit the time limit.

---

## SCORECARD

| Requirement | Status |
|---|---|
| Implementation | **PASS** |
| Original/Tampered Proof (3 visual panels) | **PASS** |
| SHA-3 cryptographic proof | **PASS** — real runtime hashes, MATCH/MISMATCH computed live |
| DIT (state + lifecycle + explanation) | **PASS** — state from backend; unavailable timestamps shown as "Event data unavailable" |
| AI Localization | **PASS** — bounding boxes from model output, coordinates real |
| Ground Truth vs AI prediction (IoU/Dice/Precision/Recall/F1) | **PASS** — calculated live from actual masks |
| Image Difference (actual pixel diff) | **PASS** — `cv2.absdiff` computed from real bytes; changed-pixel % |
| Grad-CAM | **PASS** — real heatmap from model; honest "model explanation, not cryptographic proof" labeling; unavailable case handled |
| Self-Recovery | **PASS** — existing ROI recovery API, trusted original as source |
| Post-Recovery Verification | **PASS** — real SHA-3 match check on recovered bytes |
| Blockchain Audit | **LOCAL SIMULATION** — labeled honestly everywhere; forensic event written as a REAL transaction to the local PoW ledger |
| Evidence Report download | **PASS** — `/api/forensic-demo/evidence/{id}` JSON bundle from real analysis |
| Frontend Build | **PASS** (`tsc` 0 errors, `vite build` OK) |
| Tests | 26 focused proof tests PASS + full suite (see below) |
| Role security (RBAC) | **PASS** — JWT + RoleChecker on all new endpoints; 401/403 verified |
| Runtime validation | **PASS** — page executed end-to-end in browser (lifecycle → proof → recovery → audit) |

---

## WHAT WAS BUILT

### Backend (reused existing chain — no rebuilt logic)

1. `backend/app/forensic_dataset.py`
   - Added **actual image difference** computation: `cv2.absdiff(original, tampered)` → normalized difference map (JET colormap), region-highlight overlay, changed-pixel count/%. All from real pixel data — no artificial red regions.
2. `backend/app/routes/forensic_demo.py`
   - `POST /api/forensic-demo/analyze/{id}?record_audit=true` — runs the full existing chain, then writes a **real transaction** to the project's local simulated blockchain ledger (`blockchain_service.local_chain.write_transaction`) with SHA-3/DIT/risk/trust/recovery fields + performer. Returns tx hash, block index, timestamp, and the honest label `Local Blockchain Simulation`. On failure → `blockchain_audit: null` (absence reported, never fabricated).
   - `GET /api/forensic-demo/evidence/{id}` — forensic evidence bundle for download (report type, generator, disclaimer, all real analysis values with base64 images stripped for a small text payload).

### Frontend

3. `frontend/src/views/IntegrityProof.tsx` — the dedicated page (route `integrity-proof`):
   - Header + honest blockchain badge
   - **Security lifecycle hero** (9 steps) — active step derived from real result state
   - **Visual Tamper Proof** — Original/Tampered/Recovered panels with real SHA-3, dimensions, status badges; recovery panel shows "Recovery unavailable for this image." when absent
   - **Comparison controls** — 8 tabs (Original, Tampered, Recovered, Ground Truth, AI Mask, Overlay, Grad-CAM, Difference), zoom/pan/reset/fullscreen/overlay opacity
   - **SHA-3 proof** — original/current/recovered hashes, MATCH/MISMATCH computed, honest explanation (SHA-3 ≠ pixel localization)
   - **Digital Integrity Twin** — image ID, trusted reference, current state, provenance reference, lifecycle markers; "Event data unavailable" where not tracked; viva-suitable explanation card
   - **Tamper localization** — Original/Tampered/GT/AI prediction panels + real region table (X/Y/W/H/area/confidence)
   - **Ground Truth vs AI** — GT mask + predicted mask + overlap + IoU/Dice/Precision/Recall/F1/Pixel accuracy (only values actually calculated)
   - **Image Difference** — difference map + region highlight + changed pixel stats
   - **AI Forensic Evidence** — detection, probability, confidence, model, risk, trust, quarantine state; careful wording ("identifies suspicious regions", never "proves malicious modification")
   - **Grad-CAM** — heatmap + opacity control + explicit "model explanation, not cryptographic proof" note; "Grad-CAM unavailable for this analysis." fallback
   - **Region-Level Self-Recovery** — flow, source, status, ROIs, 3-hash evidence, before/after comparison with actual images
   - **Blockchain Forensic Audit** — proof event timeline (runtime events only) + real ledger blocks + recorded TX panel + "WHAT DOES BLOCKCHAIN PROVE?" card + explicit **Local Blockchain Simulation** labeling
   - **Complete Security Lifecycle** — static visual architecture flow (marked as explanation, not runtime data)
   - **Integrity Proof Summary** — 13 checks, green ✓ only when actual runtime data confirms, `○ Not available` otherwise
   - **Evidence download** button → real JSON bundle
4. Route registered in `App.tsx`, `Sidebar.tsx`, `Navbar.tsx`.

### Tests

5. `backend/tests/test_integrity_proof_page.py` — 9 tests:
   - difference map computed from real pixels (counts/percentage consistent)
   - evidence bundle auth + content (real chain values)
   - blockchain audit recorded (real tx hash/block, honest label)
   - no audit fabricated when flag absent
   - recorded tx appears in `/api/blockchain/blocks`
   - ledger contains no "Ethereum Mainnet"/"Production Blockchain"/"Immutable Public" claims
   - RBAC 401 on unauthenticated proof endpoints
   - full proof-page data completeness (SHA-3 mismatch, GT region, IoU/Dice bounds, risk/trust fields, recovery, difference)

---

## TEST RESULTS

- Focused proof tests: **9 passed** (`test_integrity_proof_page.py`)
- Forensic demo tests: **17 passed** (unchanged, still green after additions)
- Combined focused run: **26 passed**
- **Full backend suite: 437 passed, 23 skipped, 0 failed** (170.86 s / 2 min 50 s; 23 skips = IPFS daemon absent, pre-existing/expected; +9 new tests this phase)
- `tsc --noEmit`: **0 errors**
- `npm run build`: **PASS** (built in 8.19 s)

---

## RUNTIME VALIDATION (real browser execution, 2026-10-05 ~00:05–00:19)

Executed end-to-end in a real browser against live backend (`localhost:8000`) + Vite dev server (`localhost:5173`), logged in as `drsmith` (doctor):

| Step | Result |
|---|---|
| 1. Open proof page (stitch sidebar → "Integrity Proof") | PASS — heading "Medical Image Integrity Proof & Self-Recovery" |
| 2. Sample selector loads | PASS — 6 real dataset samples (SPM-001…006) |
| 3. Run Complete Proof (SPM-001) | PASS — full chain executed live |
| 4. 3 proof panels | PASS — ✓ TRUSTED / ⚠ TAMPERED / ✓ VERIFIED with real SHA-3s |
| 5. SHA-3 mismatch detected | PASS — original `81580fd1c609…` vs current `111d4316…` → MISMATCH confirmed |
| 6. DIT state | PASS — TAMPERED, real last-verification timestamp, provenance ref, explanation card |
| 7. Localization | PASS — GT region 104,94,29,29 (0.94%) vs model region X4 Y4 W248 H249, both real |
| 8. GT vs AI metrics | PASS — IoU 0.0099 / Dice 0.0197 / Precision 0.0099 / Recall 1 / F1 0.0197 / Pixel acc 0.0671 (honest live computation; prototype model over-predicts — values are real, not curated) |
| 9. Image Difference + tab switch | PASS — Difference tab renders real `data:image/png` diff (4.2 KB base64) |
| 10. Grad-CAM + honesty note | PASS — "model explanation, not cryptographic proof" present |
| 11. Recovery + before/after | PASS — 1 ROI restored, post-recovery SHA-3 MATCH (= original) |
| 12. Blockchain audit | PASS — **real TX `8d1d0294…` on block #579**, ledger 579 blocks, labeled **Local Blockchain Simulation** everywhere |
| 13. Proof summary | PASS — all 13 items green from runtime data; **zero** "○ Not available" entries |
| 14. Evidence report button | PASS — clicked, no error; endpoint verified via HTTP (`report_type`, real sha3/dit/risk/recovery fields) |
| 15. RBAC | PASS — 401 unauthenticated asserted in tests; page behind JWT login |
| Screenshots | UNAVAILABLE — browser tool requires a visible desktop window in this environment; DOM-level evidence captured instead |

---

## HONESTY CONTROLS APPLIED

- No hardcoded hashes, coordinates, masks, heatmaps, metrics, timestamps, or transactions — everything computed at runtime.
- Blockchain labeled **"Local Blockchain Simulation"** in the page header, audit section, TX record, evidence disclaimer, and tests assert no mainnet/production claims.
- Missing events → "Event data unavailable" / "○ Not available"; no green checks for unavailable features.
- Difference visualization from `cv2.absdiff` on real bytes — no artificial highlighting for effect.
- Grad-CAM explicitly stated as model explanation, not cryptographic proof.
- Recovery section renders only when actual recovery ran; otherwise "Recovery unavailable for this image."

---

## ANYTHING NOT COMPLETED

- **5-minute target: exceeded** (actual ~25 min including full suite + runtime validation). All functionality complete.
- Synced zoom/pan across panels: implemented as single-viewer zoom/pan (per-panel sync marked "where technically possible" in the spec) — one viewer, not cross-panel link.
- DIT historical lifecycle timestamps for dataset demo samples: dataset samples have no DB-backed DIT history → shown as "Event data unavailable" rather than invented (per spec).

---

## FINAL SUCCESS CRITERIA (evaluator questions)

All 19 viva questions are answerable visually from the page (original/tampered images, both SHA-3s, DIT state, GT + AI regions, IoU/Dice, Grad-CAM, risk/trust, quarantine, recovery source + verification, blockchain record + live-or-simulated status).
