import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  BrainCircuit, RefreshCw, Images, AlertTriangle, ChevronLeft,
  ScanSearch, Crosshair, Activity, Info,
} from "lucide-react";
import { apiClient, fetchProtectedBlobUrl } from "../services/api";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";

interface AIForensicsProps {
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

interface TwinData {
  verification_status: string;
  trusted_hash: string;
  metadata: { image_type?: string; quality_score?: number };
  verification_history: { timestamp: string; event: string; details?: string }[];
}

interface ForensicMedia {
  preview: string | null;
  srm: string | null;
  heatmap: string | null;
}

const MediaPanel = ({
  label, src, loading, error, icon: Icon, accentColor,
}: {
  label: string;
  src: string | null;
  loading: boolean;
  error: string | null;
  icon: React.ElementType;
  accentColor: string;
}) => (
  <div className="glass-panel overflow-hidden">
    <div className={`px-3 py-2 border-b border-slate-800/60 flex items-center gap-2 bg-slate-900/60`}>
      <Icon className={`h-3.5 w-3.5 ${accentColor}`} />
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
    </div>
    <div className="bg-black/60 h-48 flex items-center justify-center">
      {loading && <RefreshCw className="h-5 w-5 animate-spin text-slate-600" />}
      {!loading && error && (
        <div className="text-center p-4">
          <AlertTriangle className="h-5 w-5 text-slate-700 mx-auto mb-1" />
          <p className="text-[10px] text-slate-600">Unavailable</p>
        </div>
      )}
      {!loading && src && !error && (
        <img src={src} alt={label} className="max-h-full max-w-full object-contain" />
      )}
      {!loading && !src && !error && (
        <div className="text-[10px] text-slate-700">No image selected</div>
      )}
    </div>
  </div>
);

export default function AIForensics({ token, selectedImageId, onSelectImage, onViewChange }: AIForensicsProps) {
  const [images, setImages]   = useState<ImageRecord[]>([]);
  const [imgSearch, setImgSearch] = useState("");
  const [media, setMedia]     = useState<ForensicMedia>({ preview: null, srm: null, heatmap: null });
  const [twin, setTwin]       = useState<TwinData | null>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors]   = useState<Record<string, string>>({});
  const blobsRef = useRef<string[]>([]);
  const { error: toastError } = useToast();

  const clearBlobs = () => {
    blobsRef.current.forEach(b => URL.revokeObjectURL(b));
    blobsRef.current = [];
  };

  const loadImages = useCallback(async () => {
    try {
      const res = await apiClient.get("/api/images/list");
      setImages(Array.isArray(res.data) ? res.data : []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadImages(); }, [loadImages]);

  const loadForensics = useCallback(async (id: number) => {
    clearBlobs();
    setMedia({ preview: null, srm: null, heatmap: null });
    setTwin(null);
    setErrors({});
    setLoading({ preview: true, srm: true, heatmap: true, twin: true });

    const safeLoad = async (key: string, fn: () => Promise<string | null>) => {
      try {
        const url = await fn();
        setMedia(prev => ({ ...prev, [key]: url }));
        if (url) blobsRef.current.push(url);
      } catch (e: any) {
        setErrors(prev => ({ ...prev, [key]: "Unavailable" }));
      } finally {
        setLoading(prev => ({ ...prev, [key]: false }));
      }
    };

    // Run all in parallel
    await Promise.all([
      safeLoad("preview", () => fetchProtectedBlobUrl(`/api/images/preview/${id}`)),
      safeLoad("srm",     () => fetchProtectedBlobUrl(`/api/images/srm-residual/${id}`)),
      safeLoad("heatmap", () => fetchProtectedBlobUrl(`/api/images/heatmap/by-image/${id}`)),
      (async () => {
        try {
          const res = await apiClient.get(`/api/images/digital-twin/${id}`);
          setTwin(res.data);
        } catch {
          setErrors(prev => ({ ...prev, twin: "Unavailable" }));
        } finally {
          setLoading(prev => ({ ...prev, twin: false }));
        }
      })(),
    ]);
  }, []);

  useEffect(() => {
    if (selectedImageId) loadForensics(selectedImageId);
    return clearBlobs;
  }, [selectedImageId, loadForensics]);

  const filteredImages = images.filter(img =>
    !imgSearch || img.title.toLowerCase().includes(imgSearch.toLowerCase()) || String(img.id).includes(imgSearch)
  );

  const selectedImage = images.find(i => i.id === selectedImageId);

  return (
    <div className="w-full space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-purple-400" />
            AI Forensics Center
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Hybrid Swin-Unet tamper localization · SRM noise analysis · Grad-CAM attention
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
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
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {filteredImages.map(img => (
              <button
                key={img.id}
                onClick={() => onSelectImage(img.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-all cursor-pointer ${
                  selectedImageId === img.id
                    ? "bg-purple-600/20 border border-purple-600/40 text-slate-200"
                    : "hover:bg-slate-800/60 text-slate-400 border border-transparent"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-200 truncate">{img.title}</div>
                  <div className="text-[9px] text-slate-500">#{img.id} · {img.image_type}</div>
                </div>
                {img.quarantine_status && (
                  <StatusBadge status="QUARANTINED" size="xs" showIcon={false} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Main Analysis Area */}
        <div className="xl:col-span-3 space-y-4">
          {/* Four-panel forensic grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MediaPanel
              label="Original (Decrypted)"
              src={media.preview}
              loading={!!loading.preview}
              error={errors.preview || null}
              icon={Images}
              accentColor="text-blue-400"
            />
            <MediaPanel
              label="SRM Noise Residual"
              src={media.srm}
              loading={!!loading.srm}
              error={errors.srm || null}
              icon={Activity}
              accentColor="text-cyan-400"
            />
            <MediaPanel
              label="AI Tamper Heatmap"
              src={media.heatmap}
              loading={!!loading.heatmap}
              error={errors.heatmap || null}
              icon={Crosshair}
              accentColor="text-rose-400"
            />
          </div>

          {/* Analysis Summary */}
          <div className="glass-panel p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
              <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <ScanSearch className="h-4 w-4 text-purple-400" />
                Analysis Summary
              </h3>
              {selectedImage && (
                <StatusBadge
                  status={selectedImage.quarantine_status ? "TAMPERED" : "VERIFIED"}
                  size="xs"
                  pulse={selectedImage.quarantine_status}
                />
              )}
            </div>

            {twin ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "AI Prediction", value: twin.verification_status === "QUARANTINED" || selectedImage?.quarantine_status ? "TAMPERED" : "CLEAN" },
                  { label: "Model", value: "Hybrid Swin-Unet" },
                  { label: "Dataset", value: "Synthetic Data" },
                  { label: "Image Type", value: twin.metadata?.image_type || "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-900/60 rounded-xl p-3">
                    <div className="text-[9px] text-slate-600 font-bold uppercase mb-1">{label}</div>
                    <div className="text-xs font-semibold text-slate-200">{value}</div>
                  </div>
                ))}
              </div>
            ) : loading.twin ? (
              <div className="grid grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-14 bg-slate-800/60 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : null}

            {!selectedImageId && (
              <div className="text-center py-6 text-slate-600 text-xs">
                Select an image to begin forensic analysis
              </div>
            )}

            {selectedImageId && (
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => onViewChange("tamper-localization")}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl cursor-pointer transition-all"
                >
                  <Crosshair className="h-3.5 w-3.5" />
                  Tamper Localization
                </button>
                <button
                  onClick={() => onViewChange("explainable-ai")}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl cursor-pointer transition-all"
                >
                  <BrainCircuit className="h-3.5 w-3.5" />
                  Explainable AI
                </button>
                {selectedImage?.quarantine_status && (
                  <button
                    onClick={() => onViewChange("recovery-center")}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-teal-600/20 hover:bg-teal-600/30 border border-teal-500/30 text-teal-300 rounded-xl cursor-pointer transition-all"
                  >
                    Initiate Recovery
                  </button>
                )}
              </div>
            )}

            <div className="flex items-start gap-2 bg-slate-900/40 rounded-xl p-3 border border-slate-800/40">
              <Info className="h-3.5 w-3.5 text-slate-600 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-slate-600 leading-relaxed">
                AI analysis is advisory only. The Hybrid Swin-Unet model was trained on a synthetic dataset for prototype demonstration.
                Clinical decisions require qualified medical professional review.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
