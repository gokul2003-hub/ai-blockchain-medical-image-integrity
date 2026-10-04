import React, { useState, useEffect, useCallback, useRef } from "react";
import { BrainCircuit, RefreshCw, Images, Info, AlertTriangle } from "lucide-react";
import { fetchProtectedBlobUrl, apiClient } from "../services/api";

interface ExplainableAIProps {
  token: string;
  selectedImageId: number | null;
  onSelectImage: (id: number) => void;
}

interface ImageRecord { id: number; title: string; image_type: string; quarantine_status: boolean; }

export default function ExplainableAI({ token, selectedImageId, onSelectImage }: ExplainableAIProps) {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [imgSearch, setImgSearch] = useState("");
  const [heatSrc, setHeatSrc] = useState<string | null>(null);
  const [origSrc, setOrigSrc] = useState<string | null>(null);
  const [twin, setTwin]       = useState<any>(null);
  const [loadingHeat, setLoadingHeat] = useState(false);
  const [loadingOrig, setLoadingOrig] = useState(false);
  const blobsRef = useRef<string[]>([]);

  useEffect(() => {
    apiClient.get("/api/images/list").then(r => setImages(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const loadData = useCallback(async (id: number) => {
    blobsRef.current.forEach(b => URL.revokeObjectURL(b));
    blobsRef.current = [];
    setHeatSrc(null); setOrigSrc(null); setTwin(null);
    setLoadingHeat(true); setLoadingOrig(true);

    await Promise.all([
      fetchProtectedBlobUrl(`/api/images/heatmap/by-image/${id}`)
        .then(u => { blobsRef.current.push(u); setHeatSrc(u); })
        .catch(() => {})
        .finally(() => setLoadingHeat(false)),
      fetchProtectedBlobUrl(`/api/images/preview/${id}`)
        .then(u => { blobsRef.current.push(u); setOrigSrc(u); })
        .catch(() => {})
        .finally(() => setLoadingOrig(false)),
      apiClient.get(`/api/images/digital-twin/${id}`)
        .then(r => setTwin(r.data))
        .catch(() => {}),
    ]);
  }, []);

  useEffect(() => {
    if (selectedImageId) loadData(selectedImageId);
    return () => { blobsRef.current.forEach(b => URL.revokeObjectURL(b)); };
  }, [selectedImageId, loadData]);

  const filteredImages = images.filter(img =>
    !imgSearch || img.title.toLowerCase().includes(imgSearch.toLowerCase()) || String(img.id).includes(imgSearch)
  );

  const selectedImage = images.find(i => i.id === selectedImageId);
  const isTampered = selectedImage?.quarantine_status || twin?.verification_status === "QUARANTINED";

  return (
    <div className="w-full space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-violet-400" />
          Explainable AI
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Grad-CAM gradient visualization · Model attention regions · Prediction explanation
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
                  selectedImageId === img.id ? "bg-violet-600/20 border border-violet-600/30 text-slate-200" : "hover:bg-slate-800/60 text-slate-400"
                }`}>
                <div className="font-semibold truncate">{img.title}</div>
                <div className="text-[9px] text-slate-500">#{img.id}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Visualization + Explanation */}
        <div className="xl:col-span-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Grad-CAM Heatmap */}
          <div className="glass-panel overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-800/60 bg-slate-900/40">
              <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Grad-CAM Attention Map</span>
            </div>
            <div className="bg-black/60 h-64 flex items-center justify-center relative">
              {loadingHeat ? <RefreshCw className="h-5 w-5 animate-spin text-slate-600" /> :
               heatSrc ? (
                 <div className="relative w-full h-full flex items-center justify-center p-4">
                   {origSrc && (
                     <img src={origSrc} alt="Base" className="absolute inset-0 w-full h-full object-contain opacity-40 p-4" />
                   )}
                   <img src={heatSrc} alt="Grad-CAM" className="max-h-full max-w-full object-contain mix-blend-screen" />
                 </div>
               ) : (
                 <div className="text-center text-slate-700">
                   {selectedImageId ? <><AlertTriangle className="h-5 w-5 mx-auto mb-1" /><div className="text-xs">Unavailable</div></> : <div className="text-xs">No image selected</div>}
                 </div>
               )}
            </div>
          </div>

          {/* Explanation Panel */}
          <div className="glass-panel p-5 space-y-4">
            <div className="text-[10px] text-slate-600 font-bold uppercase tracking-wider border-b border-slate-800/60 pb-3">AI Result</div>

            {selectedImageId ? (
              <div className="space-y-4">
                {/* Prediction */}
                <div className={`rounded-xl p-4 text-center border ${isTampered ? "bg-rose-500/10 border-rose-500/20" : "bg-emerald-500/10 border-emerald-500/20"}`}>
                  <div className={`text-lg font-bold ${isTampered ? "text-rose-400" : "text-emerald-400"}`}>
                    {isTampered ? "TAMPERING DETECTED" : "NO TAMPERING DETECTED"}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Based on digital integrity twin status
                  </div>
                </div>

                {/* Model Info */}
                <div className="space-y-2">
                  {[
                    { label: "Model", value: "Hybrid Swin-Unet" },
                    { label: "Visualization", value: "Gradient-weighted Class Activation Map (Grad-CAM)" },
                    { label: "Training Dataset", value: "Synthetic Data" },
                    { label: "Image Modality", value: twin?.metadata?.image_type || selectedImage?.image_type || "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="text-[10px] text-slate-600 font-bold uppercase">{label}</span>
                      <span className="text-[10px] text-slate-300 text-right">{value}</span>
                    </div>
                  ))}
                </div>

                {isTampered && twin?.region_integrity_map?.length > 0 && (
                  <div className="bg-slate-900/60 rounded-xl p-3 space-y-1 border border-slate-800/60">
                    <div className="text-[9px] text-slate-600 font-bold uppercase">Primary Suspicious Region</div>
                    {twin.region_integrity_map.slice(0, 1).map((r: any, i: number) => (
                      <div key={i} className="grid grid-cols-2 gap-1 text-[10px]">
                        <div><span className="text-slate-600">X:</span> <span className="text-slate-300">{r.x ?? "—"}</span></div>
                        <div><span className="text-slate-600">Y:</span> <span className="text-slate-300">{r.y ?? "—"}</span></div>
                        <div><span className="text-slate-600">W:</span> <span className="text-slate-300">{r.width ?? "—"}</span></div>
                        <div><span className="text-slate-600">H:</span> <span className="text-slate-300">{r.height ?? "—"}</span></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center">
                <div className="text-slate-700 text-xs text-center">
                  <Images className="h-8 w-8 mx-auto mb-2 text-slate-800" />
                  Select an image to see the explanation
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 bg-slate-900/40 rounded-xl p-2.5 border border-slate-800/40">
              <Info className="h-3 w-3 text-slate-600 flex-shrink-0 mt-0.5" />
              <p className="text-[9px] text-slate-600 leading-relaxed">
                AI analysis is advisory. Do not base clinical decisions solely on model output.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
