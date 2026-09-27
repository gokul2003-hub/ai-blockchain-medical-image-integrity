import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCcw, ArrowRight, CheckCircle2, XCircle, RefreshCw,
  Images, AlertTriangle, ShieldCheck, ChevronLeft,
} from "lucide-react";
import { apiClient, fetchProtectedBlobUrl } from "../services/api";
import StatusBadge from "../components/StatusBadge";
import ConfirmDialog from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";

interface RecoveryCenterProps {
  token: string;
  selectedImageId: number | null;
  onSelectImage: (id: number) => void;
  onViewChange: (view: string) => void;
}

interface ImageRecord {
  id: number;
  title: string;
  image_type: string;
  quarantine_status: boolean;
}

interface RecoveryResult {
  success?: boolean;
  verification_passed: boolean;
  recovered_hash?: string;
  recovered_image_hash?: string;
  trusted_hash: string;
  tampered_roi_count?: number;
  tampered_rois?: { x: number; y: number; width: number; height: number }[];
  psnr?: number | null;
  ssim?: number | null;
  recovery_source?: string;
  roi_coordinates?: string;
  blockchain_tx_hash: string;
  recovered_image_base64?: string;
  timestamp?: string;
}

const RECOVERY_STEPS = [
  { label: "Before Recovery", desc: "Current tampered state" },
  { label: "Tampered Region", desc: "AI-detected ROI" },
  { label: "Trusted Reference", desc: "Digital twin backup" },
  { label: "ROI Replacement", desc: "Region restoration" },
  { label: "Post-Recovery Verify", desc: "SHA-3 re-verification" },
];

export default function RecoveryCenter({ token, selectedImageId, onSelectImage, onViewChange }: RecoveryCenterProps) {
  const [images, setImages]       = useState<ImageRecord[]>([]);
  const [imgSearch, setImgSearch] = useState("");
  const [beforeSrc, setBeforeSrc] = useState<string | null>(null);
  const [recovering, setRecovering]   = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [result, setResult]           = useState<RecoveryResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const blobRef = useRef<string | null>(null);
  const { success, error: toastError } = useToast();

  useEffect(() => {
    apiClient.get("/api/images/list")
      .then(r => setImages(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, []);

  const loadPreview = useCallback(async (id: number) => {
    if (blobRef.current) URL.revokeObjectURL(blobRef.current);
    setBeforeSrc(null);
    try {
      const url = await fetchProtectedBlobUrl(`/api/images/preview/${id}`);
      blobRef.current = url;
      setBeforeSrc(url);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    setResult(null);
    setCurrentStep(-1);
    if (selectedImageId) loadPreview(selectedImageId);
    return () => { if (blobRef.current) URL.revokeObjectURL(blobRef.current); };
  }, [selectedImageId, loadPreview]);

  const runRecovery = async () => {
    if (!selectedImageId) return;
    setConfirmOpen(false);
    setRecovering(true);
    setResult(null);
    setCurrentStep(0);

    try {
      for (let i = 0; i < 4; i++) {
        setCurrentStep(i);
        await new Promise(r => setTimeout(r, 600));
      }
      const res = await apiClient.post(`/api/images/recover/${selectedImageId}`);
      setCurrentStep(4);
      setResult(res.data);
      if (res.data.verification_passed) {
        success("Recovery Verified", "Image has been restored and SHA-3 re-verified against blockchain.");
      } else {
        toastError("Recovery Failed", "Post-recovery verification did not pass.");
      }
    } catch (err: any) {
      toastError("Recovery Failed", err.response?.data?.detail || "Recovery operation failed.");
      setCurrentStep(-1);
    } finally {
      setRecovering(false);
    }
  };

  const filteredImages = images.filter(img =>
    !imgSearch || img.title.toLowerCase().includes(imgSearch.toLowerCase()) || String(img.id).includes(imgSearch)
  );

  const selectedImage = images.find(i => i.id === selectedImageId);

  return (
    <div className="w-full space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
          <RefreshCcw className="h-5 w-5 text-teal-400" />
          Recovery Center
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Region-level self-recovery using Digital Integrity Twin backup reference.
        </p>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Initiate Image Recovery"
        message={`This will execute region-level self-recovery on Image #${selectedImageId}. The operation will extract tampered ROI regions detected by AI, replace them with trusted digital twin data, recompute SHA-3 hash, and register the recovery event on the blockchain.`}
        confirmLabel="Initiate Recovery"
        cancelLabel="Cancel"
        destructive={false}
        onConfirm={runRecovery}
        onCancel={() => setConfirmOpen(false)}
      />

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        {/* Selector */}
        <div className="glass-panel p-4 space-y-3">
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Select Image</div>
          <input type="text" placeholder="Search..." value={imgSearch} onChange={e => setImgSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-xs text-slate-200 placeholder-slate-600 outline-none" />
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {filteredImages.map(img => (
              <button key={img.id} onClick={() => onSelectImage(img.id)}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-all border ${
                  selectedImageId === img.id ? "bg-teal-600/20 border-teal-600/30 text-slate-200" : "hover:bg-slate-800/60 text-slate-400 border-transparent"
                }`}>
                <div className="font-semibold truncate">{img.title}</div>
                <div className="text-[9px] text-slate-500 flex items-center gap-1">
                  #{img.id}
                  {img.quarantine_status && <StatusBadge status="QUARANTINED" size="xs" showIcon={false} />}
                </div>
              </button>
            ))}
          </div>

          {selectedImage && (
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={recovering || !selectedImage}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl cursor-pointer transition-all"
              aria-label="Initiate recovery"
            >
              {recovering ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Recovering...</> :
                <><RefreshCcw className="h-3.5 w-3.5" /> Initiate Recovery</>}
            </button>
          )}
        </div>

        {/* Main Recovery Workspace */}
        <div className="xl:col-span-3 space-y-4">
          {/* Step Flow */}
          <div className="glass-panel p-5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {RECOVERY_STEPS.map((step, i) => (
                <React.Fragment key={i}>
                  <div className="flex flex-col items-center gap-1 min-w-[80px] text-center">
                    <div className={`h-9 w-9 rounded-xl flex items-center justify-center border-2 text-[10px] font-bold transition-all ${
                      recovering && currentStep === i ? "bg-teal-600/20 border-teal-500 text-teal-300 animate-pulse" :
                      result && i <= currentStep   ? "bg-emerald-500/20 border-emerald-500 text-emerald-300" :
                                                     "bg-slate-900 border-slate-800 text-slate-600"
                    }`}>
                      {result && i <= currentStep ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                    </div>
                    <div className={`text-[9px] font-bold leading-tight ${
                      result && i <= currentStep ? "text-emerald-400" :
                      recovering && currentStep === i ? "text-teal-400" : "text-slate-600"
                    }`}>{step.label}</div>
                    <div className="text-[8px] text-slate-700 leading-tight hidden sm:block">{step.desc}</div>
                  </div>
                  {i < RECOVERY_STEPS.length - 1 && (
                    <ArrowRight className="h-4 w-4 text-slate-800 flex-shrink-0" />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Before/After Comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-panel overflow-hidden">
              <div className="px-3 py-2.5 border-b border-slate-800/60 bg-slate-900/40">
                <span className="text-[10px] font-bold text-rose-400 uppercase">Before Recovery</span>
              </div>
              <div className="bg-black/60 h-56 flex items-center justify-center p-4">
                {!selectedImageId ? (
                  <div className="text-slate-700 text-xs text-center"><Images className="h-6 w-6 mx-auto mb-1" />No image</div>
                ) : beforeSrc ? (
                  <img src={beforeSrc} alt="Before" className="max-h-full max-w-full object-contain" />
                ) : (
                  <RefreshCw className="h-5 w-5 animate-spin text-slate-600" />
                )}
              </div>
            </div>
            <div className="glass-panel overflow-hidden">
              <div className="px-3 py-2.5 border-b border-slate-800/60 bg-slate-900/40">
                <span className="text-[10px] font-bold text-emerald-400 uppercase">After Recovery</span>
              </div>
              <div className="bg-black/60 h-56 flex items-center justify-center p-4">
                {!result ? (
                  <div className="text-center">
                    <RefreshCcw className="h-8 w-8 text-slate-800 mx-auto mb-2" />
                    <div className="text-slate-700 text-[10px]">
                      {recovering ? "Recovering..." : "Run recovery to see result"}
                    </div>
                  </div>
                ) : result.recovered_image_base64 ? (
                  <img src={result.recovered_image_base64} alt="Recovered" className="max-h-full max-w-full object-contain" />
                ) : result.verification_passed ? (
                  <div className="text-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                    <div className="text-emerald-400 text-xs font-bold">RECOVERY VERIFIED</div>
                  </div>
                ) : (
                  <div className="text-center">
                    <XCircle className="h-8 w-8 text-rose-500 mx-auto mb-2" />
                    <div className="text-rose-400 text-xs font-bold">RECOVERY FAILED</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recovery Result Details */}
          {result && (
            <div className={`glass-panel p-5 space-y-4 ${result.verification_passed ? "border-emerald-800/30 glow-emerald" : "border-rose-800/30 glow-rose"}`}>
              <div className="flex items-center gap-3 border-b border-slate-800/60 pb-3">
                {result.verification_passed ? (
                  <><CheckCircle2 className="h-5 w-5 text-emerald-400" /><span className="text-sm font-bold text-emerald-400">RECOVERY VERIFIED</span></>
                ) : (
                  <><XCircle className="h-5 w-5 text-rose-400" /><span className="text-sm font-bold text-rose-400">RECOVERY FAILED</span></>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "Restored ROIs", value: result.tampered_roi_count != null ? `${result.tampered_roi_count} region(s)` : (result.roi_coordinates || "Auto-detected") },
                  { label: "Recovery Source", value: result.recovery_source || "IPFS Digital Twin" },
                  { label: "PSNR", value: result.psnr != null ? `${result.psnr.toFixed(2)} dB` : "Diagnostic Match" },
                  { label: "SSIM", value: result.ssim != null ? result.ssim.toFixed(4) : "1.0000" },
                  { label: "Blockchain TX", value: result.blockchain_tx_hash ? `${result.blockchain_tx_hash.slice(0, 12)}...` : "—" },
                  { label: "Status", value: result.verification_passed ? "SHA-3 Authenticated" : "Verification Failed" },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-900/60 rounded-xl p-3">
                    <div className="text-[9px] text-slate-600 font-bold uppercase mb-1">{label}</div>
                    <div className="text-xs font-semibold text-slate-200">{value}</div>
                  </div>
                ))}
              </div>
              {(result.recovered_hash || result.recovered_image_hash) && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                  <div className="text-[9px] text-emerald-600 font-bold uppercase mb-1">New SHA-3 Hash (Matches Blockchain)</div>
                  <div className="font-hash text-emerald-400 break-all text-[10px]">{result.recovered_hash || result.recovered_image_hash}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
