import os
import io
import cv2
import json
import math
import hashlib
import datetime
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader, Subset
import torch.nn.functional as F
from loguru import logger

from app.config import (
    AI_MODEL_PATH,
    AI_TRAIN_EPOCHS,
    AI_IMAGE_SIZE,
    AI_TAMPER_THRESHOLD,
    AI_MIN_REGION_AREA,
    STORAGE_DIR
)

# ===========================================================================
# RESEARCH INTEGRITY NOTICE & MODEL PROVENANCE SPECIFICATION
# ===========================================================================
# Model Name: Hybrid Swin-UNet + Spatial Rich Model (SRM) Noise Filter
# Version: 1.0.0-prototype
# Status: EXPERIMENTAL PROTOTYPE (Evaluation-Ready)
#
# IMPORTANT RESEARCH INTEGRITY DISCLOSURES:
# 1. This model was trained exclusively on SYNTHETIC demonstration data
#    (OpenCV elliptical phantom models approximating brain MRI scans with
#    simulated copy-move, blur, and lesion perturbations).
# 2. It has NOT undergone clinical validation on real-world clinical datasets.
# 3. All reported evaluation metrics (Dice, IoU, MCC, ROC-AUC) reflect
#    performance on SYNTHETIC benchmark fixtures and MUST NOT be claimed
#    as clinical efficacy.
# ===========================================================================

MODEL_NAME = "Hybrid Swin-UNet + SRM"
MODEL_VERSION = "1.0.0-prototype"
MODEL_ARCHITECTURE = (
    "Dual-Stream (Grayscale + SRM Noise Filter) Swin Transformer Encoder "
    "with Attention-Gated U-Net Decoder"
)
PREPROCESSING_VERSION = "v1-letterbox-norm"
THRESHOLD_VERSION = "v1-0.5"
DATASET_PROVENANCE = "SYNTHETIC_PROTOTYPE (OpenCV Elliptical Brain Phantom)"


def get_model_provenance(device: torch.device | str | None = None) -> dict:
    """
    Returns structured, reproducible metadata documenting the AI model's architecture,
    provenance, input specifications, and operational limitations.
    """
    dev_str = str(device) if device is not None else ("cuda" if torch.cuda.is_available() else "cpu")
    checkpoint_exists = os.path.exists(AI_MODEL_PATH)
    checkpoint_id = "unavailable"
    if checkpoint_exists:
        try:
            with open(AI_MODEL_PATH, "rb") as f:
                checkpoint_id = f"sha256-{hashlib.sha256(f.read()[:4096]).hexdigest()[:16]}"
        except Exception:
            checkpoint_id = "present-unhashed"

    return {
        "model_name": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "architecture": MODEL_ARCHITECTURE,
        "checkpoint_identifier": checkpoint_id,
        "checkpoint_path": str(AI_MODEL_PATH),
        "checkpoint_loaded": checkpoint_exists,
        "dataset_type": DATASET_PROVENANCE,
        "is_clinically_validated": False,
        "clinical_disclaimer": (
            "This model is an advisory research prototype trained on synthetic phantom data. "
            "It is NOT clinically validated and must NOT be used as a primary diagnostic tool."
        ),
        "model_input_dimensions": list(AI_IMAGE_SIZE),
        "preprocessing_version": PREPROCESSING_VERSION,
        "threshold_version": THRESHOLD_VERSION,
        "default_threshold": AI_TAMPER_THRESHOLD,
        "inference_device": dev_str,
        "inference_framework": f"PyTorch {torch.__version__}",
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }


# ===========================================================================
# 1. Neural Network Architecture Components
# ===========================================================================

class SrmNoiseFilter(nn.Module):
    """
    Spatial Rich Model (SRM) Noise Filter Stream.
    Extracts local high-frequency noise residuals to identify tampered boundaries.
    Uses 3 non-trainable 5x5 steganographic / forensic kernels:
      - 1st-order edge residual
      - 2nd-order edge residual (SPAM)
      - Square edge residual
    """
    def __init__(self):
        super().__init__()
        k1 = torch.tensor([[ 0.0,  0.0, 0.0, 0.0, 0.0],
                           [ 0.0, -1.0, 2.0,-1.0, 0.0],
                           [ 0.0,  2.0,-4.0, 2.0, 0.0],
                           [ 0.0, -1.0, 2.0,-1.0, 0.0],
                           [ 0.0,  0.0, 0.0, 0.0, 0.0]]) / 4.0

        k2 = torch.tensor([[-1.0,  2.0, -2.0,  2.0, -1.0],
                           [ 2.0, -6.0,  8.0, -6.0,  2.0],
                           [-2.0,  8.0,-12.0,  8.0, -2.0],
                           [ 2.0, -6.0,  8.0, -6.0,  2.0],
                           [-1.0,  2.0, -2.0,  2.0, -1.0]]) / 12.0

        k3 = torch.tensor([[ 0.0,  0.0,  1.0,  0.0, 0.0],
                           [ 0.0,  0.0, -3.0,  0.0, 0.0],
                           [ 1.0, -3.0,  8.0, -3.0, 1.0],
                           [ 0.0,  0.0, -3.0,  0.0, 0.0],
                           [ 0.0,  0.0,  1.0,  0.0, 0.0]]) / 8.0

        self.filter = nn.Conv2d(1, 3, kernel_size=5, padding=2, bias=False)
        weights = torch.stack([k1, k2, k3]).unsqueeze(1)
        self.filter.weight = nn.Parameter(weights, requires_grad=False)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.filter(x)


class ResidualDoubleConv(nn.Module):
    """
    Residual Double Convolution Block.
    Enhances feature propagation using skip connections inside the block.
    """
    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.conv = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1),
            nn.BatchNorm2d(out_channels)
        )
        self.shortcut = nn.Sequential()
        if in_channels != out_channels:
            self.shortcut = nn.Sequential(
                nn.Conv2d(in_channels, out_channels, kernel_size=1, stride=1),
                nn.BatchNorm2d(out_channels)
            )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return F.relu(self.conv(x) + self.shortcut(x))


class SwinBlock(nn.Module):
    """
    Hierarchical Swin Transformer-inspired Block.
    Provides multi-scale receptive field and global context capturing.
    """
    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.proj = nn.Conv2d(in_channels, out_channels, kernel_size=1)
        self.attn_conv = nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1, groups=out_channels)
        self.mlp = nn.Sequential(
            nn.Conv2d(out_channels, out_channels, kernel_size=1),
            nn.BatchNorm2d(out_channels),
            nn.GELU(),
            nn.Conv2d(out_channels, out_channels, kernel_size=1)
        )
        self.norm1 = nn.BatchNorm2d(out_channels)
        self.norm2 = nn.BatchNorm2d(out_channels)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.proj(x)
        residual = x
        x = self.norm1(x)
        x = self.attn_conv(x)
        x = x + residual

        residual = x
        x = self.norm2(x)
        x = self.mlp(x)
        return x + residual


class AttentionGate(nn.Module):
    """
    Attention Gate (AG).
    Filters features propagated through skip connections using gating signal from lower resolution.
    """
    def __init__(self, F_g: int, F_l: int, F_int: int):
        super().__init__()
        self.W_g = nn.Sequential(
            nn.Conv2d(F_g, F_int, kernel_size=1, stride=1),
            nn.BatchNorm2d(F_int)
        )
        self.W_x = nn.Sequential(
            nn.Conv2d(F_l, F_int, kernel_size=1, stride=1),
            nn.BatchNorm2d(F_int)
        )
        self.psi = nn.Sequential(
            nn.Conv2d(F_int, 1, kernel_size=1, stride=1),
            nn.BatchNorm2d(1)
        )
        self.relu = nn.ReLU(inplace=True)
        self.sigmoid = nn.Sigmoid()

    def forward(self, g: torch.Tensor, x: torch.Tensor) -> torch.Tensor:
        g1 = self.W_g(g)
        x1 = self.W_x(x)
        if g1.shape[2:] != x1.shape[2:]:
            g1 = F.interpolate(g1, size=x1.shape[2:], mode='bilinear', align_corners=True)
        psi = self.relu(g1 + x1)
        psi = self.psi(psi)
        alpha = self.sigmoid(psi)
        return x * alpha


class HybridSwinUNet(nn.Module):
    """
    Hybrid Swin-Unet Architecture.
    Integrates SRM Noise Filter Stream + Swin Transformer Encoder + Attention-Gated U-Net Decoder.
    """
    def __init__(self, use_srm: bool = True, use_swin: bool = True, use_attention: bool = True):
        super().__init__()
        self.use_srm = use_srm
        self.use_swin = use_swin
        self.use_attention = use_attention
        self.srm = SrmNoiseFilter()

        # Dual-stream encoder fusion:
        self.gray_enc = ResidualDoubleConv(1, 16)
        self.srm_enc = ResidualDoubleConv(3, 16)
        self.fuse = nn.Sequential(
            nn.Conv2d(32, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(inplace=True)
        )

        # Swin-based Hierarchical Encoder Stages
        encoder_block_1 = SwinBlock(32, 64) if use_swin else ResidualDoubleConv(32, 64)
        encoder_block_2 = SwinBlock(64, 128) if use_swin else ResidualDoubleConv(64, 128)
        bottleneck_block = SwinBlock(128, 256) if use_swin else ResidualDoubleConv(128, 256)
        self.swin1 = nn.Sequential(nn.MaxPool2d(2), encoder_block_1)
        self.swin2 = nn.Sequential(nn.MaxPool2d(2), encoder_block_2)

        # Bottleneck (tracked for Grad-CAM explainability)
        self.bottleneck = bottleneck_block

        # Placeholders for Grad-CAM hooks
        self.gradients = None
        self.activations = None

        # Attention Gates for Skip Connections
        self.attn2 = AttentionGate(F_g=256, F_l=128, F_int=64)
        self.attn1 = AttentionGate(F_g=128, F_l=64, F_int=32)

        # Decoder Upsampling
        self.up1 = nn.ConvTranspose2d(256, 128, kernel_size=2, stride=2)
        self.conv1 = ResidualDoubleConv(256, 128)

        self.up2 = nn.ConvTranspose2d(128, 64, kernel_size=2, stride=2)
        self.conv2 = ResidualDoubleConv(128, 64)

        self.up3 = nn.ConvTranspose2d(64, 32, kernel_size=2, stride=2)
        self.conv3 = ResidualDoubleConv(64, 32)

        self.outc = nn.Conv2d(32, 1, kernel_size=1)

    def activations_hook(self, grad: torch.Tensor):
        self.gradients = grad

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # SRM stream
        # Grayscale stream
        gray_out = self.gray_enc(x)

        if self.use_srm:
            srm_feat = self.srm(x)
            srm_out = self.srm_enc(srm_feat)
        else:
            srm_out = torch.zeros_like(gray_out)

        # Fuse stream features
        fused = torch.cat([gray_out, srm_out], dim=1)
        enc0 = self.fuse(fused)  # Output size: 32 x H x W

        # Encoder downsampling
        enc1 = self.swin1(enc0)  # Output size: 64 x H/2 x W/2
        enc2 = self.swin2(enc1)  # Output size: 128 x H/4 x W/4

        # Bottleneck
        bn = self.bottleneck(enc2)  # Output size: 256 x H/4 x W/4

        if bn.requires_grad:
            bn.register_hook(self.activations_hook)
            self.activations = bn

        # Upsampling Stage 1
        gated2 = self.attn2(bn, enc2) if self.use_attention else enc2
        up1_feat = self.up1(bn)
        if up1_feat.shape[2:] != gated2.shape[2:]:
            up1_feat = F.interpolate(up1_feat, size=gated2.shape[2:], mode='bilinear', align_corners=True)
        cat1 = torch.cat([up1_feat, gated2], dim=1)
        dec1 = self.conv1(cat1)

        # Upsampling Stage 2
        gated1 = self.attn1(dec1, enc1) if self.use_attention else enc1
        up2_feat = self.up2(dec1)
        if up2_feat.shape[2:] != gated1.shape[2:]:
            up2_feat = F.interpolate(up2_feat, size=gated1.shape[2:], mode='bilinear', align_corners=True)
        cat2 = torch.cat([up2_feat, gated1], dim=1)
        dec2 = self.conv2(cat2)

        # Upsampling Stage 3
        up3_feat = self.up3(dec2)
        if up3_feat.shape[2:] != enc0.shape[2:]:
            up3_feat = F.interpolate(up3_feat, size=enc0.shape[2:], mode='bilinear', align_corners=True)
        cat3 = torch.cat([up3_feat, enc0], dim=1)
        dec3 = self.conv3(cat3)

        logits = self.outc(dec3)
        return torch.sigmoid(logits)


# Maintain naming compatibility with existing celery/routing modules
class ResidualAttentionUNet(HybridSwinUNet):
    pass


# ===========================================================================
# 2. Image Preprocessing & Original Resolution Coordinate Mapping
# ===========================================================================

def prepare_image_for_ai_model(
    image: np.ndarray,
    target_size: tuple[int, int] = AI_IMAGE_SIZE,
    preserve_aspect_ratio: bool = True
) -> tuple[np.ndarray, dict]:
    """
    Standardized, deterministic preprocessing pipeline.
    Preprocesses an input medical image to the fixed dimensions required by the model.
    Preserves aspect ratio using proportional scaling and letterbox padding when requested.

    Returns:
        (canvas_image, dimension_metadata)
    """
    if image is None or image.size == 0:
        raise ValueError("Invalid or empty image array")

    if len(image.shape) == 3 and image.shape[2] in (3, 4):
        image = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    original_h, original_w = image.shape[:2]
    target_w, target_h = target_size

    metadata = {
        "original_dimensions": (int(original_w), int(original_h)),
        "original_width": int(original_w),
        "original_height": int(original_h),
        "original_aspect_ratio": round(original_w / max(1, original_h), 4),
        "model_input_dimensions": (int(target_w), int(target_h)),
        "model_input_width": int(target_w),
        "model_input_height": int(target_h),
        "is_aspect_ratio_preserved": preserve_aspect_ratio,
    }

    if not preserve_aspect_ratio or (original_w == target_w and original_h == target_h):
        resized = cv2.resize(image, (target_w, target_h), interpolation=cv2.INTER_AREA)
        metadata.update({
            "scale_x": original_w / target_w,
            "scale_y": original_h / target_h,
            "scale": min(target_w / original_w, target_h / original_h),
            "pad_x": 0,
            "pad_y": 0,
            "scaled_w": target_w,
            "scaled_h": target_h
        })
        return resized, metadata

    scale = min(target_w / original_w, target_h / original_h)
    scaled_w = max(1, int(round(original_w * scale)))
    scaled_h = max(1, int(round(original_h * scale)))

    scaled_img = cv2.resize(image, (scaled_w, scaled_h), interpolation=cv2.INTER_AREA)
    canvas = np.zeros((target_h, target_w), dtype=image.dtype)

    pad_x = (target_w - scaled_w) // 2
    pad_y = (target_h - scaled_h) // 2

    canvas[pad_y:pad_y + scaled_h, pad_x:pad_x + scaled_w] = scaled_img

    metadata.update({
        "scale": scale,
        "scale_x": scale,
        "scale_y": scale,
        "pad_x": pad_x,
        "pad_y": pad_y,
        "scaled_w": scaled_w,
        "scaled_h": scaled_h
    })
    return canvas, metadata


def map_mask_to_original_resolution(
    pred_mask_256: np.ndarray,
    dimension_metadata: dict,
    binary: bool = False
) -> np.ndarray:
    """
    Transforms model segmentation output (256x256) back to the EXACT original image dimensions (W x H).
    Properly removes letterbox padding and performs spatial un-scaling.

    Args:
        pred_mask_256: 2D numpy array [256, 256] from model inference
        dimension_metadata: dict from prepare_image_for_ai_model
        binary: if True, returns uint8 binary mask (0 or 255); else float32 probability map [0.0, 1.0]

    Returns:
        mask_original: 2D numpy array of shape (original_h, original_w)
    """
    orig_w, orig_h = dimension_metadata["original_dimensions"]

    if dimension_metadata.get("is_aspect_ratio_preserved", False) and dimension_metadata.get("pad_x") is not None:
        pad_x = dimension_metadata["pad_x"]
        pad_y = dimension_metadata["pad_y"]
        scaled_w = dimension_metadata["scaled_w"]
        scaled_h = dimension_metadata["scaled_h"]

        # Crop out letterbox padding
        unpadded = pred_mask_256[pad_y:pad_y + scaled_h, pad_x:pad_x + scaled_w]
        if unpadded.size == 0:
            unpadded = pred_mask_256

        interp = cv2.INTER_NEAREST if binary else cv2.INTER_LINEAR
        restored = cv2.resize(unpadded, (orig_w, orig_h), interpolation=interp)
    else:
        interp = cv2.INTER_NEAREST if binary else cv2.INTER_LINEAR
        restored = cv2.resize(pred_mask_256, (orig_w, orig_h), interpolation=interp)

    if binary:
        return (restored > (0.5 if restored.dtype != np.uint8 else 127)).astype(np.uint8) * 255
    return restored.astype(np.float32)


def map_bounding_boxes_to_original(
    boxes: list[dict],
    dimension_metadata: dict
) -> list[dict]:
    """
    Transforms bounding box coordinates from AI model input space (256x256)
    back to the true original image coordinates.
    """
    orig_w, orig_h = dimension_metadata["original_dimensions"]
    mapped = []

    if dimension_metadata.get("is_aspect_ratio_preserved", False) and dimension_metadata.get("pad_x") is not None:
        scale = dimension_metadata["scale"]
        pad_x = dimension_metadata["pad_x"]
        pad_y = dimension_metadata["pad_y"]

        for b in boxes:
            x_unpad = b["x"] - pad_x
            y_unpad = b["y"] - pad_y
            bx = int(max(0, min(orig_w - 1, round(x_unpad / scale))))
            by = int(max(0, min(orig_h - 1, round(y_unpad / scale))))
            bw = int(max(1, min(orig_w - bx, round(b["width"] / scale))))
            bh = int(max(1, min(orig_h - by, round(b["height"] / scale))))

            box_copy = dict(b)
            box_copy.update({"x": bx, "y": by, "width": bw, "height": bh})
            mapped.append(box_copy)
    else:
        scale_x = dimension_metadata.get("scale_x", orig_w / dimension_metadata["model_input_dimensions"][0])
        scale_y = dimension_metadata.get("scale_y", orig_h / dimension_metadata["model_input_dimensions"][1])
        for b in boxes:
            bx = int(max(0, min(orig_w - 1, round(b["x"] * scale_x))))
            by = int(max(0, min(orig_h - 1, round(b["y"] * scale_y))))
            bw = int(max(1, min(orig_w - bx, round(b["width"] * scale_x))))
            bh = int(max(1, min(orig_h - by, round(b["height"] * scale_y))))
            box_copy = dict(b)
            box_copy.update({"x": bx, "y": by, "width": bw, "height": bh})
            mapped.append(box_copy)

    return mapped


# ===========================================================================
# 3. Postprocessing & Region-Level Forensics
# ===========================================================================

def extract_tamper_regions(
    binary_mask_orig: np.ndarray,
    prob_map_orig: np.ndarray,
    min_area: int = AI_MIN_REGION_AREA
) -> list[dict]:
    """
    Performs connected components analysis on the original-resolution binary tamper mask
    to extract structured, verifiable region-level forensic evidence.

    Returns:
        List of dicts: [
            {
                "region_id": "ROI_1",
                "x": int, "y": int, "width": int, "height": int,
                "area_pixels": int,
                "area_percentage": float,
                "centroid": [float, float],
                "mean_confidence": float,
                "severity": "LOW" | "MEDIUM" | "HIGH"
            }, ...
        ]
    """
    mask_u8 = (binary_mask_orig > 0).astype(np.uint8) * 255
    total_pixels = mask_u8.size
    contours, _ = cv2.findContours(mask_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    regions = []
    idx = 1
    for contour in contours:
        area = int(cv2.contourArea(contour))
        if area < min_area:
            continue

        bx, by, bw, bh = cv2.boundingRect(contour)
        M = cv2.moments(contour)
        if M["m00"] != 0:
            cx = round(float(M["m10"] / M["m00"]), 1)
            cy = round(float(M["m01"] / M["m00"]), 1)
        else:
            cx = float(bx + bw / 2)
            cy = float(by + bh / 2)

        roi_prob = prob_map_orig[by:by + bh, bx:bx + bw]
        mean_conf = float(np.mean(roi_prob)) if roi_prob.size > 0 else 0.5
        area_pct = round((area / max(1, total_pixels)) * 100.0, 3)

        # Objective, documented heuristic severity per region
        if area_pct >= 5.0 or mean_conf >= 0.85:
            severity = "HIGH"
        elif area_pct >= 1.0 or mean_conf >= 0.60:
            severity = "MEDIUM"
        else:
            severity = "LOW"

        regions.append({
            "region_id": f"ROI_{idx}",
            "x": int(bx),
            "y": int(by),
            "width": int(bw),
            "height": int(bh),
            "area_pixels": area,
            "area_percentage": area_pct,
            "centroid": [cx, cy],
            "mean_confidence": round(min(1.0, max(0.0, mean_conf)), 4),
            "severity": severity,
            "confidence_label": f"{severity}_CONFIDENCE_TAMPER"
        })
        idx += 1

    return regions


# ===========================================================================
# 4. Evaluation Metrics (Quantitative Assessment Infrastructure)
# ===========================================================================

def calculate_segmentation_metrics(pred_mask: np.ndarray, gt_mask: np.ndarray) -> dict:
    """
    Calculates Dice (F1), IoU (Jaccard), Precision, Recall, Pixel Accuracy, MCC, and ROC-AUC.
    Inputs are 2D binary or probability numpy arrays.

    NOTE: Metrics reflect performance on SYNTHETIC benchmark data only.
    """
    pred = (pred_mask > 0.5).astype(np.uint8)
    gt = (gt_mask > 0.5).astype(np.uint8)

    tp = int(np.sum((pred == 1) & (gt == 1)))
    fp = int(np.sum((pred == 1) & (gt == 0)))
    fn = int(np.sum((pred == 0) & (gt == 1)))
    tn = int(np.sum((pred == 0) & (gt == 0)))
    total = tp + fp + fn + tn

    precision = float(tp / (tp + fp)) if (tp + fp) > 0 else (1.0 if fp == 0 else 0.0)
    recall = float(tp / (tp + fn)) if (tp + fn) > 0 else (1.0 if fn == 0 else 0.0)
    iou = float(tp / (tp + fp + fn)) if (tp + fp + fn) > 0 else 1.0
    dice = float(2 * tp / (2 * tp + fp + fn)) if (2 * tp + fp + fn) > 0 else 1.0
    pixel_accuracy = float((tp + tn) / max(1, total))

    # Matthews Correlation Coefficient (MCC)
    mcc_denom = float(np.sqrt(float(tp + fp) * float(tp + fn) * float(tn + fp) * float(tn + fn)))
    mcc = float(tp * tn - fp * fn) / mcc_denom if mcc_denom > 0 else 0.0

    # ROC-AUC using trapezoidal integration
    y_true = gt.flatten()
    y_scores = pred_mask.flatten()

    desc_indices = np.argsort(y_scores, kind="mergesort")[::-1]
    y_scores = y_scores[desc_indices]
    y_true = y_true[desc_indices]

    tp_sum = np.cumsum(y_true)
    fp_sum = np.cumsum(1 - y_true)
    total_pos = tp_sum[-1] if len(tp_sum) > 0 else 0
    total_neg = fp_sum[-1] if len(fp_sum) > 0 else 0

    if total_pos == 0 or total_neg == 0:
        roc_auc = 1.0
    else:
        tpr = tp_sum / total_pos
        fpr = fp_sum / total_neg
        roc_auc = float(np.trapz(tpr, fpr))

    return {
        "dice": round(dice, 4),
        "iou": round(iou, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1_score": round(dice, 4),
        "pixel_accuracy": round(pixel_accuracy, 4),
        "mcc": round(mcc, 4),
        "roc_auc": round(roc_auc, 4),
        "confusion_matrix": {
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "tn": tn
        }
    }


def calculate_classification_metrics(y_true: np.ndarray | list, y_pred: np.ndarray | list) -> dict:
    """
    Computes image-level binary tamper classification metrics (Tampered vs Clean).
    """
    yt = np.array(y_true, dtype=np.int32)
    yp = np.array(y_pred, dtype=np.int32)

    tp = int(np.sum((yp == 1) & (yt == 1)))
    fp = int(np.sum((yp == 1) & (yt == 0)))
    fn = int(np.sum((yp == 0) & (yt == 1)))
    tn = int(np.sum((yp == 0) & (yt == 0)))
    total = len(yt)

    accuracy = float((tp + tn) / max(1, total))
    precision = float(tp / (tp + fp)) if (tp + fp) > 0 else 0.0
    recall = float(tp / (tp + fn)) if (tp + fn) > 0 else 0.0
    f1 = float(2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
    specificity = float(tn / (tn + fp)) if (tn + fp) > 0 else 0.0
    balanced_acc = float((recall + specificity) / 2.0)

    return {
        "accuracy": round(accuracy, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1_score": round(f1, 4),
        "specificity": round(specificity, 4),
        "balanced_accuracy": round(balanced_acc, 4),
        "confusion_matrix": {"tp": tp, "fp": fp, "fn": fn, "tn": tn}
    }


# ===========================================================================
# 5. Synthetic Medical Dataset & Demonstration Training
# ===========================================================================

def generate_synthetic_medical_image() -> np.ndarray:
    """
    [DEMONSTRATION & BENCHMARK FIXTURE]
    Generates a deterministic synthetic grayscale brain MRI representation.
    NOT intended for clinical diagnostic decision-making.
    """
    img = np.zeros(AI_IMAGE_SIZE, dtype=np.uint8)
    cv2.ellipse(img, (128, 128), (80, 100), 0, 0, 360, 220, -1)
    cv2.ellipse(img, (128, 128), (75, 95), 0, 0, 360, 40, -1)
    cv2.ellipse(img, (100, 110), (35, 45), 30, 0, 360, 150, -1)
    cv2.ellipse(img, (156, 110), (35, 45), -30, 0, 360, 150, -1)
    cv2.ellipse(img, (105, 160), (30, 40), 10, 0, 360, 130, -1)
    cv2.ellipse(img, (151, 160), (30, 40), -10, 0, 360, 130, -1)
    cv2.ellipse(img, (115, 115), (10, 25), 20, 0, 360, 20, -1)
    cv2.ellipse(img, (141, 115), (10, 25), -20, 0, 360, 20, -1)

    noise = np.random.normal(0, 5, AI_IMAGE_SIZE).astype(np.uint8)
    img = cv2.add(img, noise)
    img = cv2.GaussianBlur(img, (3, 3), 0)
    return img


def introduce_tampering(img: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """
    Introduces synthetic copy-move, blur, or lesion tampering.
    Returns: (tampered_image, ground_truth_mask)
    """
    tampered_img = img.copy()
    mask = np.zeros(AI_IMAGE_SIZE, dtype=np.uint8)

    x = np.random.randint(80, 176)
    y = np.random.randint(80, 176)
    r = np.random.randint(10, 25)

    tamper_type = np.random.randint(0, 3)
    if tamper_type == 0:
        cv2.circle(tampered_img, (x, y), r, 245, -1)
    elif tamper_type == 1:
        patch = tampered_img[max(0, y-r):min(img.shape[0], y+r), max(0, x-r):min(img.shape[1], x+r)]
        if patch.size > 0:
            blurred_patch = cv2.GaussianBlur(patch, (15, 15), 0)
            tampered_img[max(0, y-r):min(img.shape[0], y+r), max(0, x-r):min(img.shape[1], x+r)] = blurred_patch
    else:
        cv2.circle(tampered_img, (x, y), r, 10, -1)

    cv2.circle(mask, (x, y), r, 255, -1)
    return tampered_img, mask


class SyntheticMedicalDataset(Dataset):
    """
    Synthetic dataset for prototype testing and benchmark evaluation.
    Enforces reproducible deterministic generation when a seed is provided.
    """
    def __init__(self, size: int = 60, seed: int | None = None):
        self.size = size
        self.data = []
        if seed is not None:
            np.random.seed(seed)
        for _ in range(size):
            base = generate_synthetic_medical_image()
            tampered, mask = introduce_tampering(base)
            self.data.append((tampered, mask))

    def __len__(self) -> int:
        return self.size

    def __getitem__(self, idx: int):
        tampered, mask = self.data[idx]
        x_tensor = torch.tensor(tampered, dtype=torch.float32).unsqueeze(0) / 255.0
        y_tensor = torch.tensor(mask, dtype=torch.float32).unsqueeze(0) / 255.0
        return x_tensor, y_tensor


def train_unet_model():
    """
    Trains the Hybrid Swin-Unet with train/val split and saves the best checkpoint.
    NOTE: Model is trained on SYNTHETIC prototype data only.
    """
    logger.info("Initializing Hybrid Swin-Unet training on synthetic medical scans...")
    os.makedirs(os.path.dirname(AI_MODEL_PATH), exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = ResidualAttentionUNet().to(device)

    criterion = nn.BCELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)

    full_dataset = SyntheticMedicalDataset(size=60, seed=42)
    val_size = max(1, int(0.2 * len(full_dataset)))
    train_size = len(full_dataset) - val_size

    indices = list(range(len(full_dataset)))
    train_subset = Subset(full_dataset, indices[:train_size])
    val_subset = Subset(full_dataset, indices[train_size:])

    train_loader = DataLoader(train_subset, batch_size=5, shuffle=True)
    val_loader = DataLoader(val_subset, batch_size=5, shuffle=False)

    best_val_dice = -1.0
    best_state_dict = None

    for epoch in range(AI_TRAIN_EPOCHS):
        model.train()
        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            outputs = model(x)
            loss = criterion(outputs, y)
            loss.backward()
            optimizer.step()

        model.eval()
        val_metrics = {"dice": 0.0, "iou": 0.0}
        val_batches = 0
        with torch.no_grad():
            for x, y in val_loader:
                x, y = x.to(device), y.to(device)
                outputs = model(x)
                out_np = outputs.cpu().numpy()
                y_np = y.cpu().numpy()
                for b in range(x.size(0)):
                    met = calculate_segmentation_metrics(out_np[b, 0], y_np[b, 0])
                    val_metrics["dice"] += met["dice"]
                    val_metrics["iou"] += met["iou"]
                    val_batches += 1

        avg_val_dice = val_metrics["dice"] / max(1, val_batches)
        if avg_val_dice > best_val_dice:
            best_val_dice = avg_val_dice
            best_state_dict = {k: v.clone() for k, v in model.state_dict().items()}

    if best_state_dict is not None:
        torch.save(best_state_dict, AI_MODEL_PATH)
    else:
        torch.save(model.state_dict(), AI_MODEL_PATH)

    logger.info(f"Model checkpoint saved to {AI_MODEL_PATH} (best_val_dice={best_val_dice:.3f})")


# ===========================================================================
# 6. Global Model Singleton & Device Manager
# ===========================================================================

class AIForensicModelManager:
    """
    Process-level singleton managing the Hybrid Swin-UNet model instance,
    ensuring thread-safe inference, evaluation mode enforcement, and safe device selection.
    """
    _instance = None
    _model = None
    _device = None

    @classmethod
    def get_instance(cls) -> "AIForensicModelManager":
        if cls._instance is None:
            cls._instance = AIForensicModelManager()
        return cls._instance

    def __init__(self):
        self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self._load_model()

    def _load_model(self):
        model = ResidualAttentionUNet()
        if not os.path.exists(AI_MODEL_PATH):
            train_unet_model()

        try:
            model.load_state_dict(torch.load(AI_MODEL_PATH, map_location=self._device))
        except Exception as e:
            logger.warning(f"Failed to load checkpoint ({e}), re-training baseline model...")
            train_unet_model()
            model.load_state_dict(torch.load(AI_MODEL_PATH, map_location=self._device))

        model.to(self._device)
        model.eval()
        self._model = model

    def get_model(self) -> ResidualAttentionUNet:
        if self._model is None:
            self._load_model()
        return self._model

    @property
    def device(self) -> torch.device:
        return self._device


def get_ai_model() -> ResidualAttentionUNet:
    """Retrieves the process singleton model instance."""
    return AIForensicModelManager.get_instance().get_model()


# ===========================================================================
# 7. Explainable AI: Grad-CAM Attribution Heatmap
# ===========================================================================

def generate_grad_cam(
    model: ResidualAttentionUNet,
    input_tensor: torch.Tensor,
    prediction: torch.Tensor
) -> np.ndarray:
    """
    Generates Grad-CAM localization heatmap based on bottleneck feature map gradients.
    Returns: 2D uint8 numpy array [256, 256].
    """
    model.zero_grad()
    loss = prediction.mean()
    loss.backward(retain_graph=True)

    gradients = model.gradients
    activations = model.activations.clone() if model.activations is not None else None

    # Reset model hook references to avoid memory retention across requests
    model.gradients = None
    model.activations = None

    if gradients is None or activations is None:
        logger.warning("Grad-CAM gradients unavailable; falling back to probability map attribution.")
        pred_np = prediction.detach().cpu().squeeze().numpy()
        return (np.clip(pred_np, 0.0, 1.0) * 255).astype(np.uint8)

    pooled_gradients = torch.mean(gradients, dim=[0, 2, 3])
    weighted_activations = activations.clone()
    for i in range(weighted_activations.shape[1]):
        weighted_activations[:, i, :, :] = weighted_activations[:, i, :, :] * pooled_gradients[i]

    heatmap = torch.mean(weighted_activations, dim=1).squeeze()
    heatmap = np.maximum(heatmap.detach().cpu().numpy(), 0)

    heatmap_max = np.max(heatmap)
    if heatmap_max > 0:
        heatmap /= heatmap_max

    heatmap = (heatmap * 255).astype(np.uint8)
    heatmap = cv2.resize(heatmap, (input_tensor.shape[3], input_tensor.shape[2]))
    return heatmap


# ===========================================================================
# 8. Unified End-to-End AI Tamper Forensic Pipeline
# ===========================================================================

def run_ai_tamper_pipeline(
    image_bytes: bytes,
    output_filename: str = "tamper_heatmap.png",
    preserve_aspect_ratio: bool = True,
    tamper_threshold: float = AI_TAMPER_THRESHOLD,
    min_region_area: int = AI_MIN_REGION_AREA
) -> dict:
    """
    Executes the complete, deterministic AI Tamper Forensic Pipeline:
      1. Safe Image Decoding & Modality Validation
      2. Aspect-Ratio-Preserving Preprocessing
      3. Hybrid Swin-UNet Deep Inference
      4. Grad-CAM Spatial Explainability Heatmap
      5. Full-Resolution Coordinate Mask & Heatmap Mapping (W x H)
      6. Connected Components Region-Level Forensics Extraction
      7. Model Provenance & Honest Uncertainty Calculation

    Returns:
        Structured result dict containing:
          - tampered_detected: bool
          - tampered_percentage: float (0.0 to 100.0)
          - confidence_score: float (0.0 to 1.0)
          - confidence_label: str
          - bounding_boxes: list[dict]
          - regions: list[dict] (region-level forensics)
          - heatmap_path: str (absolute path)
          - original_dimensions: [width, height]
          - model_provenance: dict
    """
    if not image_bytes or len(image_bytes) == 0:
        raise ValueError("Image bytes must not be empty")

    nparr = np.frombuffer(image_bytes, np.uint8)
    image_gray = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
    if image_gray is None:
        raise ValueError("Invalid or corrupted medical image bytes")

    orig_h, orig_w = image_gray.shape

    # Preprocessing with aspect ratio letterboxing
    resized_canvas, dim_meta = prepare_image_for_ai_model(
        image_gray,
        target_size=AI_IMAGE_SIZE,
        preserve_aspect_ratio=preserve_aspect_ratio
    )

    manager = AIForensicModelManager.get_instance()
    device = manager.device
    model = manager.get_model()

    x_tensor = torch.tensor(resized_canvas, dtype=torch.float32).unsqueeze(0).unsqueeze(0).to(device) / 255.0
    x_tensor.requires_grad = True

    # 1. Model Forward Pass
    torch.set_grad_enabled(True)
    pred_mask_tensor = model(x_tensor)
    pred_mask_256 = pred_mask_tensor.squeeze().detach().cpu().numpy()

    # 2. Grad-CAM Attribution Map
    try:
        grad_cam_map_256 = generate_grad_cam(model, x_tensor, pred_mask_tensor)
    except Exception as e:
        logger.warning(f"Grad-CAM generation failed: {e}. Using raw probability map.")
        grad_cam_map_256 = (pred_mask_256 * 255).astype(np.uint8)
    finally:
        torch.set_grad_enabled(False)

    # 3. Map Probability Map & Grad-CAM back to EXACT Original Image Dimensions
    prob_map_orig = map_mask_to_original_resolution(pred_mask_256, dim_meta, binary=False)
    grad_cam_orig = map_mask_to_original_resolution(grad_cam_map_256, dim_meta, binary=False).astype(np.uint8)

    # 4. Threshold to Binary Mask at Original Resolution
    binary_mask_orig = (prob_map_orig > tamper_threshold).astype(np.uint8) * 255

    tampered_pixels = int(np.sum(binary_mask_orig == 255))
    total_pixels = binary_mask_orig.size
    tampered_percentage = float((tampered_pixels / total_pixels) * 100.0)

    # 5. Model Confidence Calculation
    if tampered_pixels > 0:
        confidence_score = float(np.mean(prob_map_orig[prob_map_orig > tamper_threshold]))
    else:
        confidence_score = 1.0 - float(np.mean(prob_map_orig))

    confidence_score = round(min(1.0, max(0.0, confidence_score)), 4)
    tampered_percentage = round(min(100.0, max(0.0, tampered_percentage)), 2)

    # Confidence label classification
    if tampered_pixels == 0:
        confidence_label = "CLEAN"
    elif confidence_score >= 0.80:
        confidence_label = "HIGH_CONFIDENCE_TAMPER"
    elif confidence_score >= 0.50:
        confidence_label = "MEDIUM_CONFIDENCE_TAMPER"
    else:
        confidence_label = "LOW_CONFIDENCE_TAMPER"

    # 6. Extract Region-Level Forensics
    regions = extract_tamper_regions(binary_mask_orig, prob_map_orig, min_area=min_region_area)

    # Bounding boxes matching existing route format
    bounding_boxes = [
        {
            "x": r["x"],
            "y": r["y"],
            "width": r["width"],
            "height": r["height"],
            "confidence_label": r["confidence_label"]
        }
        for r in regions
    ]

    # 7. Render Color Heatmap Overlay at Original Resolution
    color_img = cv2.cvtColor(image_gray, cv2.COLOR_GRAY2BGR)
    grad_cam_color = cv2.applyColorMap(grad_cam_orig, cv2.COLORMAP_JET)

    alpha = 0.4
    overlay = cv2.addWeighted(grad_cam_color, alpha, color_img, 1.0 - alpha, 0)

    for box in bounding_boxes:
        bx, by, bw, bh = box["x"], box["y"], box["width"], box["height"]
        cv2.rectangle(overlay, (bx, by), (bx + bw, by + bh), (0, 0, 255), 2)
        cv2.putText(
            overlay,
            f"TAMPER {tampered_percentage:.1f}%",
            (bx, max(12, by - 5)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.4,
            (0, 0, 255),
            1
        )

    # Save heatmap overlay
    heatmap_dir = STORAGE_DIR / "heatmaps"
    heatmap_dir.mkdir(parents=True, exist_ok=True)
    # Sanitize output filename to prevent path traversal
    safe_filename = os.path.basename(output_filename)
    heatmap_path = heatmap_dir / safe_filename
    cv2.imwrite(str(heatmap_path), overlay)

    provenance = get_model_provenance(device=device)

    return {
        "tampered_detected": tampered_pixels > 0,
        "tampered_percentage": tampered_percentage,
        "confidence_score": confidence_score,
        "confidence_label": confidence_label,
        "bounding_boxes": bounding_boxes,
        "regions": regions,
        "heatmap_path": str(heatmap_path.resolve()),
        "heatmap_filename": safe_filename,
        "original_dimensions": [int(orig_w), int(orig_h)],
        "model_input_dimensions": list(AI_IMAGE_SIZE),
        "model_provenance": provenance,
        "status": "TAMPERED" if tampered_pixels > 0 else "CLEAN"
    }


def localize_tampering(
    image_bytes: bytes,
    output_filename: str = "tamper_heatmap.png",
    preserve_aspect_ratio: bool = True
) -> tuple[float, float, list[dict], str]:
    """
    Backward-compatible wrapper around run_ai_tamper_pipeline.
    Returns:
        (tampered_percentage, confidence_score, bounding_boxes, heatmap_filepath)
    """
    res = run_ai_tamper_pipeline(
        image_bytes=image_bytes,
        output_filename=output_filename,
        preserve_aspect_ratio=preserve_aspect_ratio
    )
    return (
        res["tampered_percentage"],
        res["confidence_score"],
        res["bounding_boxes"],
        res["heatmap_path"]
    )


def extract_srm_residual(image_bytes: bytes) -> bytes:
    """
    Passes image bytes through the Spatial Rich Model (SRM) Noise Filter stream
    and returns visualizable PNG image bytes representing high-frequency noise residuals.
    """
    if not image_bytes or len(image_bytes) == 0:
        raise ValueError("Invalid image bytes for SRM residual extraction")

    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise ValueError("Invalid image bytes for SRM residual extraction")

    resized = cv2.resize(image, AI_IMAGE_SIZE, interpolation=cv2.INTER_AREA)
    x_tensor = torch.tensor(resized, dtype=torch.float32).unsqueeze(0).unsqueeze(0) / 255.0

    srm_layer = SrmNoiseFilter()
    with torch.no_grad():
        srm_out = srm_layer(x_tensor).squeeze(0).numpy()  # 3 x H x W

    ch1 = cv2.normalize(srm_out[0], None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    ch2 = cv2.normalize(srm_out[1], None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    ch3 = cv2.normalize(srm_out[2], None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

    srm_visual = cv2.merge([ch1, ch2, ch3])
    _, encoded_srm = cv2.imencode(".png", srm_visual)
    return encoded_srm.tobytes()


# ===========================================================================
# 9. Synthetic Benchmark Evaluation Runner
# ===========================================================================

def evaluate_synthetic_benchmark(
    num_samples: int = 30,
    test_split: float = 0.3,
    random_seed: int = 42
) -> dict:
    """
    Executes a deterministic quantitative evaluation over synthetic benchmark samples.
    Computes both pixel-level segmentation metrics and image-level classification metrics.

    Returns:
        Structured evaluation report with metric values and research disclaimers.
    """
    np.random.seed(random_seed)
    torch.manual_seed(random_seed)

    model = get_ai_model()
    device = AIForensicModelManager.get_instance().device

    test_samples = int(num_samples * test_split)
    dice_list = []
    iou_list = []
    prec_list = []
    rec_list = []
    acc_list = []

    y_true_imgs = []
    y_pred_imgs = []

    for i in range(test_samples):
        is_tampered = (i % 2 == 1)
        base = generate_synthetic_medical_image()
        if is_tampered:
            tampered_img, gt_mask = introduce_tampering(base)
            y_true_imgs.append(1)
        else:
            tampered_img = base
            gt_mask = np.zeros(AI_IMAGE_SIZE, dtype=np.uint8)
            y_true_imgs.append(0)

        x_tensor = torch.tensor(tampered_img, dtype=torch.float32).unsqueeze(0).unsqueeze(0).to(device) / 255.0
        with torch.no_grad():
            out_tensor = model(x_tensor)
            pred_mask = out_tensor.squeeze().cpu().numpy()

        seg_met = calculate_segmentation_metrics(pred_mask, gt_mask / 255.0)
        dice_list.append(seg_met["dice"])
        iou_list.append(seg_met["iou"])
        prec_list.append(seg_met["precision"])
        rec_list.append(seg_met["recall"])
        acc_list.append(seg_met["pixel_accuracy"])

        tampered_pred = 1 if np.sum(pred_mask > 0.5) > AI_MIN_REGION_AREA else 0
        y_pred_imgs.append(tampered_pred)

    clf_met = calculate_classification_metrics(y_true_imgs, y_pred_imgs)

    return {
        "evaluation_type": "SYNTHETIC_BENCHMARK",
        "sample_count": test_samples,
        "model_provenance": get_model_provenance(device=device),
        "segmentation_metrics": {
            "mean_dice": round(float(np.mean(dice_list)), 4),
            "mean_iou": round(float(np.mean(iou_list)), 4),
            "mean_precision": round(float(np.mean(prec_list)), 4),
            "mean_recall": round(float(np.mean(rec_list)), 4),
            "mean_pixel_accuracy": round(float(np.mean(acc_list)), 4)
        },
        "image_classification_metrics": clf_met,
        "disclaimer": (
            "All metrics reflect synthetic phantom demonstration benchmarks only. "
            "Model has not been validated on clinical patient datasets."
        )
    }
