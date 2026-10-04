import React, { useState, useEffect, useCallback } from "react";
import {
  FlaskConical, Play, RefreshCw, ShieldCheck, ShieldAlert, Hash,
  BrainCircuit, Crosshair, Activity, HeartPulse, Layers, Sparkles,
  AlertTriangle, CheckCircle2, XCircle, Database,
} from "lucide-react";
import { apiClient } from "../services/api";
import StatusBadge from "../components/StatusBadge";

interface ForensicStudioProps {
  token: string;
}

interface Sample {
  image_id: string;
  tamper_type: string;
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
  sha3: {
    trusted_original: string;
    current: string;
    match: boolean;
    status: string;
    explanation: string;
  };
  dit_state: string;
  ai: {
    tamper_detected: boolean;
    tampered_percentage: number;
    confidence_score: number;
    confidence_label: string;
    model_provenance?: Record<string, any>;
    regions: any[];
    bounding_boxes: any[];
    explanation: string;
  };
  ground_truth: {
    region: { x: number; y: number; width: number; height: number };
    affected_area_percentage: number;
    tamper_type: string;
    mask_base64: string;
  };
  prediction: {
    mask_base64: string;
    overlay_base64: string;
    metrics: Record<string, any>;
  };
  grad_cam: {
    available: boolean;
    heatmap_base64: string | null;
    explanation: string;
  };
  risk: Record<string, any>;
  trust: Record<string, any>;
  recovery: {
    available: boolean;
    method: string;
    rois: any[];
    recovered_image_base64: string;
    original_sha3: string;
    tampered_sha3: string;
    recovered_sha3: string;
    post_recovery_match: boolean;
    verification_passed: boolean;
  };
  images: { original: string; tampered: string };
}

type ViewTab = "original" | "tampered" | "groundtruth" | "aimask" | "overlay" | "gradcam" | "recovered";

const Stat = ({ label, value, tone = "slate" }: { label: string; value: React.ReactNode; tone?: string }) => (
  <div className="bg-slate-900/60 rounded-xl p-3">
    <div className="text-[9px] text-slate-600 font-bold uppercase mb-1">{label}</div>
    <div className={`text-xs font-semibold text-${tone}-300 break-all`}>{value}</div>
  </div>
);

export default function ForensicStudio({ token }: ForensicStudioProps) {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ViewTab>("original");
  const [zoom, setZoom] = useState(1);
  const [opacity, setOpacity] = useState(0.6);

  const loadSamples = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await apiClient.get("/api/forensic-demo/samples");
      setSamples(res.data.samples || []);
      setError(null);
    } catch (e: any) {
      setError("Unable to reach the forensic dataset service. Please try again.");
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => { loadSamples(); }, [loadSamples]);

  const runAnalysis = async (imageId: string) => {
    setAnalyzing(true);
    setError(null);
    setResult(null);
    setTab("original");
    try {
      const res = await apiClient.post(`/api/forensic-demo/analyze/${imageId}`);
      setResult(res.data.result);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Forensic analysis could not be completed.");
    } finally {
      setAnalyzing(false);
    }
  };

  const tabs: { key: ViewTab; label: string; icon: React.ElementType; available: boolean }[] = result ? [
    { key: "original", label: "Original", icon: ShieldCheck, available: true },
    { key: "tampered", label: "Tampered", icon: ShieldAlert, available: true },
    { key: "groundtruth", label: "Ground Truth", icon: Layers, available: true },
    { key: "aimask", label: "AI Mask", icon: Crosshair, available: true },
    { key: "overlay", label: "Overlay", icon: Activity, available: true },
    { key: "gradcam", label: "Grad-CAM", icon: Sparkles, available: result.grad_cam.available },
    { key: "recovered", label: "Recovered", icon: HeartPulse, available: true },
  ] : [];

  const currentSrc = (() => {
    if (!result) return null;
    switch (tab) {
      case "original": return result.images.original;
      case "tampered": return result.images.tampered;
      case "groundtruth": return result.ground_truth.mask_base64;
      case "aimask": return result.prediction.mask_base64;
      case "overlay": return result.prediction.overlay_base64;
      case "gradcam": return result.grad_cam.heatmap_base64;
      case "recovered": return result.recovery.recovered_image_base64;
      default: return null;
    }
  })();

  const metrics = result?.prediction.metrics;
  const riskScore = result?.risk?.total_tamper_risk_score;
  const riskCat = result?.risk?.category;
  const trustScore = result?.trust?.cybersecurity_trust_score;
  const trustLevel = result?.trust?.trust_level;

  return (
    <div className="w-full space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-cyan-400" />
            AI Tamper Forensics Studio
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            SHA-3 proof · Digital Integrity Twin · Hybrid Swin-UNet localization · Grad-CAM · Self-recovery
          </p>
        </div>
        <button
          onClick={loadSamples}
          disabled={listLoading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl transition-all disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${listLoading ? "animate-spin" : ""}`} />
          Refresh Dataset
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-950/40 border border-red-800/50 text-red-300 text-xs flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        {/* Dataset Demo Selector */}
        <div className="glass-panel p-4 space-y-3">
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <Database className="h-3 w-3" /> Forensic Dataset Demo
          </div>

          {listLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 bg-slate-800/60 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : samples.length === 0 ? (
            <div className="text-xs text-slate-600 text-center py-4">No samples available</div>
          ) : (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {samples.map(s => (
                <button
                  key={s.image_id}
                  onClick={() => setSelected(s.image_id)}
                  className={`w-full flex flex-col gap-1 px-2.5 py-2 rounded-lg text-left text-xs transition-all cursor-pointer ${
                    selected === s.image_id
                      ? "bg-cyan-600/20 border border-cyan-600/40 text-slate-200"
                      : "hover:bg-slate-800/60 text-slate-400 border border-transparent"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{s.image_id}</span>
                    <span className="text-[9px] text-amber-400">{s.affected_area_percentage.toFixed(1)}%</span>
                  </div>
                  <div className="text-[9px] text-slate-600">
                    {s.tamper_type} · {s.width}×{s.height} · {s.split}
                  </div>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => selected && runAnalysis(selected)}
            disabled={!selected || analyzing}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-bold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {analyzing ? (
              <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Analyzing…</>
            ) : (
              <><Play className="h-3.5 w-3.5" /> Run Forensic Analysis</>
            )}
          </button>

          {selected && !result && !analyzing && (
            <div className="text-[10px] text-slate-600 leading-relaxed">
              Runs the full chain on the selected sample: SHA-3 → DIT → AI forensics → Grad-CAM → ground-truth comparison → risk/trust → recovery.
            </div>
          )}
        </div>

        {/* Main Studio */}
        <div className="xl:col-span-3 space-y-4">
          {!result && !analyzing && (
            <div className="glass-panel p-10 text-center">
              <BrainCircuit className="h-10 w-10 text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-500">
                Select a dataset sample and run forensic analysis to view the complete proof chain.
              </p>
            </div>
          )}

          {analyzing && (
            <div className="glass-panel p-10 text-center">
              <RefreshCw className="h-8 w-8 text-cyan-500 animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-400">
                Running SHA-3 verification, model inference, Grad-CAM and recovery…
              </p>
            </div>
          )}

          {result && (
            <>
              {/* SHA-3 Proof */}
              <div className={`glass-panel p-4 border ${result.sha3.match ? "border-emerald-700/40" : "border-red-700/50"}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Hash className="h-4 w-4 text-cyan-400" /> SHA-3 Integrity Proof
                  </h3>
                  <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${
                    result.sha3.match
                      ? "bg-emerald-500/15 text-emerald-400 border border-emerald-600/30"
                      : "bg-red-500/15 text-red-400 border border-red-600/40 animate-pulse"
                  }`}>
                    {result.sha3.match ? "MATCH" : "MISMATCH — TAMPER DETECTED"}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                  <div className="bg-slate-950/60 rounded-lg p-2.5">
                    <div className="text-[9px] text-slate-600 font-bold uppercase mb-1">Original (Trusted) SHA-3</div>
                    <div className="text-[10px] font-mono text-emerald-400 break-all">{result.sha3.trusted_original}</div>
                  </div>
                  <div className="bg-slate-950/60 rounded-lg p-2.5">
                    <div className="text-[9px] text-slate-600 font-bold uppercase mb-1">Current / Tampered SHA-3</div>
                    <div className="text-[10px] font-mono text-red-400 break-all">{result.sha3.current}</div>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">{result.sha3.explanation}</p>

                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[9px] text-slate-600 font-bold uppercase">Digital Integrity Twin:</span>
                  <StatusBadge status={result.dit_state} size="xs" />
                </div>
              </div>

              {/* Viewer Tabs */}
              <div className="glass-panel overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-800/60 flex items-center gap-1.5 flex-wrap bg-slate-900/60">
                  {tabs.map(t => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      disabled={!t.available}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                        tab === t.key
                          ? "bg-cyan-600 text-white"
                          : t.available
                            ? "bg-slate-800/60 text-slate-400 hover:text-slate-200"
                            : "bg-slate-900 text-slate-700 cursor-not-allowed"
                      }`}
                    >
                      <t.icon className="h-3 w-3" />
                      {t.label}
                    </button>
                  ))}
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => setZoom(z => Math.min(3, z + 0.25))} className="px-2 py-1 rounded bg-slate-800 text-slate-400 text-[10px] hover:text-slate-200">＋</button>
                    <button onClick={() => setZoom(z => Math.max(0.5, z - 0.25))} className="px-2 py-1 rounded bg-slate-800 text-slate-400 text-[10px] hover:text-slate-200">－</button>
                    <button onClick={() => setZoom(1)} className="px-2 py-1 rounded bg-slate-800 text-slate-400 text-[10px] hover:text-slate-200">Reset</button>
                  </div>
                </div>
                <div className="bg-black/70 h-80 flex items-center justify-center overflow-auto p-2">
                  {currentSrc ? (
                    <img
                      src={currentSrc}
                      alt={tab}
                      style={{ transform: `scale(${zoom})`, transition: "transform 0.15s" }}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <div className="text-xs text-slate-600">Grad-CAM unavailable for this analysis.</div>
                  )}
                </div>
                <div className="px-3 py-2 border-t border-slate-800/60 flex items-center gap-3">
                  <span className="text-[9px] text-slate-600 font-bold uppercase">Overlay opacity</span>
                  <input
                    type="range" min={0} max={1} step={0.05} value={opacity}
                    onChange={e => setOpacity(parseFloat(e.target.value))}
                    className="w-32 accent-cyan-500"
                  />
                  <span className="text-[10px] font-mono text-slate-500">{opacity.toFixed(2)}</span>
                </div>
              </div>

              {/* AI Result + GT vs Prediction */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="glass-panel p-4 space-y-3">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Crosshair className="h-4 w-4 text-purple-400" /> AI Forensic Analysis
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="Tamper Detected" value={result.ai.tamper_detected ? "YES" : "NO"} tone={result.ai.tamper_detected ? "red" : "emerald"} />
                    <Stat label="Tampered Area" value={`${(result.ai.tampered_percentage ?? 0).toFixed(2)} %`} tone="amber" />
                    <Stat label="Confidence" value={`${((result.ai.confidence_score ?? 0) * 100).toFixed(1)} %`} tone="cyan" />
                    <Stat label="Model" value={String(result.ai.model_provenance?.architecture ?? "Hybrid Swin-UNet")} tone="purple" />
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">{result.ai.explanation}</p>

                  {result.ai.bounding_boxes.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[9px] text-slate-600 font-bold uppercase">Predicted Regions</div>
                      {result.ai.bounding_boxes.map((b, i) => (
                        <div key={i} className="bg-slate-950/60 rounded-lg p-2 text-[10px] font-mono text-slate-400">
                          Region {i + 1} — X:{b.x} Y:{b.y} W:{b.width} H:{b.height}
                          {b.confidence !== undefined && ` · conf ${(b.confidence * 100).toFixed(1)}%`}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="glass-panel p-4 space-y-3">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-emerald-400" /> Ground Truth vs AI Prediction
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="GT Region (X,Y,W,H)" value={`${result.ground_truth.region.x}, ${result.ground_truth.region.y}, ${result.ground_truth.region.width}, ${result.ground_truth.region.height}`} tone="emerald" />
                    <Stat label="GT Affected Area" value={`${result.ground_truth.affected_area_percentage.toFixed(2)} %`} tone="emerald" />
                  </div>
                  {metrics && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Stat label="IoU" value={metrics.iou} tone="cyan" />
                      <Stat label="Dice" value={metrics.dice} tone="cyan" />
                      <Stat label="Precision" value={metrics.precision} tone="cyan" />
                      <Stat label="Recall" value={metrics.recall} tone="cyan" />
                    </div>
                  )}
                  <p className="text-[10px] text-slate-600">
                    Metrics are calculated live by comparing the AI predicted mask with the controlled ground-truth mask.
                  </p>
                </div>
              </div>

              {/* Risk / Trust / Grad-CAM */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="glass-panel p-4 space-y-2">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-amber-400" /> Risk & Trust
                  </h3>
                  <Stat label="Risk Score" value={`${(riskScore ?? 0).toFixed(1)} / 100 — ${riskCat}`} tone={riskCat === "HIGH" ? "red" : "amber"} />
                  <Stat label="Trust Score" value={`${(trustScore ?? 0).toFixed(1)} / 100 — ${trustLevel}`} tone={(trustScore ?? 0) >= 70 ? "emerald" : "red"} />
                  <Stat label="Integrity State" value={result.dit_state} tone={result.dit_state === "VERIFIED" ? "emerald" : "red"} />
                </div>

                <div className="glass-panel p-4 space-y-2">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-400" /> Grad-CAM
                  </h3>
                  {result.grad_cam.available ? (
                    <p className="text-[10px] text-slate-500 leading-relaxed">{result.grad_cam.explanation}</p>
                  ) : (
                    <p className="text-[10px] text-amber-500">Grad-CAM unavailable for this analysis.</p>
                  )}
                </div>

                <div className="glass-panel p-4 space-y-2">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <HeartPulse className="h-4 w-4 text-teal-400" /> Self-Recovery
                  </h3>
                  <div className="flex items-center gap-2">
                    {result.recovery.verification_passed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400" />
                    )}
                    <span className="text-xs font-semibold text-slate-300">
                      Post-Recovery SHA-3: {result.recovery.post_recovery_match ? "MATCH" : "MISMATCH"}
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-500 break-all space-y-0.5">
                    <div>Original:  {result.recovery.original_sha3.slice(0, 26)}…</div>
                    <div>Tampered:  {result.recovery.tampered_sha3.slice(0, 26)}…</div>
                    <div>Recovered: {result.recovery.recovered_sha3.slice(0, 26)}…</div>
                  </div>
                  <div className="text-[10px] text-slate-600">
                    ROIs restored: {result.recovery.rois.length} · Method: {result.recovery.method}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 bg-slate-900/40 rounded-xl p-3 border border-slate-800/40">
                <AlertTriangle className="h-3.5 w-3.5 text-slate-600 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-slate-600 leading-relaxed">
                  SHA-3 = cryptographic integrity evidence · DIT = integrity state tracking · AI localization = forensic
                  region prediction · Ground Truth = controlled experimental reference · Grad-CAM = model explainability ·
                  IoU/Dice = localization evaluation. AI forensic analysis identifies regions that are suspicious for
                  tampering; it does not prove malicious intent. Academic research prototype — not clinically validated.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
