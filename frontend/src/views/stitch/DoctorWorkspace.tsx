import React, { useState, useEffect, useRef, useCallback } from "react";
import { apiService, fetchProtectedBlobUrl } from "../../services/api";
import { wsService } from "../../services/websocket";
import { MetricCard } from "../../components/stitch/MetricCard";
import { StatusPill } from "../../components/stitch/StatusPill";
import { ClinicalBadge } from "../../components/stitch/ClinicalBadge";
import { RiskScoreCard } from "../../components/stitch/RiskScoreCard";
import { TrustScoreCard } from "../../components/stitch/TrustScoreCard";
import { HashComparisonCard } from "../../components/stitch/HashComparisonCard";
import { StepTracker, type StepItem } from "../../components/stitch/StepTracker";
import { QuadViewport } from "../../components/stitch/QuadViewport";
import { AuditLedger } from "../../components/stitch/AuditLedger";
import { ConsentCard } from "../../components/stitch/ConsentCard";
import { LoadingState, EmptyState, ErrorState } from "../../components/stitch/States";
import {
  ProcessingPipelinePanel,
  type ProcessingJob,
} from "../../components/stitch/ProcessingPipelinePanel";
import { FileUploadZone } from "../../components/stitch/FileUploadZone";
import IntegrityProof from "../IntegrityProof";
import UploadImage from "../UploadImage";

// ---------------------------------------------------------------------------
// Display helpers for integrity-evidence values. These only format what the
// backend returned — they never invent content. Absent values stay null and
// render as "N/A" / "Not available".
// ---------------------------------------------------------------------------

/** First 16 chars … last 8 of a SHA-3 digest; null when the backend has none. */
const shortHash = (value?: string | null): string | null => {
  if (!value || typeof value !== "string") return null;
  return value.length <= 26 ? value : `${value.slice(0, 16)}…${value.slice(-8)}`;
};

/** Compact form of a transaction hash for ledger rows (first 10 … last 6). */
const shortTx = (value?: string | null): string | null => {
  if (!value || typeof value !== "string") return null;
  return value.length <= 20 ? value : `${value.slice(0, 10)}…${value.slice(-6)}`;
};

/** ISO timestamp → locale string; absent → "N/A"; unparsable → raw value. */
const fmtTimestamp = (value?: string | null): string => {
  if (!value) return "N/A";
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
};

/** Forensic confidence values arrive as 0–1 ratios; render as a percentage. */
const fmtConfidence = (value?: number | null): string => {
  if (value === null || value === undefined || isNaN(value)) return "N/A";
  return `${(value <= 1 ? value * 100 : value).toFixed(1)}%`;
};

/**
 * Worklist ordering — newest upload first, sorted by the backend's real
 * `created_at` timestamp (descending). Ids are only a tie-break between rows
 * that share a timestamp (or lack one); the primary key is never used as the
 * sort order, so a back-filled/ascending-id table still lists the most
 * recently registered study at the top. Rows without a parsable timestamp
 * sink to the bottom instead of floating up.
 */
const byCreatedAtDesc = (a: any, b: any): number => {
  const ta = Date.parse(a?.created_at ?? "");
  const tb = Date.parse(b?.created_at ?? "");
  const aOk = !Number.isNaN(ta);
  const bOk = !Number.isNaN(tb);
  if (aOk && bOk && ta !== tb) return tb - ta;
  if (aOk !== bOk) return aOk ? -1 : 1;
  return Number(b?.id ?? 0) - Number(a?.id ?? 0);
};

interface DoctorWorkspaceProps {
  token: string;
  activeSubPath: string;
  onNavigate: (path: string) => void;
  selectedImageId: number | null;
  onSelectImage: (id: number | null) => void;
}

export const DoctorWorkspace: React.FC<DoctorWorkspaceProps> = ({
  token,
  activeSubPath,
  onNavigate,
  selectedImageId,
  onSelectImage,
}) => {
  // State for images, analytics, recovery records, consents
  const [images, setImages] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any | null>(null);
  const [selectedScan, setSelectedScan] = useState<any | null>(null);
  const [digitalTwin, setDigitalTwin] = useState<any | null>(null);
  const [integrityEvidence, setIntegrityEvidence] = useState<any | null>(null);
  // Real risk/trust assessment for the selected study (backend-sourced, never derived client-side)
  const [riskTrust, setRiskTrust] = useState<any | null>(null);
  const [riskTrustLoading, setRiskTrustLoading] = useState<boolean>(false);
  const [evidenceLoading, setEvidenceLoading] = useState<boolean>(false);
  const [recoveryRecords, setRecoveryRecords] = useState<any[]>([]);
  const [consents, setConsents] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);

  // Filter state for dashboard table
  const [filterType, setFilterType] = useState<"all" | "requires_check" | "tampered" | "verified">("all");
  const [loading, setLoading] = useState<boolean>(true);
  const [recoveryLoading, setRecoveryLoading] = useState<boolean>(false);
  const [recoverySuccess, setRecoverySuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preRecoveryUrl, setPreRecoveryUrl] = useState<string | null>(null);
  const [postRecoveryUrl, setPostRecoveryUrl] = useState<string | null>(null);
  const [liveAlert, setLiveAlert] = useState<string | null>(null);

  // ── RECOVERY STUDIO (backend-sourced, never invented client-side) ──────
  // `recoveryResult` holds the raw POST /api/images/recover/{id} response —
  // recovery.py returns: success, image_id, tampered_roi_count, tampered_rois,
  // recovered_hash, trusted_hash, verification_passed, blockchain_tx_hash,
  // twin_status and recovered_image_base64 (the real recovered PNG bytes).
  const [recoveryResult, setRecoveryResult] = useState<any | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [preRecoveryStatus, setPreRecoveryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [postRecoveryStatus, setPostRecoveryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  // ── Object-URL lifecycle for the Recovery Studio previews ───────────────
  // A blob URL is revoked only when it is replaced or when the workspace
  // unmounts. The previous cleanup effect depended on BOTH urls, so changing
  // the post-recovery preview also revoked the still-displayed pre-recovery
  // one — which is why the left panel went blank.
  const preUrlRef = useRef<string | null>(null);
  const postUrlRef = useRef<string | null>(null);

  const assignPreUrl = (url: string | null) => {
    const prev = preUrlRef.current;
    if (prev && prev !== url && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
    preUrlRef.current = url;
    setPreRecoveryUrl(url);
  };

  const assignPostUrl = (url: string | null) => {
    const prev = postUrlRef.current;
    if (prev && prev !== url && prev.startsWith("blob:")) URL.revokeObjectURL(prev);
    postUrlRef.current = url;
    setPostRecoveryUrl(url);
  };

  // Connect to live WebSocket for real-time security alerts
  useEffect(() => {
    wsService.connect();
    const unsub = wsService.on("*", (payload) => {
      if (payload.event === "tampering_detected") {
        setLiveAlert(`[SECURITY ALERT] Tamper detected on Study "${payload.title || '#' + payload.image_id}" (Risk Score: ${payload.risk_score || 'High'})`);
        loadData();
      } else if (payload.event === "new_scan_uploaded") {
        setLiveAlert(`[SYSTEM UPDATE] New imaging study "${payload.title}" registered.`);
        loadData();
      } else if (payload.event === "scan_recovered") {
        setLiveAlert(`[RESTORATION] Image #${payload.image_id} self-recovery verified.`);
        loadData();
      }
    });

    return () => {
      unsub();
    };
  }, []);

  // Clean up both preview object URLs on unmount (replacement revocation is
  // handled by assignPreUrl/assignPostUrl above).
  useEffect(() => {
    return () => {
      if (preUrlRef.current) URL.revokeObjectURL(preUrlRef.current);
      if (postUrlRef.current) URL.revokeObjectURL(postUrlRef.current);
    };
  }, []);

  // Load baseline data on mount
  useEffect(() => {
    loadData();
  }, [token]);

  const loadData = async (): Promise<any[]> => {
    setLoading(true);
    setError(null);
    let sortedImages: any[] = [];
    try {
      const [imgsData, analyticsData, recRecordsData, consentData, blocksData, patientsData] =
        await Promise.allSettled([
          apiService.listImages(),
          apiService.getDashboardAnalytics(),
          apiService.getRecoveryRecords(),
          apiService.listConsentGrants(),
          apiService.getBlockchainBlocks(),
          apiService.listPatients(),
        ]);

      if (imgsData.status === "fulfilled" && Array.isArray(imgsData.value)) {
        // Worklist order: NEWEST STUDY FIRST — sorted by the backend's real
        // `created_at` timestamp DESC (never by id, which can disagree with
        // upload order). Filters below run on top of this order, so the worklist,
        // the counts and the default selection all agree on "newest first".
        sortedImages = [...imgsData.value].sort(byCreatedAtDesc);
        // Derive display flags from the real quarantine_status DB field
        setImages(sortedImages.map((img: any) => ({ ...img, is_tampered: !!img.quarantine_status, tampered: !!img.quarantine_status })));
        if (!selectedImageId && sortedImages.length > 0) {
          // Default selection = the newest study whose stored object still
          // exists so the default view renders actual images (stale rows 404
          // on preview). Iteration follows the created_at DESC order above.
          (async () => {
            for (const img of sortedImages) {
              try {
                const probeUrl = await fetchProtectedBlobUrl(`/api/images/preview/${img.id}`);
                URL.revokeObjectURL(probeUrl);
                onSelectImage(img.id);
                return;
              } catch { /* missing object — try the next-newest scan */ }
            }
            onSelectImage(sortedImages[0].id);
          })();
        }
      }
      if (analyticsData.status === "fulfilled") setAnalytics(analyticsData.value);
      if (recRecordsData.status === "fulfilled" && recRecordsData.value?.items) {
        setRecoveryRecords(recRecordsData.value.items);
      }
      if (consentData.status === "fulfilled" && Array.isArray(consentData.value)) {
        setConsents(consentData.value);
      }
      if (blocksData.status === "fulfilled" && Array.isArray(blocksData.value)) {
        setBlocks(blocksData.value);
      }
      if (patientsData.status === "fulfilled" && Array.isArray(patientsData.value)) {
        setPatients(patientsData.value);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load clinical workspace data.");
    } finally {
      setLoading(false);
    }
    // Sorted (created_at DESC) worklist — lets callers select the newest study.
    return sortedImages;
  };

  // REFRESH AFTER UPLOAD: the moment the doctor leaves the upload view (either
  // via the back link or UploadImage's "View all images"), re-run the existing
  // loadData() fetch so the freshly registered study shows up in the worklist —
  // and select the NEWEST study (created_at DESC), i.e. the upload just made.
  const prevSubPathRef = useRef(activeSubPath);
  useEffect(() => {
    const prevSubPath = prevSubPathRef.current;
    prevSubPathRef.current = activeSubPath;
    if (prevSubPath === "upload-image" && activeSubPath !== "upload-image") {
      loadData().then((sorted) => {
        if (sorted.length > 0) onSelectImage(sorted[0].id);
      });
    }
  }, [activeSubPath]);

  // Sync selected scan details.
  // NOTE: `images` is a dependency (the worklist refreshes after upload /
  // recovery), so everything image-SCOPED to the Recovery Studio — the preview
  // snapshots and the recovery execution result — lives in the separate
  // selectedImageId-only effect below and is deliberately NOT reset here.
  useEffect(() => {
    if (!selectedImageId) {
      setSelectedScan(null);
      setDigitalTwin(null);
      setIntegrityEvidence(null);
      setRiskTrust(null);
      setRiskTrustLoading(false);
      setEvidenceLoading(false);
      return;
    }

    const found = images.find((img) => img.id === selectedImageId);
    setSelectedScan(found || null);

    // Fetch Digital Twin and Integrity Evidence
    apiService
      .getDigitalTwin(selectedImageId)
      .then((twin) => setDigitalTwin(twin))
      .catch(() => setDigitalTwin(null));

    // Real risk/trust assessment: dedicated endpoint first, integrity-evidence
    // scores as the fallback source. Null/absent stays null (honest "no
    // assessment" state) — no numbers are ever invented in the client.
    let isRiskMounted = true;
    setRiskTrust(null);
    setIntegrityEvidence(null);
    setRiskTrustLoading(true);
    apiService
      .getImageRiskTrust(selectedImageId)
      .then((data) => {
        if (isRiskMounted) setRiskTrust(data ?? null);
      })
      .catch(() => {
        if (isRiskMounted) setRiskTrust(null);
      })
      .finally(() => {
        if (isRiskMounted) setRiskTrustLoading(false);
      });

    setEvidenceLoading(true);
    apiService
      .getIntegrityEvidence(selectedImageId)
      .then((evidence) => {
        if (isRiskMounted) setIntegrityEvidence(evidence);
      })
      .catch(() => {
        if (isRiskMounted) setIntegrityEvidence(null);
      })
      .finally(() => {
        if (isRiskMounted) setEvidenceLoading(false);
      });

    return () => {
      isRiskMounted = false;
    };
  }, [selectedImageId, images]);

  // ── RECOVERY STUDIO (image-scoped) ──────────────────────────────────────
  // Loads the authenticated CURRENT preview of the selected study
  // (GET /api/images/preview/{id}) for the pre-recovery panel and owns the
  // recovery execution state.
  // Keyed ONLY on selectedImageId: the worklist refresh that follows a
  // recovery must neither revoke the pre-recovery snapshot (its bytes are
  // only correct BEFORE POST /api/images/recover/{id} succeeds — recovery.py
  // + versioning.record_recovered_version repoint file_path to the recovered
  // ciphertext) nor wipe the post-recovery verification result.
  useEffect(() => {
    setRecoverySuccess(null);
    setRecoveryResult(null);
    setRecoveryError(null);
    assignPostUrl(null);
    setPostRecoveryStatus("idle");

    if (!selectedImageId) {
      assignPreUrl(null);
      setPreRecoveryStatus("idle");
      return;
    }

    let active = true;
    assignPreUrl(null);
    setPreRecoveryStatus("loading");
    fetchProtectedBlobUrl(`/api/images/preview/${selectedImageId}`)
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        assignPreUrl(url);
        setPreRecoveryStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        assignPreUrl(null);
        setPreRecoveryStatus("error");
      });

    return () => {
      active = false;
    };
  }, [selectedImageId]);

  // Handle Self-Recovery Execution — POST /api/images/recover/{image_id}.
  // The backend (recovery.py) runs the real region-level recovery and returns
  // {success, image_id, tampered_roi_count, tampered_rois, recovered_hash,
  //  trusted_hash, verification_passed, blockchain_tx_hash, twin_status,
  //  recovered_image_base64}. Nothing here is fabricated: on API failure we
  // surface an error state and show no image at all.
  const handleExecuteRecovery = async (imageId: number) => {
    setRecoveryLoading(true);
    setRecoverySuccess(null);
    setRecoveryResult(null);
    setRecoveryError(null);
    assignPostUrl(null);
    setPostRecoveryStatus("idle");
    try {
      const result = await apiService.recoverImage(imageId);
      setRecoveryResult(result ?? null);
      setRecoverySuccess(
        result?.verification_passed === true
          ? `Recovered SHA-3 matches the trusted baseline (recovery ran on ${result?.tampered_roi_count ?? 0} ROI(s)).`
          : `Recovery executed on ${result?.tampered_roi_count ?? 0} ROI(s), but the recovered SHA-3 does not match the trusted baseline.`
      );

      // Post-recovery pixels come from the recovery response itself
      // (`recovered_image_base64` is the real re-encoded PNG). If a future
      // response omits it, fall back to re-fetching GET /api/images/preview/{id}
      // — a verified recovery repoints file_path to the recovered ciphertext.
      const b64 = result?.recovered_image_base64;
      if (typeof b64 === "string" && b64.startsWith("data:image")) {
        assignPostUrl(b64);
        setPostRecoveryStatus("ready");
      } else {
        setPostRecoveryStatus("loading");
        try {
          const url = await fetchProtectedBlobUrl(`/api/images/preview/${imageId}`);
          assignPostUrl(url);
          setPostRecoveryStatus("ready");
        } catch {
          assignPostUrl(null);
          setPostRecoveryStatus("error");
        }
      }

      // Refresh worklist, recovery records and integrity evidence (the latter
      // provides post_recovery_hash / post_recovery_verified / recovery_record_id
      // for the verification block).
      const [updatedImages, updatedRecords, updatedEvidence] = await Promise.all([
        apiService.listImages(),
        apiService.getRecoveryRecords(),
        apiService.getIntegrityEvidence(imageId),
      ]);
      // Keep the worklist's created_at DESC ordering after the refresh.
      setImages(
        [...updatedImages]
          .sort(byCreatedAtDesc)
          .map((img: any) => ({ ...img, is_tampered: !!img.quarantine_status, tampered: !!img.quarantine_status }))
      );
      if (updatedRecords?.items) setRecoveryRecords(updatedRecords.items);
      if (updatedEvidence) setIntegrityEvidence(updatedEvidence);
    } catch (err: any) {
      // Honest error state — no post-recovery image is rendered.
      assignPostUrl(null);
      setPostRecoveryStatus("idle");
      setRecoveryResult(null);
      setRecoveryError(
        err?.response?.data?.detail || err?.message || "Recovery execution failed."
      );
    } finally {
      setRecoveryLoading(false);
    }
  };

  // Filtered scans for dashboard worklist
  const filteredImages = images.filter((img) => {
    const isTampered = img.is_tampered || img.tampered || img.tamper_status === "TAMPERED";
    if (filterType === "tampered") return isTampered;
    if (filterType === "verified") return !isTampered;
    if (filterType === "requires_check") return img.requires_review || isTampered;
    return true;
  });

  const totalScans = images.length;
  const tamperedScansCount = images.filter((img) => img.is_tampered || img.tampered).length;
  const verifiedScansCount = Math.max(0, totalScans - tamperedScansCount);
  // Same predicate the worklist filter uses, so the "Requires Check" chip badge matches its rows
  const requiresCheckCount = images.filter(
    (img) =>
      img.requires_review ||
      img.is_tampered ||
      img.tampered ||
      img.tamper_status === "TAMPERED"
  ).length;
  const recoveryQueueCount = recoveryRecords.filter((r) => r.status !== "VERIFIED").length;

  // Single source for the selected study's risk value (the value RiskScoreCard renders).
  // Backend-sourced only: dedicated /risk-trust endpoint, falling back to the
  // persisted/computed scores on the integrity-evidence bundle. null => no
  // assessment on record, rendered as an honest absent state.
  const riskAssessmentLoading = riskTrustLoading || evidenceLoading;
  const selectedRiskScore: number | null =
    riskTrust && riskTrust.risk_score !== null && riskTrust.risk_score !== undefined
      ? riskTrust.risk_score
      : integrityEvidence?.risk_score !== undefined && integrityEvidence?.risk_score !== null
      ? integrityEvidence.risk_score
      : null;
  const selectedTrustScore: number | null =
    riskTrust && riskTrust.trust_score !== null && riskTrust.trust_score !== undefined
      ? riskTrust.trust_score
      : integrityEvidence?.trust_score !== undefined && integrityEvidence?.trust_score !== null
      ? integrityEvidence.trust_score
      : null;
  const selectedTamperConfidence: number | undefined =
    integrityEvidence?.ai_confidence ??
    integrityEvidence?.ai_forensics?.confidence_score ??
    undefined;

  // ------------------------------------------------------------------
  // INTEGRITY EVIDENCE for the selected study — GET /api/images/{id}/integrity-evidence.
  // Every value rendered below comes straight from that bundle (or the
  // existing digitalTwin fetch); anything the backend omits stays an honest
  // "N/A" / "Not available" — nothing is derived or invented client-side.
  // ------------------------------------------------------------------
  const evidence = integrityEvidence;
  const evStatus: string | null = evidence?.verification_status ?? null;
  const evHashMatch: boolean | null =
    typeof evidence?.hash_match === "boolean" ? evidence.hash_match : null;
  const isTamperedEvidence =
    evHashMatch === false || evStatus === "TAMPERED" || evStatus === "QUARANTINED";
  const isVerifiedEvidence =
    !isTamperedEvidence &&
    (evStatus === "VERIFIED" || evStatus === "RECOVERED" || evHashMatch === true);
  const ditStatus: string | null =
    digitalTwin?.verification_status ?? evidence?.dit_status ?? null;
  const evTxHash: string | null = evidence?.blockchain_tx_hash ?? null;
  const evBlockchainTxs: any[] = Array.isArray(evidence?.blockchain?.transactions)
    ? evidence.blockchain.transactions
    : [];
  const evLatestTx: any | null =
    evBlockchainTxs.length > 0 ? evBlockchainTxs[evBlockchainTxs.length - 1] : null;
  const evAuditEvents: any[] = Array.isArray(evidence?.audit_events)
    ? evidence.audit_events
    : [];
  const evLatestAudit: any | null = evAuditEvents.length > 0 ? evAuditEvents[0] : null;
  const evAiStatus: string | null =
    evidence?.ai_forensics?.status ?? evidence?.forensic_report_status ?? null;
  const evAiConfidenceRaw =
    evidence?.ai_confidence ?? evidence?.ai_forensics?.confidence_score;
  const evAiConfidence: number | null =
    typeof evAiConfidenceRaw === "number" ? evAiConfidenceRaw : null;
  const evTamperPct: number | null =
    typeof evidence?.tamper_percentage === "number" ? evidence.tamper_percentage : null;

  // Headline verdict — honest mapping of the backend verification_status.
  const integrityHeadline: { label: string; icon: string; className: string } = (() => {
    const neutral =
      "bg-surface-container text-on-surface-variant border-surface-container-high";
    if (evidenceLoading)
      return { label: "VERIFYING…", icon: "progress_activity", className: neutral };
    if (!evidence)
      return { label: "N/A — NOT AVAILABLE", icon: "help", className: neutral };
    switch (evStatus) {
      case "VERIFIED":
        return {
          label: "✓ VERIFIED",
          icon: "verified",
          className: "bg-secondary-fixed text-on-secondary-fixed border-secondary/40",
        };
      case "RECOVERED":
        return {
          label: "✓ RECOVERED",
          icon: "restart_check",
          className: "bg-secondary-fixed text-on-secondary-fixed border-secondary/40",
        };
      case "TAMPERED":
        return {
          label: "⚠ TAMPERED",
          icon: "gpp_maybe",
          className: "bg-error-container text-on-error-container border-error/50",
        };
      case "QUARANTINED":
        return {
          label: "⚠ QUARANTINED",
          icon: "gpp_maybe",
          className: "bg-error-container text-on-error-container border-error/50",
        };
      case "PENDING":
        return {
          label: "⚠ REVIEW REQUIRED",
          icon: "rule",
          className: "bg-amber-100 text-amber-900 border-amber-300",
        };
      default:
        return { label: evStatus || "N/A", icon: "help", className: neutral };
    }
  })();

  // Digital Integrity Twin lifecycle — only states backed by real data.
  // Steps the backend has not reported yet stay dimmed as "pending".
  const ditTimeline: { label: string; done: boolean; current: boolean }[] = [];
  if (evidence) {
    ditTimeline.push({
      label: evidence.created_at
        ? `Created · ${fmtTimestamp(evidence.created_at)}`
        : "Created",
      done: !!evidence.created_at,
      current: false,
    });
    if (evStatus === "VERIFIED" || evStatus === "RECOVERED") {
      ditTimeline.push({ label: "Verified", done: true, current: evStatus === "VERIFIED" });
    } else if (evStatus === "TAMPERED") {
      ditTimeline.push({ label: "Tampered", done: true, current: true });
    } else if (evStatus === "QUARANTINED") {
      ditTimeline.push({ label: "Quarantined", done: true, current: true });
    }
    if (evidence.recovery_status === "RECOVERED") {
      ditTimeline.push({
        label: "Recovered",
        done: true,
        current: evidence.post_recovery_verified !== true,
      });
    } else if (evidence.recovery_status === "FAILED") {
      ditTimeline.push({ label: "Recovery failed", done: false, current: false });
    } else if (isTamperedEvidence) {
      ditTimeline.push({ label: "Recovered", done: false, current: false });
    }
    if (evidence.post_recovery_verified === true) {
      ditTimeline.push({ label: "Recovery verified", done: true, current: true });
    } else if (evidence.post_recovery_verified === false) {
      ditTimeline.push({ label: "Recovery verification failed", done: false, current: false });
    } else if (isTamperedEvidence) {
      ditTimeline.push({ label: "Recovery verified", done: false, current: false });
    }
  }

  // Verify action on worklist rows: select the study and anchor the inline
  // integrity-evidence panel on the dashboard (the panel lives there).
  // ── ASYNC SECURITY PROCESSING (real backend job state) ─────────────────
  // How long a finished job keeps its panel on screen so the clinician can
  // actually read the forensic outcome.
  const TERMINAL_LINGER_MS = 180_000;
  // `jobs` maps image_id -> the LAST status the backend reported. Stage and
  // progress always come from GET /api/images/{id}/processing-status; nothing
  // here is a client-side timer or an invented percentage.
  const [jobs, setJobs] = useState<Record<number, any>>({});

  const pollJob = useCallback(async (imageId: number) => {
    try {
      const s = await apiService.getProcessingStatus(imageId);
      setJobs((prev) => {
        const terminal = ["COMPLETED", "FAILED"].includes(s.status);
        return {
          ...prev,
          [imageId]: {
            ...s,
            pollAttempt: (prev[imageId]?.pollAttempt ?? 0) + 1,
            // Stamp the moment a terminal state was first observed so the panel
            // can linger long enough for the clinician to read the outcome
            // instead of vanishing the instant the worker finishes.
            terminalAt:
              prev[imageId]?.terminalAt ?? (terminal ? Date.now() : undefined),
          },
        };
      });
      return s;
    } catch (err: any) {
      // A transient failure (backend restarting, socket reset) must NOT freeze
      // the panel: advance pollAttempt so the effect re-arms with backoff and
      // recovers on its own. The last known stage is preserved deliberately.
      setJobs((prev) => ({
        ...prev,
        [imageId]: {
          ...(prev[imageId] ?? {}),
          pollAttempt: (prev[imageId]?.pollAttempt ?? 0) + 1,
          lastError:
            err?.response?.data?.detail || "status temporarily unavailable",
        },
      }));
      return null;
    }
  }, []);

  // Studies with real, non-terminal backend job state, newest first.
  // A finished job stays visible for TERMINAL_LINGER_MS so the forensic
  // result is actually readable, then drops out on its own.
  const activeJobs: ProcessingJob[] = Object.values(jobs)
    .filter((j): j is ProcessingJob => {
      if (!j) return false;
      if (j.status === "NOT_QUEUED") return false;
      if (["COMPLETED", "FAILED"].includes(j.status)) {
        const t = (j as any).terminalAt;
        return typeof t === "number" && Date.now() - t < TERMINAL_LINGER_MS;
      }
      return true;
    })
    .sort((a, b) => b.image_id - a.image_id);

  // Re-evaluate the linger window without polling the API.
  useEffect(() => {
    if (!Object.values(jobs).some((j: any) => j?.terminalAt)) return;
    const t = window.setTimeout(() => {
      setJobs((prev) =>
        Object.fromEntries(
          Object.entries(prev).filter(
            ([, j]: [string, any]) =>
              !j?.terminalAt || Date.now() - j.terminalAt < TERMINAL_LINGER_MS
          )
        )
      );
    }, TERMINAL_LINGER_MS + 500);
    return () => window.clearTimeout(t);
  }, [jobs]);

  // Poll with exponential backoff ONLY while a job is unfinished, and stop once
  // it reaches a terminal state so the API is never hammered.
  useEffect(() => {
    const pending = Object.entries(jobs).filter(
      ([, j]) => j && j.status !== "COMPLETED" && j.status !== "FAILED" && j.status !== "NOT_QUEUED"
    );
    if (pending.length === 0) return;

    const timers: number[] = [];
    pending.forEach(([idStr, job], idx) => {
      const attempt = job.pollAttempt ?? 0;
      const delay = Math.min(30000, 1500 * 2 ** Math.min(attempt, 4));
      timers.push(
        window.setTimeout(async () => {
          await pollJob(Number(idStr));
        }, delay + idx * 200)
      );
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [jobs, pollJob]);

  // Real-time nudge from the existing WebSocket channel; polling is the
  // fallback when a socket event is missed.
  useEffect(() => {
    const unsub = wsService.on("*", (payload: any) => {
      const id = payload?.image_id;
      if (id && typeof id === "number") pollJob(id);
    });
    return unsub;
  }, [pollJob]);

  const adoptJob = async (imageId: number, seed?: any) => {
    if (seed) setJobs((prev) => ({ ...prev, [imageId]: { ...seed, pollAttempt: 0 } }));
    await pollJob(imageId);
  };

  const handleVerifyStudy = (id: number) => {
    onSelectImage(id);
    if (activeSubPath !== "doctor-dashboard") onNavigate("doctor-dashboard");
    window.setTimeout(() => {
      document
        .getElementById("integrity-evidence-panel")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
  };

  // ------------------------------------------------------------------
  // RECOVERY PIPELINE — every stage is derived from REAL backend artifacts:
  //   • integrity-evidence (GET /api/images/{id}/integrity-evidence):
  //       hash_match / verification_status / affected_regions /
  //       recovery_status / post_recovery_hash / post_recovery_verified /
  //       recovery_record_id
  //   • the POST /api/images/recover/{id} response (recovery.py)
  //   • the persisted RecoveryRecord (GET /api/images/recovery-records)
  // A stage stays "upcoming" (rendered muted by StepTracker) unless one of
  // those actually backs it — no stage is green on load by default.
  // ------------------------------------------------------------------
  const activeRecovery =
    recoveryResult && selectedImageId && recoveryResult.image_id === selectedImageId
      ? recoveryResult
      : null;
  // Records are served newest-first (timestamp DESC), so the first match for
  // this image is its latest recovery run.
  const latestRecoveryRecord: any =
    recoveryRecords.find((rec: any) => String(rec?.image_id) === String(selectedImageId)) ?? null;

  const recoveredRois: any[] = Array.isArray(activeRecovery?.tampered_rois)
    ? activeRecovery.tampered_rois
    : Array.isArray(latestRecoveryRecord?.affected_regions)
    ? latestRecoveryRecord.affected_regions
    : [];
  const localizedRegions: any[] = Array.isArray(evidence?.affected_regions)
    ? evidence.affected_regions
    : [];
  const regionCount = recoveredRois.length > 0 ? recoveredRois.length : localizedRegions.length;

  // Stage 1 evidence: a reported hash deviation, a quarantined study, or a
  // recorded recovery run (the tamper flag itself is reset by a verified
  // recovery, so the recovery record is the historical proof it existed).
  const hashDeviationKnown =
    evHashMatch === false ||
    evStatus === "TAMPERED" ||
    evStatus === "QUARANTINED" ||
    selectedScan?.is_tampered === true;
  const tamperEvidenceKnown =
    hashDeviationKnown || !!activeRecovery || !!latestRecoveryRecord;
  const recoveryExecuted =
    !!activeRecovery ||
    !!latestRecoveryRecord ||
    evidence?.recovery_status === "RECOVERED" ||
    evidence?.recovery_status === "FAILED";

  // Post-recovery verdict — true only when a backend verification says so.
  const postVerified: boolean | null =
    typeof activeRecovery?.verification_passed === "boolean"
      ? activeRecovery.verification_passed
      : typeof evidence?.post_recovery_verified === "boolean"
      ? evidence.post_recovery_verified
      : typeof latestRecoveryRecord?.hash_match === "boolean"
      ? latestRecoveryRecord.hash_match
      : null;

  const stage1Done = tamperEvidenceKnown;
  const stage2Done = stage1Done && regionCount > 0;
  // Stages 03/04 are executed atomically inside recover_compromised_image:
  // 03 = trusted original pulled from the Digital Twin storage reference,
  // 04 = ROI replacement + SHA-3 recomputed on the re-encoded recovered file.
  const stage3Done = recoveryExecuted;
  const stage4Done = !!(
    activeRecovery?.recovered_hash ||
    latestRecoveryRecord?.recovered_hash ||
    evidence?.post_recovery_hash
  );
  const stage5Done = postVerified === true;

  const stageStatus = (
    done: boolean,
    inProgress: boolean
  ): "complete" | "current" | "upcoming" =>
    done ? "complete" : inProgress ? "current" : "upcoming";

  // Self-recovery steps definition — descriptions state only what the backend
  // has actually reported (or what is still pending). Note: the backend method
  // is TRUSTED_IPFS_ROI_REPLACEMENT (recovery.py) — there is no fragile
  // watermark extraction, so stage 03 is named for the retrieval the code
  // really performs instead of an un-executed watermark step.
  const recoverySteps: StepItem[] = [
    {
      number: "01",
      title: "Compromised Scan Isolated",
      description: stage1Done
        ? hashDeviationKnown
          ? "Trusted vs current SHA-3 deviation reported by integrity-evidence."
          : "Recovery record on file for this study."
        : evidenceLoading
        ? "Recomputing SHA-3 against the trusted baseline…"
        : evidence
        ? "No hash deviation reported — study currently verifies clean."
        : "Integrity evidence not available for this study.",
      status: stageStatus(stage1Done, !stage1Done && evidenceLoading),
    },
    {
      number: "02",
      title: "Tampered Region Masked",
      description: stage2Done
        ? `${regionCount} region(s) localized (integrity-evidence affected_regions / recovery ROIs).`
        : stage1Done
        ? "Pending — no localization evidence (affected_regions) on record yet."
        : "Pending — awaiting stage 01.",
      status: stageStatus(stage2Done, !stage2Done && stage1Done && recoveryLoading),
    },
    {
      number: "03",
      title: "Trusted Backup Retrieved",
      description: stage3Done
        ? "TRUSTED_IPFS_ROI_REPLACEMENT: trusted original loaded from the Digital Twin reference."
        : "Pending — recovery pulls the trusted original from the Digital Twin reference.",
      status: stageStatus(stage3Done, !stage3Done && recoveryLoading),
    },
    {
      number: "04",
      title: "Trusted ROI Replacement",
      description: stage4Done
        ? `Recovered pixels re-encoded and SHA-3 recomputed (execution ran on ${activeRecovery?.tampered_roi_count ?? regionCount} ROI(s)).`
        : "Pending — tampered regions overwritten from the trusted scan, then re-hashed.",
      status: stageStatus(stage4Done, !stage4Done && recoveryLoading),
    },
    {
      number: "05",
      title: "Review & Forensic Sign-off",
      description: stage5Done
        ? "Post-recovery SHA-3 matches the trusted hash; ledger transaction recorded."
        : postVerified === false
        ? "Post-recovery SHA-3 verification FAILED — sign-off withheld."
        : stage4Done
        ? "Awaiting post-recovery SHA-3 verification against the trusted hash."
        : "Pending — verification runs after a recovery execution.",
      status: stageStatus(stage5Done, !stage5Done && stage4Done && evidenceLoading),
    },
  ];

  // One honest badge for the tracker — reflects what has really happened.
  const recoveryStageBadge = recoveryLoading
    ? "Executing Recovery…"
    : stage5Done
    ? "Completed • Verified"
    : stage4Done
    ? "Awaiting Sign-off"
    : stage1Done
    ? "Ready for Recovery"
    : evidenceLoading
    ? "Loading Evidence…"
    : "No Tamper Evidence";

  // ------------------------------------------------------------------
  // SUB-VIEW: secure upload. Reuses the existing UploadImage component
  // (the same screen the legacy router renders for "upload-image").
  // ------------------------------------------------------------------
  if (activeSubPath === "upload-image") {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => onNavigate("doctor-dashboard")}
          className="self-start inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-surface-container text-on-surface font-label-md text-xs font-medium shadow-sm hover:bg-surface-container-high transition-colors"
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">arrow_back</span>
          <span>Back to worklist</span>
        </button>
        <UploadImage
          token={token}
          onViewChange={(view) =>
            // UploadImage's receipt links to legacy "medical-images", which has
            // no stitch branch for doctors — land on the real worklist instead.
            onNavigate(view === "medical-images" ? "doctor-dashboard" : view)
          }
          onAccepted={(payload: any) => {
            // Fast-accept returned real ids: adopt the job, refresh the worklist
            // immediately so the doctor can keep working while forensics run.
            if (payload?.image_id) {
              adoptJob(payload.image_id, {
                status: payload.status,
                progress: 5,
                progress_basis: "pipeline_stage",
                stages: [],
              });
              if (payload?.worker_queued === false) {
                setError(
                  payload?.worker_error
                    ? `Study stored, but background processing was NOT queued: ${payload.worker_error}`
                    : "Study stored, but background processing was NOT queued (worker unavailable)."
                );
              }
              loadData().then((sorted) => {
                if (sorted.length > 0) onSelectImage(sorted[0].id);
              });
            }
          }}
        />
      </div>
    );
  }

  if (loading && images.length === 0) {
    return <LoadingState message="Loading Doctor / Radiologist telemetry suite..." />;
  }

  return (
    <div className="space-y-6">
      {error && (
        <ErrorState
          title="Clinical Telemetry Notice"
          message={error}
          onRetry={loadData}
        />
      )}
      {liveAlert && (
        <div className="p-3 bg-secondary-fixed text-on-secondary-fixed rounded-xl font-label-md text-xs flex items-center justify-between border border-secondary/30 shadow-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-secondary">
              security
            </span>
            <span>{liveAlert}</span>
          </div>
          <button
            onClick={() => setLiveAlert(null)}
            className="text-on-secondary-fixed/70 hover:text-on-secondary-fixed"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Async security processing: real backend job state for every study
          this session uploaded or adopted. Non-blocking - the dashboard stays
          fully usable while the Celery worker runs the forensics. */}
      {activeJobs.length > 0 && (
        <div className="space-y-3">
          {activeJobs.map((j) => (
            <ProcessingPipelinePanel
              key={j.image_id}
              job={j}
              onRetry={() => apiService.retryAnalysis(j.image_id).then(() => pollJob(j.image_id))}
              onDismiss={() =>
                setJobs((prev) => {
                  const next = { ...prev };
                  delete next[j.image_id];
                  return next;
                })
              }
            />
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 1. DOCTOR RADIOLOGIST DASHBOARD VIEW                              */}
      {/* ------------------------------------------------------------------ */}
      {activeSubPath === "doctor-dashboard" && (
        <div className="space-y-6">
          {/* Top Context Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-secondary-container text-on-secondary-container font-label-sm text-[11px] uppercase tracking-wider font-semibold">
                  Node #428 • Active Diagnostic Hub
                </span>
                <span className="text-outline-variant">•</span>
                <span className="font-code-sm text-xs text-on-surface-variant font-medium">
                  STATION_KEY // SHA3-512-VERIFIED
                </span>
              </div>
              <h1 className="font-headline-xl text-2xl md:text-3xl font-bold text-on-surface tracking-tight">
                Radiology Diagnostic Suite
              </h1>
              <p className="font-body-md text-xs md:text-sm text-on-surface-variant max-w-2xl">
                Diagnostic Integrity &amp; Continuous Ledger Verification. All ingested DICOM telemetry validated against tamper-proof provenance blocks.
              </p>
            </div>

            {/* Quick Filter Pill Navigation */}
            <div className="flex items-center flex-wrap gap-1.5 bg-surface-container-low p-1 rounded-xl shadow-sm border border-surface-container-high/40">
              <button
                onClick={() => setFilterType("all")}
                aria-pressed={filterType === "all"}
                title="Every study assigned to this worklist"
                className={`px-3 py-1.5 rounded-lg font-label-md text-xs transition-all flex items-center gap-1.5 border ${
                  filterType === "all"
                    ? "bg-surface-container-lowest text-primary font-semibold shadow-sm ring-1 ring-primary/60 border-primary/40"
                    : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                }`}
              >
                <span>All Assigned</span>
                <span className={`px-1.5 py-0.5 rounded-full font-code-sm text-[10px] ${filterType === "all" ? "bg-primary/15 text-primary" : "bg-surface-container text-on-surface"}`}>
                  {totalScans}
                </span>
              </button>
              <button
                onClick={() => setFilterType("requires_check")}
                aria-pressed={filterType === "requires_check"}
                title="Studies still awaiting a second-look review"
                className={`px-3 py-1.5 rounded-lg font-label-md text-xs transition-all flex items-center gap-1.5 border ${
                  filterType === "requires_check"
                    ? "bg-surface-container-lowest text-primary font-semibold shadow-sm ring-1 ring-primary/60 border-primary/40"
                    : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                }`}
              >
                <span>Requires Check</span>
                <span className={`px-1.5 py-0.5 rounded-full font-code-sm text-[10px] ${filterType === "requires_check" ? "bg-primary/15 text-primary" : "bg-surface-container text-on-surface-variant"}`}>
                  {requiresCheckCount}
                </span>
              </button>
              <button
                onClick={() => setFilterType("tampered")}
                aria-pressed={filterType === "tampered"}
                title="Quarantined studies with detected hash deviation"
                className={`px-3 py-1.5 rounded-lg font-label-md text-xs transition-all flex items-center gap-1.5 border ${
                  filterType === "tampered"
                    ? "bg-error-container text-on-error-container font-semibold shadow-sm ring-1 ring-error/70 border-error/50"
                    : "border-transparent text-error hover:bg-error-container/40"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
                <span>Suspected Tampering</span>
                <span className={`px-1.5 py-0.5 rounded-full font-code-sm text-[10px] font-semibold ${filterType === "tampered" ? "bg-error text-on-error" : "bg-error-container text-on-error-container"}`}>
                  {tamperedScansCount}
                </span>
              </button>
              <button
                onClick={() => setFilterType("verified")}
                aria-pressed={filterType === "verified"}
                title="Cleared studies ready for radiologist sign-off"
                className={`px-3 py-1.5 rounded-lg font-label-md text-xs transition-all flex items-center gap-1.5 border ${
                  filterType === "verified"
                    ? "bg-surface-container-lowest text-secondary font-semibold shadow-sm ring-1 ring-secondary/60 border-secondary/40"
                    : "border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                }`}
              >
                <span>Ready for Sign-off</span>
                <span className={`px-1.5 py-0.5 rounded-full font-code-sm text-[10px] ${filterType === "verified" ? "bg-secondary/15 text-secondary" : "bg-secondary-fixed text-on-secondary-fixed"}`}>
                  {verifiedScansCount}
                </span>
              </button>
              {/* Primary action: register a new study (routes to the existing upload view) */}
              <button
                type="button"
                onClick={() => onNavigate("upload-image")}
                title="Register a new medical image study"
                className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-xs font-semibold flex items-center gap-1.5 shadow-sm hover:bg-primary-container transition-colors"
              >
                <span className="material-symbols-outlined text-sm" aria-hidden="true">upload</span>
                <span>+ Import Medical Study</span>
              </button>
            </div>
          </div>

          {/* Metric Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              title="Assigned Studies Today"
              value={totalScans}
              unit="scans queued"
              icon="medical_services"
              footerText="Validated with AES-256-GCM"
              footerBadgeText={`${verifiedScansCount} Verified`}
            />
            <MetricCard
              title="Integrity Status"
              value={totalScans > 0 ? `${((verifiedScansCount / totalScans) * 100).toFixed(1)}%` : "—"}
              unit="SHA-3 Match"
              icon="verified_user"
              iconBgClass="bg-secondary-container/40 text-secondary"
              valueColorClass="text-secondary"
              footerText="Dual-ledger validated"
              footerBadgeText="Ledger Synced"
              footerBadgeClass="bg-secondary-fixed text-on-secondary-fixed font-semibold"
            />
            <MetricCard
              title="Tamper Alerts Flagged"
              value={tamperedScansCount.toString().padStart(2, "0")}
              unit="anomalous pixel beds"
              icon="warning"
              iconBgClass="bg-error-container/60 text-error"
              valueColorClass="text-error"
              footerText="Swin-UNet & SRM filters"
              footerBadgeText={tamperedScansCount > 0 ? "Action Required" : "No Tampering"}
              footerBadgeClass={
                tamperedScansCount > 0
                  ? "bg-error-container text-on-error-container font-semibold"
                  : "bg-surface-container text-on-surface font-semibold"
              }
            />
            <MetricCard
              title="Self-Recovery Queue"
              value={recoveryQueueCount.toString().padStart(2, "0")}
              unit="healed slices"
              icon="auto_fix_high"
              iconBgClass="bg-tertiary-fixed text-tertiary"
              valueColorClass="text-primary-container"
              footerText="Region-level ROI recovery"
              footerBadgeText="Pending Sign-off"
              footerBadgeClass="bg-tertiary-fixed text-on-tertiary-fixed font-semibold"
            />
          </div>

          {/* Asymmetric Workspace Grid: Table (8 cols) + Detail Panel (4 cols) */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            {/* Scans Table */}
            <div className="xl:col-span-8 bg-surface-container-lowest rounded-xl p-space-md border border-surface-container-high/60 shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-surface-container-low">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px] text-primary">
                    list_alt
                  </span>
                  <h3 className="font-headline-sm text-sm font-semibold text-on-surface">
                    Priority Radiology Worklist
                  </h3>
                </div>
                <span className="font-body-sm text-xs text-on-surface-variant">
                  Showing {filteredImages.length} of {images.length} studies
                </span>
              </div>

              {filteredImages.length === 0 ? (
                <EmptyState
                  icon="inventory_2"
                  title="No Scans Found"
                  description="No clinical scan records match your active filter."
                />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-surface-container-high/40">
                  <table className="w-full text-left font-body-sm text-xs">
                    <thead className="bg-surface-container-low text-on-surface-variant font-label-sm uppercase tracking-wider text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3 border-l-2 border-l-transparent">Study / Modality</th>
                        <th className="py-2.5 px-3">Patient Ref</th>
                        <th className="py-2.5 px-3">Integrity State</th>
                        <th className="py-2.5 px-3">Cryptographic Match</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-container-low">
                      {filteredImages.map((img) => {
                        // Same tamper predicate the quick filters use (derived from quarantine_status)
                        const isTampered =
                          img.is_tampered ||
                          img.tampered ||
                          img.tamper_status === "TAMPERED";
                        const isSelected = img.id === selectedImageId;
                        return (
                          <tr
                            key={img.id}
                            onClick={() => onSelectImage(img.id)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? isTampered
                                  ? "bg-error-container/30"
                                  : "bg-surface-container/70"
                                : isTampered
                                ? "bg-error-container/20 hover:bg-error-container/35"
                                : "hover:bg-surface-container-low/50"
                            }`}
                          >
                            <td
                              className={`py-3 px-3 ${
                                isTampered ? "border-l-2 border-l-error" : "border-l-2 border-l-transparent"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-primary shrink-0">
                                  <span className="material-symbols-outlined text-sm">
                                    radiology
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  <span className="font-headline-sm text-xs font-semibold text-on-surface block truncate max-w-[180px]">
                                    {img.title || `Scan #${img.id}`}
                                  </span>
                                  <span className="font-label-sm text-[10px] text-on-surface-variant uppercase">
                                    {img.image_type || "DICOM"}
                                  </span>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-3 text-on-surface-variant font-code-sm">
                              Patient #{img.patient_id || "Anonymous"}
                            </td>
                            <td className="py-3 px-3">
                              <div className="flex flex-col items-start gap-1">
                                <StatusPill
                                  variant={isTampered ? "tampered" : "verified"}
                                  label={isTampered ? "Tamper Detected" : "SHA-3 Valid"}
                                  pulse={isTampered}
                                  className={
                                    isTampered
                                      ? "ring-1 ring-error/50"
                                      : "ring-1 ring-secondary/40"
                                  }
                                />
                                <span
                                  className={`px-1.5 py-0.5 rounded font-label-sm text-[10px] font-semibold tracking-wide ${
                                    isTampered
                                      ? "bg-error-container text-on-error-container"
                                      : "bg-surface-container text-on-surface-variant"
                                  }`}
                                >
                                  {isTampered ? "Critical Risk" : "Minimal Risk"}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-3 font-mono text-[10px] text-on-surface-variant max-w-[140px] truncate" title={img.original_hash || img.hash}>
                              {img.original_hash || img.hash
                                ? `${(img.original_hash || img.hash).slice(0, 10)}...${(img.original_hash || img.hash).slice(-6)}`
                                : "Not available"}
                            </td>
                            <td className="py-3 px-3 text-right">
                              <div className="flex items-center justify-end gap-1.5 flex-wrap">
                                {/* View → existing DICOM preview / viewer action */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectImage(img.id);
                                    onNavigate("image-review-and-verification");
                                  }}
                                  className="px-2.5 py-1.5 rounded border border-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high font-label-sm text-[11px] font-medium"
                                >
                                  View
                                </button>
                                {/* Verify → select the study and anchor the integrity-evidence panel */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleVerifyStudy(img.id);
                                  }}
                                  className="px-2.5 py-1.5 rounded border border-secondary/50 text-secondary hover:bg-secondary-container/40 font-label-sm text-[11px] font-semibold"
                                >
                                  Verify
                                </button>
                                {/* Analyze → existing AI forensic studio (also the tampered-row escalation CTA) */}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onSelectImage(img.id);
                                    onNavigate("ai-tamper-forensics");
                                  }}
                                  className={`px-2.5 py-1.5 rounded font-label-sm text-[11px] font-semibold shadow-sm ${
                                    isTampered
                                      ? "bg-primary text-on-primary hover:bg-primary-container"
                                      : "border border-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                                  }`}
                                >
                                  Analyze
                                </button>
                                {/* Cleared state: sign-off remains an available row action */}
                                {!isTampered && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSelectImage(img.id);
                                      alert(`Radiological sign-off recorded for Image #${img.id} with certified SHA-3 provenance signature.`);
                                    }}
                                    className="px-2.5 py-1.5 rounded bg-primary text-on-primary font-label-sm text-[11px] font-semibold hover:bg-primary-container shadow-sm"
                                  >
                                    Sign off
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Selected Scan Right Inspector (4 cols) */}
            <div className="xl:col-span-4 space-y-4">
              {selectedScan ? (
                <div className="bg-surface-container-lowest rounded-xl p-space-md border border-surface-container-high/60 shadow-sm space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-surface-container-low">
                    <span className="font-label-sm text-xs font-semibold text-outline uppercase tracking-wider">
                      Study Telemetry Inspector
                    </span>
                    <span className="px-2 py-0.5 rounded font-label-sm text-[10px] bg-secondary-fixed text-on-secondary-fixed font-semibold">
                      Live Telemetry
                    </span>
                  </div>

                  <div className="space-y-1">
                    <h4 className="font-headline-sm text-base font-semibold text-on-surface">
                      {selectedScan.title || `Scan #${selectedScan.id}`}
                    </h4>
                    <span className="font-body-sm text-xs text-on-surface-variant block">
                      Patient #{selectedScan.patient_id} • Modality: {selectedScan.image_type || "DICOM"}
                    </span>
                  </div>

                  {/* ── INTEGRITY STATUS PANEL (GET /api/images/{id}/integrity-evidence) ── */}
                  <div
                    id="integrity-evidence-panel"
                    className="rounded-xl border border-surface-container-high/60 bg-surface-container-low p-3 space-y-2 scroll-mt-24"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline font-semibold">
                        Integrity Status
                      </span>
                      <span className="font-code-sm text-[10px] text-on-surface-variant">
                        {evidence?.hash_algorithm || "N/A"}
                      </span>
                    </div>

                    {/* Headline verdict */}
                    <div
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 ${integrityHeadline.className}`}
                    >
                      <span
                        className="material-symbols-outlined text-lg"
                        aria-hidden="true"
                      >
                        {integrityHeadline.icon}
                      </span>
                      <span className="font-headline-sm text-sm font-bold tracking-wide">
                        {integrityHeadline.label}
                      </span>
                    </div>

                    {evidenceLoading ? (
                      <p className="font-body-sm text-xs text-on-surface-variant flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm animate-spin">
                          progress_activity
                        </span>
                        <span>Loading integrity evidence…</span>
                      </p>
                    ) : !evidence ? (
                      <p className="font-body-sm text-xs text-on-surface-variant">
                        N/A — integrity evidence not available for this study.
                      </p>
                    ) : (
                      <div className="space-y-1.5 font-body-sm text-[11px]">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-on-surface-variant shrink-0">Trusted SHA-3</span>
                          <code
                            className="font-mono text-[10px] text-on-surface truncate"
                            title={evidence.trusted_hash || ""}
                          >
                            {shortHash(evidence.trusted_hash) || "Not available"}
                          </code>
                        </div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-on-surface-variant shrink-0">Current SHA-3</span>
                          <code
                            className="font-mono text-[10px] text-on-surface truncate"
                            title={evidence.current_hash || ""}
                          >
                            {shortHash(evidence.current_hash) || "Not available"}
                          </code>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-on-surface-variant">Hash Match</span>
                          <span
                            className={`font-label-md text-[11px] font-bold ${
                              evHashMatch === true
                                ? "text-secondary"
                                : evHashMatch === false
                                ? "text-error"
                                : "text-on-surface-variant"
                            }`}
                          >
                            {evHashMatch === true
                              ? "✓ MATCH"
                              : evHashMatch === false
                              ? "✕ MISMATCH"
                              : "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-on-surface-variant">Digital Integrity Twin</span>
                          <span
                            className={`font-code-sm text-[10px] font-semibold ${
                              ditStatus ? "text-secondary" : "text-on-surface-variant"
                            }`}
                          >
                            {ditStatus || "Not available"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-on-surface-variant">Verification</span>
                          <span className="font-code-sm text-[10px] text-on-surface">
                            {fmtTimestamp(evidence.verification_timestamp)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-on-surface-variant">Image / Study ID</span>
                          <span className="font-code-sm text-[10px] text-on-surface">
                            {evidence.image_id !== null && evidence.image_id !== undefined
                              ? `IMG-#${evidence.image_id}`
                              : "N/A"}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── TAMPER PROOF EVIDENCE (only when the evidence says tampered) ── */}
                  {evidence && isTamperedEvidence && (
                    <div className="rounded-xl border border-error/40 bg-error-container/30 p-3 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-label-sm text-[10px] uppercase tracking-wider text-error font-bold flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm" aria-hidden="true">
                            crisis_alert
                          </span>
                          Tamper Proof Evidence
                        </span>
                        <StatusPill
                          variant="tampered"
                          label="Tampering Detected"
                          className="ring-1 ring-error/50"
                        />
                      </div>

                      {/* A · Cryptographic evidence */}
                      <div className="rounded-lg border border-surface-container-high/60 bg-surface-container-lowest p-2.5 space-y-1">
                        <span className="font-label-sm text-[10px] uppercase tracking-wider text-error font-semibold block">
                          A · Cryptographic
                        </span>
                        <div className="flex items-start justify-between gap-2 text-[11px]">
                          <span className="text-on-surface-variant shrink-0">Trusted SHA-3</span>
                          <code
                            className="font-mono text-[10px] text-on-surface truncate"
                            title={evidence.trusted_hash || ""}
                          >
                            {shortHash(evidence.trusted_hash) || "Not available"}
                          </code>
                        </div>
                        <div className="flex items-start justify-between gap-2 text-[11px]">
                          <span className="text-on-surface-variant shrink-0">Current SHA-3</span>
                          <code
                            className="font-mono text-[10px] text-on-surface truncate"
                            title={evidence.current_hash || ""}
                          >
                            {shortHash(evidence.current_hash) || "Not available"}
                          </code>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-on-surface-variant">Comparison</span>
                          <span
                            className={`font-label-md text-[11px] font-bold ${
                              evHashMatch === false ? "text-error" : "text-on-surface-variant"
                            }`}
                          >
                            {evHashMatch === true
                              ? "✓ MATCH"
                              : evHashMatch === false
                              ? "✕ MISMATCH"
                              : "N/A"}
                          </span>
                        </div>
                        <p className="font-label-md text-[11px] font-bold text-error pt-1">
                          TAMPERING DETECTED
                        </p>
                        <p className="font-body-sm text-[10px] text-on-surface-variant">
                          {evidence.current_hash
                            ? "Trusted and current SHA-3 digests do not match."
                            : "Current SHA-3 could not be recomputed from the stored file."}
                        </p>
                      </div>

                      {/* B · AI forensic analysis */}
                      <div className="rounded-lg border border-surface-container-high/60 bg-surface-container-lowest p-2.5 space-y-1.5">
                        <span className="font-label-sm text-[10px] uppercase tracking-wider text-error font-semibold block">
                          B · AI Forensic
                        </span>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-on-surface-variant">Detection status</span>
                          <span className="font-code-sm text-[10px] text-on-surface">
                            {evAiStatus || "Not available"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-on-surface-variant">Tamper probability</span>
                          <span className="font-code-sm text-[10px] text-on-surface">
                            {evTamperPct !== null ? `${evTamperPct.toFixed(1)}%` : "N/A"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-on-surface-variant">AI confidence</span>
                          <span className="font-code-sm text-[10px] text-on-surface">
                            {fmtConfidence(evAiConfidence)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-on-surface-variant">Risk score</span>
                          <span className="font-code-sm text-[10px] text-on-surface">
                            {typeof evidence.risk_score === "number"
                              ? `${evidence.risk_score}/100${
                                  // Prefer the breakdown's own category: the serializer's
                                  // top-level risk_category can disagree with its breakdown
                                  (evidence.risk_and_trust as any)?.risk_breakdown?.risk?.category ||
                                  evidence.risk_and_trust?.risk_category
                                    ? ` · ${
                                        (evidence.risk_and_trust as any)?.risk_breakdown?.risk
                                          ?.category ||
                                        evidence.risk_and_trust?.risk_category
                                      }`
                                    : ""
                                }`
                              : "N/A"}
                          </span>
                        </div>
                        {/* Forensic artifact views live in the existing AI forensic studio */}
                        <div className="flex flex-wrap gap-1.5 pt-1.5">
                          <button
                            type="button"
                            onClick={() => onNavigate("ai-tamper-forensics")}
                            className="px-2 py-1 rounded bg-primary text-on-primary font-label-sm text-[10px] font-semibold hover:bg-primary-container shadow-sm"
                          >
                            View Tamper Heatmap
                          </button>
                          <button
                            type="button"
                            onClick={() => onNavigate("ai-tamper-forensics")}
                            className="px-2 py-1 rounded border border-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high font-label-sm text-[10px] font-medium"
                          >
                            View Localization Mask
                          </button>
                          <button
                            type="button"
                            onClick={() => onNavigate("ai-tamper-forensics")}
                            className="px-2 py-1 rounded border border-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high font-label-sm text-[10px] font-medium"
                          >
                            View Grad-CAM
                          </button>
                        </div>
                      </div>

                      {/* C · Digital integrity twin lifecycle */}
                      <div className="rounded-lg border border-surface-container-high/60 bg-surface-container-lowest p-2.5 space-y-1.5">
                        <span className="font-label-sm text-[10px] uppercase tracking-wider text-error font-semibold block">
                          C · Digital Integrity Twin
                        </span>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="text-on-surface-variant">Current state</span>
                          <span
                            className={`font-code-sm text-[10px] font-semibold ${
                              ditStatus ? "text-error" : "text-on-surface-variant"
                            }`}
                          >
                            {ditStatus || "Not available"}
                          </span>
                        </div>
                        <ol className="space-y-1 pt-0.5">
                          {ditTimeline.map((step, idx) => (
                            <li key={idx} className="flex items-center gap-1.5 text-[10px]">
                              <span
                                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  step.done
                                    ? step.current
                                      ? "bg-primary animate-pulse"
                                      : "bg-secondary"
                                    : "bg-outline-variant/60"
                                }`}
                                aria-hidden="true"
                              />
                              <span
                                className={
                                  step.done
                                    ? step.current
                                      ? "text-on-surface font-semibold"
                                      : "text-on-surface-variant"
                                    : "text-outline"
                                }
                              >
                                {step.label}
                              </span>
                              {!step.done && (
                                <span className="text-outline italic">pending</span>
                              )}
                            </li>
                          ))}
                        </ol>
                        <div className="flex items-center justify-between gap-2 text-[11px] pt-1 border-t border-surface-container-high/60">
                          <span className="text-on-surface-variant">Post-recovery hash</span>
                          <code
                            className="font-mono text-[10px] text-on-surface truncate"
                            title={evidence.post_recovery_hash || ""}
                          >
                            {shortHash(evidence.post_recovery_hash) || "Not available"}
                          </code>
                        </div>
                      </div>

                      {/* D · Blockchain / audit record (real tx only, else honest absent state) */}
                      <div className="rounded-lg border border-surface-container-high/60 bg-surface-container-lowest p-2.5 space-y-1">
                        <span className="font-label-sm text-[10px] uppercase tracking-wider text-error font-semibold block">
                          D · Blockchain / Audit
                        </span>
                        {evTxHash ? (
                          <>
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="text-on-surface-variant">Ledger record</span>
                              <span className="text-secondary font-bold">✓ RECORDED</span>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="text-on-surface-variant">Network</span>
                              <span className="font-code-sm text-[10px] text-on-surface">
                                {evidence.blockchain_network || "Not available"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="text-on-surface-variant">Block</span>
                              <span className="font-code-sm text-[10px] text-on-surface">
                                {evidence.blockchain_block !== null &&
                                evidence.blockchain_block !== undefined
                                  ? `#${evidence.blockchain_block}`
                                  : "N/A"}
                              </span>
                            </div>
                            <div className="flex items-start justify-between gap-2 text-[11px]">
                              <span className="text-on-surface-variant shrink-0">Tx hash</span>
                              <code
                                className="font-mono text-[10px] text-on-surface truncate"
                                title={evTxHash}
                              >
                                {shortTx(evTxHash)}
                              </code>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="text-on-surface-variant">Event</span>
                              <span className="font-code-sm text-[10px] text-on-surface">
                                {evLatestTx?.record_type || "N/A"}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="text-on-surface-variant">Timestamp</span>
                              <span className="font-code-sm text-[10px] text-on-surface">
                                {fmtTimestamp(evidence.blockchain_timestamp)}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-on-surface-variant">Ledger record</span>
                            <span className="text-on-surface-variant font-semibold">
                              Not available
                            </span>
                          </div>
                        )}
                        {evLatestAudit ? (
                          <div className="flex items-start justify-between gap-2 text-[11px] pt-1 border-t border-surface-container-high/60">
                            <span className="text-on-surface-variant shrink-0">Latest audit</span>
                            <span className="text-right text-[10px] text-on-surface">
                              {evLatestAudit.action || "N/A"}
                              <span className="block text-on-surface-variant font-code-sm">
                                {evLatestAudit.actor_username ||
                                  (evLatestAudit.actor_user_id
                                    ? `user #${evLatestAudit.actor_user_id}`
                                    : "actor N/A")}
                                {" · "}
                                {fmtTimestamp(evLatestAudit.timestamp)}
                              </span>
                            </span>
                          </div>
                        ) : (
                          !evTxHash && (
                            <p className="font-body-sm text-[10px] text-on-surface-variant pt-1">
                              No ledger transaction or audit event recorded for this study.
                            </p>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {/* ── VERIFIED IMAGE CARD (only when the evidence says intact) ── */}
                  {evidence && isVerifiedEvidence && (
                    <div className="rounded-xl border border-secondary/40 bg-secondary-fixed/50 p-3 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="material-symbols-outlined text-base text-secondary"
                          aria-hidden="true"
                        >
                          verified
                        </span>
                        <span className="font-headline-sm text-xs font-bold text-on-surface">
                          ✓ IMAGE INTEGRITY VERIFIED
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-on-surface-variant">SHA-3</span>
                        <span className="font-label-md text-[11px] font-bold text-secondary">
                          {evHashMatch === true ? "✓ MATCH" : "N/A"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-on-surface-variant">Digital Integrity Twin</span>
                        <span className="font-label-md text-[11px] font-bold text-secondary">
                          {ditStatus ? `✓ ${ditStatus}` : "Not available"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-on-surface-variant">Blockchain / Audit</span>
                        <span
                          className={`font-label-md text-[11px] font-bold ${
                            evTxHash ? "text-secondary" : "text-on-surface-variant"
                          }`}
                        >
                          {evTxHash ? "✓ RECORDED" : "N/A"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="text-on-surface-variant">AI forensics</span>
                        <span className="text-on-surface">
                          {evidence.forensic_report_id
                            ? evidence.forensic_report_status || "Report on record"
                            : "Not triggered"}
                        </span>
                      </div>
                    </div>
                  )}

                  <RiskScoreCard
                    score={selectedRiskScore}
                    anomalyDetected={selectedScan.is_tampered}
                    tamperConfidence={selectedTamperConfidence}
                    riskLevel={
                      selectedRiskScore === null
                        ? riskAssessmentLoading
                          ? "ASSESSING…"
                          : "NO ASSESSMENT"
                        : undefined
                    }
                  />

                  {/* Risk rationale + contextual escalation (reuses the forensic studio route) */}
                  <div
                    className={`rounded-lg border px-3 py-2.5 space-y-2 ${
                      selectedScan.is_tampered
                        ? "bg-error-container/60 border-error/40"
                        : "bg-surface-container-low border-surface-container-high/60"
                    }`}
                  >
                    <p
                      className={`font-label-md text-[11px] leading-4 ${
                        selectedScan.is_tampered ? "text-on-error-container" : "text-secondary"
                      }`}
                    >
                      {riskAssessmentLoading
                        ? "Loading tamper risk assessment from the forensic service…"
                        : selectedRiskScore === null
                        ? "No risk assessment yet for this study — run a forensic analysis to generate one."
                        : selectedScan.is_tampered
                        ? `Critical: Tampering likelihood ${Math.round(selectedRiskScore)}/100 — escalate for forensic review.`
                        : `Stable: Tampering likelihood ${Math.round(selectedRiskScore)}/100 — integrity threshold passed.`}
                    </p>
                    <button
                      onClick={() => onNavigate("ai-tamper-forensics")}
                      className={`w-full py-2 px-3 rounded-lg font-label-md text-xs flex items-center justify-center gap-1.5 transition-colors shadow-sm ${
                        selectedScan.is_tampered
                          ? "bg-primary text-on-primary hover:bg-primary-container"
                          : "border border-surface-container-high text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">biotech</span>
                      <span>
                        {selectedScan.is_tampered ? "Escalate to Forensics" : "Open Forensic Report"}
                      </span>
                    </button>
                  </div>

                  {/* Digital Twin Status */}
                  <div className="bg-surface-container-low p-3 rounded-xl border border-surface-container-high/40 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-label-sm text-outline uppercase tracking-wider text-[10px]">
                        Digital Integrity Twin
                      </span>
                      <span className="font-code-sm text-secondary font-semibold">
                        {digitalTwin?.status || "Active Sync"}
                      </span>
                    </div>
                    <div className="flex justify-between text-on-surface-variant">
                      <span>Twin Anchor ID</span>
                      <code className="font-mono text-on-surface">
                        {digitalTwin?.id ? `TWIN-#${digitalTwin.id}` : `TWIN-IMG-${selectedScan.id}`}
                      </code>
                    </div>
                    <div className="flex justify-between text-on-surface-variant">
                      <span>Consensus Sync</span>
                      <span className="text-secondary font-semibold">
                        {digitalTwin?.verified_at ? "Dual-Ledger Confirmed" : "Synchronized"}
                      </span>
                    </div>
                  </div>

                  {/* Quick Action Tray */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-surface-container-low">
                    <button
                      onClick={() => onNavigate("image-review-and-verification")}
                      className="px-3 py-2 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-xs flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm" data-icon="fact_check" aria-hidden="true" />
                      <span>DICOM Review</span>
                    </button>
                    <button
                      onClick={() => onNavigate("self-recovery-studio")}
                      className="px-3 py-2 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed font-label-md text-xs flex items-center justify-center gap-1.5 hover:bg-tertiary-fixed-dim transition-colors"
                    >
                      <span className="material-symbols-outlined text-sm">healing</span>
                      <span>Self-Recovery</span>
                    </button>
                  </div>
                </div>
              ) : (
                <EmptyState
                  icon="touch_app"
                  title="Select a Study"
                  description="Choose a patient scan from the table to inspect telemetry and neural risk metrics."
                />
              )}

              <TrustScoreCard score={selectedTrustScore} />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 2. IMAGE REVIEW & VERIFICATION VIEW                                */}
      {/* ------------------------------------------------------------------ */}
      {(activeSubPath === "image-review-and-verification" || activeSubPath === "assigned-images") && (
        <div className="space-y-6">
          {/* Subheader Clinical Context Bar */}
          <div className="bg-surface-container-lowest rounded-xl shadow-sm p-4 border border-surface-container-high/60 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary shrink-0">
                <span className="material-symbols-outlined text-2xl">folder_managed</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-headline-sm text-base font-semibold text-on-surface">
                    {selectedScan?.title || "DICOM Image Verification"}
                  </h2>
                  <StatusPill
                    variant={selectedScan?.is_tampered ? "tampered" : "verified"}
                    label={selectedScan?.is_tampered ? "Flagged for Inspection" : "Assigned for Sign-off"}
                  />
                </div>
                <div className="text-xs text-on-surface-variant flex items-center gap-2 mt-0.5">
                  <span>Patient #{selectedScan?.patient_id || "Unassigned"}</span>
                  <span>•</span>
                  <span>Modality: {selectedScan?.image_type || "DICOM"}</span>
                  <span>•</span>
                  <span>Ingestion Hash Validated</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate("ai-tamper-forensics")}
                className="px-3 py-1.5 rounded-lg bg-surface-container text-primary font-label-md text-xs hover:bg-surface-container-high flex items-center gap-1.5 shadow-sm"
              >
                <span className="material-symbols-outlined text-sm">biotech</span>
                <span>Open Forensic Studio</span>
              </button>
              {selectedScan?.is_tampered && (
                <button
                  onClick={() => onNavigate("self-recovery-studio")}
                  className="px-3 py-1.5 rounded-lg bg-secondary text-on-secondary font-label-md text-xs hover:bg-on-secondary-container flex items-center gap-1.5 shadow-sm"
                >
                  <span className="material-symbols-outlined text-sm">auto_fix_high</span>
                  <span>Launch Self-Recovery</span>
                </button>
              )}
            </div>
          </div>

          {/* Main Inspection Viewport & Side Hashes */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            <div className="xl:col-span-8">
              <QuadViewport
                imageId={selectedImageId}
                patientName={selectedScan ? `Patient #${selectedScan.patient_id}` : undefined}
                studyModality={selectedScan?.image_type}
                anomalyDetected={selectedScan?.is_tampered}
              />
            </div>

            <div className="xl:col-span-4 space-y-4">
              <HashComparisonCard
                genesisHash={integrityEvidence?.trusted_hash || selectedScan?.hash}
                currentHash={integrityEvidence?.current_hash || selectedScan?.hash}
                isMatch={integrityEvidence?.hash_match !== undefined ? integrityEvidence.hash_match : !selectedScan?.is_tampered}
              />

              <RiskScoreCard
                score={selectedRiskScore}
                anomalyDetected={selectedScan?.is_tampered}
                tamperConfidence={selectedTamperConfidence}
                riskLevel={
                  selectedRiskScore === null
                    ? riskAssessmentLoading
                      ? "ASSESSING…"
                      : "NO ASSESSMENT"
                    : undefined
                }
              />

              {/* Clinical Verification Actions */}
              <div className="bg-surface-container-lowest rounded-xl p-space-md border border-surface-container-high/60 shadow-sm space-y-3">
                <span className="font-label-sm text-xs font-semibold text-outline uppercase tracking-wider block">
                  Radiologist Clinical Action
                </span>

                <button
                  onClick={() => alert(`Radiological sign-off recorded for Image #${selectedImageId} with certified SHA-3 provenance signature.`)}
                  className={`w-full py-2.5 px-4 rounded-lg font-headline-sm text-xs font-semibold transition-colors shadow-sm flex items-center justify-center gap-2 ${
                    selectedScan?.is_tampered
                      ? "border border-surface-container-high bg-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high"
                      : "bg-secondary text-on-secondary hover:bg-on-secondary-container"
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">verified</span>
                  <span>Sign &amp; Verify Image Authenticity</span>
                </button>

                <button
                  onClick={() => {
                    alert(`Flagged Image #${selectedImageId} as suspect! Initiating hospital quarantine and dispatching neural tamper report.`);
                  }}
                  className={`w-full py-2 px-4 rounded-lg font-label-md text-xs transition-colors flex items-center justify-center gap-2 ${
                    selectedScan?.is_tampered
                      ? "bg-error text-on-error font-semibold shadow-sm hover:opacity-90"
                      : "bg-surface-container text-error hover:bg-error-container/30"
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">flag</span>
                  <span>Flag Suspicious Pixel Alteration</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 3. AI TAMPER FORENSICS ANALYSIS STUDIO                            */}
      {/* ------------------------------------------------------------------ */}
      {(activeSubPath === "ai-tamper-forensics" || activeSubPath === "risk-analysis") && (
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl bg-surface-container-lowest border border-surface-container-high/60 shadow-sm">
            <div>
              <div className="flex items-center gap-2 text-xs font-label-sm text-on-surface-variant mb-1">
                <ClinicalBadge label="Swin-UNet & SRM Analyzer v4.2" variant="tertiary" />
                <span>•</span>
                <span className="text-error font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-error animate-ping" />
                  Neural Residual Forensics
                </span>
              </div>
              <h2 className="font-headline-lg text-xl font-bold text-on-surface">
                AI Tamper Forensics Studio: {selectedScan?.title || `Scan #${selectedImageId}`}
              </h2>
              <p className="font-body-sm text-xs text-on-surface-variant mt-0.5">
                Multi-stream spatial rich noise residual extraction and hybrid transformer pixel localization.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onNavigate("integrity-proof")}
                className="px-3 py-2 rounded-lg bg-surface-container text-primary font-label-md text-xs hover:bg-surface-container-high shadow-sm flex items-center gap-1.5 border border-primary/20"
              >
                <span className="material-symbols-outlined text-sm">verified_user</span>
                <span>Integrity Proof &amp; Recovery</span>
              </button>
              <button
                onClick={() => onNavigate("self-recovery-studio")}
                className="px-3 py-2 rounded-lg bg-tertiary text-on-tertiary font-label-md text-xs hover:bg-tertiary-container shadow-sm flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">healing</span>
                <span>Initiate Self-Recovery</span>
              </button>
            </div>
          </div>

          <QuadViewport
            imageId={selectedImageId}
            studyModality={selectedScan?.image_type}
            anomalyDetected={selectedScan?.is_tampered}
            tamperConfidence={integrityEvidence?.ai_confidence ?? (integrityEvidence?.ai_forensics?.confidence_score ?? undefined)}
            tamperPercentage={integrityEvidence?.tamper_percentage ?? (integrityEvidence?.ai_forensics?.tamper_percentage ?? undefined)}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <RiskScoreCard
              score={selectedRiskScore}
              anomalyDetected={selectedScan?.is_tampered}
              tamperConfidence={selectedTamperConfidence}
              riskLevel={
                selectedRiskScore === null
                  ? riskAssessmentLoading
                    ? "ASSESSING…"
                    : "NO ASSESSMENT"
                  : undefined
              }
            />
            <HashComparisonCard
              genesisHash={integrityEvidence?.trusted_hash || selectedScan?.hash}
              currentHash={integrityEvidence?.current_hash || selectedScan?.hash}
              isMatch={integrityEvidence?.hash_match !== undefined ? integrityEvidence.hash_match : !selectedScan?.is_tampered}
            />
            <TrustScoreCard score={selectedTrustScore} />
          </div>
        </div>
      )}

      {activeSubPath === "integrity-proof" && (
        <IntegrityProof token={token} />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 4. MEDICAL IMAGE SELF-RECOVERY STUDIO                              */}
      {/* ------------------------------------------------------------------ */}
      {activeSubPath === "self-recovery-studio" && (
        <div className="space-y-6">
          {/* Top Protocol Header */}
          <div className="bg-surface-container-low p-6 rounded-xl border border-surface-container-high/60 shadow-sm relative overflow-hidden">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-xs uppercase tracking-wider font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-secondary" />
                    Protocol Active • Region-Level ROI Replacement
                  </span>
                  <span className="font-code-sm text-xs text-on-surface-variant font-medium">
                    Image ID: {selectedImageId ?? "N/A"}
                  </span>
                </div>
                <h2 className="font-headline-lg text-xl font-bold text-on-surface">
                  Self-Recovery Studio • Trusted ROI Replacement Recovery
                </h2>
                <p className="font-body-sm text-xs text-on-surface-variant">
                  Backend method TRUSTED_IPFS_ROI_REPLACEMENT: tampered regions are overwritten from the trusted
                  original held by the Digital Integrity Twin, then the recovered scan is re-hashed and verified
                  against the trusted SHA-3 baseline.
                </p>
              </div>

              {selectedImageId !== null && (
                <button
                  onClick={() => handleExecuteRecovery(selectedImageId)}
                  disabled={recoveryLoading}
                  className="px-5 py-2.5 rounded-lg bg-primary text-on-primary font-headline-sm text-xs font-semibold hover:bg-primary-container shadow-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {recoveryLoading ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">
                        progress_activity
                      </span>
                      <span>Executing Region-Level Recovery...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">auto_fix_high</span>
                      <span>Execute Reversible Recovery</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* 5-Step Pipeline Tracker — stages are green only when backed by
              real backend evidence (integrity-evidence / recover response /
              RecoveryRecord); everything else renders muted as pending. */}
          <StepTracker steps={recoverySteps} stageBadge={recoveryStageBadge} />

          {recoveryError && (
            <div className="p-3 bg-error-container text-on-error-container rounded-xl font-body-sm text-xs flex items-center gap-2 border border-error/30">
              <span className="material-symbols-outlined text-base text-error">error</span>
              <span>
                <span className="font-bold">Recovery execution failed — </span>
                {recoveryError}
              </span>
            </div>
          )}

          {recoverySuccess && !recoveryError && (
            <div
              className={`p-3 rounded-xl font-body-sm text-xs flex items-center gap-2 border ${
                postVerified === true
                  ? "bg-secondary-container text-on-secondary-container border-secondary/30"
                  : "bg-error-container text-on-error-container border-error/30"
              }`}
            >
              <span
                className={`material-symbols-outlined text-base ${
                  postVerified === true ? "text-secondary" : "text-error"
                }`}
              >
                {postVerified === true ? "verified" : "gpp_maybe"}
              </span>
              <span className="font-bold">
                {postVerified === true ? "✓ RECOVERY VERIFIED" : "✕ RECOVERY VERIFICATION FAILED"}
              </span>
              <span>{recoverySuccess}</span>
            </div>
          )}

          {/* Pre vs Post Recovery Comparison View */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* LEFT · Pre-recovery: the ACTUAL current image, GET /api/images/preview/{id} */}
            <div className="bg-surface-container-lowest rounded-xl p-4 border border-surface-container-high/60 shadow-sm space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-surface-container-low">
                <span className="font-label-sm text-xs font-semibold text-error">
                  Pre-Recovery Ingested State{tamperEvidenceKnown ? " (Tampered)" : ""}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    tamperEvidenceKnown
                      ? "bg-error-container text-on-error-container"
                      : "bg-surface-container text-on-surface-variant"
                  }`}
                >
                  {tamperEvidenceKnown ? "Altered Matrix" : evidence ? "Hash Verified" : "State Unknown"}
                </span>
              </div>
              <div className="bg-[#0D1117] h-64 rounded-lg flex items-center justify-center overflow-hidden">
                {preRecoveryStatus === "loading" ? (
                  <span className="font-code-sm text-xs text-slate-500 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                    <span>Fetching decrypted preview…</span>
                  </span>
                ) : preRecoveryStatus === "error" ? (
                  <span className="font-code-sm text-xs text-slate-500">
                    Not available — preview could not be loaded for this study.
                  </span>
                ) : preRecoveryUrl ? (
                  <img
                    src={preRecoveryUrl}
                    alt="Pre-Recovery Authenticated Preview"
                    onError={() => {
                      assignPreUrl(null);
                      setPreRecoveryStatus("error");
                    }}
                    className="max-h-full max-w-full object-contain"
                  />
                ) : (
                  <span className="font-code-sm text-xs text-slate-500">
                    {selectedImageId ? "Loading secure scan baseline..." : "No scan active"}
                  </span>
                )}
              </div>
              <span className="font-code-sm text-[10px] text-on-surface-variant block">
                {selectedImageId ? `GET /api/images/preview/${selectedImageId}` : "No study selected"}
              </span>
            </div>

            {/* RIGHT · Post-recovery: real recovered bytes only after a real
                recovery run; otherwise an honest empty state. */}
            <div className="bg-surface-container-lowest rounded-xl p-4 border border-surface-container-high/60 shadow-sm space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-surface-container-low">
                <span className="font-label-sm text-xs font-semibold text-secondary">
                  Post-Recovery Synthesized State (Baseline)
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    postVerified === true
                      ? "bg-secondary-fixed text-on-secondary-fixed"
                      : postVerified === false || recoveryError
                      ? "bg-error-container text-on-error-container"
                      : "bg-surface-container text-on-surface-variant"
                  }`}
                >
                  {recoveryLoading
                    ? "Recovering…"
                    : recoveryError
                    ? "Recovery Failed"
                    : postVerified === true
                    ? "✓ Verified"
                    : postVerified === false
                    ? "✕ Verification Failed"
                    : activeRecovery
                    ? "Recovery Executed"
                    : "Standby"}
                </span>
              </div>
              <div className="bg-[#0D1117] h-64 rounded-lg flex items-center justify-center overflow-hidden">
                {recoveryLoading ? (
                  <div className="text-center p-4 flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined text-3xl text-primary animate-spin">
                      progress_activity
                    </span>
                    <span className="font-code-sm text-xs text-slate-400">
                      Executing region-level recovery on the backend…
                    </span>
                  </div>
                ) : recoveryError ? (
                  <div className="text-center p-4">
                    <span className="material-symbols-outlined text-3xl text-red-400 mb-1 block">error</span>
                    <span className="font-code-sm text-xs text-slate-400">
                      Recovery failed — no post-recovery image available.
                    </span>
                  </div>
                ) : !selectedImageId ? (
                  <div className="text-center p-4">
                    <span className="material-symbols-outlined text-3xl text-outline mb-1 block">touch_app</span>
                    <span className="font-code-sm text-xs text-slate-400">Select a study to run recovery.</span>
                  </div>
                ) : !activeRecovery ? (
                  <div className="text-center p-4">
                    <span className="material-symbols-outlined text-3xl text-outline mb-1 block">
                      healing
                    </span>
                    <span className="font-code-sm text-xs text-slate-400 block">
                      Recovery not executed
                    </span>
                    <span className="font-code-sm text-[11px] text-slate-500">
                      Run recovery to synthesize the trusted region.
                    </span>
                  </div>
                ) : postRecoveryStatus === "loading" ? (
                  <span className="font-code-sm text-xs text-slate-500">Fetching recovered preview…</span>
                ) : postRecoveryStatus === "error" || !postRecoveryUrl ? (
                  <span className="font-code-sm text-xs text-slate-500">
                    Not available — recovered image could not be loaded.
                  </span>
                ) : (
                  <img
                    src={postRecoveryUrl}
                    alt="Post-Recovery Authenticated Result"
                    onError={() => {
                      assignPostUrl(null);
                      setPostRecoveryStatus("error");
                    }}
                    className="max-h-full max-w-full object-contain filter contrast-105"
                  />
                )}
              </div>

              {/* Post-recovery verification — real fields from the recover
                  response + GET /api/images/{id}/integrity-evidence. */}
              {activeRecovery ? (
                <div className="rounded-lg border border-surface-container-high/60 bg-surface-container-low p-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline font-semibold">
                      Post-Recovery Verification
                    </span>
                    <span
                      className={`font-label-md text-[11px] font-bold ${
                        postVerified === true
                          ? "text-secondary"
                          : postVerified === false
                          ? "text-error"
                          : "text-on-surface-variant"
                      }`}
                    >
                      {postVerified === true
                        ? "✓ RECOVERY VERIFIED"
                        : postVerified === false
                        ? "✕ RECOVERY VERIFICATION FAILED"
                        : "Verification pending"}
                    </span>
                  </div>
                  <div className="space-y-1 font-body-sm text-[11px]">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-on-surface-variant shrink-0">Trusted SHA-3</span>
                      <code
                        className="font-mono text-[10px] text-on-surface truncate"
                        title={activeRecovery.trusted_hash || evidence?.trusted_hash || ""}
                      >
                        {shortHash(activeRecovery.trusted_hash ?? evidence?.trusted_hash) || "Not available"}
                      </code>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-on-surface-variant shrink-0">Recovered SHA-3</span>
                      <code
                        className="font-mono text-[10px] text-on-surface truncate"
                        title={activeRecovery.recovered_hash || evidence?.post_recovery_hash || ""}
                      >
                        {shortHash(activeRecovery.recovered_hash ?? evidence?.post_recovery_hash) || "Not available"}
                      </code>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-on-surface-variant">Hash Match</span>
                      <span
                        className={`font-label-md text-[11px] font-bold ${
                          postVerified === true ? "text-secondary" : postVerified === false ? "text-error" : "text-on-surface-variant"
                        }`}
                      >
                        {postVerified === true ? "✓ MATCH" : postVerified === false ? "✕ MISMATCH" : "N/A"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-on-surface-variant">Digital Integrity Twin</span>
                      <span className="font-code-sm text-[10px] font-semibold text-on-surface">
                        {activeRecovery.twin_status ?? evidence?.dit_status ?? "Not available"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-on-surface-variant">Recovery record</span>
                      <span className="font-code-sm text-[10px] text-on-surface">
                        {latestRecoveryRecord?.recovery_id
                          ? `REC-#${latestRecoveryRecord.recovery_id}`
                          : evidence?.recovery_record_id
                          ? `REC-#${evidence.recovery_record_id}`
                          : "Not available"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-on-surface-variant">Record status</span>
                      <span className="font-code-sm text-[10px] text-on-surface">
                        {latestRecoveryRecord?.status ?? evidence?.recovery_status ?? "Not available"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-on-surface-variant">Executed at</span>
                      <span className="font-code-sm text-[10px] text-on-surface">
                        {fmtTimestamp(latestRecoveryRecord?.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-on-surface-variant">Tampered ROIs replaced</span>
                      <span className="font-code-sm text-[10px] text-on-surface">
                        {activeRecovery.tampered_roi_count !== undefined &&
                        activeRecovery.tampered_roi_count !== null
                          ? `${activeRecovery.tampered_roi_count} region(s)`
                          : recoveredRois.length > 0
                          ? `${recoveredRois.length} region(s)`
                          : "Not available"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-on-surface-variant">Recovery method</span>
                      <span className="font-code-sm text-[10px] text-on-surface truncate">
                        {latestRecoveryRecord?.recovery_method ??
                          evidence?.recovery?.recovery_method ??
                          "Not available"}
                      </span>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-on-surface-variant shrink-0">Ledger tx</span>
                      <code
                        className="font-mono text-[10px] text-on-surface truncate"
                        title={
                          activeRecovery.blockchain_tx_hash ||
                          latestRecoveryRecord?.blockchain_transaction ||
                          ""
                        }
                      >
                        {shortTx(
                          activeRecovery.blockchain_tx_hash ??
                            latestRecoveryRecord?.blockchain_transaction ??
                            null
                        ) || "Not available"}
                      </code>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-on-surface-variant">Evidence refreshed</span>
                      <span className="font-code-sm text-[10px] text-on-surface">
                        {evidence ? fmtTimestamp(evidence.verification_timestamp) : "Not available"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <span className="font-code-sm text-[10px] text-on-surface-variant block">
                  No recovery record for this study yet.
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 5. BLOCKCHAIN AUDIT & REPORTS                                     */}
      {/* ------------------------------------------------------------------ */}
      {activeSubPath === "blockchain-audit-and-reports" && (
        <div className="space-y-6">
          <AuditLedger
            blocks={blocks}
            isVerified={true}
            onRefresh={loadData}
          />
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 6. PATIENT CONSENT DIRECTORY                                       */}
      {/* ------------------------------------------------------------------ */}
      {activeSubPath === "patient-consent-directory" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-2 border-b border-surface-container-low">
            <div>
              <h2 className="font-headline-lg text-xl font-bold text-on-surface">
                Patient Consent Directory
              </h2>
              <p className="font-body-sm text-xs text-on-surface-variant">
                Active clinical access grants, research permissions, and time-bounded authorizations
              </p>
            </div>
            <span className="px-2.5 py-1 rounded-full font-label-sm text-xs bg-secondary-fixed text-on-secondary-fixed font-semibold">
              {consents.length} Grants Active
            </span>
          </div>

          {consents.length === 0 ? (
            <EmptyState
              icon="shield_person"
              title="No Consent Grants"
              description="No active patient consent authorizations on record."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {consents.map((consent) => (
                <ConsentCard
                  key={consent.id}
                  consent={consent}
                  canRevoke={false} // Doctor does not revoke patient consent unilaterally
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default DoctorWorkspace;
