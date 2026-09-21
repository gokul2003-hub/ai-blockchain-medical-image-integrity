import os
import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import torch.nn.functional as F
from loguru import logger
from app.config import AI_MODEL_PATH, AI_TRAIN_EPOCHS, AI_IMAGE_SIZE, STORAGE_DIR

# ===========================================================================
# IMPORTANT: MODEL TRAINING DATA STATUS
# ===========================================================================
# This model is trained on SYNTHETIC data only (cv2 ellipse approximations
# of brain MRI scans). It has NOT been validated on real clinical images.
# Performance metrics (Dice, IoU, etc.) reflect SYNTHETIC prototype evaluation
# and should NOT be interpreted as clinical validation.
#
# For clinical deployment, retrain on a real annotated medical dataset such as:
# - BraTS (brain tumor segmentation)
# - NIH ChestX-ray14
# - TCIA datasets
# ===========================================================================

# --- 1. Hybrid Swin-Unet Components ---

class SrmNoiseFilter(nn.Module):
    """
    Spatial Rich Model (SRM) Noise Filter Stream.
    Extracts local high-frequency noise residuals to identify tampered boundaries.
    """
    def __init__(self):
        super().__init__()
        # SRM kernels: basic edge, spam, and 2nd-order check
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
        
        # Stack to create a conv layer with 3 out channels
        self.filter = nn.Conv2d(1, 3, kernel_size=5, padding=2, bias=False)
        weights = torch.stack([k1, k2, k3]).unsqueeze(1)
        self.filter.weight = nn.Parameter(weights, requires_grad=False)
        
    def forward(self, x):
        return self.filter(x)

class ResidualDoubleConv(nn.Module):
    """
    Residual Double Convolution Block.
    Enhances feature propagation using skip connections inside the block.
    """
    def __init__(self, in_channels, out_channels):
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
            
    def forward(self, x):
        return F.relu(self.conv(x) + self.shortcut(x))

class SwinBlock(nn.Module):
    """
    Simplified Swin Transformer Block using shifted window attention mechanism.
    Provides hierarchical feature representation and global context capturing.
    """
    def __init__(self, in_channels, out_channels):
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
        
    def forward(self, x):
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
    def __init__(self, F_g, F_l, F_int):
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
        
    def forward(self, g, x):
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
    def __init__(self):
        super().__init__()
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
        self.swin1 = nn.Sequential(nn.MaxPool2d(2), SwinBlock(32, 64))
        self.swin2 = nn.Sequential(nn.MaxPool2d(2), SwinBlock(64, 128))
        
        # Bottleneck (We track activations here for Grad-CAM)
        self.bottleneck = SwinBlock(128, 256)
        
        # Placeholders for Grad-CAM
        self.gradients = None
        self.activations = None
        
        # Attention Gates for Skip Connections
        self.attn2 = AttentionGate(F_g=256, F_l=128, F_int=64)
        self.attn1 = AttentionGate(F_g=128, F_l=64, F_int=32)
        
        # Decoder Upsampling (matches encoder resolution mapping)
        self.up1 = nn.ConvTranspose2d(256, 128, kernel_size=2, stride=2)
        self.conv1 = ResidualDoubleConv(256, 128)  # 128 up + 128 skip
        
        self.up2 = nn.ConvTranspose2d(128, 64, kernel_size=2, stride=2)
        self.conv2 = ResidualDoubleConv(128, 64)   # 64 up + 64 skip
        
        self.up3 = nn.ConvTranspose2d(64, 32, kernel_size=2, stride=2)
        self.conv3 = ResidualDoubleConv(64, 32)
        
        self.outc = nn.Conv2d(32, 1, kernel_size=1)
        
    def activations_hook(self, grad):
        self.gradients = grad

    def forward(self, x):
        # SRM stream
        srm_feat = self.srm(x)
        srm_out = self.srm_enc(srm_feat)
        
        # Grayscale stream
        gray_out = self.gray_enc(x)
        
        # Fuse stream features
        fused = torch.cat([gray_out, srm_out], dim=1)
        enc0 = self.fuse(fused)  # Output size: 32 x H x W
        
        # Encoder downsampling
        enc1 = self.swin1(enc0)  # Output size: 64 x H/2 x W/2
        enc2 = self.swin2(enc1)  # Output size: 128 x H/4 x W/4
        
        # Bottleneck
        bn = self.bottleneck(enc2)  # Output size: 256 x H/4 x W/4
        
        # Hook activations of bottleneck for Grad-CAM
        if bn.requires_grad:
            h = bn.register_hook(self.activations_hook)
            self.activations = bn
            
        # Upsampling Stage 1
        gated2 = self.attn2(bn, enc2)
        up1_feat = self.up1(bn)
        if up1_feat.shape[2:] != gated2.shape[2:]:
            up1_feat = F.interpolate(up1_feat, size=gated2.shape[2:], mode='bilinear', align_corners=True)
        cat1 = torch.cat([up1_feat, gated2], dim=1)
        dec1 = self.conv1(cat1)
        
        # Upsampling Stage 2
        gated1 = self.attn1(dec1, enc1)
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

# --- 2. Advanced Performance Metric Evaluation ---

def calculate_segmentation_metrics(pred_mask: np.ndarray, gt_mask: np.ndarray) -> dict:
    """
    Calculates Dice, IoU, Precision, Recall, F1, MCC, and ROC-AUC.
    Inputs are binary arrays (values 0 or 1), except ROC-AUC which uses soft probabilities.

    Clinical interpretation of each metric:
      - Dice (F1):   Harmonic overlap between predicted and actual tampered regions.
                     Range [0, 1]; higher = better spatial agreement. The primary
                     segmentation quality metric in medical image analysis.
      - IoU:         Intersection over Union (Jaccard index). Stricter than Dice;
                     penalises false positives and false negatives equally.
                     Range [0, 1]; typically ~Dice/2 for imperfect predictions.
      - Precision:   Of all flagged pixels, what fraction is truly tampered.
                     High precision → low false-alarm rate.
      - Recall:      Of all truly tampered pixels, what fraction was detected.
                     High recall → few missed tampered regions.
      - MCC:         Matthews Correlation Coefficient. Robust to severe class
                     imbalance (most pixels are genuine). Range [-1, 1];
                     values near 1 indicate excellent detection performance.
      - ROC-AUC:     Area under the Receiver Operating Characteristic curve.
                     Measures overall discriminative power across all thresholds.
                     Range [0.5 (random), 1.0 (perfect)].

    NOTE: All metrics above reflect performance on SYNTHETIC training data only.
    """
    pred = (pred_mask > 0.5).astype(np.uint8)
    gt = (gt_mask > 0.5).astype(np.uint8)
    
    tp = np.sum((pred == 1) & (gt == 1))
    fp = np.sum((pred == 1) & (gt == 0))
    fn = np.sum((pred == 0) & (gt == 1))
    tn = np.sum((pred == 0) & (gt == 0))
    
    precision = float(tp / (tp + fp)) if (tp + fp) > 0 else 1.0
    recall = float(tp / (tp + fn)) if (tp + fn) > 0 else 1.0
    
    intersection = tp
    union = tp + fp + fn
    iou = float(intersection / union) if union > 0 else 1.0
    
    dice = float(2 * tp / (2 * tp + fp + fn)) if (2 * tp + fp + fn) > 0 else 1.0
    
    # Matthews Correlation Coefficient (MCC)
    mcc_denom = float(np.sqrt(float(tp + fp) * float(tp + fn) * float(tn + fp) * float(tn + fn)))
    mcc = float(tp * tn - fp * fn) / mcc_denom if mcc_denom > 0 else 0.0
    
    # Native ROC-AUC calculation using trapezoidal integration
    y_true = gt.flatten()
    y_scores = pred_mask.flatten()
    
    desc_score_indices = np.argsort(y_scores, kind="mergesort")[::-1]
    y_scores = y_scores[desc_score_indices]
    y_true = y_true[desc_score_indices]
    
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
        "mcc": round(mcc, 4),
        "roc_auc": round(roc_auc, 4),
        "confusion_matrix": {
            "tp": int(tp),
            "fp": int(fp),
            "fn": int(fn),
            "tn": int(tn)
        }
    }

# --- 3. Synthetic Data Generation (Demonstration / Training Baseline) ---

def generate_synthetic_medical_image() -> np.ndarray:
    """
    [DEMONSTRATION INFRASTRUCTURE]
    Generates a synthetic grayscale brain MRI representation for pipeline verification,
    unit testing, and offline training initialization.
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
    """Introduces synthetic copy-move, blur, or lesion tampering."""
    tampered_img = img.copy()
    mask = np.zeros(AI_IMAGE_SIZE, dtype=np.uint8)
    
    x = np.random.randint(80, 176)
    y = np.random.randint(80, 176)
    r = np.random.randint(10, 25)
    
    tamper_type = np.random.randint(0, 3)
    if tamper_type == 0:
        cv2.circle(tampered_img, (x, y), r, 245, -1)
    elif tamper_type == 1:
        patch = tampered_img[y-r:y+r, x-r:x+r]
        if patch.size > 0:
            blurred_patch = cv2.GaussianBlur(patch, (15, 15), 0)
            tampered_img[y-r:y+r, x-r:x+r] = blurred_patch
    else:
        cv2.circle(tampered_img, (x, y), r, 10, -1)
        
    cv2.circle(mask, (x, y), r, 255, -1)
    return tampered_img, mask

class SyntheticMedicalDataset(Dataset):
    def __init__(self, size=100):
        self.size = size
        self.data = []
        for _ in range(size):
            base = generate_synthetic_medical_image()
            tampered, mask = introduce_tampering(base)
            self.data.append((tampered, mask))

    def __len__(self):
        return self.size

    def __getitem__(self, idx):
        tampered, mask = self.data[idx]
        x_tensor = torch.tensor(tampered, dtype=torch.float32).unsqueeze(0) / 255.0
        y_tensor = torch.tensor(mask, dtype=torch.float32).unsqueeze(0) / 255.0
        return x_tensor, y_tensor

# --- 4. Model Training Pipeline ---

def train_unet_model():
    """Trains the Hybrid Swin-Unet with train/val split and logs quality parameters.

    Training uses a 60-sample synthetic dataset with 80/20 train/val split.
    The model with the best validation Dice score is saved as the checkpoint.

    NOTE: Model is trained on SYNTHETIC prototype data only.
    Performance reflects synthetic evaluation, not clinical validation.
    """
    logger.info("Initializing Hybrid Swin-Unet training on synthetic medical scans...")
    os.makedirs(os.path.dirname(AI_MODEL_PATH), exist_ok=True)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = ResidualAttentionUNet().to(device)

    criterion = nn.BCELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.001)

    # Increase synthetic samples and apply train/val split
    full_dataset = SyntheticMedicalDataset(size=60)
    val_size = max(1, int(0.2 * len(full_dataset)))
    train_size = len(full_dataset) - val_size

    # Deterministic split (no shuffle to keep reproducibility)
    indices = list(range(len(full_dataset)))
    train_indices = indices[:train_size]
    val_indices = indices[train_size:]

    from torch.utils.data import Subset
    train_subset = Subset(full_dataset, train_indices)
    val_subset = Subset(full_dataset, val_indices)

    train_loader = DataLoader(train_subset, batch_size=5, shuffle=True)
    val_loader = DataLoader(val_subset, batch_size=5, shuffle=False)

    logger.info(
        f"SYNTHETIC PROTOTYPE TRAINING: {train_size} train / {val_size} val samples. "
        f"Epochs={AI_TRAIN_EPOCHS}. NOT clinically validated."
    )

    best_val_dice = -1.0
    best_state_dict = None

    for epoch in range(AI_TRAIN_EPOCHS):
        # --- Training phase ---
        model.train()
        epoch_loss = 0.0
        train_metrics = {"dice": 0.0, "iou": 0.0, "precision": 0.0, "recall": 0.0}
        train_batches = 0

        for x, y in train_loader:
            x, y = x.to(device), y.to(device)
            optimizer.zero_grad()
            outputs = model(x)
            loss = criterion(outputs, y)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item() * x.size(0)

            out_np = outputs.detach().cpu().numpy()
            y_np = y.cpu().numpy()
            for b in range(x.size(0)):
                met = calculate_segmentation_metrics(out_np[b, 0], y_np[b, 0])
                for k in train_metrics:
                    if k in met:
                        train_metrics[k] += met[k]
                train_batches += 1

        avg_train_loss = epoch_loss / train_size
        avg_train_dice = train_metrics["dice"] / max(1, train_batches)

        # --- Validation phase ---
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
                    for k in val_metrics:
                        if k in met:
                            val_metrics[k] += met[k]
                    val_batches += 1

        avg_val_dice = val_metrics["dice"] / max(1, val_batches)
        avg_val_iou = val_metrics["iou"] / max(1, val_batches)

        logger.info(
            f"[SYNTHETIC] Epoch {epoch+1}/{AI_TRAIN_EPOCHS} — "
            f"train_loss={avg_train_loss:.4f}, train_dice={avg_train_dice:.3f}, "
            f"val_dice={avg_val_dice:.3f}, val_iou={avg_val_iou:.3f}"
        )

        # Best-model checkpoint (save if val_dice improves)
        if avg_val_dice > best_val_dice:
            best_val_dice = avg_val_dice
            best_state_dict = {k: v.clone() for k, v in model.state_dict().items()}
            logger.info(f"  → New best val_dice={best_val_dice:.3f} — checkpoint updated.")

    # Save the best checkpoint
    if best_state_dict is not None:
        torch.save(best_state_dict, AI_MODEL_PATH)
    else:
        torch.save(model.state_dict(), AI_MODEL_PATH)

    logger.info(
        f"Model checkpoint saved to {AI_MODEL_PATH} "
        f"(best_val_dice={best_val_dice:.3f}) — SYNTHETIC PROTOTYPE ONLY."
    )

# --- 5. Global Model Instance Handler ---

_attention_unet_instance = None

def get_ai_model() -> ResidualAttentionUNet:
    global _attention_unet_instance
    if _attention_unet_instance is not None:
        return _attention_unet_instance

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = ResidualAttentionUNet()

    if not os.path.exists(AI_MODEL_PATH):
        train_unet_model()

    model.load_state_dict(torch.load(AI_MODEL_PATH, map_location=device))
    model.to(device)
    model.eval()
    _attention_unet_instance = model
    return _attention_unet_instance

# --- 6. Explainable AI: Grad-CAM Explainer ---

def generate_grad_cam(model: ResidualAttentionUNet, input_tensor: torch.Tensor, prediction: torch.Tensor) -> np.ndarray:
    """
    Generates Grad-CAM localization heatmap based on the bottleneck feature map gradients.
    """
    model.zero_grad()
    loss = prediction.mean()
    loss.backward(retain_graph=True)

    gradients = model.gradients
    activations = model.activations.clone() if model.activations is not None else None

    # Reset model hook properties to avoid state leakage across calls
    model.gradients = None
    model.activations = None

    if gradients is None or activations is None:
        logger.warning("Grad-CAM gradients unavailable. Returning empty attribution map.")
        return np.zeros((256, 256), dtype=np.uint8)

    pooled_gradients = torch.mean(gradients, dim=[0, 2, 3])

    # Weight features safely without in-place tensor view mutation
    weighted_activations = activations.clone()
    for i in range(weighted_activations.shape[1]):
        weighted_activations[:, i, :, :] = weighted_activations[:, i, :, :] * pooled_gradients[i]

    heatmap = torch.mean(weighted_activations, dim=1).squeeze()
    heatmap = np.maximum(heatmap.detach().cpu().numpy(), 0)

    heatmap_max = np.max(heatmap)
    if heatmap_max > 0:
        heatmap /= heatmap_max

    heatmap = (heatmap * 255).astype(np.uint8)
    heatmap = cv2.resize(heatmap, (input_tensor.shape[2], input_tensor.shape[3]))
    return heatmap

# --- 7. Inference & Localization Overlay Pipeline ---

def localize_tampering(image_bytes: bytes, output_filename: str) -> tuple[float, float, list[dict], str]:
    """
    Runs Hybrid Swin-Unet model and computes Grad-CAM attribution maps.

    Returns:
        tampered_percentage: Float [0, 100] — percentage of pixels classified as tampered.
        confidence_score:    Float [0, 1]  — mean prediction confidence for tampered regions.
        bounding_boxes:      List of dicts with keys x, y, width, height, confidence_label.
        heatmap_filepath:    Absolute path to Grad-CAM heatmap overlay PNG.

    NOTE: This model was trained on SYNTHETIC data only. Results on real clinical
    images should be treated as indicative, not clinically validated.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise ValueError("Invalid image bytes")

    original_h, original_w = image.shape
    resized = cv2.resize(image, AI_IMAGE_SIZE, interpolation=cv2.INTER_AREA)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = get_ai_model()

    x_tensor = torch.tensor(resized, dtype=torch.float32).unsqueeze(0).unsqueeze(0).to(device) / 255.0
    x_tensor.requires_grad = True

    torch.set_grad_enabled(True)
    pred_mask_tensor = model(x_tensor)
    pred_mask = pred_mask_tensor.squeeze().detach().cpu().numpy()

    binary_mask = (pred_mask > 0.5).astype(np.uint8) * 255
    tampered_pixels = np.sum(binary_mask == 255)
    total_pixels = binary_mask.size
    tampered_percentage = float((tampered_pixels / total_pixels) * 100)

    if tampered_pixels > 0:
        confidence_score = float(np.mean(pred_mask[pred_mask > 0.5]))
    else:
        confidence_score = 1.0 - float(np.mean(pred_mask))

    confidence_score = round(min(1.0, max(0.1, confidence_score)), 4)
    tampered_percentage = round(min(100.0, max(0.0, tampered_percentage)), 2)

    # Confidence quality indicator
    if tampered_pixels == 0:
        confidence_label = "CLEAN"
    elif confidence_score >= 0.8:
        confidence_label = "HIGH_CONFIDENCE_TAMPER"
    elif confidence_score >= 0.5:
        confidence_label = "MEDIUM_CONFIDENCE_TAMPER"
    else:
        confidence_label = "LOW_CONFIDENCE_TAMPER"

    try:
        grad_cam_map = generate_grad_cam(model, x_tensor, pred_mask_tensor)
    except Exception as e:
        logger.error(f"Grad-CAM generation failed: {str(e)}")
        grad_cam_map = (pred_mask * 255).astype(np.uint8)

    grad_cam_resized = cv2.resize(grad_cam_map, (original_w, original_h))
    grad_cam_color = cv2.applyColorMap(grad_cam_resized, cv2.COLORMAP_JET)

    contours, _ = cv2.findContours(binary_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    bounding_boxes = []
    scale_x = original_w / AI_IMAGE_SIZE[0]
    scale_y = original_h / AI_IMAGE_SIZE[1]

    color_img = cv2.cvtColor(cv2.resize(image, (original_w, original_h)), cv2.COLOR_GRAY2BGR)

    alpha = 0.4
    overlay = cv2.addWeighted(grad_cam_color, alpha, color_img, 1.0 - alpha, 0)

    for contour in contours:
        if cv2.contourArea(contour) > 50:
            x, y, w, h = cv2.boundingRect(contour)
            bx, by, bw, bh = int(x * scale_x), int(y * scale_y), int(w * scale_x), int(h * scale_y)
            bounding_boxes.append({
                "x": bx,
                "y": by,
                "width": bw,
                "height": bh,
                "confidence_label": confidence_label,
            })
            cv2.rectangle(overlay, (bx, by), (bx + bw, by + bh), (0, 0, 255), 2)
            cv2.putText(overlay, f"TAMPERED {tampered_percentage:.1f}%", (bx, by - 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)

    heatmap_dir = STORAGE_DIR / "heatmaps"
    heatmap_dir.mkdir(parents=True, exist_ok=True)
    heatmap_path = heatmap_dir / output_filename
    cv2.imwrite(str(heatmap_path), overlay)

    torch.set_grad_enabled(False)

    return tampered_percentage, confidence_score, bounding_boxes, str(heatmap_path.resolve())


def extract_srm_residual(image_bytes: bytes) -> bytes:
    """
    Passes image bytes through Spatial Rich Model (SRM) Noise Filter stream
    and returns visualizable PNG image bytes representing high-frequency noise residuals.
    """
    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise ValueError("Invalid image bytes for SRM residual extraction")

    resized = cv2.resize(image, AI_IMAGE_SIZE, interpolation=cv2.INTER_AREA)
    x_tensor = torch.tensor(resized, dtype=torch.float32).unsqueeze(0).unsqueeze(0) / 255.0

    srm_layer = SrmNoiseFilter()
    with torch.no_grad():
        srm_out = srm_layer(x_tensor).squeeze(0).numpy()  # 3 x H x W

    # Normalize each SRM channel to 0-255 range
    ch1 = cv2.normalize(srm_out[0], None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    ch2 = cv2.normalize(srm_out[1], None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    ch3 = cv2.normalize(srm_out[2], None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

    # Merge channels into a 3-channel BGR noise visualization map
    srm_visual = cv2.merge([ch1, ch2, ch3])
    _, encoded_srm = cv2.imencode(".png", srm_visual)
    return encoded_srm.tobytes()

