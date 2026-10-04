# Medical Image Dataset Report — MediSecure AI

**Date:** 2026-10-04
**Status:** PASS (with documented synthetic-phantom fallback)

## 1. Dataset Selected

| Field | Value |
|---|---|
| **Name** | MediSecure Synthetic Phantom Forensic Dataset |
| **Official Source** | Generated in-project (`backend/app/forensic_dataset.py`) |
| **URL** | N/A — controlled synthetic fixture |
| **Modality** | Grayscale brain-MRI-like phantom, 256×256 PNG |
| **Image Count** | 6 samples (original + tampered + GT mask each) |
| **Annotations** | Per-pixel ground-truth tamper mask for every sample |
| **License** | Project-internal synthetic data — no third-party data, no patient data |
| **Academic Usage** | Demonstration/benchmark fixture only |
| **Citation** | N/A (synthetic; generation routine derives from the project's existing `generate_synthetic_medical_image` / `introduce_tampering` fixtures used by `test_end_to_end_framework.py` and `test_ai_forensics.py`) |
| **Privacy** | Fully synthetic — **no PII, no real patient images, no private hospital data** |

## 2. Why a Synthetic Phantom (Documented Fallback)

Per the dataset time-limit rule (Section 10 of the phase prompt):

1. First check was made for an existing local compatible dataset — **none existed** in the project (`datasets/` was absent).
2. Downloading a public dataset (TCIA/PhysioNet/etc.) within the 5-minute benchmark window was rejected per the "DO NOT WAIT FOR HUGE DATASET DOWNLOADS" rule.
3. Therefore the documented fallback was used: **controlled synthetic medical-image demo fixture** — the project's own deterministic brain-MRI-like phantom generator, which is already the validated fixture used by the existing AI training and test pipeline.

No access controls were bypassed; no registration-gated datasets were used.

## 3. Preprocessing

- Grayscale PNG decode (no arbitrary alteration of pixel values)
- Model applies aspect-ratio-preserving 256×256 letterbox at inference time (`prepare_image_for_ai_model`)
- No train/test split leakage: each sample is an independent deterministic generation under seed `20261004`
- Split assignment: 3× `validation`, 3× `test`

## 4. Controlled Tampering Method

Reuses the project's existing `introduce_tampering()` with a deterministic seed:

| Type | Operation |
|---|---|
| 0 | Local intensity insertion (bright circular region) |
| 1 | Local Gaussian blur patch (region replacement) |
| 2 | Local intensity suppression (dark circular region) |

**Ground-truth method:** the GT mask is produced by the *same* tampering operation (`cv2.circle(mask, (x, y), r, 255, -1)`), so region coordinates in `tamper_metadata.csv` come from the actual operation — **never manually invented**.

## 5. Dataset Structure

```
datasets/
├── raw/original/            # 6 trusted originals
├── tampered/                # 6 controlled tampered images
├── masks/                   # 6 ground-truth masks
├── samples/{original,tampered,masks,heatmaps}/   # frontend-accessible copies
└── metadata/
    ├── dataset_manifest.json    # per-sample SHA-3, region, license, split
    ├── image_metadata.csv
    └── tamper_metadata.csv      # region x/y/w/h + both SHA-3 values
```

## 6. SHA-3

- `original_sha3` and `tampered_sha3` computed with the project's real SHA-3 (`app.crypto.sha3_hash`) from actual bytes written to disk.
- Validation asserts `original_sha3 != tampered_sha3` for every sample (tamper proof) and re-verifies both against file contents.

## 7. Dataset Quality Validation

Automated `validate_dataset()` checks: corrupted files, missing files, dimension mismatch, empty masks, duplicates, missing/incorrect SHA-3, invalid area percentages.

**Dataset validation: PASS** (0 issues across 6 samples) — verified by `test_dataset_validation` and the `/api/forensic-demo/dataset-validation` endpoint.

## 8. Limitations

- Synthetic phantom is a **research prototype fixture**, not clinical data; it does not represent real scanner noise/pathology.
- Localization metrics are reported against this synthetic ground truth only.
- No clinical validation is claimed.
