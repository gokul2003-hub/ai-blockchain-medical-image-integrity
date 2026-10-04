import React, { useState, useEffect, useCallback, useRef } from "react";
import { Crosshair, RefreshCw, Images, AlertTriangle } from "lucide-react";
import { fetchProtectedBlobUrl, apiClient } from "../services/api";
import { useToast } from "../components/Toast";

interface TamperLocalizationProps {
  token: string;
  selectedImageId: number | null;
  onSelectImage: (id: number) => void;
}

interface ImageRecord { id: number; title: string; image_type: string; quarantine_status: boolean; }

type ViewMode = "original" | "heatmap" | "overlay" | "split";

export default function TamperLocalization({ token, selectedImageId, onSelectImage }: TamperLocalizationProps) {
  const [images, setImages]       = useState<ImageRecord[]>([]);
  const [imgSearch, setImgSearch] = useState("");
  const [origSrc, setOrigSrc]     = useState<string | null>(null);
  const [heatSrc, setHeatSrc]     = useState<string | null>(null);
  const [loadingOrig, setLoadingOrig] = useState(false);
  const [loadingHeat, setLoadingHeat] = useState(false);
  const [viewMode, setViewMode]   = useState<ViewMode>("split");
  const [opacity, setOpacity]     = useState(60);
  const blobsRef = useRef<string[]>([]);
  const { error: toastError } = useToast();

  useEffect(() => {
    apiClient.get("/api/images/list")
      .then(res => setImages(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  }, []);

  const loadMedia = useCallback(async (id: number) => {
    // Revoke previous
    blobsRef.current.forEach(b => URL.revokeObjectURL(b));
    blobsRef.current = [];
    setOrigSrc(null); setHeatSrc(null);
    setLoadingOrig(true); setLoadingHeat(true);

    try {
      const url = await fetchProtectedBlobUrl(`/api/images/preview/${id}`);
      blobsRef.current.push(url);
      setOrigSrc(url);
    } catch { /* silent */ } finally { setLoadingOrig(false); }

    try {
      const url = await fetchProtectedBlobUrl(`/api/images/heatmap/by-image/${id}`);
      blobsRef.current.push(url);
      setHeatSrc(url);
    } catch { /* silent */ } finally { setLoadingHeat(false); }
  }, []);

  useEffect(() => {
    if (selectedImageId) loadMedia(selectedImageId);
    return () => { blobsRef.current.forEach(b => URL.revokeObjectURL(b)); };
  }, [selectedImageId, loadMedia]);

  const filteredImages = images.filter(img =>
    !imgSearch || img.title.toLowerCase().includes(imgSearch.toLowerCase()) || String(img.id).includes(imgSearch)
  );

  const viewModes: { id: ViewMode; label: string }[] = [
    { id: "original", label: "Original" },
    { id: "heatmap",  label: "Heatmap" },
    { id: "overlay",  label: "Overlay" },
    { id: "split",    label: "Split" },
  ];

  return (
    <div className="w-full space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
          <Crosshair className="h-5 w-5 text-rose-400" />
          Tamper Localization
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          AI-generated segmentation overlay · Grad-CAM regional attention map
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        {/* Selector */}
        <div className="glass-panel p-4 space-y-3">
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Image</div>
          <input type="text" placeholder="Search..." value={imgSearch} onChange={e => setImgSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-xs text-slate-200 placeholder-slate-600 outline-none" />
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {filteredImages.map(img => (
              <button key={img.id} onClick={() => onSelectImage(img.id)}
                className={`w-full text-left px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-all ${
                  selectedImageId === img.id ? "bg-rose-600/20 border border-rose-600/30 text-slate-200" : "hover:bg-slate-800/60 text-slate-400"
                }`}>
                <div className="font-semibold truncate">{img.title}</div>
                <div className="text-[9px] text-slate-500">#{img.id} · {img.image_type}</div>
              </button>
            ))}
          </div>

          {/* Controls */}
          <div className="border-t border-slate-800/60 pt-3 space-y-3">
            <div className="text-[9px] text-slate-600 font-bold uppercase">View Mode</div>
            <div className="grid grid-cols-2 gap-1">
              {viewModes.map(m => (
                <button key={m.id} onClick={() => setViewMode(m.id)}
                  className={`py-1.5 text-[10px] font-semibold rounded-lg cursor-pointer transition-all ${
                    viewMode === m.id ? "bg-rose-600/20 text-rose-300 border border-rose-500/30" : "bg-slate-900 text-slate-500 hover:text-slate-300"
                  }`}>
                  {m.label}
                </button>
              ))}
            </div>

            {viewMode === "overlay" && (
              <div>
                <div className="text-[9px] text-slate-600 font-bold uppercase mb-1">Overlay Opacity: {opacity}%</div>
                <input type="range" min={0} max={100} step={5} value={opacity}
                  onChange={e => setOpacity(Number(e.target.value))}
                  className="w-full accent-rose-500 cursor-pointer" />
              </div>
            )}
          </div>
        </div>

        {/* Viewer */}
        <div className="xl:col-span-3 glass-panel overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/60 flex items-center justify-between bg-slate-900/40">
            <span className="text-xs font-semibold text-slate-300">
              {viewMode === "split" ? "Original / AI Heatmap" : viewModes.find(v => v.id === viewMode)?.label}
            </span>
            {selectedImageId && (
              <span className="text-[10px] text-slate-600">Image #{selectedImageId}</span>
            )}
          </div>

          <div className="bg-black/60" style={{ minHeight: "480px" }}>
            {!selectedImageId ? (
              <div className="h-96 flex items-center justify-center">
                <div className="text-center">
                  <Images className="h-10 w-10 text-slate-700 mx-auto mb-2" />
                  <p className="text-slate-600 text-xs">Select an image to view localization</p>
                </div>
              </div>
            ) : viewMode === "split" ? (
              <div className="grid grid-cols-2 h-full" style={{ minHeight: "480px" }}>
                {/* Original */}
                <div className="border-r border-slate-800/60 flex items-center justify-center p-4 relative">
                  <div className="absolute top-2 left-2 text-[9px] bg-slate-900/80 text-slate-400 px-2 py-0.5 rounded font-bold">ORIGINAL</div>
                  {loadingOrig ? (
                    <RefreshCw className="h-5 w-5 animate-spin text-slate-600" />
                  ) : origSrc ? (
                    <img src={origSrc} alt="Original" className="max-h-[440px] max-w-full object-contain" />
                  ) : (
                    <div className="text-slate-700 text-xs text-center">
                      <AlertTriangle className="h-5 w-5 mx-auto mb-1" />Unavailable
                    </div>
                  )}
                </div>
                {/* Heatmap */}
                <div className="flex items-center justify-center p-4 relative">
                  <div className="absolute top-2 left-2 text-[9px] bg-slate-900/80 text-rose-400 px-2 py-0.5 rounded font-bold">AI HEATMAP</div>
                  {loadingHeat ? (
                    <RefreshCw className="h-5 w-5 animate-spin text-slate-600" />
                  ) : heatSrc ? (
                    <img src={heatSrc} alt="AI Heatmap" className="max-h-[440px] max-w-full object-contain" />
                  ) : (
                    <div className="text-slate-700 text-xs text-center">
                      <AlertTriangle className="h-5 w-5 mx-auto mb-1" />Unavailable
                    </div>
                  )}
                </div>
              </div>
            ) : viewMode === "original" ? (
              <div className="flex items-center justify-center p-4" style={{ minHeight: "480px" }}>
                {loadingOrig ? <RefreshCw className="h-6 w-6 animate-spin text-slate-600" /> :
                  origSrc ? <img src={origSrc} alt="Original" className="max-h-[480px] object-contain" /> :
                  <div className="text-slate-700 text-xs">Image unavailable</div>}
              </div>
            ) : viewMode === "heatmap" ? (
              <div className="flex items-center justify-center p-4" style={{ minHeight: "480px" }}>
                {loadingHeat ? <RefreshCw className="h-6 w-6 animate-spin text-slate-600" /> :
                  heatSrc ? <img src={heatSrc} alt="Heatmap" className="max-h-[480px] object-contain" /> :
                  <div className="text-slate-700 text-xs">Heatmap unavailable</div>}
              </div>
            ) : viewMode === "overlay" && origSrc ? (
              <div className="flex items-center justify-center p-4 relative" style={{ minHeight: "480px" }}>
                <div className="relative">
                  <img src={origSrc} alt="Base" className="max-h-[480px] object-contain" />
                  {heatSrc && (
                    <img
                      src={heatSrc}
                      alt="Heatmap overlay"
                      className="absolute inset-0 w-full h-full object-contain mix-blend-screen"
                      style={{ opacity: opacity / 100 }}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center" style={{ minHeight: "480px" }}>
                <div className="text-slate-700 text-xs">Loading...</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
