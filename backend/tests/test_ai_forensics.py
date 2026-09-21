import os
import sys
import numpy as np
import torch
import cv2
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.ai_model import (
    SrmNoiseFilter,
    HybridSwinUNet,
    ResidualAttentionUNet,
    calculate_segmentation_metrics,
    generate_synthetic_medical_image,
    introduce_tampering,
    extract_srm_residual,
    localize_tampering,
    get_ai_model,
    AI_IMAGE_SIZE,
)


def test_srm_noise_filter_layer():
    """Verify Spatial Rich Model (SRM) filter outputs 3 high-frequency residual channels."""
    srm = SrmNoiseFilter()
    x = torch.randn(1, 1, 64, 64)
    out = srm(x)

    assert out.shape == (1, 3, 64, 64)
    assert not torch.isnan(out).any()


def test_srm_residual_image_extraction():
    """Verify extract_srm_residual returns valid PNG image bytes."""
    # Create test grayscale image
    img = np.zeros((128, 128), dtype=np.uint8)
    cv2.circle(img, (64, 64), 30, 200, -1)
    _, encoded = cv2.imencode(".png", img)

    srm_bytes = extract_srm_residual(encoded.tobytes())
    assert len(srm_bytes) > 0
    assert srm_bytes[:8] == b"\x89PNG\r\n\x1a\n"


def test_hybrid_swin_unet_forward():
    """Verify forward pass of Hybrid Swin-Unet produces sigmoid probability mask of matching shape."""
    model = get_ai_model()
    x = torch.rand(1, 1, AI_IMAGE_SIZE[0], AI_IMAGE_SIZE[1])
    with torch.no_grad():
        out = model(x)

    assert out.shape == (1, 1, AI_IMAGE_SIZE[0], AI_IMAGE_SIZE[1])
    assert torch.all(out >= 0.0) and torch.all(out <= 1.0)


def test_segmentation_metrics_calculation():
    """Verify Dice, IoU, MCC, precision, recall, and confusion matrix calculation."""
    gt = np.zeros((64, 64), dtype=np.uint8)
    pred = np.zeros((64, 64), dtype=np.float32)

    # Perfect overlap in 10x10 square
    gt[20:30, 20:30] = 1
    pred[20:30, 20:30] = 0.95

    metrics = calculate_segmentation_metrics(pred, gt)
    assert metrics["dice"] > 0.9
    assert metrics["iou"] > 0.9
    assert metrics["precision"] == 1.0
    assert metrics["recall"] == 1.0
    assert metrics["confusion_matrix"]["tp"] == 100
    assert metrics["confusion_matrix"]["fp"] == 0
    assert metrics["confusion_matrix"]["fn"] == 0


def test_localize_tampering_pipeline():
    """Verify end-to-end localize_tampering function."""
    base = generate_synthetic_medical_image()
    tampered, mask = introduce_tampering(base)
    _, enc = cv2.imencode(".png", tampered)

    output_filename = "test_heatmap_output.png"
    tampered_pct, confidence, bboxes, hpath = localize_tampering(enc.tobytes(), output_filename)

    assert 0.0 <= tampered_pct <= 100.0
    assert 0.0 <= confidence <= 1.0
    assert isinstance(bboxes, list)
    assert os.path.exists(hpath)
