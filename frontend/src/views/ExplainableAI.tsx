import React, { useState, useEffect, useCallback, useRef } from "react";
import { BrainCircuit, RefreshCw, Images, Info, AlertTriangle, Crosshair } from "lucide-react";
import { fetchProtectedBlobUrl, apiClient } from "../services/api";

interface ExplainableAIProps {
  token: string;
  selectedImageId: number | null;
  onSelectImage: (id: number) => void;
}

interface ImageRecord { id: number; title: string; image_type: string; quarantine_status: boolean; }

type ArtifactStatus = "loading" | "ok" | "error";

interface BBox { x?: number; y?: number; width?: number; height?: number; }

interface IntegrityEvidence {
  ai_confidence?: number | null;
  ai_model?: string | null;
  verification_status?: string | null;
  hash_match?: boolean | null;
  affected_regions?: BBox[] | null;
  ai_forensics?: {
    bounding_boxes?: BBox[] | null;
    regions?: { region_id?: string; x?: number; y?: number; width?: number; height?: number; severity?: string }[] | null;
    model_name?: string | null;
    model_version?: string | null;
    confidence_score?: number | null;
    model_provenance?: { dataset_type?: string | null; model_name?: string | null } | null;
  } | null;
  digital_integrity_twin?: { region_integrity_map?: BBox[] | null } | null;
}

export default function ExplainableAI({ token, selectedImageId, onSelectImage }: ExplainableAIProps) {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [imgSearch, setImgSearch] = useState("");
  const [heatSrc, setHeatSrc] = useState<string | null>(null);
  const [origSrc, setOrigSrc] = useState<string | null>(null);
  const [maskSrc, setMaskSrc] = useState<string | null>(null);
  const [twin, setTwin] =       useState<any>(null);
  const [evidence, setEvidence] = useState<IntegrityEvidence | null>(null);
  const [loadingHeat, setLoadingHeat] = useState(false);
  const [loadingOrig, setLoadingOrig] = useState(false);
  const [loadingMask, setLoadingMask] = useState(false);
  const [heatStatus, setHeatStatus] = useState<ArtifactStatus>("loading");
  const [maskStatus, setMaskStatus] = useState<ArtifactStatus>("loading");
  const [evidenceStatus, setEvidenceStatus] = useState<ArtifactStatus>("loading");
  const blobsRef = useRef<string[]>([]);

  useEffect(() => {
    apiClient.get("/api/images/list").then(r => setImages(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  const loadData = useCallback(async (id: number) => {
    blobsRef.current.forEach(b => URL.revokeObjectURL(b));
    blobsRef.current = [];
    setHeatSrc(null); setOrigSrc(null); setMaskSrc(null); setTwin(null); setEvidence(null);
    setLoadingHeat(true); setLoadingOrig(true); setLoadingMask(true);
    setHeatStatus("loading"); setMaskStatus("loading"); setEvidenceStatus("loading");

    await Promise.all([
      // Heatmap endpoint serves the Grad-CAM attribution overlay written by the
      // AI pipeline (JET colormap + red ROI boxes) — same real artifact.
      fetchProtectedBlobUrl(`/api/images/heatmap/by-image/${id}`)
        .then(u => { blobsRef.current.push(u); setHeatSrc(u); setHeatStatus("ok"); })
        .catch(() => { setHeatSrc(null); setHeatStatus("error"); })
        .finally(() => setLoadingHeat(false)),
      fetchProtectedBlobUrl(`/api/images/preview/${id}`)
        .then(u => { blobsRef.current.push(u); setOrigSrc(u); })
        .catch(() => {})
        .finally(() => setLoadingOrig(false)),
      // Swin-UNet binary localization mask — real endpoint, availability tracked
      fetchProtectedBlobUrl(`/api/images/localization-mask/by-image/${id}`)
        .then(u => { blobsRef.current.push(u); setMaskSrc(u); setMaskStatus("ok"); })
        .catch(() => { setMaskSrc(null); setMaskStatus("error"); })
        .finally(() => setLoadingMask(false)),
      apiClient.get(`/api/images/digital-twin/${id}`)
        .then(r => setTwin(r.data))
        .catch(() => {}),
      // Real integrity evidence — model provenance + region data + confidence
      apiClient.get(`/api/images/${id}/integrity-evidence`)
        .then(r => { setEvidence(r.data); setEvidenceStatus("ok"); })
        .catch(() => { setEvidence(null); setEvidenceStatus("error"); }),
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
  const isTampered = selectedImage?.quarantine_status || twin?.verification_status === "QUARANTINED"
    || (evidenceStatus === "ok" && (evidence?.verification_status === "QUARANTINED" || evidence?.hash_match === false));

  // Real model provenance — from integrity-evidence ai_forensics.model_provenance
  // (written by the backend AI pipeline). Static fallbacks removed.
  const provenance = evidenceStatus === "ok" ? evidence?.ai_forensics?.model_provenance ?? null : null;
  const modelName =
    evidence?.ai_forensics?.model_name || provenance?.model_name || evidence?.ai_model || "Not available";
  const datasetType = provenance?.dataset_type || "Not available";
  const aiConfidence = evidence?.ai_confidence ?? evidence?.ai_forensics?.confidence_score ?? null;

  // Real region data: integrity-evidence regions (rich: region_id/severity) >
  // affected_regions / ai_forensics.bounding_boxes > digital-twin region_integrity_map
  const regionList: BBox[] | null =
    evidenceStatus === "ok" && evidence
      ? (Array.isArray(evidence.ai_forensics?.regions) && evidence.ai_forensics!.regions!.length > 0
          ? evidence.ai_forensics!.regions!
          : Array.isArray(evidence.affected_regions) && evidence.affected_regions.length > 0
            ? evidence.affected_regions
            : Array.isArray(evidence.ai_forensics?.bounding_boxes) && (evidence.ai_forensics?.bounding_boxes?.length ?? 0) > 0
              ? evidence.ai_forensics!.bounding_boxes!
              : null)
      : Array.isArray(twin?.region_integrity_map) && twin.region_integrity_map.length > 0
        ? twin.region_integrity_map
        : null;

  const availChip = (status: ArtifactStatus, label: string) => (
    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
      status === "ok" ? "bg-emerald-900/60 text-emerald-300"
      : status === "error" ? "bg-rose-900/60 text-rose-300"
      : "bg-slate-800 text-slate-400"}`}>
      {label}: {status === "ok" ? "Available" : status === "error" ? "Not available" : "Loading…"}
    </span>
  );

  return (
    <div className="w-full space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-violet-400" />
          Explainable AI
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Grad-CAM gradient visualization (served via heatmap endpoint) · Model attention regions · Prediction explanation
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
          {/* Heatmap / Grad-CAM Attention Map */}
          <div className="glass-panel overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-800/60 bg-slate-900/40 flex items-center justify-between">
              <span className="text-[10px] font-bold text-violet-400 uppercase tracking-wider">Heatmap / Grad-CAM Attention Map</span>
              <span className="flex gap-1.5">
                {availChip(heatStatus, "Heatmap")}
                {availChip(heatStatus, "Grad-CAM")}
              </span>
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
                 <div className="text-center text-slate-700 space-y-1">
                   {selectedImageId ? (
                     <>
                       <AlertTriangle className="h-5 w-5 mx-auto text-slate-600" />
                       <div className="text-xs font-semibold text-slate-500">Not available</div>
                       <div className="text-[10px] text-slate-700">Heatmap / Grad-CAM artifact missing for this image</div>
                     </>
                   ) : <div className="text-xs">No image selected</div>}
                 </div>
               )}
            </div>
            <div className="px-3 py-1.5 border-t border-slate-800/60 text-[9px] text-slate-600">
              Source: GET /api/images/heatmap/by-image/{selectedImageId ?? "—"} — backend writes the Grad-CAM overlay as heatmap_img_{selectedImageId ?? "—"}.png (no separate Grad-CAM artifact endpoint)
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
                    {evidenceStatus === "ok" && evidence?.verification_status ? ` · ${evidence.verification_status}` : ""}
                  </div>
                  {aiConfidence !== null && aiConfidence !== undefined && (
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Backend AI confidence: {(aiConfidence * 100).toFixed(1)}%
                    </div>
                  )}
                </div>

                {/* Model Info — real provenance from integrity-evidence; static values removed */}
                <div className="space-y-2">
                  {[
                    { label: "Model", value: modelName },
                    { label: "Visualization", value: "Gradient-weighted Class Activation Map (Grad-CAM)" },
                    { label: "Training Dataset", value: datasetType },
                    { label: "Image Modality", value: twin?.metadata?.image_type || selectedImage?.image_type || "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex justify-between gap-2">
                      <span className="text-[10px] text-slate-600 font-bold uppercase">{label}</span>
                      <span className="text-[10px] text-slate-300 text-right">{value}</span>
                    </div>
                  ))}
                </div>

                {/* TAMPER LOCATION — real backend region data only */}
                <div className="bg-slate-900/60 rounded-xl p-3 space-y-2 border border-slate-800/60">
                  <div className="text-[9px] text-slate-600 font-bold uppercase flex items-center gap-1.5">
                    <Crosshair className="h-3 w-3" /> TAMPER LOCATION
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {availChip(maskStatus, "Localization")}
                    {availChip(heatStatus, "Heatmap")}
                    {availChip(heatStatus, "Grad-CAM")}
                  </div>
                  {evidenceStatus === "loading" ? (
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                      <RefreshCw className="h-3 w-3 animate-spin" /> Loading region evidence…
                    </div>
                  ) : evidenceStatus === "error" && !Array.isArray(twin?.region_integrity_map) ? (
                    <div className="text-[10px] text-slate-600 italic">
                      Not available — integrity-evidence endpoint unreachable for this image
                    </div>
                  ) : regionList && regionList.length > 0 ? (
                    <div className="space-y-1">
                      <div className="text-[10px] text-slate-300">
                        Detected suspicious region: {regionList.length} region{regionList.length > 1 ? "s" : ""} (backend AI forensic output)
                      </div>
                      {regionList.slice(0, 6).map((r: any, i: number) => (
                        <div key={i} className="grid grid-cols-2 gap-1 text-[10px]">
                          <div><span className="text-slate-600">X:</span> <span className="text-slate-300">{r.x ?? "—"}</span></div>
                          <div><span className="text-slate-600">Y:</span> <span className="text-slate-300">{r.y ?? "—"}</span></div>
                          <div><span className="text-slate-600">W:</span> <span className="text-slate-300">{r.width ?? "—"}</span></div>
                          <div><span className="text-slate-600">H:</span> <span className="text-slate-300">{r.height ?? "—"}</span></div>
                          {r.severity && (
                            <div className="col-span-2"><span className="text-slate-600">Severity:</span> <span className="text-slate-300">{r.severity}</span></div>
                          )}
                        </div>
                      ))}
                      {regionList.length > 6 && <div className="text-[10px] text-slate-600">…and {regionList.length - 6} more</div>}
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-600 italic">
                      Not available — backend returned no region data for this image
                    </div>
                  )}
                </div>
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
