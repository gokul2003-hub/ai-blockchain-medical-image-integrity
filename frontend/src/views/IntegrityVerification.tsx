import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ShieldCheck, ShieldAlert, ShieldX, ArrowDown, CheckCircle2, XCircle,
  RefreshCw, Images, AlertTriangle, ChevronLeft, FileText,
} from "lucide-react";
import { apiClient } from "../services/api";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";

interface IntegrityVerificationProps {
  token: string;
  selectedImageId: number | null;
  onSelectImage: (id: number) => void;
  onViewChange: (view: string) => void;
}

interface ImageRecord {
  id: number;
  title: string;
  image_type: string;
  original_hash: string;
  quarantine_status: boolean;
  created_at: string;
}

interface TamperDetail {
  status: "TAMPERED";
  tampered_percentage: number;
  confidence_score: number;
  bounding_boxes: { x: number; y: number; width: number; height: number }[];
  heatmap_filename: string;
  report_id: number;
  tamper_risk_score: number;
  risk_category: string;
  cybersecurity_trust_score: number;
  trust_level: string;
}

type VerifyResult =
  | { status: "VERIFIED"; imageBlob: string }
  | { status: "TAMPERED"; detail: TamperDetail }
  | { status: "ERROR"; message: string };

const FlowStep = ({ label, icon: Icon, active, done, failed }: { label: string; icon: React.ElementType; active?: boolean; done?: boolean; failed?: boolean }) => (
  <div className="flex flex-col items-center gap-1.5 relative">
    <div className={`h-10 w-10 rounded-xl flex items-center justify-center border-2 transition-all ${
      failed ? "bg-rose-500/20 border-rose-500 text-rose-400" :
      done   ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" :
      active ? "bg-blue-600/20 border-blue-500 text-blue-400 animate-pulse" :
               "bg-slate-900 border-slate-800 text-slate-600"
    }`}>
      <Icon className="h-4.5 w-4.5" />
    </div>
    <span className={`text-[9px] font-bold uppercase tracking-wider text-center ${
      failed ? "text-rose-400" : done ? "text-emerald-400" : active ? "text-blue-400" : "text-slate-600"
    }`}>{label}</span>
  </div>
);

export default function IntegrityVerification({ token, selectedImageId, onSelectImage, onViewChange }: IntegrityVerificationProps) {
  const [images, setImages]         = useState<ImageRecord[]>([]);
  const [imgSearch, setImgSearch]   = useState("");
  const [verifying, setVerifying]   = useState(false);
  const [result, setResult]         = useState<VerifyResult | null>(null);
  const [stepIndex, setStepIndex]   = useState(0);
  const [trustedHash, setTrustedHash] = useState("");
  const [verifiedAt, setVerifiedAt]   = useState("");
  const blobRef = useRef<string | null>(null);
  const { success, error: toastError } = useToast();

  const loadImages = useCallback(async () => {
    try {
      const res = await apiClient.get("/api/images/list");
      setImages(Array.isArray(res.data) ? res.data : []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadImages(); }, [loadImages]);

  const filteredImages = images.filter(img =>
    !imgSearch || img.title.toLowerCase().includes(imgSearch.toLowerCase()) || String(img.id).includes(imgSearch)
  );

  const runVerification = async () => {
    if (!selectedImageId) return;
    setVerifying(true);
    setResult(null);
    setStepIndex(1);
    setTrustedHash("");
    setVerifiedAt("");

    // Get trusted hash from list cache
    const img = images.find(i => i.id === selectedImageId);
    if (img) setTrustedHash(img.original_hash);

    try {
      // Step simulation
      await new Promise(r => setTimeout(r, 400)); setStepIndex(2);
      await new Promise(r => setTimeout(r, 400)); setStepIndex(3);
      await new Promise(r => setTimeout(r, 400)); setStepIndex(4);

      const res = await apiClient.get(`/api/images/download/${selectedImageId}`, {
        responseType: "arraybuffer",
      });

      setStepIndex(5);
      const blob = new Blob([res.data], { type: "image/png" });
      if (blobRef.current) URL.revokeObjectURL(blobRef.current);
      blobRef.current = URL.createObjectURL(blob);
      setVerifiedAt(new Date().toISOString());
      setResult({ status: "VERIFIED", imageBlob: blobRef.current });
      success("Integrity Verified", "SHA-3 hash matches blockchain record. Image is authentic.");
    } catch (err: any) {
      setStepIndex(5);

      if (err.response?.status === 409) {
        // ─── Robust 409 payload extraction ────────────────────────────────
        // When responseType is "arraybuffer", Axios always delivers error
        // response bodies as ArrayBuffer — even when the server sends JSON.
        // We must decode it to a UTF-8 string first, then JSON.parse it.
        let parsedDetail: TamperDetail | null = null;
        let parsedStatus: string | null = null;
        let processingMessage: string | null = null;

        try {
          let rawText: string;
          if (err.response.data instanceof ArrayBuffer) {
            rawText = new TextDecoder("utf-8").decode(err.response.data);
          } else if (typeof err.response.data === "string") {
            rawText = err.response.data;
          } else {
            // Axios parsed it already (edge case — shouldn't happen with arraybuffer)
            rawText = JSON.stringify(err.response.data);
          }

          const parsed = JSON.parse(rawText);
          // FastAPI wraps HTTPException body as { "detail": { ... } }
          const detail = parsed?.detail ?? parsed;
          parsedStatus = detail?.status ?? null;

          if (parsedStatus === "TAMPERED") {
            parsedDetail = detail as TamperDetail;
          } else if (parsedStatus === "PROCESSING") {
            processingMessage =
              detail?.message ??
              "AI tamper localization is still running. Please retry in a few seconds.";
          }
        } catch {
          // JSON parse failed — fall through to generic error
        }

        if (parsedDetail && parsedStatus === "TAMPERED") {
          setResult({ status: "TAMPERED", detail: parsedDetail });
          toastError(
            "Tampering Detected",
            `Risk: ${parsedDetail.risk_category ?? "Unknown"} (score: ${parsedDetail.tamper_risk_score?.toFixed(1) ?? "—"})`
          );
        } else if (parsedStatus === "PROCESSING") {
          setResult({
            status: "ERROR",
            message:
              processingMessage ??
              "AI analysis still running in background. Please retry in a few seconds.",
          });
          toastError("Analysis In Progress", processingMessage ?? "Please retry shortly.");
        } else {
          // 409 with unrecognised or unparseable payload
          let fallbackMsg = "Verification conflict — please retry.";
          try {
            if (err.response.data instanceof ArrayBuffer) {
              fallbackMsg =
                new TextDecoder("utf-8").decode(err.response.data) || fallbackMsg;
            }
          } catch { /* */ }
          setResult({ status: "ERROR", message: fallbackMsg });
          toastError("Verification Error", "Unexpected 409 response. Please retry.");
        }
      } else if (!err.response) {
        // Network failure — no HTTP response at all
        const msg = err.message || "Network error. Could not reach the backend.";
        setResult({ status: "ERROR", message: msg });
        toastError("Network Failure", msg);
      } else {
        // Other HTTP errors (401, 403, 404, 500 …)
        let msg = "Verification request failed.";
        try {
          if (err.response.data instanceof ArrayBuffer) {
            const text = new TextDecoder("utf-8").decode(err.response.data);
            const parsed = JSON.parse(text);
            msg = parsed?.detail ?? text;
          } else if (err.response.data?.detail) {
            msg = err.response.data.detail;
          } else if (err.message) {
            msg = err.message;
          }
        } catch {
          msg = err.message || msg;
        }
        setResult({ status: "ERROR", message: msg });
        toastError("Verification Error", msg);
      }
    } finally {
      setVerifying(false);
    }
  };

  const steps = [
    { label: "Image", icon: Images },
    { label: "SHA-3 Hash", icon: ShieldCheck },
    { label: "Trusted Hash", icon: ShieldCheck },
    { label: "Comparison", icon: ShieldCheck },
    { label: "Result", icon: result?.status === "TAMPERED" ? ShieldAlert : result?.status === "VERIFIED" ? CheckCircle2 : ShieldX },
  ];

  return (
    <div className="w-full space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          Integrity Verification
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Cryptographic SHA-3 hash verification against the blockchain-registered trusted hash.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Image Selector */}
        <div className="glass-panel p-4 space-y-3">
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Select Image</div>
          <input
            type="text"
            placeholder="Search..."
            value={imgSearch}
            onChange={e => setImgSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-xs text-slate-200 placeholder-slate-600 outline-none"
          />
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {filteredImages.map(img => (
              <button
                key={img.id}
                onClick={() => { onSelectImage(img.id); setResult(null); setStepIndex(0); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition-all cursor-pointer ${
                  selectedImageId === img.id
                    ? "bg-blue-600/20 border border-blue-600/40 text-slate-200"
                    : "hover:bg-slate-800/60 text-slate-400 border border-transparent"
                }`}
                aria-label={`Select image ${img.title}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-200 truncate">{img.title}</div>
                  <div className="text-[9px] text-slate-500">#{img.id} · {img.image_type}</div>
                </div>
                {img.quarantine_status && <ShieldAlert className="h-3 w-3 text-rose-400 flex-shrink-0" />}
              </button>
            ))}
            {filteredImages.length === 0 && (
              <div className="text-slate-600 text-xs text-center py-6">No images found</div>
            )}
          </div>
        </div>

        {/* Verification Flow + Result */}
        <div className="lg:col-span-2 space-y-4">
          {/* Flow Diagram */}
          <div className="glass-panel p-6">
            <div className="flex items-center justify-center gap-2 flex-wrap">
              {steps.map((step, i) => (
                <React.Fragment key={i}>
                  <FlowStep
                    label={step.label}
                    icon={step.icon}
                    active={verifying && stepIndex === i + 1}
                    done={!verifying && stepIndex > i + 1 || (!verifying && result !== null && i < 4)}
                    failed={!verifying && result?.status === "TAMPERED" && i === 4}
                  />
                  {i < steps.length - 1 && (
                    <ArrowDown className="h-4 w-4 text-slate-700 flex-shrink-0 -rotate-90" />
                  )}
                </React.Fragment>
              ))}
            </div>

            <div className="mt-6 flex justify-center">
              <button
                onClick={runVerification}
                disabled={!selectedImageId || verifying}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl cursor-pointer transition-all shadow-md shadow-blue-900/30"
                aria-label="Run integrity verification"
              >
                {verifying ? (
                  <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Verifying...</>
                ) : (
                  <><ShieldCheck className="h-3.5 w-3.5" /> Run Integrity Check</>
                )}
              </button>
            </div>
          </div>

          {/* Hash Details */}
          {trustedHash && (
            <div className="glass-panel p-4 space-y-3">
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Hash Comparison</div>
              <div className="space-y-2">
                <div className="bg-slate-900/60 rounded-xl p-3">
                  <div className="text-[9px] text-slate-600 font-bold uppercase mb-1">Trusted Hash (Blockchain)</div>
                  <div className="font-hash text-emerald-400 break-all text-[10px]">{trustedHash}</div>
                </div>
                {result?.status === "VERIFIED" && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                    <span className="text-xs text-emerald-400 font-semibold">Hashes match — Image is authentic</span>
                  </div>
                )}
                {result?.status === "TAMPERED" && (
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-rose-400 flex-shrink-0" />
                    <span className="text-xs text-rose-400 font-semibold">Hash mismatch — Tampering detected</span>
                  </div>
                )}
              </div>
              {verifiedAt && (
                <div className="text-[10px] text-slate-600">Verified at: {new Date(verifiedAt).toLocaleString()}</div>
              )}
            </div>
          )}

          {/* Result Detail */}
          {result && (
            <div className={`glass-panel p-5 space-y-4 ${
              result.status === "VERIFIED" ? "border-emerald-800/30 glow-emerald" :
              result.status === "TAMPERED" ? "border-rose-800/30 glow-rose" : ""
            }`}>
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-slate-100">Integrity Result</div>
                <StatusBadge
                  status={result.status === "VERIFIED" ? "VERIFIED" : result.status === "TAMPERED" ? "TAMPERED" : "FAILED"}
                  size="sm"
                  pulse={result.status === "TAMPERED"}
                />
              </div>

              {result.status === "VERIFIED" && result.imageBlob && (
                <div className="flex gap-4 items-start">
                  <div className="border border-emerald-800/30 rounded-xl overflow-hidden bg-black/40 h-36 w-36 flex-shrink-0 flex items-center justify-center">
                    <img src={result.imageBlob} alt="Verified scan" className="max-h-full max-w-full object-contain" />
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" /> INTEGRITY VERIFIED
                    </div>
                    <p className="text-slate-400 text-xs leading-relaxed">
                      SHA-3 hash successfully matched blockchain-registered trusted hash. Image has not been modified since upload.
                    </p>
                    <div className="text-[10px] text-slate-500">
                      Encryption: AES-256-GCM + 4D Chen Hyperchaos
                    </div>
                  </div>
                </div>
              )}

              {result.status === "TAMPERED" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {[
                      { label: "Tampered Area", value: `${result.detail.tampered_percentage?.toFixed(1) ?? "—"}%` },
                      { label: "AI Confidence", value: `${((result.detail.confidence_score || 0) * 100).toFixed(1)}%` },
                      { label: "Risk Category", value: result.detail.risk_category || "—" },
                      { label: "Risk Score", value: result.detail.tamper_risk_score?.toFixed(1) ?? "—" },
                      { label: "Trust Score", value: result.detail.cybersecurity_trust_score?.toFixed(1) ?? "—" },
                      { label: "Detections", value: String(result.detail.bounding_boxes?.length ?? 0) },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-slate-900/60 rounded-xl p-2.5">
                        <div className="text-[9px] text-slate-600 font-bold uppercase mb-1">{label}</div>
                        <div className="text-sm font-bold text-rose-400">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => onViewChange("tamper-detection")}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 rounded-xl cursor-pointer"
                    >
                      AI Forensics Analysis
                    </button>
                    <button
                      onClick={() => onViewChange("recovery-center")}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/30 rounded-xl cursor-pointer"
                    >
                      Recovery Center
                    </button>
                  </div>
                </div>
              )}

              {result.status === "ERROR" && (
                <div className="text-xs text-rose-400">{result.message}</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
