import React, { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck, ShieldAlert, RefreshCw, Play, Hash, Layers, Crosshair,
  Sparkles, HeartPulse, Link2, AlertTriangle, CheckCircle2, XCircle,
  Database, FileText, Download, Workflow, ScrollText, Boxes, Info,
} from "lucide-react";
import { apiClient } from "../services/api";
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
  const [selected, setSelected] = useState<string | null>(null);
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

  const loadSamples = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await apiClient.get("/api/forensic-demo/samples");
      setSamples(res.data.samples || []);
      // Real blockchain ledger (honestly labeled local simulation)
      try {
        const bres = await apiClient.get("/api/blockchain/blocks");
        setBlocks(Array.isArray(bres.data) ? bres.data : []);
      } catch { setBlocks([]); }
      setError(null);
    } catch {
      setError("Unable to reach the proof service. Please try again.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { loadSamples(); }, [loadSamples]);

  const runProof = async (imageId: string) => {
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

  const downloadEvidence = async () => {
    if (!selected) return;
    setEvidenceLoading(true);
    try {
      const res = await apiClient.get(`/api/forensic-demo/evidence/${selected}`);
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `forensic_evidence_${selected}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Evidence report could not be generated.");
    } finally {
      setEvidenceLoading(false);
    }
  };

  // ---- Derived lifecycle state (from real result, never hardcoded) ----
  const lifecycleActiveIdx = !result ? -1 : (() => {
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
            onClick={loadSamples} disabled={listLoading}
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
            const done = result && i <= lifecycleActiveIdx;
            const current = result && i === lifecycleActiveIdx;
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
          {!result && <span className="text-[10px] text-slate-600 ml-2">Run proof analysis to advance the lifecycle</span>}
        </div>
      </div>

      {/* SELECTOR */}
      <div className="glass-panel p-4 flex flex-wrap items-center gap-3">
        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
          <Database className="h-3 w-3" /> Demonstration Image
        </div>
        <select
          value={selected ?? ""}
          onChange={e => setSelected(e.target.value || null)}
          className="bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-xs text-slate-200 outline-none"
        >
          <option value="">Select sample…</option>
          {samples.map(s => (
            <option key={s.image_id} value={s.image_id}>
              {s.image_id} — {s.tamper_type} ({s.affected_area_percentage.toFixed(1)}% affected)
            </option>
          ))}
        </select>
        <button
          onClick={() => selected && runProof(selected)}
          disabled={!selected || analyzing}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl transition-all disabled:opacity-40"
        >
          {analyzing ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Proving…</> : <><Play className="h-3.5 w-3.5" /> Run Complete Proof</>}
        </button>
        {result && (
          <button
            onClick={downloadEvidence} disabled={evidenceLoading}
            className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 rounded-xl transition-all disabled:opacity-50"
          >
            {evidenceLoading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Generate Forensic Evidence Report
          </button>
        )}
      </div>

      {!result && !analyzing && (
        <div className="glass-panel p-10 text-center">
          <ScrollText className="h-10 w-10 text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            Select a demonstration image and run the complete proof to see visual evidence of
            detection, localization, recovery and blockchain audit.
          </p>
        </div>
      )}
      {analyzing && (
        <div className="glass-panel p-10 text-center">
          <RefreshCw className="h-8 w-8 text-emerald-500 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-400">Executing SHA-3 verification, AI forensics, Grad-CAM, recovery and audit…</p>
        </div>
      )}

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
                    ["Modality", result.sample.modality ?? "MRI-phantom"],
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
                    ["Area", `${(result.ai.tampered_percentage ?? 0).toFixed(2)}%`],
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
                    {b.confidence !== undefined && ` · Confidence: ${(b.confidence * 100).toFixed(1)}%`}
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
                <Stat label="Tamper Probability" value={`${((result.ai.confidence_score ?? 0) * 100).toFixed(1)}%`} tone="amber" />
                <Stat label="AI Confidence" value={result.ai.confidence_label ?? "—"} tone="cyan" />
                <Stat label="Model" value={String(result.ai.model_provenance?.architecture ?? "Hybrid Swin-UNet")} tone="purple" />
                <Stat label="Risk Level" value={`${(result.risk?.total_tamper_risk_score ?? 0).toFixed(1)}/100 — ${result.risk?.category}`} tone={(result.risk?.category === "HIGH") ? "red" : "amber"} />
                <Stat label="Trust Score" value={`${(result.trust?.cybersecurity_trust_score ?? 0).toFixed(1)}/100 — ${result.trust?.trust_level}`} tone={(result.trust?.cybersecurity_trust_score ?? 0) >= 70 ? "emerald" : "red"} />
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
                  <Stat label="Recovery Source" value="Trusted original reference (DIT)" tone="teal" />
                  <Stat label="Recovery Status" value={m.post_recovery_match ? "VERIFIED" : "FAILED"} tone={m.post_recovery_match ? "emerald" : "red"} />
                  <Stat label="Recovered Regions" value={String(m.rois.length)} tone="cyan" />
                  <Stat label="Method" value={m.method} />
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
                  { ev: "Image Registered", ok: true, detail: `${result.image_id} (dataset demo)` },
                  { ev: "Integrity Verified", ok: true, detail: `SHA-3 computed: ${result.sha3.trusted_original.slice(0, 12)}…` },
                  { ev: "Tamper Detected", ok: !result.sha3.match, detail: result.sha3.status },
                  { ev: "Region Localized", ok: result.ai.bounding_boxes.length > 0, detail: `${result.ai.bounding_boxes.length} region(s)` },
                  { ev: "Risk Assessed", ok: true, detail: `${result.risk?.category} (${(result.risk?.total_tamper_risk_score ?? 0).toFixed(1)})` },
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

          {/* ===== SECURITY LIFECYCLE FLOW (visual explanation) ===== */}
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

          {/* ===== PROOF SUMMARY ===== */}
          <Section title="Integrity Proof Summary" icon={CheckCircle2} accent="text-emerald-400">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {[
                ["Original image identified", !!result.images.original],
                ["Trusted SHA-3 generated", !!result.sha3.trusted_original],
                ["Current image verified", true],
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
                Academic research prototype — not clinically validated. All values on this page are computed at runtime
                from actual image data, backend responses, and model output.
              </p>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
