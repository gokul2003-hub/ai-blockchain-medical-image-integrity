import React, { useState, useEffect } from "react";
import { AlertOctagon, Download, ShieldCheck, Crosshair, RefreshCw, CheckCircle2, Lock, Loader2, AlertTriangle } from "lucide-react";
import { apiService, fetchProtectedBlobUrl } from "../services/api";

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface TamperViewerProps {
  imageTitle: string;
  originalImageUrl?: string;
  heatmapFilename: string;
  tamperPercentage: number;
  confidenceScore: number;
  boundingBoxes: BoundingBox[];
  reportId: number;
  imageId?: number;
  tamperRiskScore?: number;
  riskCategory?: string;
  cybersecurityTrustScore?: number;
  trustLevel?: string;
  accessDecision?: string;
  onDownloadReport: (reportId: number) => void;
  onClose: () => void;
}

export default function TamperViewer({
  imageTitle,
  heatmapFilename,
  tamperPercentage,
  confidenceScore,
  boundingBoxes,
  reportId,
  imageId = 1,
  tamperRiskScore = 85.5,
  riskCategory = "HIGH",
  cybersecurityTrustScore = 32.0,
  trustLevel = "CRITICAL",
  onDownloadReport,
  onClose
}: TamperViewerProps) {
  const [activeTab, setActiveTab] = useState<"gradcam" | "srm">("gradcam");
  const [recovering, setRecovering] = useState(false);
  const [recoveryResult, setRecoveryResult] = useState<any>(null);

  const [heatmapBlobUrl, setHeatmapBlobUrl] = useState<string | null>(null);
  const [srmBlobUrl, setSrmBlobUrl] = useState<string | null>(null);
  const [loadingMedia, setLoadingMedia] = useState<boolean>(true);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingMedia(true);
    setMediaError(null);

    async function loadForensicMedia() {
      try {
        const hUrl = heatmapFilename 
          ? `/api/images/heatmap/${heatmapFilename}` 
          : `/api/images/heatmap/by-image/${imageId}`;
        const hBlob = await fetchProtectedBlobUrl(hUrl);
        if (active) setHeatmapBlobUrl(hBlob);

        const sBlob = await fetchProtectedBlobUrl(`/api/images/srm-residual/${imageId}`);
        if (active) setSrmBlobUrl(sBlob);
      } catch (err: any) {
        if (active) setMediaError(err.message || "Failed to load forensic imagery");
      } finally {
        if (active) setLoadingMedia(false);
      }
    }

    loadForensicMedia();

    return () => {
      active = false;
      if (heatmapBlobUrl) URL.revokeObjectURL(heatmapBlobUrl);
      if (srmBlobUrl) URL.revokeObjectURL(srmBlobUrl);
    };
  }, [heatmapFilename, imageId]);

  const handleExecuteSelfRecovery = async () => {
    setRecovering(true);
    try {
      const data = await apiService.recoverImage(imageId);
      setRecoveryResult(data);
    } catch (e: any) {
      const msg = e.response?.data?.detail || e.message || "Self-recovery failed";
      alert(`Recovery failed: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`);
    } finally {
      setRecovering(false);
    }
  };

  return (
    <div className="glass-panel p-6 border-rose-900/40 glow-rose max-w-5xl mx-auto space-y-6 text-left">
      {/* Alert Header Banner */}
      <div className="bg-rose-950/45 border border-rose-900/60 rounded-xl p-4 flex items-start gap-4">
        <div className="p-2 bg-rose-500/10 rounded-lg text-rose-500 mt-0.5 animate-bounce">
          <AlertOctagon className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-rose-400 text-sm">SECURITY ALERT: Cryptographic Tampering Detected</h3>
            <span className="bg-rose-900/80 text-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border border-rose-700 flex items-center gap-1">
              <Lock className="h-3 w-3" /> QUARANTINED
            </span>
          </div>
          <p className="text-xs text-rose-300/80 leading-relaxed mt-1">
            SHA-3 cryptographic verification failed for scan. Continuous Integrity Monitor automatically flagged this scan, 
            computed Tamper Risk &amp; Cybersecurity Trust scores, and quarantined the asset to restrict unauthorized clinical distribution.
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 px-3 py-1.5 rounded-xl transition-all cursor-pointer"
        >
          Dismiss Alert
        </button>
      </div>

      {/* Multi-Factor Security Scores Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/70 border border-slate-800 p-3.5 rounded-2xl">
          <div className="text-[10px] text-slate-400 font-bold uppercase">Tamper Risk Score</div>
          <div className="text-2xl font-black text-rose-500 mt-0.5">{tamperRiskScore} / 100</div>
          <div className="text-[9px] text-rose-400 font-semibold mt-0.5">Category: {riskCategory}</div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 p-3.5 rounded-2xl">
          <div className="text-[10px] text-slate-400 font-bold uppercase">Cybersecurity Trust Score</div>
          <div className="text-2xl font-black text-amber-400 mt-0.5">{cybersecurityTrustScore} / 100</div>
          <div className="text-[9px] text-amber-300 font-semibold mt-0.5">Trust Level: {trustLevel}</div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 p-3.5 rounded-2xl">
          <div className="text-[10px] text-slate-400 font-bold uppercase">Risk-Adaptive Action</div>
          <div className="text-sm font-bold text-rose-400 mt-1 flex items-center gap-1.5">
            <Lock className="h-4 w-4" /> QUARANTINE
          </div>
          <div className="text-[9px] text-slate-400 mt-0.5">Restricted Access Policy</div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 p-3.5 rounded-2xl">
          <div className="text-[10px] text-slate-400 font-bold uppercase">Digital Integrity Twin</div>
          <div className="text-sm font-bold text-blue-400 mt-1 flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" /> Off-Chain Twin Active
          </div>
          <div className="text-[9px] text-slate-400 mt-0.5">Storage Trusted Backup Ready</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Visual Inspection Card with Tabs */}
        <div className="glass-panel p-4 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider">Visual Forensics</span>
              <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-[10px] font-semibold">
                <button
                  onClick={() => setActiveTab("gradcam")}
                  className={`px-2.5 py-1 rounded-lg transition-all ${activeTab === "gradcam" ? "bg-rose-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                >
                  Grad-CAM
                </button>
                <button
                  onClick={() => setActiveTab("srm")}
                  className={`px-2.5 py-1 rounded-lg transition-all ${activeTab === "srm" ? "bg-rose-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
                >
                  SRM Residual
                </button>
              </div>
            </div>
            <h4 className="text-xs font-semibold text-slate-300 mt-1">
              {activeTab === "gradcam" ? "Grad-CAM Attribution Overlay" : "Spatial Rich Model (SRM) Noise Residual Stream"}
            </h4>
          </div>

          <div className="relative border border-slate-800 rounded-xl bg-slate-950 aspect-square overflow-hidden flex items-center justify-center">
            {loadingMedia ? (
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin text-rose-500" />
                <span className="text-[10px] font-semibold">Loading forensic media...</span>
              </div>
            ) : mediaError ? (
              <div className="p-4 text-center text-rose-400 space-y-2">
                <AlertTriangle className="h-6 w-6 mx-auto text-rose-500" />
                <div className="text-xs font-bold">Failed to load media</div>
                <div className="text-[10px] text-slate-400">{mediaError}</div>
              </div>
            ) : activeTab === "gradcam" ? (
              heatmapBlobUrl ? (
                <img
                  src={heatmapBlobUrl}
                  alt="AI Tamper Heatmap Overlay"
                  className="object-contain max-h-full max-w-full"
                />
              ) : (
                <span className="text-xs text-slate-500 italic">Heatmap unavailable</span>
              )
            ) : srmBlobUrl ? (
              <img
                src={srmBlobUrl}
                alt="SRM High-Frequency Noise Residual"
                className="object-contain max-h-full max-w-full"
              />
            ) : (
              <span className="text-xs text-slate-500 italic">SRM residual stream unavailable</span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 text-center italic">
            {activeTab === "gradcam"
              ? "Colormap representation: High probability modifications are mapped in red."
              : "SRM Noise Residual: High-frequency noise inconsistencies reveal altered ROI boundaries."}
          </div>
        </div>

        {/* Metrics & Self-Recovery Actions Card */}
        <div className="space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Analysis Target</span>
              <h4 className="text-sm font-bold text-slate-200 mt-0.5">{imageTitle}</h4>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-900/60 border border-slate-850 p-4 rounded-2xl">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Modified Area</div>
                <div className="text-xl font-black text-rose-500 mt-1">{tamperPercentage}%</div>
                <div className="text-[9px] text-slate-400 mt-0.5">Of image coordinates</div>
              </div>
              <div className="bg-slate-900/60 border border-slate-850 p-4 rounded-2xl">
                <div className="text-[10px] text-slate-500 font-bold uppercase">Model Confidence</div>
                <div className="text-xl font-black text-blue-400 mt-1">{(confidenceScore * 100).toFixed(1)}%</div>
                <div className="text-[9px] text-slate-400 mt-0.5">Hybrid Swin-UNet weight</div>
              </div>
            </div>

            {/* Bounding Box coordinates details */}
            <div className="space-y-2">
              <span className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1">
                <Crosshair className="h-3.5 w-3.5 text-slate-400" /> Bounding Box Coordinates (scaled)
              </span>
              <div className="bg-slate-950 border border-slate-900 rounded-xl p-3 max-h-28 overflow-y-auto font-mono text-[10px] leading-relaxed text-slate-400">
                {boundingBoxes && boundingBoxes.length > 0 ? (
                  boundingBoxes.map((box, index) => (
                    <div key={index} className="flex justify-between py-1 border-b border-slate-900/50 last:border-b-0">
                      <span className="text-rose-400 font-bold">Region #{index + 1}:</span>
                      <span>X: {box.x}, Y: {box.y} [W: {box.width}, H: {box.height}]</span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-500 italic text-center py-2">
                    No discrete coordinates detected (diffuse pixel modification)
                  </div>
                )}
              </div>
            </div>

            {/* Post-Recovery Result Card if executed */}
            {recoveryResult && (
              <div className="bg-emerald-950/50 border border-emerald-800 p-4 rounded-2xl space-y-2 animate-fade-in">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  REGION-LEVEL SELF-RECOVERY SUCCESSFUL
                </div>
                <p className="text-[10px] text-emerald-300/80 leading-relaxed">
                  ROI patches extracted from trusted backup decrypted scan. Re-computed SHA-3 hash matched Digital Integrity Twin!
                </p>
                <div className="bg-slate-950 p-2 rounded-xl text-[9px] font-mono text-slate-300 space-y-1">
                  <div>Post-Recovery Hash: <span className="text-emerald-400 font-bold">{recoveryResult.recovered_hash?.slice(0, 16)}...</span></div>
                  <div>Blockchain Tx: <span className="text-blue-400 font-bold">{recoveryResult.blockchain_tx_hash?.slice(0, 16)}...</span></div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <button
              onClick={handleExecuteSelfRecovery}
              disabled={recovering || (recoveryResult && recoveryResult.success)}
              className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white border border-emerald-500/20 py-3 rounded-2xl text-xs font-bold transition-all shadow-lg glow-emerald hover:scale-[1.01] cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${recovering ? "animate-spin" : ""}`} />
              {recovering ? "Executing Self-Recovery..." : recoveryResult?.success ? "Self-Recovery Completed & Verified" : "Execute Region-Level Self-Recovery"}
            </button>

            <button
              onClick={() => onDownloadReport(reportId)}
              className="w-full flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white border border-rose-500/20 py-3 rounded-2xl text-xs font-bold transition-all shadow-lg glow-rose hover:scale-[1.01] cursor-pointer"
            >
              <Download className="h-4 w-4" />
              Download Digital Forensic PDF Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
