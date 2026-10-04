import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Eye, ZoomIn, ZoomOut, RotateCcw, Maximize2, Sun, Contrast,
  RefreshCw, ShieldCheck, AlertTriangle, Images, ChevronLeft,
} from "lucide-react";
import { apiClient, fetchProtectedBlobUrl } from "../services/api";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";

interface ImageViewerProps {
  token: string;
  selectedImageId: number | null;
  onViewChange: (view: string) => void;
}

interface DigitalTwin {
  id: number;
  image_id: number;
  trusted_hash: string;
  verification_status: string;
  metadata: {
    title?: string;
    image_type?: string;
    quality_score?: number;
    entropy?: number;
    storage_provider?: string;
  };
  provenance: {
    uploader?: string;
    timestamp?: string;
    hospital_id?: number;
  };
  ipfs_cid: string;
  created_at: string;
  updated_at: string;
}

export default function ImageViewer({ token, selectedImageId, onViewChange }: ImageViewerProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [twin, setTwin] = useState<DigitalTwin | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(100);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const prevBlobRef = useRef<string | null>(null);
  const { error: toastError } = useToast();

  const loadImage = useCallback(async (id: number) => {
    setLoading(true);
    setError("");
    setImageSrc(null);
    setTwin(null);

    try {
      // Load preview and twin in parallel
      const [blobUrl, twinRes] = await Promise.all([
        fetchProtectedBlobUrl(`/api/images/preview/${id}`),
        apiClient.get(`/api/images/digital-twin/${id}`).catch(() => null),
      ]);

      // Revoke previous blob URL
      if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
      prevBlobRef.current = blobUrl;
      setImageSrc(blobUrl);
      if (twinRes) setTwin(twinRes.data);
    } catch (err: any) {
      const msg = err.message || "Failed to load image preview.";
      setError(msg);
      toastError("Preview Failed", msg);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    if (selectedImageId) {
      loadImage(selectedImageId);
      // Reset controls
      setZoom(100);
      setBrightness(100);
      setContrast(100);
    }
    return () => {
      if (prevBlobRef.current) URL.revokeObjectURL(prevBlobRef.current);
    };
  }, [selectedImageId, loadImage]);

  const resetControls = () => { setZoom(100); setBrightness(100); setContrast(100); };

  if (!selectedImageId) {
    return (
      <div className="w-full space-y-5">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Eye className="h-5 w-5 text-blue-400" />
            Image Viewer
          </h2>
        </div>
        <div className="glass-panel p-20 flex flex-col items-center justify-center gap-4 text-center">
          <Images className="h-12 w-12 text-slate-700" />
          <p className="text-slate-400 text-sm font-medium">No Image Selected</p>
          <p className="text-slate-500 text-xs max-w-xs">
            Select an image from the Medical Images list to view it here.
          </p>
          <button
            onClick={() => onViewChange("medical-images")}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl cursor-pointer"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Go to Medical Images
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
          <Eye className="h-5 w-5 text-blue-400" />
          Image Viewer — #{selectedImageId}
        </h2>
        <button
          onClick={() => onViewChange("medical-images")}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 cursor-pointer"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to Images
        </button>
      </div>

      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Left Controls Panel */}
        <div className="col-span-12 lg:col-span-2 glass-panel p-4 space-y-5 overflow-y-auto">
          <div>
            <div className="text-[9px] text-slate-600 font-bold uppercase tracking-wider mb-3">Zoom</div>
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setZoom(z => Math.max(25, z - 25))}
                className="p-1.5 bg-slate-900 hover:bg-slate-800 rounded-lg text-slate-400 cursor-pointer"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs font-mono text-slate-300 text-center flex-1">{zoom}%</span>
              <button
                onClick={() => setZoom(z => Math.min(400, z + 25))}
                className="p-1.5 bg-slate-900 hover:bg-slate-800 rounded-lg text-slate-400 cursor-pointer"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </div>
            <input
              type="range" min={25} max={400} step={25} value={zoom}
              onChange={e => setZoom(Number(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
              aria-label="Zoom level"
            />
          </div>

          <div>
            <div className="text-[9px] text-slate-600 font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
              <Sun className="h-3 w-3" /> Brightness
            </div>
            <input
              type="range" min={0} max={200} step={10} value={brightness}
              onChange={e => setBrightness(Number(e.target.value))}
              className="w-full accent-amber-500 cursor-pointer"
              aria-label="Brightness"
            />
            <span className="text-[10px] text-slate-600">{brightness}%</span>
          </div>

          <div>
            <div className="text-[9px] text-slate-600 font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
              <Contrast className="h-3 w-3" /> Contrast
            </div>
            <input
              type="range" min={0} max={300} step={10} value={contrast}
              onChange={e => setContrast(Number(e.target.value))}
              className="w-full accent-cyan-500 cursor-pointer"
              aria-label="Contrast"
            />
            <span className="text-[10px] text-slate-600">{contrast}%</span>
          </div>

          <button
            onClick={resetControls}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl cursor-pointer transition-all"
            aria-label="Reset controls"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>

        {/* Center — Image */}
        <div className="col-span-12 lg:col-span-7 glass-panel flex items-center justify-center bg-black/40 overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 z-10">
              <div className="flex items-center gap-3 text-slate-400 text-xs">
                <RefreshCw className="h-5 w-5 animate-spin text-blue-500" />
                Decrypting and loading secure image...
              </div>
            </div>
          )}
          {error && !loading && (
            <div className="text-center p-8">
              <AlertTriangle className="h-8 w-8 text-rose-500 mx-auto mb-2" />
              <p className="text-rose-400 text-xs">{error}</p>
              <button onClick={() => loadImage(selectedImageId)} className="mt-3 text-xs text-blue-400 underline cursor-pointer">
                Retry
              </button>
            </div>
          )}
          {imageSrc && !error && (
            <div className="overflow-auto w-full h-full flex items-center justify-center p-4">
              <img
                src={imageSrc}
                alt={`Medical scan #${selectedImageId}`}
                style={{
                  transform: `scale(${zoom / 100})`,
                  filter: `brightness(${brightness}%) contrast(${contrast}%)`,
                  transition: "transform 0.2s ease, filter 0.2s ease",
                  transformOrigin: "center",
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                }}
              />
            </div>
          )}
        </div>

        {/* Right — Info Panel */}
        <div className="col-span-12 lg:col-span-3 glass-panel p-4 space-y-4 overflow-y-auto">
          <div className="text-[9px] text-slate-600 font-bold uppercase tracking-wider">Image Information</div>

          {twin ? (
            <div className="space-y-3">
              {[
                { label: "Image ID", value: `#${twin.image_id}` },
                { label: "Modality", value: twin.metadata?.image_type || "—" },
                { label: "Storage", value: twin.metadata?.storage_provider?.toUpperCase() || "—" },
                { label: "Quality", value: twin.metadata?.quality_score?.toFixed(2) || "—" },
                { label: "Entropy", value: twin.metadata?.entropy?.toFixed(4) || "—" },
                { label: "Uploader", value: twin.provenance?.uploader || "—" },
                { label: "Uploaded", value: twin.provenance?.timestamp ? new Date(twin.provenance.timestamp).toLocaleString() : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="space-y-0.5">
                  <div className="text-[9px] text-slate-600 font-bold uppercase">{label}</div>
                  <div className="text-xs text-slate-200 font-medium">{value}</div>
                </div>
              ))}

              <div className="border-t border-slate-800/60 pt-3 space-y-2">
                <div className="text-[9px] text-slate-600 font-bold uppercase">Integrity</div>
                <StatusBadge status={twin.verification_status as any || "VERIFIED"} size="xs" />

                <div className="space-y-0.5">
                  <div className="text-[9px] text-slate-600 font-bold uppercase">Trusted Hash</div>
                  <div className="font-hash text-emerald-400 break-all text-[9px]">
                    {twin.trusted_hash ? `${twin.trusted_hash.slice(0, 24)}...` : "—"}
                  </div>
                </div>

                <div className="space-y-0.5">
                  <div className="text-[9px] text-slate-600 font-bold uppercase">Storage Reference</div>
                  <div className="font-hash text-slate-500 break-all text-[9px]">
                    {twin.ipfs_cid ? `${twin.ipfs_cid.slice(0, 20)}...` : "—"}
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/60 rounded-xl p-3 space-y-1.5 border border-slate-800/60">
                <div className="text-[9px] text-slate-600 font-bold uppercase tracking-wider">Encryption</div>
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                  <ShieldCheck className="h-3 w-3" />
                  AES-256-GCM
                </div>
                <div className="text-[9px] text-slate-500">4D Chen Hyperchaotic Permutation</div>
              </div>
            </div>
          ) : loading ? (
            <div className="space-y-3 animate-pulse">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-8 bg-slate-800/60 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="text-slate-600 text-xs text-center py-8">
              {error ? "Metadata unavailable" : "Load an image to see details"}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
