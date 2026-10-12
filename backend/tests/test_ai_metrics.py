"""Phase 5 — segmentation metric correctness and degenerate-case behaviour.

Covers the ROC-AUC empty-class edge case (Phase 4 finding A-1), the new
False-Positive Rate metric, and PR-AUC / Average Precision.

All arrays here are deterministic hand-computed fixtures, not model output.
"""
import numpy as np
import pytest

from app.ai_model import calculate_segmentation_metrics


# 4x4 deterministic fixture -----------------------------------------------
# gt positives = 6, negatives = 10
GT = np.array(
    [
        [1, 1, 0, 0],
        [1, 0, 0, 0],
        [0, 0, 1, 1],
        [0, 0, 0, 1],
    ],
    dtype=np.float64,
)
PRED = np.array(
    [
        [1, 0, 0, 0],
        [1, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 0],
    ],
    dtype=np.float64,
)
# Hand-computed: tp=3 fp=1 fn=3 tn=9


def test_confusion_matrix_is_counted_not_inferred():
    m = calculate_segmentation_metrics(PRED, GT)
    assert m["confusion_matrix"] == {"tp": 3, "fp": 1, "fn": 3, "tn": 9}


def test_normal_masks_match_hand_computed_values():
    m = calculate_segmentation_metrics(PRED, GT)
    assert m["precision"] == pytest.approx(3 / 4, abs=1e-4)
    assert m["recall"] == pytest.approx(3 / 6, abs=1e-4)
    assert m["iou"] == pytest.approx(3 / 7, abs=1e-4)
    assert m["dice"] == pytest.approx(6 / 10, abs=1e-4)
    assert m["pixel_accuracy"] == pytest.approx(12 / 16, abs=1e-4)
    assert m["false_positive_rate"] == pytest.approx(1 / 10, abs=1e-4)


def test_f1_score_is_the_same_quantity_as_dice():
    m = calculate_segmentation_metrics(PRED, GT)
    assert m["f1_score"] == m["dice"]


def test_mcc_matches_its_closed_form():
    m = calculate_segmentation_metrics(PRED, GT)
    tp, fp, fn, tn = 3, 1, 3, 9
    denom = np.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn))
    assert m["mcc"] == pytest.approx((tp * tn - fp * fn) / denom, abs=1e-4)


def test_ranking_metrics_are_defined_and_reasonable_on_mixed_masks():
    m = calculate_segmentation_metrics(PRED, GT)
    for key in ("roc_auc", "pr_auc"):
        assert m[key] is not None, f"{key} unexpectedly undefined"
        assert 0.0 <= m[key] <= 1.0


def test_perfect_prediction_scores_perfectly():
    m = calculate_segmentation_metrics(GT, GT)
    assert m["dice"] == 1.0
    assert m["iou"] == 1.0
    assert m["precision"] == 1.0
    assert m["recall"] == 1.0
    assert m["pixel_accuracy"] == 1.0
    assert m["false_positive_rate"] == 0.0
    # Ranking here is fully separating (scores == ground truth), so ROC-AUC and
    # PR-AUC are legitimately 1.0 rather than a fabricated value.
    assert m["roc_auc"] == pytest.approx(1.0, abs=1e-3)
    assert m["pr_auc"] == pytest.approx(1.0, abs=1e-3)
    assert m["undefined_metrics"] == []


def test_empty_prediction_is_honest_about_zero_recall():
    m = calculate_segmentation_metrics(np.zeros((4, 4)), GT)
    assert m["confusion_matrix"] == {"tp": 0, "fp": 0, "fn": 6, "tn": 10}
    assert m["recall"] == 0.0
    assert m["dice"] == 0.0
    assert m["iou"] == 0.0
    assert m["false_positive_rate"] == 0.0


def test_all_positive_prediction_cannot_avoid_false_positives():
    pred = np.ones((4, 4))
    m = calculate_segmentation_metrics(pred, GT)
    cm = m["confusion_matrix"]
    assert cm["tp"] == 6
    assert cm["fp"] == 10
    assert cm["fn"] == 0
    assert m["false_positive_rate"] == pytest.approx(1.0, abs=1e-4)


# --- Degenerate-class behaviour (Phase 4 finding A-1) ---------------------


def test_all_negative_ground_truth_leaves_ranking_metrics_UNDEFINED_not_one():
    """Phase 4 A-1: this previously returned roc_auc == 1.0."""
    gt = np.zeros((4, 4))
    pred = np.zeros((4, 4))

    m = calculate_segmentation_metrics(pred, gt)

    assert m["roc_auc"] is None, "roc_auc must be None, not a fake perfect score"
    assert m["pr_auc"] is None
    assert set(m["undefined_metrics"]) == {"roc_auc", "pr_auc"}
    # Metrics that remain well-defined are still reported normally.
    assert m["pixel_accuracy"] == 1.0
    assert m["false_positive_rate"] == 0.0


def test_all_positive_ground_truth_leaves_fpr_UNDEFINED():
    gt = np.ones((4, 4))
    pred = np.ones((4, 4))

    m = calculate_segmentation_metrics(pred, gt)

    assert m["false_positive_rate"] is None, "no true negatives => FPR undefined"
    assert "false_positive_rate" in m["undefined_metrics"]
    assert m["false_positive_rate"] != 0.0 and m["false_positive_rate"] != 1.0
    # Dice/IoU stay defined and perfect for a matching all-positive mask.
    assert m["dice"] == 1.0
    assert m["iou"] == 1.0


def test_all_positive_ground_truth_also_undefined_for_ranking():
    m = calculate_segmentation_metrics(np.ones((4, 4)), np.ones((4, 4)))
    assert m["roc_auc"] is None
    assert m["pr_auc"] is None


def test_undefined_metrics_list_names_exactly_what_is_missing():
    m = calculate_segmentation_metrics(np.ones((4, 4)), np.ones((4, 4)))
    for name in m["undefined_metrics"]:
        assert m[name] is None, f"{name} listed as undefined but has a value"


def test_no_metric_is_undefined_on_ordinary_mixed_masks():
    m = calculate_segmentation_metrics(PRED, GT)
    assert m["undefined_metrics"] == []


# --- Probability-map ranking ---------------------------------------------

def test_ranking_uses_raw_scores_not_the_binary_threshold():
    """A graded probability map must out-rank an equivalent hard mask."""
    gt = np.array([[1, 1, 0, 0]] * 4, dtype=np.float64)

    # Thresholding at 0.5 yields [1,1,1,0] -- one false positive per row.
    graded = np.array([[0.9, 0.55, 0.55, 0.1]] * 4, dtype=np.float64)
    hard = (graded > 0.5).astype(np.float64)

    m_graded = calculate_segmentation_metrics(graded, gt)
    m_hard = calculate_segmentation_metrics(hard, gt)

    # Identical thresholded predictions, hence identical confusion matrices.
    assert m_graded["confusion_matrix"] == m_hard["confusion_matrix"]
    # Identical pixel-level metrics too -- only the ranking metrics can differ.
    assert m_graded["dice"] == m_hard["dice"]

    assert m_graded["roc_auc"] > m_hard["roc_auc"], (
        "raw scores must drive the ranking, otherwise ROC/PR-AUC are not ranking metrics"
    )
    assert m_graded["pr_auc"] > m_hard["pr_auc"]


def test_pr_auc_is_never_computed_from_binary_masks_alone_without_saying_so():
    """All-equal scores produce a degenerate ranking; PR-AUC must not be 1.0."""
    gt = np.array([[1, 0]] * 8, dtype=np.float64)
    flat_scores = np.full((8, 2), 0.5, dtype=np.float64)

    m = calculate_segmentation_metrics(flat_scores, gt)

    # Both classes exist, so a value is returned -- but it must reflect the
    # uninformative ranking, i.e. chance level, never 1.0.
    # NOTE: the inherited stable-descending tie-break (`mergesort()[::-1]`) reverses
    # equal-score groups, so a flat score vector lands slightly BELOW chance
    # rather than exactly on it. Preserved deliberately to avoid changing the
    # historical ranking semantics; asserted as chance-level, not as 1.0.
    assert m["pr_auc"] is not None
    assert m["pr_auc"] == pytest.approx(0.5, abs=0.1)
    assert m["roc_auc"] == pytest.approx(0.5, abs=0.1)
    assert m["roc_auc"] < 0.75, "an uninformative ranking must never look strong"


def test_output_shape_and_types_are_stable():
    m = calculate_segmentation_metrics(PRED, GT)
    assert set(m) >= {
        "dice", "iou", "precision", "recall", "f1_score",
        "pixel_accuracy", "mcc", "roc_auc", "pr_auc",
        "false_positive_rate", "undefined_metrics", "confusion_matrix",
    }
    assert isinstance(m["undefined_metrics"], list)
    for key in ("dice", "iou", "precision", "recall", "mcc", "roc_auc", "pr_auc"):
        assert isinstance(m[key], float)


def test_1d_inputs_are_accepted():
    m = calculate_segmentation_metrics(
        np.array([1.0, 0.0, 1.0, 0.0]),
        np.array([1.0, 1.0, 1.0, 0.0]),
    )
    # tp=2 fp=0 fn=1 tn=1
    assert m["confusion_matrix"] == {"tp": 2, "fp": 0, "fn": 1, "tn": 1}
    assert m["false_positive_rate"] == pytest.approx(0.0, abs=1e-4)
