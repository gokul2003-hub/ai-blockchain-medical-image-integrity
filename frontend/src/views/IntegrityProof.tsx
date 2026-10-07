import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ShieldCheck, ShieldAlert, RefreshCw, Play, Hash, Layers, Crosshair,
  Sparkles, HeartPulse, Link2, AlertTriangle, CheckCircle2, XCircle,
  Database, FileText, Download, Workflow, ScrollText, Boxes, Info,
} from "lucide-react";
import { apiClient, fetchProtectedBlobUrl } from "../services/api";
import StatusBadge from "../components/StatusBadge";

interface IntegrityProofProps {
  token: string;
}

interface Sample {
  image_id: string;
  tamper_type: string;
  modality?: string;
  region: { x: number; y: number; width: number; height: number };
  affected_area_percentage: number;
  original_sha3: string;
  tampered_sha3: string;
  width: number;
  height: number;
  split: string;
}

interface AnalysisResult {
  image_id: string;
  sample: Sample;
  sha3: {
    trusted_original: string; current: string; match: boolean;
    status: string; explanation: string;
  };
  dit_state: string;
  difference?: {
    available: boolean; changed_pixels: number; total_pixels: number;
    changed_pixel_percentage: number; difference_map_base64: string;
    difference_overlay_base64: string; note: string;
  };
  ai: {
    tamper_detected: boolean; tampered_percentage: number;
    confidence_score: number; confidence_label: string;
    model_provenance?: Record<string, any>;
    regions: any[]; bounding_boxes: any[]; explanation: string;
  };
  ground_truth: {
    region: { x: number; y: number; width: number; height: number };
    affected_area_percentage: number; tamper_type: string; mask_base64: string;
  };
  prediction: { mask_base64: string; overlay_base64: string; metrics: Record<string, any> };
  grad_cam: { available: boolean; heatmap_base64: string | null; explanation: string };
  risk: Record<string, any>;
  trust: Record<string, any>;
  recovery: {
    available: boolean; method: string; rois: any[];
    recovered_image_base64: string; original_sha3: string;
    tampered_sha3: string; recovered_sha3: string;
    post_recovery_match: boolean; verification_passed: boolean;
  };
  images: { original: string; tampered: string };
}

interface BlockchainBlock {
  id: number;
  block_index: number;
  type: string;
  timestamp?: string;
  transaction_hash?: string;
}

// ---- Real clinical study (backend contract: MedicalImageResponse) ----
interface ClinicalImage {
  id: number;
  title: string;
  image_type: string;
  created_at: string;
  original_hash?: string;
  quarantine_status?: boolean;
}

// ---- Real evidence bundle (backend contract: IntegrityEvidenceResponse) ----
interface IntegrityEvidence {
  image_id: number;
  image_name: string;
  image_type: string;
  created_at?: string | null;
  original_dimensions?: number[] | null;
  file_size_bytes?: number | null;
  hash_algorithm?: string;
  trusted_hash: string;
  current_hash?: string | null;
  hash_match?: boolean | null;
  verification_status: string;
  verification_timestamp?: string | null;
  dit_status?: string | null;
  digital_integrity_twin?: Record<string, any> | null;
  storage?: Record<string, any>;
  storage_provider?: string;
  storage_reference?: string;
  is_local_storage?: boolean;
  blockchain?: Record<string, any>;
  blockchain_tx_hash?: string | null;
  blockchain_network?: string;
  blockchain_block?: number | null;
  ai_forensics?: Record<string, any> | null;
  affected_regions?: Record<string, any>[];
  tamper_percentage?: number | null;
  ai_model?: string | null;
  ai_confidence?: number | null;
  risk_score?: number | null;
  trust_score?: number | null;
  risk_and_trust?: Record<string, any> | null;
  recovery_status?: string | null;
  recovery?: Record<string, any> | null;
  post_recovery_hash?: string | null;
  post_recovery_verified?: boolean | null;
  forensic_report_status?: string | null;
  audit_events?: Record<string, any>[];
}

type Selection = { kind: "real"; id: number } | { kind: "demo"; id: string } | null;

type StageStatus = "idle" | "running" | "done" | "failed" | "na";

interface ProofStage {
  key: string;
  label: string;
  endpoint: string;
  status: StageStatus;
  detail: string;
}

// The real proof chain. Every stage maps to a live backend endpoint; a stage is
// only marked "done" after that endpoint actually returned.
const REAL_PROOF_STAGES: { key: string; label: string; endpoint: string }[] = [
  { key: "preview", label: "Clinical image preview", endpoint: "GET /api/images/preview/{image_id}" },
  { key: "evidence", label: "SHA-3 integrity evidence", endpoint: "GET /api/images/{image_id}/integrity-evidence" },
  { key: "twin", label: "Digital Integrity Twin", endpoint: "GET /api/images/digital-twin/{image_id}" },
  { key: "risk", label: "Risk & trust scoring", endpoint: "GET /api/images/{image_id}/risk-trust" },
  { key: "forensics", label: "AI forensic report", endpoint: "GET /api/images/{image_id}/integrity-evidence (ai_forensics)" },
  { key: "blockchain", label: "Blockchain provenance", endpoint: "GET /api/images/{image_id}/integrity-evidence (blockchain)" },
  { key: "recovery", label: "Recovery evidence", endpoint: "GET /api/images/{image_id}/integrity-evidence (recovery)" },
  { key: "ledger", label: "Local ledger refresh", endpoint: "GET /api/blockchain/blocks" },
];

const idleStages = (): ProofStage[] =>
  REAL_PROOF_STAGES.map(s => ({ ...s, status: "idle" as StageStatus, detail: "Not started" }));

// ---- formatting helpers (never invent a value: absent stays N/A) ----
const errDetail = (e: any, fallback: string): string => {
  const detail = e?.response?.data?.detail;
  if (typeof detail === "string" && detail) return detail;
  if (detail && typeof detail === "object" && typeof detail.message === "string") return detail.message;
  if (typeof e?.message === "string" && e.message) return e.message;
  return fallback;
};

const formatWhen = (v?: string | null): string => {
  if (!v) return "Not recorded";
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString();
};

const formatBytes = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
};

const fmtScore = (v: unknown): string => (typeof v === "number" ? v.toFixed(1) : "N/A");

const deriveIntegrityStatus = (ev: IntegrityEvidence): string => {
  const vs = (ev.verification_status || "").toUpperCase();
  if (vs === "VERIFIED" || vs === "TAMPERED" || vs === "QUARANTINED" || vs === "RECOVERED") return vs;
  if (ev.hash_match === true) return "VERIFIED";
  if (ev.hash_match === false) return "TAMPERED";
  return "REVIEW";
};

const statusTone = (status: string): string => {
  if (status === "VERIFIED" || status === "RECOVERED") return "emerald";
  if (status === "TAMPERED" || status === "QUARANTINED") return "red";
  if (status === "REVIEW" || status === "PENDING") return "amber";
  return "slate";
};

const stageStatusLabel = (s: StageStatus): string =>
  s === "idle" ? "Not run"
    : s === "running" ? "Running"
      : s === "done" ? "Completed"
        : s === "failed" ? "Failed" : "Not applicable";

const stageChipClass = (s: StageStatus): string =>
  s === "done" ? "bg-emerald-500/15 text-emerald-400"
    : s === "running" ? "bg-cyan-500/15 text-cyan-300"
      : s === "failed" ? "bg-rose-500/15 text-rose-400"
        : s === "na" ? "bg-slate-800 text-slate-400"
          : "bg-slate-900 text-slate-600";

type TabKey =
  | "original" | "tampered" | "recovered" | "groundtruth"
  | "aimask" | "overlay" | "gradcam" | "difference";

const LIFECYCLE_STEPS = [
  "TRUSTED", "INTEGRITY VERIFIED", "TAMPER DETECTED", "AI FORENSIC ANALYSIS",
  "REGION LOCALIZED", "QUARANTINED", "SELF-RECOVERY", "POST-RECOVERY VERIFIED", "BLOCKCHAIN AUDITED",
];

const SECURITY_FLOW = [
  "ORIGINAL IMAGE", "SHA-3 + DIT CREATED", "TRUSTED STORAGE", "IMAGE ACCESSED",
  "INTEGRITY CHECK", "AI FORENSICS", "REGION LOCALIZATION", "RISK / TRUST",
  "QUARANTINE", "SELF-RECOVERY", "POST-RECOVERY SHA-3", "VERIFIED", "BLOCKCHAIN AUDIT",
];

const Section = ({ title, icon: Icon, accent, children, right }: any) => (
  <div className="glass-panel p-5 space-y-4">
    <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
      <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${accent}`} /> {title}
      </h3>
      {right}
    </div>
    {children}
  </div>
);

const Stat = ({ label, value, tone = "slate" }: { label: string; value: React.ReactNode; tone?: string }) => (
  <div className="bg-slate-900/60 rounded-xl p-3">
    <div className="text-[9px] text-slate-600 font-bold uppercase mb-1">{label}</div>
    <div className={`text-xs font-semibold text-${tone}-300 break-all`}>{value}</div>
  </div>
);

export default function IntegrityProof({ token }: IntegrityProofProps) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [clinicalImages, setClinicalImages] = useState<ClinicalImage[]>([]);
  const [selection, setSelection] = useState<Selection>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [audit, setAudit] = useState<any>(null);
  const [blocks, setBlocks] = useState<BlockchainBlock[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("original");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0.65);
  const [fullscreen, setFullscreen] = useState(false);
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  // Real clinical study state (loaded from real endpoints only)
  const [realEvidence, setRealEvidence] = useState<IntegrityEvidence | null>(null);
  const [realTwin, setRealTwin] = useState<Record<string, any> | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [heatmapUrl, setHeatmapUrl] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [stages, setStages] = useState<ProofStage[]>(idleStages);
  const loadSeq = useRef(0);
  const previewRef = useRef<string | null>(null);
  const heatmapRef = useRef<string | null>(null);

  const assignPreview = (url: string | null) => {
    if (previewRef.current && previewRef.current !== url) URL.revokeObjectURL(previewRef.current);
    previewRef.current = url;
    setPreviewUrl(url);
  };
  const assignHeatmap = (url: string | null) => {
    if (heatmapRef.current && heatmapRef.current !== url) URL.revokeObjectURL(heatmapRef.current);
    heatmapRef.current = url;
    setHeatmapUrl(url);
  };

  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    if (heatmapRef.current) URL.revokeObjectURL(heatmapRef.current);
  }, []);

  // ---- Catalogue: PRIMARY real uploads + SECONDARY demonstration samples ----
  const loadCatalogue = useCallback(async () => {
    setListLoading(true);
    try {
      try {
        const res = await apiClient.get("/api/images/list");
        const arr: ClinicalImage[] = Array.isArray(res.data) ? res.data : [];
        const sorted = [...arr].sort((a, b) => {
          const ta = new Date(a.created_at).getTime() || 0;
          const tb = new Date(b.created_at).getTime() || 0;
          return tb - ta; // newest first — created_at desc, never by id
        });
        setClinicalImages(sorted);
        setError(null);
      } catch (e: any) {
        setError(errDetail(e, "Recent doctor uploads could not be loaded."));
      }

      // Demonstration dataset (secondary group — kept for the dissertation demo)
      try {
        const res = await apiClient.get("/api/forensic-demo/samples");
        setSamples(res.data.samples || []);
      } catch { setSamples([]); }

      // Local ledger (honestly labelled local simulation)
      try {
        const bres = await apiClient.get("/api/blockchain/blocks");
        setBlocks(Array.isArray(bres.data) ? bres.data : []);
      } catch { setBlocks([]); }
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { loadCatalogue(); }, [loadCatalogue]);

  // ---- Default selection = the NEWEST real upload (first of sorted list) ----
  useEffect(() => {
    setSelection(prev => {
      if (prev && prev.kind === "real") {
        return clinicalImages.some(i => i.id === prev.id)
          ? prev
          : (clinicalImages.length ? { kind: "real", id: clinicalImages[0].id } : null);
      }
      if (prev && prev.kind === "demo") {
        return samples.some(s => s.image_id === prev.id)
          ? prev
          : (samples.length ? { kind: "demo", id: samples[0].image_id } : null);
      }
      return clinicalImages.length ? { kind: "real", id: clinicalImages[0].id } : null;
    });
  }, [clinicalImages, samples]);

  // ---- Load real preview + metadata + integrity state when a study is selected ----
  const loadRealSelection = async (id: number) => {
    const seq = ++loadSeq.current;
    setPreviewState("loading");
    assignPreview(null);
    assignHeatmap(null);
    setRealEvidence(null);
    setRealTwin(null);

    try {
      const url = await fetchProtectedBlobUrl(`/api/images/preview/${id}`);
      if (seq !== loadSeq.current) { URL.revokeObjectURL(url); return; }
      assignPreview(url);
      setPreviewState("ready");
    } catch {
      if (seq === loadSeq.current) setPreviewState("failed");
    }

    let ev: IntegrityEvidence | null = null;
    try {
      const res = await apiClient.get(`/api/images/${id}/integrity-evidence`);
      ev = res.data;
      if (seq === loadSeq.current) { setRealEvidence(ev); setError(null); }
    } catch (e: any) {
      if (seq === loadSeq.current) setError(errDetail(e, "Integrity evidence could not be loaded for this study."));
    }

    try {
      const res = await apiClient.get(`/api/images/digital-twin/${id}`);
      if (seq === loadSeq.current) setRealTwin(res.data);
    } catch {
      // 404 = no twin on record — rendered honestly as N/A
      if (seq === loadSeq.current) setRealTwin(null);
    }

    if (ev && ev.ai_forensics && ev.ai_forensics.heatmap_available) {
      try {
        const h = await fetchProtectedBlobUrl(`/api/images/heatmap/by-image/${id}`);
        if (seq === loadSeq.current) assignHeatmap(h); else URL.revokeObjectURL(h);
      } catch { /* heatmap is optional visual evidence */ }
    }
  };

  useEffect(() => {
    setStages(idleStages());
    setAnalyzing(false);
    if (selection && selection.kind === "real") {
      loadRealSelection(selection.id);
    } else {
      ++loadSeq.current;
      assignPreview(null);
      assignHeatmap(null);
      setRealEvidence(null);
      setRealTwin(null);
      setPreviewState("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

  // ---- Demo proof (synthetic dataset samples only) ----
  const runProof = async (imageId: string) => {
    ++loadSeq.current; // cancel any in-flight real-study load
    assignPreview(null);
    assignHeatmap(null);
    setRealEvidence(null);
    setRealTwin(null);
    setPreviewState("idle");
    setStages(idleStages());
    setAnalyzing(true); setError(null); setResult(null); setAudit(null); setTab("original");
    setZoom(1); setPan({ x: 0, y: 0 });
    try {
      const res = await apiClient.post(`/api/forensic-demo/analyze/${imageId}?record_audit=true`);
      setResult(res.data.result);
      setAudit(res.data.blockchain_audit || null);
      // Refresh ledger to include new transaction
      try {
        const bres = await apiClient.get("/api/blockchain/blocks");
        setBlocks(Array.isArray(bres.data) ? bres.data : []);
      } catch { /* keep previous */ }
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Forensic proof analysis could not be completed.");
    } finally {
      setAnalyzing(false);
    }
  };

  // ---- REAL proof: runs the chain above against the SELECTED real image id ----
  const runRealProof = async (id: number) => {
    const seq = ++loadSeq.current;
    setAnalyzing(true);
    setError(null);
    setResult(null);
    setAudit(null);
    setRealTwin(null);
    assignHeatmap(null);
    setTab("original");
    setZoom(1); setPan({ x: 0, y: 0 });

    const st: ProofStage[] = idleStages();
    const push = (key: string, status: StageStatus, detail: string) => {
      if (seq !== loadSeq.current) return;
      const idx = st.findIndex(x => x.key === key);
      if (idx >= 0) st[idx] = { ...st[idx], status, detail };
      setStages(st.map(x => ({ ...x })));
    };
    setStages(st.map(x => ({ ...x })));

    let ev: IntegrityEvidence | null = null;

    // Stage 1 — authenticated preview bytes
    push("preview", "running", "Requesting decrypted preview bytes…");
    try {
      const url = await fetchProtectedBlobUrl(`/api/images/preview/${id}`);
      if (seq === loadSeq.current) { assignPreview(url); setPreviewState("ready"); }
      else URL.revokeObjectURL(url);
      push("preview", "done", `Decrypted preview received for image ${id}.`);
    } catch (e: any) {
      if (seq === loadSeq.current) setPreviewState("failed");
      push("preview", "failed", errDetail(e, "Preview request failed."));
    }

    // Stage 2 — SHA-3 recomputation + full evidence chain
    push("evidence", "running", "Backend decrypts the file, recomputes SHA-3 and assembles the evidence chain…");
    try {
      const res = await apiClient.get(`/api/images/${id}/integrity-evidence`);
      ev = res.data;
      if (seq === loadSeq.current) { setRealEvidence(ev); setError(null); }
      push("evidence", "done",
        `${ev.hash_algorithm || "SHA3-256"} recomputed · status ${ev.verification_status} · ${
          ev.hash_match === true ? "trusted hash MATCH"
            : ev.hash_match === false ? "trusted hash MISMATCH"
              : "hash comparison unavailable"}`);
    } catch (e: any) {
      push("evidence", "failed", errDetail(e, "Integrity evidence could not be retrieved."));
    }

    // Stage 3 — Digital Integrity Twin (404 = honest "no twin on record")
    push("twin", "running", "Reading the Digital Integrity Twin…");
    try {
      const res = await apiClient.get(`/api/images/digital-twin/${id}`);
      if (seq === loadSeq.current) setRealTwin(res.data);
      push("twin", "done",
        `Twin record #${res.data?.id ?? "?"} · status ${res.data?.verification_status || "UNKNOWN"} · updated ${formatWhen(res.data?.updated_at)}`);
    } catch (e: any) {
      if (seq === loadSeq.current) setRealTwin(null);
      if (e?.response?.status === 404) push("twin", "na", "No Digital Integrity Twin on record for this image.");
      else push("twin", "failed", errDetail(e, "Digital Integrity Twin could not be read."));
    }

    // Stage 4 — real risk & trust scores
    push("risk", "running", "Reading tamper-risk and trust scores…");
    try {
      const res = await apiClient.get(`/api/images/${id}/risk-trust`);
      const d = res.data || {};
      const endpointHasScores = typeof d.risk_score === "number" || typeof d.trust_score === "number";
      if (endpointHasScores) {
        push("risk", "done", `Risk ${fmtScore(d.risk_score)} · Trust ${fmtScore(d.trust_score)} (source: risk-trust endpoint)`);
      } else if (ev && (typeof ev.risk_score === "number" || typeof ev.trust_score === "number")) {
        push("risk", "done", `Risk ${fmtScore(ev.risk_score)} · Trust ${fmtScore(ev.trust_score)} (source: integrity evidence)`);
      } else {
        push("risk", "na", "No risk/trust assessment on record for this image.");
      }
    } catch (e: any) {
      if (ev && (typeof ev.risk_score === "number" || typeof ev.trust_score === "number")) {
        push("risk", "done", `Risk ${fmtScore(ev.risk_score)} · Trust ${fmtScore(ev.trust_score)} (source: integrity evidence)`);
      } else if (e?.response?.status === 404) {
        push("risk", "na", "No risk/trust record returned for this image.");
      } else {
        push("risk", "failed", errDetail(e, "Risk/trust scores could not be read."));
      }
    }

    // Stage 5 — AI forensic report (returned inside the evidence bundle)
    if (!ev) {
      push("forensics", "failed", "Skipped — the integrity-evidence stage did not complete.");
    } else {
      const ai = ev.ai_forensics;
      if (ai && ai.analyzed === true) {
        const boxes = Array.isArray(ai.bounding_boxes) ? ai.bounding_boxes.length : 0;
        push("forensics", "done",
          `${ai.status || "ANALYZED"} · ${ai.model_name || ev.ai_model || "model not reported"} · ${boxes} region(s)`);
        if (ai.heatmap_available) {
          try {
            const h = await fetchProtectedBlobUrl(`/api/images/heatmap/by-image/${id}`);
            if (seq === loadSeq.current) assignHeatmap(h); else URL.revokeObjectURL(h);
          } catch { /* optional visual evidence */ }
        }
      } else if (ai && ai.analyzed === false) {
        push("forensics", "na", `AI forensics not run for this image (status: ${ai.status || "NO RECORD"}).`);
      } else {
        push("forensics", "na", "No AI forensic report on record.");
      }
    }

    // Stage 6 — blockchain provenance for this image
    if (!ev) {
      push("blockchain", "failed", "Skipped — the integrity-evidence stage did not complete.");
    } else {
      const count = Number(ev.blockchain?.record_count ?? 0);
      if (count > 0) {
        push("blockchain", "done",
          `${count} transaction(s) · ${ev.blockchain_network || ev.blockchain?.network || "ledger"} · latest ${
            ev.blockchain_tx_hash ? `${String(ev.blockchain_tx_hash).slice(0, 16)}…` : "hash not reported"}`);
      } else {
        push("blockchain", "na", "No blockchain transaction recorded for this image.");
      }
    }

    // Stage 7 — recovery evidence
    if (!ev) {
      push("recovery", "failed", "Skipped — the integrity-evidence stage did not complete.");
    } else if (ev.recovery) {
      push("recovery", "done",
        `${ev.recovery_status || "RECORD FOUND"} · post-recovery verification ${ev.post_recovery_verified === true ? "passed" : "failed"}`);
    } else if (ev.recovery_status) {
      push("recovery", "na", `Recovery status: ${ev.recovery_status} — no recovery record.`);
    } else {
      push("recovery", "na", "No recovery record for this image.");
    }

    // Stage 8 — refresh the local ledger
    push("ledger", "running", "Refreshing the local ledger…");
    try {
      const bres = await apiClient.get("/api/blockchain/blocks");
      const arr = Array.isArray(bres.data) ? bres.data : [];
      if (seq === loadSeq.current) setBlocks(arr);
      push("ledger", "done", `${arr.length} block(s) currently in the local ledger.`);
    } catch (e: any) {
      push("ledger", "failed", errDetail(e, "Ledger could not be refreshed."));
    }

    if (seq === loadSeq.current) setAnalyzing(false);
  };

  const runSelectedProof = () => {
    if (!selection) return;
    if (selection.kind === "real") runRealProof(selection.id);
    else runProof(selection.id);
  };

  const handleSelectionValue = (raw: string) => {
    if (!raw) { setSelection(null); return; }
    const sep = raw.indexOf(":");
    const kind = raw.slice(0, sep);
    const idPart = raw.slice(sep + 1);
    if (kind === "real") {
      const n = Number(idPart);
      if (Number.isFinite(n)) setSelection({ kind: "real", id: n });
    } else if (kind === "demo") {
      setSelection({ kind: "demo", id: idPart });
    }
  };

  const downloadEvidence = async () => {
    if (!selection) return;
    setEvidenceLoading(true);
    try {
      let payload: any;
      let fileName: string;
      if (selection.kind === "real") {
        // Fresh read of the live evidence bundle for the selected real image
        const res = await apiClient.get(`/api/images/${selection.id}/integrity-evidence`);
        payload = { ...res.data, client_proof_stages: stages };
        fileName = `integrity_evidence_image_${selection.id}.json`;
      } else {
        const res = await apiClient.get(`/api/forensic-demo/evidence/${selection.id}`);
        payload = res.data;
        fileName = `forensic_evidence_${selection.id}.json`;
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Evidence report could not be generated.");
    } finally {
      setEvidenceLoading(false);
    }
  };

  // ---- Derived proof facts (never hard-coded) ----
  const ev = realEvidence;
  const integrityStatus = ev ? deriveIntegrityStatus(ev) : "REVIEW";
  const hashComparison = !ev ? "N/A"
    : ev.hash_match === true ? "MATCH"
      : ev.hash_match === false ? "MISMATCH"
        : "UNAVAILABLE — file could not be re-hashed";
  const hashChipClass = !ev ? "bg-slate-800 text-slate-400 border border-slate-700"
    : ev.hash_match === true ? "bg-emerald-500/15 text-emerald-400 border border-emerald-600/30"
      : ev.hash_match === false ? "bg-red-500/15 text-red-400 border border-red-600/40 animate-pulse"
        : "bg-slate-800 text-slate-400 border border-slate-700";
  const hashChipText = !ev ? "— NO EVIDENCE"
    : ev.hash_match === true ? "✓ HASH MATCH"
      : ev.hash_match === false ? "✕ HASH MISMATCH — INTEGRITY CHANGE CONFIRMED"
        : "— COMPARISON UNAVAILABLE";
  const ditStatus = (ev && ev.dit_status) || (realTwin && realTwin.verification_status) ||
    (ev && ev.digital_integrity_twin && ev.digital_integrity_twin.verification_status) || null;
  const ditAvailable = !!ditStatus || !!realTwin || !!(ev && ev.digital_integrity_twin);
  const aiForensics = ev && ev.ai_forensics ? ev.ai_forensics : null;
  const aiBoxes: any[] = aiForensics && Array.isArray(aiForensics.bounding_boxes) ? aiForensics.bounding_boxes : [];
  const regionCount = Math.max(aiBoxes.length, ev && Array.isArray(ev.affected_regions) ? ev.affected_regions.length : 0);
  const hasRunReal = stages.some(s => s.status !== "idle");
  const selectedRealRecord: ClinicalImage | null =
    selection && selection.kind === "real"
      ? (clinicalImages.find(i => i.id === selection.id) || null)
      : null;
  const selectionValue = selection
    ? (selection.kind === "real" ? `real:${selection.id}` : `demo:${selection.id}`)
    : "";
  const isQuarantined = !!(ev && ev.verification_status === "QUARANTINED") ||
    !!(selectedRealRecord && selectedRealRecord.quarantine_status);

  const integrityNarrative = integrityStatus === "VERIFIED"
    ? "SHA-3 recomputed at runtime matches the trusted reference."
    : integrityStatus === "TAMPERED"
      ? "SHA-3 recomputed at runtime does not match the trusted reference."
      : integrityStatus === "QUARANTINED"
        ? "Image is quarantined — isolated from clinical use pending forensic review."
        : integrityStatus === "RECOVERED"
          ? "Integrity restored and verified after recovery."
          : "Verification inconclusive — manual review required.";

  // ---- Derived lifecycle state (from real result, never hardcoded) ----
  const demoLifecycleIdx = !result ? -1 : (() => {
    let i = 1; // trusted
    if (result.sha3.match) return 1;
    i = 2; // tamper detected
    if (result.ai.tamper_detected) i = 3;
    if (result.ai.bounding_boxes.length > 0) i = 4;
    if (result.risk?.category === "HIGH" || result.dit_state === "TAMPERED") i = 5;
    if (result.recovery?.available && result.recovery.rois.length > 0) i = 6;
    if (result.recovery?.post_recovery_match) i = 7;
    if (audit?.tx_hash) i = 8;
    return i;
  })();

  const realLifecycleIdx = !ev ? -1 : (() => {
    const vs = (ev.verification_status || "").toUpperCase();
    let i = 0; // registered / trusted
    if (ev.hash_match === true || vs === "VERIFIED") i = 1;
    if (ev.hash_match === false || vs === "TAMPERED") i = Math.max(i, 2);
    if (aiForensics && aiForensics.analyzed === true) i = Math.max(i, 3);
    if (regionCount > 0) i = Math.max(i, 4);
    if (vs === "QUARANTINED" || (ev.risk_and_trust && ev.risk_and_trust.access_decision === "ACTION_QUARANTINE")) i = Math.max(i, 5);
    if (ev.recovery) i = Math.max(i, 6);
    if (ev.post_recovery_verified === true) i = Math.max(i, 7);
    if (ev.blockchain_tx_hash) i = Math.max(i, 8);
    return i;
  })();

  const lifecycleActiveIdx = result ? demoLifecycleIdx : realLifecycleIdx;

  const tabs: { key: TabKey; label: string; icon: React.ElementType; src: string | null; avail: boolean }[] = result ? [
    { key: "original", label: "Original", icon: ShieldCheck, src: result.images.original, avail: true },
    { key: "tampered", label: "Tampered", icon: ShieldAlert, src: result.images.tampered, avail: true },
    { key: "recovered", label: "Recovered", icon: HeartPulse, src: result.recovery.recovered_image_base64, avail: true },
    { key: "groundtruth", label: "Ground Truth", icon: Layers, src: result.ground_truth.mask_base64, avail: true },
    { key: "aimask", label: "AI Mask", icon: Crosshair, src: result.prediction.mask_base64, avail: true },
    { key: "overlay", label: "Overlay", icon: Boxes, src: result.prediction.overlay_base64, avail: true },
    { key: "gradcam", label: "Grad-CAM", icon: Sparkles, src: result.grad_cam.heatmap_base64, avail: result.grad_cam.available },
    { key: "difference", label: "Difference", icon: Layers, src: result.difference?.difference_map_base64 ?? null, avail: !!result.difference?.available },
  ] : [];
  const currentTab = tabs.find(t => t.key === tab);

  const metrics = result?.prediction.metrics;
  const m = result?.recovery;

  const startPan = (e: React.MouseEvent) => {
    const startX = e.clientX - pan.x, startY = e.clientY - pan.y;
    const move = (ev: MouseEvent) => setPan({ x: ev.clientX - startX, y: ev.clientY - startY });
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  return (
    <div className="w-full space-y-5">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            Medical Image Integrity Proof &amp; Self-Recovery
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Continuous Integrity Verification, AI Tamper Forensics, Recovery and Blockchain Audit
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold bg-slate-800/80 border border-slate-700 text-slate-300">
            Blockchain: Local Blockchain Simulation
          </span>
          <button
            onClick={loadCatalogue} disabled={listLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl transition-all disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${listLoading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-xs flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" /><span>{error}</span>
        </div>
      )}

      {/* LIFECYCLE HERO */}
      <div className="glass-panel p-4">
        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-3">Security Lifecycle</div>
        <div className="flex flex-wrap items-center gap-1.5">
          {LIFECYCLE_STEPS.map((s, i) => {
            const done = (result || ev) && i <= lifecycleActiveIdx;
            const current = (result || ev) && i === lifecycleActiveIdx;
            return (
              <React.Fragment key={s}>
                <span className={`px-2 py-1 rounded-lg text-[9px] font-bold border transition-all ${
                  current ? "bg-cyan-600 text-white border-cyan-500 animate-pulse"
                    : done ? "bg-emerald-500/15 text-emerald-400 border-emerald-600/40"
                      : "bg-slate-900 text-slate-600 border-slate-800"
                }`}>{s}</span>
                {i < LIFECYCLE_STEPS.length - 1 && <span className={`text-[10px] ${done ? "text-emerald-500" : "text-slate-700"}`}>↓</span>}
              </React.Fragment>
            );
          })}
          {!result && !ev && <span className="text-[10px] text-slate-600 ml-2">Select a clinical study and run the proof to advance the lifecycle</span>}
        </div>
      </div>

      {/* SELECTOR — PRIMARY: real uploads / SECONDARY: demonstration samples */}
      <div className="glass-panel p-4 flex flex-wrap items-center gap-3">
        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
          <Database className="h-3 w-3" /> Select Clinical Study
        </div>
        <select
          value={selectionValue}
          onChange={e => handleSelectionValue(e.target.value)}
          disabled={analyzing}
          aria-label="Select clinical study"
          className="bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-xs text-slate-200 outline-none max-w-full sm:max-w-2xl"
        >
          <option value="">Select a clinical study…</option>
          <optgroup label="Recent Doctor Uploads">
            {clinicalImages.map(img => (
              <option key={`real-${img.id}`} value={`real:${img.id}`}>
                {img.title} — {img.image_type} · Image ID: {img.id} · {formatWhen(img.created_at)}
              </option>
            ))}
          </optgroup>
          <optgroup label="Demonstration Samples (synthetic dataset — demo only)">
            {samples.map(s => (
              <option key={`demo-${s.image_id}`} value={`demo:${s.image_id}`}>
                Demonstration Sample — {s.image_id} · {s.tamper_type} · {s.affected_area_percentage.toFixed(1)}% affected
              </option>
            ))}
          </optgroup>
        </select>
        {selection && selection.kind === "real" && (
          <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/10 border border-emerald-600/40 text-emerald-300">
            Real upload · Image ID {selection.id}
          </span>
        )}
        {selection && selection.kind === "demo" && (
          <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-amber-500/10 border border-amber-600/40 text-amber-300">
            Demonstration Sample (synthetic — demo only)
          </span>
        )}
        <button
          onClick={runSelectedProof}
          disabled={!selection || analyzing}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl transition-all disabled:opacity-40"
        >
          {analyzing ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Proving…</> : <><Play className="h-3.5 w-3.5" /> Run Complete Proof</>}
        </button>
        {(result || ev) && (
          <button
            onClick={downloadEvidence} disabled={evidenceLoading}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-xl transition-all disabled:opacity-50"
          >
            {evidenceLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {selection && selection.kind === "real" ? "Download Integrity Evidence (JSON)" : "Generate Forensic Evidence Report"}
          </button>
        )}
        {clinicalImages.length === 0 && !listLoading && (
          <span className="w-full text-[10px] text-amber-500/90">
            No clinical study is accessible to this account yet — upload an image, or run a clearly-labelled demonstration sample.
          </span>
        )}
      </div>

      {/* PROOF EXECUTION STAGES (real runs only — real endpoint responses) */}
      {hasRunReal && (
        <Section title="Proof Execution Stages" icon={Workflow} accent="text-indigo-400"
          right={
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-800 border border-slate-700 text-slate-300">
              {stages.filter(s => s.status === "done").length} of {stages.length} stages completed
            </span>}>
          <div className="space-y-1.5">
            {stages.map((st, idx) => (
              <div key={st.key} className="flex items-start gap-2.5 bg-slate-950/50 rounded-lg p-2.5 border border-slate-900">
                <span className="mt-0.5 shrink-0">
                  {st.status === "running" ? <RefreshCw className="h-3.5 w-3.5 text-cyan-400 animate-spin" />
                    : st.status === "done" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                      : st.status === "failed" ? <XCircle className="h-3.5 w-3.5 text-rose-400" />
                        : st.status === "na" ? <Info className="h-3.5 w-3.5 text-slate-500" />
                          : <span className="block w-3.5 h-3.5 rounded-full border border-slate-700" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-semibold text-slate-300">{idx + 1}. {st.label}</span>
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${stageChipClass(st.status)}`}>
                      {stageStatusLabel(st.status)}
                    </span>
                  </div>
                  <div className="text-[9px] font-mono text-slate-600 break-all">{st.endpoint}</div>
                  <div className="text-[9px] text-slate-500 break-words">{st.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-600 leading-relaxed">
            Each stage is only marked completed after the endpoint listed actually returned. Failed stages show the
            server's own error; "Not applicable" means the backend reports no record for this image — nothing is simulated.
          </p>
        </Section>
      )}

      {!result && !ev && !analyzing && (
        <div className="glass-panel p-10 text-center">
          <ScrollText className="h-10 w-10 text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            Select a clinical study from <b>Recent Doctor Uploads</b> (or a clearly-labelled demonstration sample) and
            run the complete proof to see live hash evidence, DIT state, AI forensics and the audit trail.
          </p>
        </div>
      )}
      {analyzing && (
        <div className="glass-panel p-10 text-center">
          <RefreshCw className="h-8 w-8 text-emerald-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">
            {selection && selection.kind === "real"
              ? "Executing the proof chain against the selected clinical study — each stage reports its live endpoint response."
              : "Executing SHA-3 verification, AI forensics, Grad-CAM, recovery and audit…"}
          </p>
        </div>
      )}

      {/* ===== REAL CLINICAL STUDY RESULTS ===== */}
      {ev && (
        <>
          {/* STUDY METADATA + LIVE PREVIEW + INTEGRITY STATE */}
          <Section title="Clinical Study Under Proof" icon={FileText} accent="text-cyan-400"
            right={<StatusBadge status={integrityStatus} size="xs" pulse={integrityStatus === "TAMPERED" || integrityStatus === "QUARANTINED"} />}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-slate-950/60 rounded-xl overflow-hidden border border-slate-800">
                <div className="px-3 py-2 bg-slate-900/80 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Live Preview</span>
                  <span className="text-[9px] font-mono text-slate-600">/api/images/preview/{ev.image_id}</span>
                </div>
                <div className="h-56 bg-black/70 flex items-center justify-center p-2">
                  {previewUrl ? (
                    <img src={previewUrl} alt={ev.image_name} className="max-h-full max-w-full object-contain" />
                  ) : (
                    <span className="text-[10px] text-slate-600 text-center px-3">
                      {previewState === "loading" ? "Loading authorized preview…"
                        : previewState === "failed" ? "Preview unavailable — the file could not be decrypted for this account."
                          : "No preview loaded."}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Stat label="Title" value={ev.image_name || "Not reported"} tone="cyan" />
                <Stat label="Image ID" value={String(ev.image_id)} tone="cyan" />
                <Stat label="Modality / Type" value={ev.image_type || "Not reported"} tone="purple" />
                <Stat label="Uploaded" value={formatWhen(ev.created_at)} />
                <Stat label="Dimensions" value={ev.original_dimensions && ev.original_dimensions.length >= 2
                  ? `${ev.original_dimensions[0]}×${ev.original_dimensions[1]}`
                  : "N/A — not decoded"} />
                <Stat label="File Size" value={typeof ev.file_size_bytes === "number" ? formatBytes(ev.file_size_bytes) : "N/A"} />
                <Stat label="Verification Status" value={ev.verification_status || "REVIEW"} tone={statusTone(integrityStatus)} />
                <Stat label="Verified At" value={formatWhen(ev.verification_timestamp)} />
              </div>

              <div className="bg-slate-950/60 rounded-xl p-3 space-y-2.5">
                <div className="text-[9px] text-slate-600 font-bold uppercase">Integrity state (runtime)</div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={integrityStatus} size="sm" />
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">{integrityNarrative}</p>
                <div className="text-[10px] text-slate-400">
                  SHA-3 comparison: <b className={ev.hash_match === true ? "text-emerald-400" : ev.hash_match === false ? "text-red-400" : "text-slate-500"}>{hashComparison}</b>
                </div>
                <div className="text-[10px] text-slate-400">
                  Digital Integrity Twin: <b className={ditAvailable ? "text-purple-300" : "text-slate-500"}>{ditStatus || "No twin on record (N/A)"}</b>
                </div>
                <div className="text-[10px] text-slate-400">
                  Quarantine: <b className={isQuarantined ? "text-red-400" : "text-slate-300"}>{isQuarantined ? "Quarantined" : "Not quarantined"}</b>
                </div>
                <div className="text-[10px] text-slate-400">
                  Risk: <b className={typeof ev.risk_score === "number" ? "text-amber-300" : "text-slate-500"}>{fmtScore(ev.risk_score)}</b>
                  {" · "}Trust: <b className={typeof ev.trust_score === "number" ? "text-emerald-300" : "text-slate-500"}>{fmtScore(ev.trust_score)}</b>
                </div>
              </div>
            </div>
          </Section>

          {/* SHA-3 PROOF (real) */}
          <Section title="Cryptographic Integrity Proof (SHA-3)" icon={Hash} accent="text-cyan-400"
            right={<span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${hashChipClass}`}>{hashChipText}</span>}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                ["TRUSTED HASH", ev.trusted_hash || "Not available", "emerald"],
                ["CURRENT HASH (recomputed)", ev.current_hash || "Not available — file could not be re-hashed", ev.current_hash ? "cyan" : "slate"],
                ["COMPARISON", hashComparison, ev.hash_match === true ? "emerald" : ev.hash_match === false ? "red" : "slate"],
              ].map(([label, val, tone]) => (
                <div key={label} className="bg-slate-950/60 rounded-xl p-3">
                  <div className="text-[9px] text-slate-600 font-bold uppercase mb-1">{label}</div>
                  <div className={`text-[10px] font-mono break-all text-${tone}-400`}>{val}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Stat label="Algorithm" value={ev.hash_algorithm || "SHA3-256"} tone="cyan" />
              <Stat label="Verification Status" value={ev.verification_status || "REVIEW"} tone={statusTone(integrityStatus)} />
              <Stat label="Verification Time" value={formatWhen(ev.verification_timestamp)} />
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed flex items-start gap-1.5">
              <Info className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                The current hash is recomputed by the backend from the decrypted bytes on every integrity-evidence
                request — hashes on this page are never stored or hard-coded in the frontend.
              </span>
            </p>
          </Section>

          {/* DIGITAL INTEGRITY TWIN (real, honest 404 handling) */}
          <Section title="Digital Integrity Twin" icon={Link2} accent="text-purple-400"
            right={
              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${
                ditAvailable ? "bg-purple-500/15 text-purple-300 border-purple-600/40" : "bg-slate-800 text-slate-400 border-slate-700"}`}>
                {ditAvailable ? `TWIN STATUS: ${ditStatus || "UNKNOWN"}` : "NO TWIN ON RECORD (N/A)"}
              </span>}>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Stat label="Twin ID" value={realTwin && realTwin.id ? String(realTwin.id) : (ev.digital_integrity_twin?.id ? String(ev.digital_integrity_twin.id) : "N/A")} tone="purple" />
              <Stat label="DIT Status" value={ditStatus || "N/A"} tone={ditStatus === "VERIFIED" ? "emerald" : ditStatus ? "red" : "slate"} />
              <Stat label="Trusted Reference" value={
                (realTwin && realTwin.trusted_hash)
                  ? `${String(realTwin.trusted_hash).slice(0, 20)}…`
                  : (ev.digital_integrity_twin?.trusted_hash
                    ? `${String(ev.digital_integrity_twin.trusted_hash).slice(0, 20)}…`
                    : "N/A")} tone="emerald" />
              <Stat label="Last Updated" value={formatWhen(realTwin?.updated_at || ev.digital_integrity_twin?.updated_at || null)} />
              <Stat label="Verification History" value={
                realTwin && Array.isArray(realTwin.verification_history)
                  ? `${realTwin.verification_history.length} event(s)`
                  : "N/A"} tone="cyan" />
              <Stat label="Storage Reference" value={
                (realTwin && realTwin.ipfs_cid) || ev.storage_reference
                  ? String(realTwin?.ipfs_cid || ev.storage_reference)
                  : "N/A"} />
            </div>
            <div className="bg-purple-950/20 border border-purple-900/40 rounded-xl p-3">
              <div className="text-[10px] font-bold text-purple-300 mb-1">WHAT IS DIGITAL INTEGRITY TWIN?</div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                The Digital Integrity Twin maintains the trusted integrity and provenance reference of the
                medical image. During continuous verification, the current image is compared against this
                trusted reference. A mismatch changes the integrity state and triggers forensic analysis.
                When the backend reports no twin (404), this panel honestly shows N/A instead of a value.
              </p>
            </div>
          </Section>

          {/* AI FORENSICS (real report data) */}
          <Section title="AI Forensic Evidence" icon={Crosshair} accent="text-purple-400">
            {aiForensics && aiForensics.analyzed === true ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <Stat label="AI Status" value={String(aiForensics.status || "ANALYZED")} tone="cyan" />
                  <Stat label="Tamper Percentage" value={
                    typeof (aiForensics.tamper_percentage ?? ev.tamper_percentage) === "number"
                      ? `${((aiForensics.tamper_percentage ?? ev.tamper_percentage) as number).toFixed(2)}%`
                      : "N/A"} tone="amber" />
                  <Stat label="AI Confidence" value={
                    typeof aiForensics.confidence_score === "number"
                      ? `${(aiForensics.confidence_score * 100).toFixed(1)}%`
                      : typeof ev.ai_confidence === "number"
                        ? `${(ev.ai_confidence * 100).toFixed(1)}%`
                        : "N/A"} tone="amber" />
                  <Stat label="Detected Regions" value={String(regionCount)} tone="purple" />
                  <Stat label="Model" value={String(aiForensics.model_name || ev.ai_model || "Not reported by backend")} tone="purple" />
                  <Stat label="Model Version" value={String(aiForensics.model_version || "Not reported")} />
                </div>
                {heatmapUrl ? (
                  <div className="bg-slate-950/60 rounded-xl overflow-hidden border border-slate-800">
                    <div className="px-2 py-1.5 bg-slate-900/80 text-[9px] font-bold text-slate-400 uppercase">
                      Heatmap — /api/images/heatmap/by-image/{ev.image_id}
                    </div>
                    <div className="h-44 bg-black/70 flex items-center justify-center">
                      <img src={heatmapUrl} alt="heatmap" className="max-h-full max-w-full object-contain" />
                    </div>
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-600">
                    Heatmap: {aiForensics.heatmap_available
                      ? "reported by the backend but could not be loaded."
                      : "not available for this image."}
                  </p>
                )}
                {aiBoxes.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[9px] text-slate-600 font-bold uppercase">Reported regions (model output)</div>
                    {aiBoxes.slice(0, 8).map((b: any, i: number) => (
                      <div key={i} className="bg-slate-950/60 rounded-lg p-2 text-[10px] font-mono text-slate-400">
                        Region {i + 1} — X: {b.x ?? "—"} · Y: {b.y ?? "—"} · W: {b.width ?? "—"} · H: {b.height ?? "—"}
                        {typeof b.confidence === "number" && ` · Confidence: ${(b.confidence * 100).toFixed(1)}%`}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : aiForensics ? (
              <p className="text-xs text-amber-500">
                AI forensic analysis has not been run for this image (status: {String(aiForensics.status || "NO RECORD")}) —
                shown as N/A instead of a fabricated result.
              </p>
            ) : (
              <p className="text-xs text-slate-500">No AI forensic report on record for this image — N/A.</p>
            )}
          </Section>

          {/* RISK / TRUST (real scores or honest N/A) */}
          <Section title="Risk & Trust Assessment" icon={ShieldAlert} accent="text-amber-400"
            right={
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-800 border border-slate-700 text-slate-300">
                Source: integrity evidence / risk-trust endpoint
              </span>}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Risk Score" value={fmtScore(ev.risk_score)}
                tone={typeof ev.risk_score === "number" ? (ev.risk_score >= 50 ? "red" : "amber") : "slate"} />
              <Stat label="Risk Category" value={ev.risk_and_trust?.risk_category || (typeof ev.risk_score === "number" ? "Category not reported" : "N/A")} tone="amber" />
              <Stat label="Trust Score" value={fmtScore(ev.trust_score)}
                tone={typeof ev.trust_score === "number" ? (ev.trust_score >= 70 ? "emerald" : "amber") : "slate"} />
              <Stat label="Trust Level" value={ev.risk_and_trust?.trust_level || (typeof ev.trust_score === "number" ? "Level not reported" : "N/A")} tone="cyan" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <Stat label="Access Decision" value={ev.risk_and_trust?.access_decision || "N/A"} />
              <Stat label="Quarantine Flag" value={isQuarantined ? "Yes" : "No"} tone={isQuarantined ? "red" : "emerald"} />
              <Stat label="Forensic Report" value={ev.forensic_report_status || "N/A"} tone="cyan" />
              <Stat label="Post-Recovery Verified" value={
                typeof ev.post_recovery_verified === "boolean"
                  ? (ev.post_recovery_verified ? "MATCH" : "MISMATCH")
                  : "N/A"} tone={ev.post_recovery_verified === true ? "emerald" : "slate"} />
            </div>
            {typeof ev.risk_score !== "number" && typeof ev.trust_score !== "number" && (
              <p className="text-[10px] text-slate-600">
                No risk/trust assessment has been recorded for this image — reported as N/A rather than a default number.
              </p>
            )}
          </Section>

          {/* STORAGE / BLOCKCHAIN / RECOVERY */}
          <Section title="Storage, Blockchain & Recovery Evidence" icon={Boxes} accent="text-teal-400">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Stat label="Storage Provider" value={ev.storage_provider || "N/A"} tone="cyan" />
              <Stat label="Storage Reference" value={ev.storage_reference || "N/A"} />
              <Stat label="Storage Integrity" value={
                ev.storage?.pin_confirmed === true ? "IPFS pin confirmed"
                  : ev.storage?.pin_confirmed === false ? "IPFS pin NOT confirmed"
                    : ev.is_local_storage ? "Local storage" : "N/A"} tone="teal" />
              <Stat label="Blockchain Network" value={ev.blockchain_network || ev.blockchain?.network || "N/A"} tone="purple" />
              <Stat label="Latest TX" value={ev.blockchain_tx_hash ? `${String(ev.blockchain_tx_hash).slice(0, 20)}…` : "N/A"} tone="purple" />
              <Stat label="Block" value={typeof ev.blockchain_block === "number" ? `#${ev.blockchain_block}` : "N/A"} tone="purple" />
              <Stat label="Recovery Status" value={ev.recovery_status || "N/A"} tone="teal" />
              <Stat label="Recovery Record" value={ev.recovery ? `#${ev.recovery.record_id ?? "?"} · ${ev.recovery.tampered_roi_count ?? 0} ROI(s)` : "N/A"} />
              <Stat label="Post-Recovery Hash" value={ev.post_recovery_hash ? `${String(ev.post_recovery_hash).slice(0, 20)}…` : "N/A"} tone="emerald" />
            </div>
            <p className="text-[10px] text-slate-600">
              Values are read directly from GET /api/images/{ev.image_id}/integrity-evidence. Fields the backend does not
              hold for this image are shown as N/A.
            </p>
          </Section>

          {/* AUDIT TRAIL (real audit events + local ledger) */}
          <Section title="Integrity Audit Trail" icon={ScrollText} accent="text-cyan-400"
            right={
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-800 border border-slate-700 text-slate-300">
                Local Blockchain Simulation
              </span>}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <div className="text-[9px] text-slate-600 font-bold uppercase">
                  Evidence audit events ({Array.isArray(ev.audit_events) ? ev.audit_events.length : 0})
                </div>
                <div className="max-h-72 overflow-y-auto space-y-1">
                  {!Array.isArray(ev.audit_events) || ev.audit_events.length === 0 ? (
                    <div className="text-[10px] text-slate-600">No audit events returned for this image.</div>
                  ) : ev.audit_events.slice(0, 12).map((a: any, i: number) => (
                    <div key={a.id ?? i} className="bg-slate-950/50 rounded-lg p-2 border border-slate-900 text-[9px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-400">{String(a.action || "EVENT")}</span>
                        <span className={`font-bold uppercase ${
                          String(a.status || "").toUpperCase().includes("FAIL") ? "text-rose-400"
                            : String(a.status || "").toUpperCase().includes("DENY") ? "text-amber-400"
                              : "text-emerald-400"}`}>{String(a.status || "—")}</span>
                      </div>
                      <div className="font-mono text-slate-600 break-all">
                        {a.actor_username || (a.actor_user_id ? `user #${a.actor_user_id}` : "system")} · {formatWhen(a.timestamp)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[9px] text-slate-600 font-bold uppercase">Ledger Blocks ({blocks.length} recorded)</div>
                <div className="max-h-72 overflow-y-auto space-y-1">
                  {blocks.length === 0 && <div className="text-[10px] text-slate-600">No blocks recorded yet.</div>}
                  {[...blocks].reverse().slice(0, 12).map(b => (
                    <div key={b.id} className="bg-slate-950/50 rounded-lg p-2 border border-slate-900 text-[9px] font-mono">
                      <span className="text-cyan-500">#{b.block_index}</span>{" "}
                      <span className="text-slate-400">{b.type}</span>{" "}
                      <span className="text-slate-600">
                        {b.timestamp ? new Date(b.timestamp).toLocaleString() : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Section>
        </>
      )}

      {/* ===== DEMONSTRATION SAMPLE RESULTS (synthetic dataset, unchanged workflow) ===== */}
      {result && (
        <>
          {/* ===== VISUAL TAMPER PROOF — 3 PANELS ===== */}
          <Section title="Visual Tamper Proof" icon={ShieldCheck} accent="text-emerald-400">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  label: "Original / Trusted Image", src: result.images.original,
                  status: "✓ TRUSTED", tone: "emerald",
                  rows: [
                    ["Image ID", result.image_id],
                    ["Dimensions", `${result.sample.width}×${result.sample.height}`],
                    ["Modality", result.sample.modality || "Not reported by backend"],
                    ["SHA-3", result.sha3.trusted_original],
                  ],
                },
                {
                  label: "Tampered / Current Image", src: result.images.tampered,
                  status: "⚠ TAMPERED", tone: "red",
                  rows: [
                    ["SHA-3", result.sha3.current],
                    ["Integrity", result.sha3.status],
                    ["Tamper Result", result.ai.tamper_detected ? "Detected" : "Not detected"],
                    ["Area", typeof result.ai.tampered_percentage === "number"
                      ? `${result.ai.tampered_percentage.toFixed(2)}%`
                      : "N/A"],
                  ],
                },
                {
                  label: "Recovered Image", src: m?.recovered_image_base64 ?? null,
                  status: m?.post_recovery_match ? "✓ VERIFIED" : (m ? "✕ NOT VERIFIED" : "—"),
                  tone: m?.post_recovery_match ? "emerald" : "amber",
                  rows: m ? [
                    ["SHA-3", m.recovered_sha3],
                    ["Post-Recovery", m.post_recovery_match ? "MATCH" : "MISMATCH"],
                    ["ROIs Restored", String(m.rois.length)],
                  ] : [["Status", "Recovery unavailable for this image."]],
                },
              ].map(p => (
                <div key={p.label} className="bg-slate-950/60 rounded-xl overflow-hidden border border-slate-800">
                  <div className="px-3 py-2 bg-slate-900/80 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{p.label}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      p.tone === "emerald" ? "bg-emerald-500/15 text-emerald-400"
                        : p.tone === "red" ? "bg-red-500/15 text-red-400"
                          : "bg-amber-500/15 text-amber-400"
                    }`}>{p.status}</span>
                  </div>
                  <div className="h-44 bg-black/70 flex items-center justify-center">
                    {p.src ? <img src={p.src} alt={p.label} className="max-h-full max-w-full object-contain" />
                      : <span className="text-[10px] text-slate-600">Recovery unavailable for this image.</span>}
                  </div>
                  <div className="p-2.5 space-y-1">
                    {p.rows.map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-2 text-[9px]">
                        <span className="text-slate-600 font-bold uppercase">{k}</span>
                        <span className="font-mono text-slate-400 break-all text-right">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Comparison controls */}
            <div className="border-t border-slate-800/60 pt-3 space-y-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {tabs.map(t => (
                  <button key={t.key} onClick={() => { setTab(t.key); setZoom(1); setPan({ x: 0, y: 0 }); }}
                    disabled={!t.avail}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                      tab === t.key ? "bg-cyan-600 text-white"
                        : t.avail ? "bg-slate-800/60 text-slate-400 hover:text-slate-200"
                          : "bg-slate-900 text-slate-700 cursor-not-allowed"}`}>
                    <t.icon className="h-3 w-3" />{t.label}
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-1.5">
                  <button onClick={() => setZoom(z => Math.min(4, z + 0.25))} className="px-2 py-1 rounded bg-slate-800 text-slate-400 text-[10px]">＋</button>
                  <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="px-2 py-1 rounded bg-slate-800 text-slate-400 text-[10px]">－</button>
                  <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="px-2 py-1 rounded bg-slate-800 text-slate-400 text-[10px]">Reset</button>
                  <button onClick={() => setFullscreen(f => !f)} className="px-2 py-1 rounded bg-slate-800 text-slate-400 text-[10px]">⛶</button>
                </div>
              </div>
              <div
                className={`bg-black/70 flex items-center justify-center overflow-hidden ${fullscreen ? "fixed inset-0 z-50 h-screen" : "h-72"} cursor-move`}
                onMouseDown={startPan}
              >
                {currentTab?.src ? (
                  <img src={currentTab.src} alt={tab}
                    style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transition: "transform 0.1s" }}
                    className="max-h-full max-w-full object-contain pointer-events-none" draggable={false} />
                ) : (
                  <span className="text-xs text-slate-600">
                    {tab === "gradcam" ? "Grad-CAM unavailable for this analysis." : "Unavailable"}
                  </span>
                )}
                {fullscreen && (
                  <button onClick={() => setFullscreen(false)}
                    className="absolute top-4 right-4 px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-xs">Close</button>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[9px] text-slate-600 font-bold uppercase">Overlay opacity</span>
                <input type="range" min={0} max={1} step={0.05} value={opacity}
                  onChange={e => setOpacity(parseFloat(e.target.value))} className="w-32 accent-cyan-500" />
                <span className="text-[10px] font-mono text-slate-500">{opacity.toFixed(2)}</span>
                <span className="text-[10px] text-slate-600">Zoom {(zoom * 100).toFixed(0)}% · drag to pan</span>
              </div>
            </div>
          </Section>

          {/* ===== SHA-3 PROOF ===== */}
          <Section title="Cryptographic Integrity Proof (SHA-3)" icon={Hash} accent="text-cyan-400"
            right={
              <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                result.sha3.match ? "bg-emerald-500/15 text-emerald-400 border border-emerald-600/30"
                  : "bg-red-500/15 text-red-400 border border-red-600/40 animate-pulse"}`}>
                {result.sha3.match ? "✓ HASH MATCH" : "✕ HASH MISMATCH — INTEGRITY CHANGE CONFIRMED"}
              </span>
            }>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                ["ORIGINAL", result.sha3.trusted_original, "emerald"],
                ["CURRENT / TAMPERED", result.sha3.current, "red"],
                ["RECOVERED", m?.recovered_sha3 ?? "Unavailable", m?.post_recovery_match ? "emerald" : "slate"],
              ].map(([label, val, tone]) => (
                <div key={label} className="bg-slate-950/60 rounded-xl p-3">
                  <div className="text-[9px] text-slate-600 font-bold uppercase mb-1">{label}</div>
                  <div className={`text-[10px] font-mono break-all text-${tone}-400`}>{val}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={`rounded-xl p-3 border text-xs font-semibold ${
                result.sha3.match ? "bg-emerald-500/10 border-emerald-700/40 text-emerald-400"
                  : "bg-red-500/10 border-red-700/50 text-red-400"}`}>
                Original == Current → <b>{result.sha3.match ? "MATCH" : "MISMATCH"}</b>
              </div>
              <div className={`rounded-xl p-3 border text-xs font-semibold ${
                m?.post_recovery_match ? "bg-emerald-500/10 border-emerald-700/40 text-emerald-400"
                  : "bg-slate-800/60 border-slate-700 text-slate-500"}`}>
                Original == Recovered → <b>{m ? (m.post_recovery_match ? "MATCH — POST-RECOVERY INTEGRITY VERIFIED" : "MISMATCH") : "Unavailable"}</b>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed flex items-start gap-1.5">
              <Info className="h-3 w-3 mt-0.5 shrink-0" /><span>{result.sha3.explanation}</span>
            </p>
          </Section>

          {/* ===== DIT ===== */}
          <Section title="Digital Integrity Twin" icon={Link2} accent="text-purple-400"
            right={<StatusBadge status={result.dit_state} size="xs" />}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Stat label="Image ID" value={result.image_id} tone="cyan" />
                <Stat label="Trusted Integrity Reference" value={`${result.sha3.trusted_original.slice(0, 18)}…`} tone="emerald" />
                <Stat label="Current Integrity State" value={result.dit_state} tone={result.dit_state === "VERIFIED" ? "emerald" : "red"} />
                <Stat label="DIT Status" value={result.dit_state} tone={result.dit_state === "VERIFIED" ? "emerald" : "red"} />
                <Stat label="Last Verification" value={audit?.timestamp ? new Date(audit.timestamp).toLocaleString() : "Event data unavailable"} />
                <Stat label="Provenance Reference" value={audit?.tx_hash ? `${String(audit.tx_hash).slice(0, 16)}…` : "Event data unavailable"} tone="purple" />
              </div>
              <div className="bg-slate-950/60 rounded-xl p-3 space-y-1.5">
                <div className="text-[9px] text-slate-600 font-bold uppercase mb-1">DIT Lifecycle</div>
                {["CREATED", "VERIFIED", "TAMPERED", "QUARANTINED", "RECOVERED", "VERIFIED"].map((st, i) => {
                  const reached =
                    st === "CREATED" ? true :
                      st === "VERIFIED" ? (i === 1 ? true : !!m?.post_recovery_match) :
                        st === "TAMPERED" ? !result.sha3.match :
                          st === "QUARANTINED" ? (result.risk?.category === "HIGH") :
                            st === "RECOVERED" ? !!m?.post_recovery_match : false;
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full ${reached ? "bg-emerald-400" : "bg-slate-700"}`} />
                      <span className={`text-[10px] font-semibold ${reached ? "text-slate-300" : "text-slate-600"}`}>{st}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-purple-950/20 border border-purple-900/40 rounded-xl p-3">
              <div className="text-[10px] font-bold text-purple-300 mb-1">WHAT IS DIGITAL INTEGRITY TWIN?</div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                The Digital Integrity Twin maintains the trusted integrity and provenance reference of the
                medical image. During continuous verification, the current image is compared against this
                trusted reference. A mismatch changes the integrity state and triggers forensic analysis.
              </p>
            </div>
          </Section>

          {/* ===== LOCALIZATION ===== */}
          <Section title="Where Did the Tampering Occur?" icon={Crosshair} accent="text-rose-400">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                ["Original", result.images.original], ["Tampered", result.images.tampered],
                ["Ground Truth", result.ground_truth.mask_base64], ["AI Prediction", result.prediction.mask_base64],
              ].map(([label, src]) => (
                <div key={label} className="bg-slate-950/60 rounded-xl overflow-hidden border border-slate-800">
                  <div className="px-2 py-1.5 bg-slate-900/80 text-[9px] font-bold text-slate-400 uppercase">{label}</div>
                  <div className="h-36 bg-black/70 flex items-center justify-center">
                    <img src={src as string} alt={label as string} className="max-h-full max-w-full object-contain" />
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Stat label="GT Region (X,Y,W,H)" value={`${result.ground_truth.region.x}, ${result.ground_truth.region.y}, ${result.ground_truth.region.width}, ${result.ground_truth.region.height}`} tone="emerald" />
              <Stat label="GT Area" value={`${result.ground_truth.affected_area_percentage.toFixed(2)}%`} tone="emerald" />
              <Stat label="Predicted Regions" value={String(result.ai.bounding_boxes.length)} tone="purple" />
              <Stat label="Tamper Type" value={result.ground_truth.tamper_type} tone="amber" />
            </div>
            {result.ai.bounding_boxes.length > 0 && (
              <div className="space-y-1">
                <div className="text-[9px] text-slate-600 font-bold uppercase">Detected Regions (model output)</div>
                {result.ai.bounding_boxes.map((b: any, i: number) => (
                  <div key={i} className="bg-slate-950/60 rounded-lg p-2 text-[10px] font-mono text-slate-400">
                    Region {i + 1} — X: {b.x} · Y: {b.y} · W: {b.width} · H: {b.height} · Area: {((b.width * b.height) / (result.sample.width * result.sample.height) * 100).toFixed(2)}%
                    {typeof b.confidence === "number" && ` · Confidence: ${(b.confidence * 100).toFixed(1)}%`}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ===== GT vs AI ===== */}
          <Section title="Ground Truth vs AI Localization" icon={Layers} accent="text-emerald-400">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="grid grid-cols-3 gap-2 lg:col-span-2">
                {[["Ground Truth Mask", result.ground_truth.mask_base64],
                ["AI Predicted Mask", result.prediction.mask_base64],
                ["Overlap", result.prediction.overlay_base64]].map(([label, src]) => (
                  <div key={label} className="bg-slate-950/60 rounded-xl overflow-hidden border border-slate-80">
                    <div className="px-2 py-1.5 bg-slate-900/80 text-[9px] font-bold text-slate-400 uppercase">{label}</div>
                    <div className="h-32 bg-black/70 flex items-center justify-center">
                      <img src={src as string} alt={label as string} className="max-h-full max-w-full object-contain" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Stat label="IoU" value={metrics?.iou ?? "—"} tone="cyan" />
                <Stat label="Dice" value={metrics?.dice ?? "—"} tone="cyan" />
                <Stat label="Precision" value={metrics?.precision ?? "—"} tone="cyan" />
                <Stat label="Recall" value={metrics?.recall ?? "—"} tone="cyan" />
                <Stat label="F1" value={metrics?.f1_score ?? "—"} tone="cyan" />
                <Stat label="Pixel Accuracy" value={metrics?.pixel_accuracy ?? "—"} tone="cyan" />
              </div>
            </div>
            <p className="text-[10px] text-slate-600">
              Metrics calculated live by comparing the AI predicted mask against the controlled ground-truth mask —
              proving whether the AI-localized region corresponds to the known tampered region.
            </p>
          </Section>

          {/* ===== IMAGE DIFFERENCE ===== */}
          {result.difference?.available && (
            <Section title="Image Difference" icon={Layers} accent="text-amber-400">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-950/60 rounded-xl overflow-hidden border border-slate-800">
                  <div className="px-2 py-1.5 bg-slate-900/80 text-[9px] font-bold text-slate-400 uppercase">Difference Map</div>
                  <div className="h-44 bg-black/70 flex items-center justify-center">
                    <img src={result.difference.difference_map_base64} alt="difference map" className="max-h-full max-w-full object-contain" />
                  </div>
                </div>
                <div className="bg-slate-950/60 rounded-xl overflow-hidden border border-slate-800">
                  <div className="px-2 py-1.5 bg-slate-900/80 text-[9px] font-bold text-slate-400 uppercase">Region Highlight Overlay</div>
                  <div className="h-44 bg-black/70 flex items-center justify-center">
                    <img src={result.difference.difference_overlay_base64} alt="difference overlay" className="max-h-full max-w-full object-contain" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Stat label="Changed Pixels" value={result.difference.changed_pixels.toLocaleString()} tone="amber" />
                <Stat label="Total Pixels" value={result.difference.total_pixels.toLocaleString()} />
                <Stat label="Changed" value={`${result.difference.changed_pixel_percentage}%`} tone="amber" />
              </div>
              <p className="text-[10px] text-slate-600">{result.difference.note}</p>
            </Section>
          )}

          {/* ===== AI FORENSIC EVIDENCE + GRAD-CAM ===== */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Section title="AI Forensic Evidence" icon={Crosshair} accent="text-purple-400">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Tamper Detected" value={result.ai.tamper_detected ? "YES" : "NO"} tone={result.ai.tamper_detected ? "red" : "emerald"} />
                <Stat label="Tamper Probability" value={typeof result.ai.confidence_score === "number"
                  ? `${(result.ai.confidence_score * 100).toFixed(1)}%`
                  : "N/A — not reported"} tone="amber" />
                <Stat label="AI Confidence" value={result.ai.confidence_label || "N/A"} tone="cyan" />
                <Stat label="Model" value={String(result.ai.model_provenance?.architecture
                  ?? result.ai.model_provenance?.model_name
                  ?? "Not reported by backend")} tone="purple" />
                <Stat label="Risk Level" value={typeof result.risk?.total_tamper_risk_score === "number"
                  ? `${result.risk.total_tamper_risk_score.toFixed(1)}/100 — ${result.risk?.category ?? "category not reported"}`
                  : "N/A — no risk assessment on record"}
                  tone={(typeof result.risk?.total_tamper_risk_score === "number" && result.risk?.category === "HIGH") ? "red" : "amber"} />
                <Stat label="Trust Score" value={typeof result.trust?.cybersecurity_trust_score === "number"
                  ? `${result.trust.cybersecurity_trust_score.toFixed(1)}/100 — ${result.trust?.trust_level ?? "level not reported"}`
                  : "N/A — no trust assessment on record"}
                  tone={(typeof result.trust?.cybersecurity_trust_score === "number" && result.trust.cybersecurity_trust_score >= 70) ? "emerald" : "slate"} />
              </div>
              <p className="text-[10px] text-slate-500 leading-relaxed">{result.ai.explanation}</p>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-slate-600 font-bold uppercase">Quarantined:</span>
                {result.risk?.category === "HIGH"
                  ? <span className="text-red-400 font-semibold">Yes — high-risk tamper state</span>
                  : <span className="text-slate-500">No quarantine condition at this risk level</span>}
              </div>
            </Section>

            <Section title="AI Explainability — Grad-CAM" icon={Sparkles} accent="text-purple-400">
              {result.grad_cam.available ? (
                <>
                  <div className="bg-slate-950/60 rounded-xl overflow-hidden border border-slate-800">
                    <div className="px-2 py-1.5 bg-slate-900/80 text-[9px] font-bold text-slate-400 uppercase">Grad-CAM Heatmap</div>
                    <div className="h-48 bg-black/70 flex items-center justify-center relative">
                      <img src={result.grad_cam.heatmap_base64!} alt="grad-cam"
                        style={{ opacity: tab === "gradcam" ? 1 : opacity }}
                        className="max-h-full max-w-full object-contain" />
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">{result.grad_cam.explanation}</p>
                  <p className="text-[10px] text-amber-600/80 leading-relaxed">
                    Grad-CAM is model explanation, not cryptographic proof. It does not prove the exact malicious pixels.
                  </p>
                </>
              ) : (
                <p className="text-xs text-amber-500">Grad-CAM unavailable for this analysis.</p>
              )}
            </Section>
          </div>

          {/* ===== SELF-RECOVERY ===== */}
          <Section title="Region-Level Self-Recovery" icon={HeartPulse} accent="text-teal-400"
            right={
              m ? (
                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                  m.post_recovery_match ? "bg-emerald-500/15 text-emerald-400 border border-emerald-600/30"
                    : "bg-red-500/15 text-red-400 border border-red-600/40"}`}>
                  {m.post_recovery_match ? "✓ RECOVERY VERIFIED" : "✕ VERIFICATION FAILED"}
                </span>
              ) : undefined
            }>
            {m ? (
              <>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                  {["Tampered Region", "Trusted Region Retrieved", "Image Reconstruction", "Recovered Image", "SHA-3 Verification"].map((s, i, arr) => (
                    <React.Fragment key={s}>
                      <span className="px-2 py-1 rounded-lg bg-teal-500/10 border border-teal-700/40 text-teal-300 font-semibold">{s}</span>
                      {i < arr.length - 1 && <span className="text-slate-600">→</span>}
                    </React.Fragment>
                  ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat label="Recovery Status" value={m.post_recovery_match ? "VERIFIED" : "FAILED"} tone={m.post_recovery_match ? "emerald" : "red"} />
                  <Stat label="Recovered Regions" value={String(m.rois.length)} tone="cyan" />
                  <Stat label="Method" value={m.method || "Not reported"} />
                  <Stat label="Verification Passed" value={typeof m.verification_passed === "boolean" ? (m.verification_passed ? "YES" : "NO") : "N/A"} tone={m.verification_passed ? "emerald" : "slate"} />
                </div>
                <div className="text-[10px] font-mono text-slate-500 space-y-0.5">
                  <div>Original SHA-3:&nbsp; <span className="text-emerald-400">{m.original_sha3}</span></div>
                  <div>Tampered SHA-3:&nbsp; <span className="text-red-400">{m.tampered_sha3}</span></div>
                  <div>Recovered SHA-3: <span className={m.post_recovery_match ? "text-emerald-400" : "text-red-400"}>{m.recovered_sha3}</span></div>
                </div>

                {/* Before / After */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800/60">
                  <div className="bg-slate-950/60 rounded-xl p-3 space-y-2">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">Before Recovery</div>
                    <div className="grid grid-cols-2 gap-2">
                      <img src={result.images.original} alt="original" className="h-24 w-full object-contain bg-black/60 rounded-lg" />
                      <img src={result.images.tampered} alt="tampered" className="h-24 w-full object-contain bg-black/60 rounded-lg" />
                    </div>
                    <div className="text-[10px] font-semibold text-red-400 flex items-center gap-1"><XCircle className="h-3 w-3" /> Integrity mismatch</div>
                  </div>
                  <div className="bg-slate-950/60 rounded-xl p-3 space-y-2">
                    <div className="text-[10px] font-bold text-slate-400 uppercase">After Recovery</div>
                    <div className="grid grid-cols-2 gap-2">
                      <img src={result.images.original} alt="original" className="h-24 w-full object-contain bg-black/60 rounded-lg" />
                      <img src={m.recovered_image_base64} alt="recovered" className="h-24 w-full object-contain bg-black/60 rounded-lg" />
                    </div>
                    <div className={`text-[10px] font-semibold flex items-center gap-1 ${m.post_recovery_match ? "text-emerald-400" : "text-red-400"}`}>
                      {m.post_recovery_match ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {m.post_recovery_match ? "Verified" : "Not verified"}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500">Recovery unavailable for this image.</p>
            )}
          </Section>

          {/* ===== BLOCKCHAIN AUDIT ===== */}
          <Section title="Blockchain Forensic Audit Trail" icon={ScrollText} accent="text-cyan-400"
            right={
              <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-800 border border-slate-700 text-slate-300">
                Local Blockchain Simulation
              </span>
            }>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Demo lifecycle timeline (real runtime events) */}
              <div className="space-y-1.5">
                <div className="text-[9px] text-slate-600 font-bold uppercase">Proof Event Timeline (this analysis)</div>
                {[
                  { ev: "Image Registered", ok: true, detail: `${result.image_id} (demonstration dataset)` },
                  { ev: "Integrity Verified", ok: true, detail: `SHA-3 computed: ${result.sha3.trusted_original.slice(0, 12)}…` },
                  { ev: "Tamper Detected", ok: !result.sha3.match, detail: result.sha3.status },
                  { ev: "Region Localized", ok: result.ai.bounding_boxes.length > 0, detail: `${result.ai.bounding_boxes.length} region(s)` },
                  {
                    ev: "Risk Assessed", ok: typeof result.risk?.total_tamper_risk_score === "number",
                    detail: typeof result.risk?.total_tamper_risk_score === "number"
                      ? `${result.risk?.category ?? "category not reported"} (${result.risk.total_tamper_risk_score.toFixed(1)})`
                      : "No risk assessment on record",
                  },
                  { ev: "Image Quarantined", ok: result.risk?.category === "HIGH", detail: result.risk?.category === "HIGH" ? "High-risk state" : "Not triggered" },
                  { ev: "Recovery Executed", ok: !!m && m.rois.length >= 0, detail: m ? `${m.rois.length} ROI(s) restored` : "Unavailable" },
                  { ev: "Recovery Verified", ok: !!m?.post_recovery_match, detail: m ? (m.post_recovery_match ? "SHA-3 MATCH" : "SHA-3 MISMATCH") : "Unavailable" },
                  { ev: "Blockchain Recorded", ok: !!audit?.tx_hash, detail: audit?.tx_hash ? `Block #${audit.block_index}` : "Not recorded" },
                ].map((row, i) => (
                  <div key={i} className="flex items-start gap-2 bg-slate-950/50 rounded-lg p-2 border border-slate-900">
                    {row.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                      : <XCircle className="h-3.5 w-3.5 text-slate-600 mt-0.5 shrink-0" />}
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold text-slate-300">{row.ev}</div>
                      <div className="text-[9px] font-mono text-slate-600 break-all">{row.detail}</div>
                    </div>
                  </div>
                ))}
                {audit?.tx_hash && (
                  <div className="bg-cyan-950/20 border border-cyan-800/40 rounded-lg p-2.5">
                    <div className="text-[9px] font-bold text-cyan-400 uppercase mb-1">Recorded Transaction</div>
                    <div className="text-[9px] font-mono text-slate-400 break-all space-y-0.5">
                      <div>TX: {audit.tx_hash}</div>
                      <div>Block: #{audit.block_index}</div>
                      <div>Time: {audit.timestamp ? new Date(audit.timestamp).toLocaleString() : "Event data unavailable"}</div>
                      <div>Implementation: {audit.implementation}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Real ledger blocks */}
              <div className="space-y-1.5">
                <div className="text-[9px] text-slate-600 font-bold uppercase">Ledger Blocks ({blocks.length} recorded)</div>
                <div className="max-h-72 overflow-y-auto space-y-1">
                  {blocks.length === 0 && <div className="text-[10px] text-slate-600">No blocks recorded yet.</div>}
                  {[...blocks].reverse().slice(0, 12).map(b => (
                    <div key={b.id} className="bg-slate-950/50 rounded-lg p-2 border border-slate-900 text-[9px] font-mono">
                      <span className="text-cyan-500">#{b.block_index}</span>{" "}
                      <span className="text-slate-400">{b.type}</span>{" "}
                      <span className="text-slate-600">
                        {b.timestamp ? new Date(b.timestamp).toLocaleString() : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-slate-900/40 border border-slate-800/60 rounded-xl p-3">
              <div className="text-[10px] font-bold text-cyan-300 mb-1">WHAT DOES BLOCKCHAIN PROVE?</div>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Blockchain provides an auditable record of image integrity, tampering, recovery, and verification
                events. It preserves the security-event history and provenance references. Blockchain does not
                itself detect the tampered pixels — the AI forensic system performs localization.
              </p>
              <p className="text-[10px] text-amber-500/90 mt-1.5 leading-relaxed">
                Implementation status: this project currently runs a <b>Local Blockchain Simulation</b>
                (proof-of-work Python ledger), not a public mainnet deployment.
              </p>
            </div>
          </Section>
        </>
      )}

      {/* ===== SECURITY LIFECYCLE FLOW (visual explanation) ===== */}
      {(result || ev) && (
        <Section title="Complete Security Lifecycle" icon={Workflow} accent="text-indigo-400">
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {SECURITY_FLOW.map((s, i) => (
              <React.Fragment key={s}>
                <span className="px-2 py-1.5 rounded-lg bg-indigo-950/30 border border-indigo-900/50 text-[9px] font-bold text-indigo-300">
                  {s}
                </span>
                {i === 4 && <span className="text-[10px] font-bold text-red-400 px-1">MISMATCH ↓</span>}
                {i < SECURITY_FLOW.length - 1 && i !== 4 && <span className="text-slate-600">↓</span>}
              </React.Fragment>
            ))}
          </div>
          <p className="text-[10px] text-slate-600 text-center">
            Visual explanation of the architecture — not fabricated runtime data.
          </p>
        </Section>
      )}

      {/* ===== PROOF SUMMARY — REAL CLINICAL STUDY ===== */}
      {ev && (
        <Section title="Integrity Proof Summary" icon={CheckCircle2} accent="text-emerald-400"
          right={
            <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-800 border border-slate-700 text-slate-300">
              Image ID {ev.image_id} · {integrityStatus}
            </span>}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[
              ["Clinical study loaded", true],
              ["Live preview retrieved", previewState === "ready"],
              ["SHA-3 recomputed at runtime", !!ev.current_hash],
              ["Trusted hash comparison completed", typeof ev.hash_match === "boolean"],
              ["Digital Integrity Twin read", ditAvailable],
              ["AI forensic report on record", !!(aiForensics && aiForensics.analyzed === true)],
              ["Region(s) localized", regionCount > 0],
              ["Risk / trust assessment on record", typeof ev.risk_score === "number" || typeof ev.trust_score === "number"],
              ["Blockchain transaction recorded", !!ev.blockchain_tx_hash],
              ["Recovery record on record", !!ev.recovery],
              ["Forensic report on record", !!ev.forensic_report_status],
              ["Audit events returned", Array.isArray(ev.audit_events) && ev.audit_events.length > 0],
            ].map(([label, ok]) => (
              <div key={String(label)} className="flex items-center gap-2 bg-slate-950/50 rounded-lg p-2.5 border border-slate-900">
                {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  : <span className="w-3.5 h-3.5 rounded-full border border-slate-700 shrink-0" />}
                <span className={`text-[11px] ${ok ? "text-slate-300 font-medium" : "text-slate-600"}`}>
                  {String(label)}
                </span>
                {!ok && <span className="text-[9px] text-slate-600 ml-auto">○ Not on record</span>}
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 bg-slate-900/40 rounded-xl p-3 border border-slate-800/40">
            <Info className="h-3.5 w-3.5 text-slate-600 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-600 leading-relaxed">
              Every value above comes from GET /api/images/{ev.image_id}/integrity-evidence, the digital-twin endpoint
              and the live preview/heatmap responses. Absent records are reported as "not on record" or N/A — nothing on
              this page is fabricated. Academic research prototype — not clinically validated.
            </p>
          </div>
        </Section>
      )}

      {/* ===== PROOF SUMMARY — DEMONSTRATION SAMPLE ===== */}
      {result && (
        <Section title="Integrity Proof Summary" icon={CheckCircle2} accent="text-emerald-400">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[
              ["Original image identified", !!result.images.original],
              ["Trusted SHA-3 generated", !!result.sha3.trusted_original],
              ["Current image verified", result.sha3.match === true],
              ["Tamper detected", !result.sha3.match],
              ["Suspicious region localized", result.ai.bounding_boxes.length > 0],
              ["Ground truth available", !!result.ground_truth.mask_base64],
              ["AI prediction available", !!result.prediction.mask_base64],
              ["Grad-CAM available", result.grad_cam.available],
              ["Risk assessed", result.risk?.category !== undefined],
              ["Image quarantined (risk state)", result.risk?.category === "HIGH"],
              ["Recovery performed", !!m && m.rois.length > 0],
              ["Recovery verified", !!m?.post_recovery_match],
              ["Blockchain audit recorded", !!audit?.tx_hash],
            ].map(([label, ok]) => (
              <div key={String(label)} className="flex items-center gap-2 bg-slate-950/50 rounded-lg p-2.5 border border-slate-900">
                {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  : <span className="w-3.5 h-3.5 rounded-full border border-slate-700 shrink-0" />}
                <span className={`text-[11px] ${ok ? "text-slate-300 font-medium" : "text-slate-600"}`}>
                  {String(label)}
                </span>
                {!ok && <span className="text-[9px] text-slate-600 ml-auto">○ Not available</span>}
              </div>
            ))}
          </div>
          <div className="flex items-start gap-2 bg-slate-900/40 rounded-xl p-3 border border-slate-800/40">
            <Info className="h-3.5 w-3.5 text-slate-600 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-600 leading-relaxed">
              SHA-3 = cryptographic integrity evidence · DIT = integrity state tracking · AI localization = forensic
              region prediction · Ground Truth = controlled experimental reference · Grad-CAM = model explainability.
              This summary is generated from a <b>demonstration sample</b> of the synthetic forensic dataset — switch to
              "Recent Doctor Uploads" to prove a real uploaded study. Academic research prototype — not clinically
              validated. All values are computed at runtime from actual image data, backend responses, and model output.
            </p>
          </div>
        </Section>
      )}
    </div>
  );
}
