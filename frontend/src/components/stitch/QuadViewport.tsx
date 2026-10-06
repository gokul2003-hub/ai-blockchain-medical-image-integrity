import React, { useState, useEffect } from "react";
import { fetchProtectedBlobUrl, apiClient } from "../../services/api";
import { LoadingState } from "./States";

type ArtifactStatus = "loading" | "ok" | "error";

interface BBox { x?: number; y?: number; width?: number; height?: number; }

interface IntegrityEvidence {
  tamper_percentage?: number | null;
  ai_confidence?: number | null;
  hash_match?: boolean | null;
  verification_status?: string | null;
  affected_regions?: BBox[] | null;
  ai_forensics?: { bounding_boxes?: BBox[]; heatmap_available?: boolean; analyzed?: boolean } | null;
}

interface QuadViewportProps {
  imageId: number | null;
  patientName?: string;
  studyModality?: string;
  anomalyDetected?: boolean;
  tamperConfidence?: number;
  tamperPercentage?: number;
  className?: string;
}

type ViewTab = "quad" | "original" | "current" | "heatmap" | "localization" | "srm";

const NOT_AVAILABLE = "Not available — artifact missing or endpoint error";

export const QuadViewport: React.FC<QuadViewportProps> = ({
  imageId,
  patientName = "Selected Study",
  studyModality = "DICOM Series",
  anomalyDetected = false,
  tamperConfidence,
  tamperPercentage,
  className = "",
}) => {
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [loading, setLoading] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [srmUrl, setSrmUrl] = useState<string | null>(null);
  const [maskUrl, setMaskUrl] = useState<string | null>(null);
  const [heatmapUrl, setHeatmapUrl] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<ArtifactStatus>("loading");
  const [srmStatus, setSrmStatus] = useState<ArtifactStatus>("loading");
  const [maskStatus, setMaskStatus] = useState<ArtifactStatus>("loading");
  const [heatmapStatus, setHeatmapStatus] = useState<ArtifactStatus>("loading");
  const [evidence, setEvidence] = useState<IntegrityEvidence | null>(null);
  const [evidenceStatus, setEvidenceStatus] = useState<ArtifactStatus>("loading");
  const [activeTab, setActiveTab] = useState<ViewTab>("quad");

  useEffect(() => {
    let isMounted = true;
    let createdUrls: string[] = [];

    const revokeAll = (urls: string[]) => urls.forEach((u) => URL.revokeObjectURL(u));

    if (!imageId) {
      setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setSrmUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setMaskUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setHeatmapUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setEvidence(null);
      setEvidenceStatus("error");
      return;
    }

    setLoading(true);
    setPreviewStatus("loading");
    setSrmStatus("loading");
    setMaskStatus("loading");
    setHeatmapStatus("loading");
    setEvidenceStatus("loading");

    // Real backend forensic artifacts — each endpoint tracked independently so a
    // 404/500 on one layer never fabricates a substitute image for another.
    Promise.allSettled([
      fetchProtectedBlobUrl(`/api/images/preview/${imageId}`),
      fetchProtectedBlobUrl(`/api/images/srm-residual/${imageId}`),
      fetchProtectedBlobUrl(`/api/images/localization-mask/by-image/${imageId}`),
      fetchProtectedBlobUrl(`/api/images/heatmap/by-image/${imageId}`),
    ]).then(([previewRes, srmRes, maskRes, heatmapRes]) => {
      if (!isMounted) {
        revokeAll([previewRes, srmRes, maskRes, heatmapRes]
          .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled")
          .map((r) => r.value));
        return;
      }
      if (previewRes.status === "fulfilled") {
        createdUrls.push(previewRes.value);
        setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return previewRes.value; });
        setPreviewStatus("ok");
      } else {
        setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
        setPreviewStatus("error");
      }
      if (srmRes.status === "fulfilled") {
        createdUrls.push(srmRes.value);
        setSrmUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return srmRes.value; });
        setSrmStatus("ok");
      } else {
        setSrmUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
        setSrmStatus("error");
      }
      if (maskRes.status === "fulfilled") {
        createdUrls.push(maskRes.value);
        setMaskUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return maskRes.value; });
        setMaskStatus("ok");
      } else {
        setMaskUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
        setMaskStatus("error");
      }
      if (heatmapRes.status === "fulfilled") {
        createdUrls.push(heatmapRes.value);
        setHeatmapUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return heatmapRes.value; });
        setHeatmapStatus("ok");
      } else {
        setHeatmapUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
        setHeatmapStatus("error");
      }
      setLoading(false);
    });

    // Real integrity evidence (affected_regions / ai_forensics / risk) — drives
    // the "Suspicious Region" strip. Missing evidence => honest "Not available".
    apiClient.get(`/api/images/${imageId}/integrity-evidence`)
      .then((res) => {
        if (!isMounted) return;
        setEvidence(res.data);
        setEvidenceStatus("ok");
      })
      .catch(() => {
        if (!isMounted) return;
        setEvidence(null);
        setEvidenceStatus("error");
      });

    return () => {
      isMounted = false;
      revokeAll(createdUrls);
    };
  }, [imageId]);

  const handleZoom = (delta: number) => {
    setZoomLevel((prev) => Math.min(300, Math.max(50, prev + delta)));
  };

  const statusChip = (status: ArtifactStatus, label: string) => {
    if (status === "loading") {
      return (
        <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface-variant font-label-sm text-[10px]">
          Loading…
        </span>
      );
    }
    if (status === "ok") {
      return (
        <span className="px-2 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed font-label-sm text-[10px]">
          {label}: Available
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded bg-error-container text-on-error-container font-label-sm text-[10px]">
        {label}: Not available
      </span>
    );
  };

  const unavailablePanel = (message: string) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
      <span className="material-symbols-outlined text-3xl text-slate-600">broken_image</span>
      <span className="font-code-sm text-xs text-slate-400">Not available</span>
      <span className="font-code-sm text-[10px] text-slate-600 max-w-[240px]">{message}</span>
    </div>
  );

  // Real region data from integrity-evidence only: affected_regions first,
  // then ai_forensics.bounding_boxes. Empty/missing => "Not available".
  const regionList: BBox[] | null =
    evidenceStatus === "ok" && evidence
      ? (Array.isArray(evidence.affected_regions) && evidence.affected_regions.length > 0
          ? evidence.affected_regions
          : Array.isArray(evidence?.ai_forensics?.bounding_boxes) && (evidence.ai_forensics?.bounding_boxes?.length ?? 0) > 0
            ? evidence.ai_forensics!.bounding_boxes!
            : null)
      : null;

  if (!imageId) {
    return (
      <div className="bg-surface-container-lowest rounded-xl p-8 border border-surface-container-high text-center flex flex-col items-center justify-center min-h-[360px]">
        <div className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-outline mb-3">
          <span className="material-symbols-outlined text-2xl">radiology</span>
        </div>
        <h4 className="font-headline-sm text-base font-semibold text-on-surface">
          No Scan Selected for Quad Forensics
        </h4>
        <p className="font-body-sm text-xs text-on-surface-variant max-w-sm mt-1">
          Select an imaging study from your worklist or repository to inspect real-time neural residuals, Swin-UNet localization, and PACS provenance.
        </p>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {/* Top Controls Chrome */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-container-low p-2 rounded-xl border border-surface-container-high/60">
        <div className="flex items-center gap-1">
          {/* Zoom controls */}
          <div className="flex items-center bg-surface-container-lowest rounded px-2 py-1 shadow-sm border border-surface-container-high/40">
            <button
              onClick={() => handleZoom(-25)}
              className="p-1 rounded hover:bg-surface-container text-on-surface-variant"
              title="Zoom Out"
            >
              <span className="material-symbols-outlined text-[16px]">zoom_out</span>
            </button>
            <span className="font-code-sm text-xs text-on-surface font-semibold px-2 min-w-[45px] text-center">
              {zoomLevel}%
            </span>
            <button
              onClick={() => handleZoom(25)}
              className="p-1 rounded hover:bg-surface-container text-on-surface-variant"
              title="Zoom In"
            >
              <span className="material-symbols-outlined text-[16px]">zoom_in</span>
            </button>
          </div>

          <button
            onClick={() => setZoomLevel(100)}
            className="px-2.5 py-1 rounded bg-surface-container-lowest text-on-surface-variant hover:text-on-surface font-label-sm text-xs shadow-sm border border-surface-container-high/40"
          >
            Reset
          </button>
        </div>

        {/* Viewport Modes — every tab maps to a real backend artifact endpoint */}
        <div className="flex flex-wrap items-center gap-1 bg-surface-container-lowest p-0.5 rounded-lg border border-surface-container-high/40">
          {([
            { id: "quad" as ViewTab, label: "Quad-Channel" },
            { id: "original" as ViewTab, label: "Original" },
            { id: "current" as ViewTab, label: "Current" },
            { id: "heatmap" as ViewTab, label: "Heatmap / Grad-CAM" },
            { id: "localization" as ViewTab, label: "Localization Mask" },
            { id: "srm" as ViewTab, label: "SRM Residual" },
          ]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-2.5 py-1 rounded font-label-sm text-xs transition-colors ${
                activeTab === tab.id
                  ? "bg-primary text-on-primary font-semibold shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Numbered forensic flow caption — Original → Current → Heatmap/Grad-CAM → Localization → Suspicious Region */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 font-label-sm text-[11px] text-on-surface-variant">
        <span className="font-semibold text-on-surface">Forensic flow:</span>
        <span>1. Original</span><span className="text-outline">→</span>
        <span>2. Current (tamper state)</span><span className="text-outline">→</span>
        <span>3. Heatmap / Grad-CAM</span><span className="text-outline">→</span>
        <span>4. Localization Mask</span><span className="text-outline">→</span>
        <span className="text-on-surface">5. Suspicious Region</span>
      </div>

      {loading ? (
        <LoadingState message="Decrypting protected cryptographic scan layers..." heightClass="min-h-[400px]" />
      ) : (
        <div
          className={`grid gap-3 ${
            activeTab === "quad" ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
          }`}
        >
          {/* Channel 1: Original / Current decrypted scan (GET /api/images/preview/{id}) */}
          {(activeTab === "quad" || activeTab === "original" || activeTab === "current") && (
            <div className="flex flex-col rounded-xl overflow-hidden bg-surface-container-lowest border border-surface-container-high/60 shadow-sm">
              <div className="px-3 py-2 bg-surface-container-low flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      anomalyDetected ? "bg-error animate-pulse" : "bg-secondary"
                    }`}
                  />
                  <span className="font-label-md text-xs font-semibold text-on-surface">
                    {activeTab === "current"
                      ? "2. Current Stored Scan State"
                      : activeTab === "original"
                        ? "1. Original Ingested Scan"
                        : "1–2. Original / Current Scan"}
                  </span>
                </div>
                {statusChip(previewStatus, "Preview")}
              </div>
              <div className="relative bg-[#0D1117] h-72 flex items-center justify-center overflow-hidden">
                {previewStatus === "loading" ? (
                  <span className="material-symbols-outlined text-3xl text-slate-600 animate-spin">progress_activity</span>
                ) : previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={activeTab === "current" ? "Current stored scan" : "Original ingested scan"}
                    className="max-h-full max-w-full object-contain transition-transform duration-200"
                    style={{ transform: `scale(${zoomLevel / 100})` }}
                  />
                ) : (
                  unavailablePanel(NOT_AVAILABLE)
                )}
                <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 text-white font-code-sm text-[11px] backdrop-blur-sm">
                  {studyModality} • Image #{imageId}
                </div>
              </div>
              <div className="px-3 py-1.5 bg-surface-container-low border-t border-surface-container-high/40 font-code-sm text-[10px] text-on-surface-variant">
                Source: <span className="text-on-surface">GET /api/images/preview/{imageId}</span>
                {evidenceStatus === "ok" && evidence?.hash_match !== undefined && evidence?.hash_match !== null
                  ? ` • SHA-3 match: ${evidence.hash_match ? "Yes" : "No"}${evidence.verification_status ? ` (${evidence.verification_status})` : ""}`
                  : " • SHA-3 match: Not available"}
              </div>
            </div>
          )}

          {/* Channel 2: SRM Micro-Noise Residual (GET /api/images/srm-residual/{id}) */}
          {(activeTab === "quad" || activeTab === "srm") && (
            <div className="flex flex-col rounded-xl overflow-hidden bg-surface-container-lowest border border-surface-container-high/60 shadow-sm">
              <div className="px-3 py-2 bg-surface-container-low flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span className="font-label-md text-xs font-semibold text-on-surface">
                    3. SRM Residual Filter (Stego Noise)
                  </span>
                </div>
                {statusChip(srmStatus, "SRM")}
              </div>
              <div className="relative bg-[#0D1117] h-72 flex items-center justify-center overflow-hidden">
                {srmStatus === "loading" ? (
                  <span className="material-symbols-outlined text-3xl text-slate-600 animate-spin">progress_activity</span>
                ) : srmUrl ? (
                  <img
                    src={srmUrl}
                    alt="SRM Residual Filter"
                    className="max-h-full max-w-full object-contain filter contrast-125 transition-transform duration-200"
                    style={{ transform: `scale(${zoomLevel / 100})` }}
                  />
                ) : (
                  unavailablePanel(NOT_AVAILABLE)
                )}
                <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 text-white font-code-sm text-[11px] backdrop-blur-sm">
                  Noise Discrepancy Stream
                </div>
              </div>
              <div className="px-3 py-1.5 bg-surface-container-low border-t border-surface-container-high/40 font-code-sm text-[10px] text-on-surface-variant">
                Source: <span className="text-on-surface">GET /api/images/srm-residual/{imageId}</span>
              </div>
            </div>
          )}

          {/* Channel 3: Swin-UNet Localization Mask (GET /api/images/localization-mask/by-image/{id}) */}
          {(activeTab === "quad" || activeTab === "localization") && (
            <div className="flex flex-col rounded-xl overflow-hidden bg-surface-container-lowest border border-surface-container-high/60 shadow-sm">
              <div className="px-3 py-2 bg-surface-container-low flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-tertiary" />
                  <span className="font-label-md text-xs font-semibold text-on-surface">
                    4. Swin-UNet Localization Mask
                  </span>
                </div>
                {statusChip(maskStatus, "Localization")}
              </div>
              <div className="relative bg-[#0D1117] h-72 flex items-center justify-center overflow-hidden">
                {maskStatus === "loading" ? (
                  <span className="material-symbols-outlined text-3xl text-slate-600 animate-spin">progress_activity</span>
                ) : maskUrl ? (
                  <img
                    src={maskUrl}
                    alt="Swin-UNet Localization Mask"
                    className="max-h-full max-w-full object-contain transition-transform duration-200"
                    style={{ transform: `scale(${zoomLevel / 100})` }}
                  />
                ) : (
                  unavailablePanel(NOT_AVAILABLE)
                )}
                <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 text-white font-code-sm text-[11px] backdrop-blur-sm">
                  Altered Bed:{" "}
                  {tamperPercentage !== undefined && tamperPercentage !== null
                    ? `${tamperPercentage.toFixed(2)}%`
                    : evidenceStatus === "ok" && evidence?.tamper_percentage != null
                      ? `${evidence.tamper_percentage.toFixed(2)}%`
                      : "Not available"}
                </div>
              </div>
              <div className="px-3 py-1.5 bg-surface-container-low border-t border-surface-container-high/40 font-code-sm text-[10px] text-on-surface-variant">
                Source: <span className="text-on-surface">GET /api/images/localization-mask/by-image/{imageId}</span>
              </div>
            </div>
          )}

          {/* Channel 4: Heatmap / Grad-CAM overlay (GET /api/images/heatmap/by-image/{id}) */}
          {(activeTab === "quad" || activeTab === "heatmap") && (
            <div className="flex flex-col rounded-xl overflow-hidden bg-surface-container-lowest border border-surface-container-high/60 shadow-sm">
              <div className="px-3 py-2 bg-surface-container-low flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-secondary" />
                  <span className="font-label-md text-xs font-semibold text-on-surface">
                    5. Heatmap / Grad-CAM Neural Attention
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {tamperConfidence !== undefined && tamperConfidence !== null && (
                    <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-sm text-[10px]">
                      Conf {(tamperConfidence * 100).toFixed(1)}%
                    </span>
                  )}
                  {statusChip(heatmapStatus, "Heatmap/Grad-CAM")}
                </div>
              </div>
              <div className="relative bg-[#0D1117] h-72 flex items-center justify-center overflow-hidden">
                {heatmapStatus === "loading" ? (
                  <span className="material-symbols-outlined text-3xl text-slate-600 animate-spin">progress_activity</span>
                ) : heatmapUrl ? (
                  <img
                    src={heatmapUrl}
                    alt="Heatmap / Grad-CAM attention overlay"
                    className="max-h-full max-w-full object-contain transition-transform duration-200"
                    style={{ transform: `scale(${zoomLevel / 100})` }}
                  />
                ) : (
                  unavailablePanel(NOT_AVAILABLE)
                )}
                <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 text-white font-code-sm text-[11px] backdrop-blur-sm">
                  Grad-CAM attribution overlay (JET colormap from model bottleneck gradients)
                </div>
              </div>
              <div className="px-3 py-1.5 bg-surface-container-low border-t border-surface-container-high/40 font-code-sm text-[10px] text-on-surface-variant">
                Source: <span className="text-on-surface">GET /api/images/heatmap/by-image/{imageId}</span> — backend writes the Grad-CAM overlay as heatmap_img_{imageId}.png (no separate Grad-CAM artifact endpoint)
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAMPER LOCATION strip — real integrity-evidence region data only */}
      <div className="bg-surface-container-low rounded-xl border border-surface-container-high/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-label-md text-xs font-semibold text-on-surface uppercase tracking-wider">
            5. Suspicious Region (TAMPER LOCATION)
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {statusChip(maskStatus, "Localization")}
            {statusChip(heatmapStatus, "Heatmap")}
            {statusChip(heatmapStatus, "Grad-CAM")}
          </div>
        </div>
        <div className="mt-2 font-code-sm text-xs text-on-surface-variant space-y-1">
          {evidenceStatus === "loading" ? (
            <span>Loading integrity evidence…</span>
          ) : evidenceStatus === "error" ? (
            <span>Not available — integrity-evidence endpoint unreachable for this image</span>
          ) : regionList && regionList.length > 0 ? (
            <>
              <div>
                Detected suspicious region: {regionList.length} region{regionList.length > 1 ? "s" : ""} (backend AI forensic output)
              </div>
              <div className="space-y-0.5">
                {regionList.slice(0, 8).map((r, i) => (
                  <div key={i}>
                    Region #{i + 1}: X {r.x ?? "—"}, Y {r.y ?? "—"} · W {r.width ?? "—"}, H {r.height ?? "—"}
                  </div>
                ))}
                {regionList.length > 8 && <div>…and {regionList.length - 8} more</div>}
              </div>
            </>
          ) : (
            <span>Not available — backend returned no region data for this image</span>
          )}
        </div>
      </div>
    </div>
  );
};
export default QuadViewport;
