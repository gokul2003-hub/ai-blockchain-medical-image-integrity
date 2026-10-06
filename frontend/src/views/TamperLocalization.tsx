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

type ViewMode = "original" | "heatmap" | "mask" | "overlay" | "split";
type ArtifactStatus = "loading" | "ok" | "error";

interface BBox { x?: number; y?: number; width?: number; height?: number; }

interface IntegrityEvidence {
  affected_regions?: BBox[] | null;
  ai_forensics?: { bounding_boxes?: BBox[] | null } | null;
  tamper_percentage?: number | null;
  ai_confidence?: number | null;
  verification_status?: string | null;
  hash_match?: boolean | null;
}

export default function TamperLocalization({ token, selectedImageId, onSelectImage }: TamperLocalizationProps) {
  const [images, setImages]       = useState<ImageRecord[]>([]);
  const [imgSearch, setImgSearch] = useState("");
  const [origSrc, setOrigSrc]     = useState<string | null>(null);
  const [heatSrc, setHeatSrc]     = useState<string | null>(null);
  const [maskSrc, setMaskSrc]     = useState<string | null>(null);
  const [loadingOrig, setLoadingOrig] = useState(false);
  const [loadingHeat, setLoadingHeat] = useState(false);
  const [loadingMask, setLoadingMask] = useState(false);
  const [heatStatus, setHeatStatus]   = useState<ArtifactStatus>("loading");
  const [maskStatus, setMaskStatus]   = useState<ArtifactStatus>("loading");
  const [evidence, setEvidence]       = useState<IntegrityEvidence | null>(null);
  const [evidenceStatus, setEvidenceStatus] = useState<ArtifactStatus>("loading");
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
    setOrigSrc(null); setHeatSrc(null); setMaskSrc(null);
    setLoadingOrig(true); setLoadingHeat(true); setLoadingMask(true);
    setHeatStatus("loading"); setMaskStatus("loading");
    setEvidenceStatus("loading"); setEvidence(null);

    try {
      const url = await fetchProtectedBlobUrl(`/api/images/preview/${id}`);
      blobsRef.current.push(url);
      setOrigSrc(url);
    } catch {
      setOrigSrc(null);
    } finally { setLoadingOrig(false); }

    try {
      // Heatmap endpoint serves the Grad-CAM attribution overlay (JET colormap)
      // written by the AI pipeline — same artifact, honestly labelled.
      const url = await fetchProtectedBlobUrl(`/api/images/heatmap/by-image/${id}`);
      blobsRef.current.push(url);
      setHeatSrc(url); setHeatStatus("ok");
    } catch {
      setHeatSrc(null); setHeatStatus("error");
    } finally { setLoadingHeat(false); }

    try {
      // Swin-UNet binary localization mask
      const url = await fetchProtectedBlobUrl(`/api/images/localization-mask/by-image/${id}`);
      blobsRef.current.push(url);
      setMaskSrc(url); setMaskStatus("ok");
    } catch {
      setMaskSrc(null); setMaskStatus("error");
    } finally { setLoadingMask(false); }

    try {
      const res = await apiClient.get(`/api/images/${id}/integrity-evidence`);
      setEvidence(res.data); setEvidenceStatus("ok");
    } catch {
      setEvidence(null); setEvidenceStatus("error");
    }
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
    { id: "mask",     label: "Localization" },
    { id: "overlay",  label: "Overlay" },
    { id: "split",    label: "Split" },
  ];

  const availChip = (status: ArtifactStatus, label: string) => (
    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
      status === "ok" ? "bg-emerald-900/60 text-emerald-300"
      : status === "error" ? "bg-rose-900/60 text-rose-300"
      : "bg-slate-800 text-slate-400"}`}>
      {label}: {status === "ok" ? "Available" : status === "error" ? "Not available" : "Loading…"}
    </span>
  );

  // Real region data from integrity-evidence only
  const regionList: BBox[] | null =
    evidenceStatus === "ok" && evidence
      ? (Array.isArray(evidence.affected_regions) && evidence.affected_regions.length > 0
          ? evidence.affected_regions
          : Array.isArray(evidence.ai_forensics?.bounding_boxes) && (evidence.ai_forensics?.bounding_boxes?.length ?? 0) > 0
            ? evidence.ai_forensics!.bounding_boxes!
            : null)
      : null;

  const unavailableBox = (label: string) => (
    <div className="text-slate-600 text-xs text-center space-y-1">
      <AlertTriangle className="h-5 w-5 mx-auto text-slate-700" />
      <div className="font-semibold text-slate-500">Not available</div>
      <div className="text-[10px] text-slate-700">{label}</div>
    </div>
  );

  return (
    <div className="w-full space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
          <Crosshair className="h-5 w-5 text-rose-400" />
          Tamper Localization
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Real backend artifacts · Grad-CAM overlay via heatmap endpoint · Swin-UNet binary mask via localization-mask endpoint
        </p>
        {/* Numbered forensic flow caption */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-300">Flow:</span>
          <span>1. Original</span><span>→</span>
          <span>2. Current (tamper state)</span><span>→</span>
          <span>3. Heatmap / Grad-CAM</span><span>→</span>
          <span>4. Localization Mask</span><span>→</span>
          <span className="font-semibold text-slate-300">5. Suspicious Region</span>
        </div>
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
        <div className="xl:col-span-3 space-y-5">
          <div className="glass-panel overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800/60 flex items-center justify-between bg-slate-900/40">
            <span className="text-xs font-semibold text-slate-300">
              {viewMode === "split" ? "Original / Heatmap-Grad-CAM" : viewModes.find(v => v.id === viewMode)?.label}
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
                    unavailableBox("Preview endpoint failed for this image")
                  )}
                </div>
                {/* Heatmap / Grad-CAM */}
                <div className="flex items-center justify-center p-4 relative">
                  <div className="absolute top-2 left-2 text-[9px] bg-slate-900/80 text-rose-400 px-2 py-0.5 rounded font-bold">HEATMAP / GRAD-CAM</div>
                  {loadingHeat ? (
                    <RefreshCw className="h-5 w-5 animate-spin text-slate-600" />
                  ) : heatSrc ? (
                    <img src={heatSrc} alt="Heatmap / Grad-CAM overlay" className="max-h-[440px] max-w-full object-contain" />
                  ) : (
                    unavailableBox("Heatmap / Grad-CAM artifact missing for this image")
                  )}
                </div>
              </div>
            ) : viewMode === "original" ? (
              <div className="flex items-center justify-center p-4" style={{ minHeight: "480px" }}>
                {loadingOrig ? <RefreshCw className="h-6 w-6 animate-spin text-slate-600" /> :
                  origSrc ? <img src={origSrc} alt="Original" className="max-h-[480px] object-contain" /> :
                  unavailableBox("Preview endpoint failed for this image")}
              </div>
            ) : viewMode === "heatmap" ? (
              <div className="flex items-center justify-center p-4" style={{ minHeight: "480px" }}>
                {loadingHeat ? <RefreshCw className="h-6 w-6 animate-spin text-slate-600" /> :
                  heatSrc ? <img src={heatSrc} alt="Heatmap / Grad-CAM" className="max-h-[480px] object-contain" /> :
                  unavailableBox("Heatmap / Grad-CAM artifact missing for this image")}
              </div>
            ) : viewMode === "mask" ? (
              <div className="flex items-center justify-center p-4" style={{ minHeight: "480px" }}>
                {loadingMask ? <RefreshCw className="h-6 w-6 animate-spin text-slate-600" /> :
                  maskSrc ? <img src={maskSrc} alt="Localization mask" className="max-h-[480px] object-contain" /> :
                  unavailableBox("Localization mask artifact missing for this image")}
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

          {/* TAMPER LOCATION — evidence panel (real integrity-evidence region data only) */}
          <div className="glass-panel p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Crosshair className="h-3.5 w-3.5" /> TAMPER LOCATION
              </span>
              <div className="flex flex-wrap gap-1.5">
                {availChip(maskStatus, "Localization")}
                {availChip(heatStatus, "Heatmap")}
                {availChip(heatStatus, "Grad-CAM")}
              </div>
            </div>

            <div className="space-y-1.5 font-mono text-[11px] text-slate-400">
              {evidenceStatus === "loading" ? (
                <div className="flex items-center gap-2 text-slate-500">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading integrity evidence…
                </div>
              ) : evidenceStatus === "error" ? (
                <div className="text-slate-600 italic">
                  Not available — integrity-evidence endpoint unreachable for this image
                </div>
              ) : regionList && regionList.length > 0 ? (
                <>
                  <div className="text-slate-300">
                    Detected suspicious region: {regionList.length} region{regionList.length > 1 ? "s" : ""} (backend AI forensic output)
                  </div>
                  {regionList.slice(0, 10).map((r, i) => (
                    <div key={i} className="flex justify-between border-b border-slate-900/50 last:border-b-0 py-0.5">
                      <span className="text-rose-400 font-bold">Region #{i + 1}</span>
                      <span>X: {r.x ?? "—"}, Y: {r.y ?? "—"} · W: {r.width ?? "—"}, H: {r.height ?? "—"}</span>
                    </div>
                  ))}
                  {regionList.length > 10 && <div className="text-slate-600">…and {regionList.length - 10} more</div>}
                </>
              ) : (
                <div className="text-slate-600 italic">
                  Not available — backend returned no region data for this image
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
