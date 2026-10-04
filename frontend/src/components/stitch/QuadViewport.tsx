import React, { useState, useEffect } from "react";
import { fetchProtectedBlobUrl } from "../../services/api";
import { LoadingState } from "./States";

interface QuadViewportProps {
  imageId: number | null;
  patientName?: string;
  studyModality?: string;
  anomalyDetected?: boolean;
  tamperConfidence?: number;
  tamperPercentage?: number;
  className?: string;
}

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
  const [heatmapUrl, setHeatmapUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"quad" | "primary" | "srm" | "heatmap">("quad");

  useEffect(() => {
    let isMounted = true;
    let createdUrls: string[] = [];

    if (!imageId) {
      setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setSrmUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      setHeatmapUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      return;
    }

    setLoading(true);

    // Fetch authenticated blobs concurrently
    Promise.allSettled([
      fetchProtectedBlobUrl(`/api/images/preview/${imageId}`),
      fetchProtectedBlobUrl(`/api/images/srm-residual/${imageId}`),
      fetchProtectedBlobUrl(`/api/images/heatmap/by-image/${imageId}`),
    ]).then(([previewRes, srmRes, heatmapRes]) => {
      if (!isMounted) {
        if (previewRes.status === "fulfilled") URL.revokeObjectURL(previewRes.value);
        if (srmRes.status === "fulfilled") URL.revokeObjectURL(srmRes.value);
        if (heatmapRes.status === "fulfilled") URL.revokeObjectURL(heatmapRes.value);
        return;
      }
      if (previewRes.status === "fulfilled") {
        createdUrls.push(previewRes.value);
        setPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return previewRes.value; });
      }
      if (srmRes.status === "fulfilled") {
        createdUrls.push(srmRes.value);
        setSrmUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return srmRes.value; });
      }
      if (heatmapRes.status === "fulfilled") {
        createdUrls.push(heatmapRes.value);
        setHeatmapUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return heatmapRes.value; });
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [imageId]);

  const handleZoom = (delta: number) => {
    setZoomLevel((prev) => Math.min(300, Math.max(50, prev + delta)));
  };

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

        {/* Viewport Modes */}
        <div className="flex items-center gap-1 bg-surface-container-lowest p-0.5 rounded-lg border border-surface-container-high/40">
          <button
            onClick={() => setActiveTab("quad")}
            className={`px-2.5 py-1 rounded font-label-sm text-xs transition-colors ${
              activeTab === "quad"
                ? "bg-primary text-on-primary font-semibold shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Quad-Channel
          </button>
          <button
            onClick={() => setActiveTab("primary")}
            className={`px-2.5 py-1 rounded font-label-sm text-xs transition-colors ${
              activeTab === "primary"
                ? "bg-primary text-on-primary font-semibold shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            PACS Ingestion
          </button>
          <button
            onClick={() => setActiveTab("srm")}
            className={`px-2.5 py-1 rounded font-label-sm text-xs transition-colors ${
              activeTab === "srm"
                ? "bg-primary text-on-primary font-semibold shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            SRM Residual
          </button>
          <button
            onClick={() => setActiveTab("heatmap")}
            className={`px-2.5 py-1 rounded font-label-sm text-xs transition-colors ${
              activeTab === "heatmap"
                ? "bg-primary text-on-primary font-semibold shadow-sm"
                : "text-on-surface-variant hover:text-on-surface"
            }`}
          >
            Swin-UNet Heatmap
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingState message="Decrypting protected cryptographic scan layers..." heightClass="min-h-[400px]" />
      ) : (
        <div
          className={`grid gap-3 ${
            activeTab === "quad" ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
          }`}
        >
          {/* Channel 1: Ingested Scan */}
          {(activeTab === "quad" || activeTab === "primary") && (
            <div className="flex flex-col rounded-xl overflow-hidden bg-surface-container-lowest border border-surface-container-high/60 shadow-sm">
              <div className="px-3 py-2 bg-surface-container-low flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      anomalyDetected ? "bg-error animate-pulse" : "bg-secondary"
                    }`}
                  />
                  <span className="font-label-md text-xs font-semibold text-on-surface">
                    1. Ingested Scan (PACS Direct)
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded font-label-sm text-[10px] ${
                    anomalyDetected
                      ? "bg-error-container text-on-error-container"
                      : "bg-secondary-fixed text-on-secondary-fixed"
                  }`}
                >
                  {anomalyDetected ? "Tamper Flagged" : "Validated"}
                </span>
              </div>
              <div className="relative bg-[#0D1117] h-72 flex items-center justify-center overflow-hidden">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Ingested Scan"
                    className="max-h-full max-w-full object-contain transition-transform duration-200"
                    style={{ transform: `scale(${zoomLevel / 100})` }}
                  />
                ) : (
                  <span className="font-code-sm text-xs text-slate-500">
                    Image preview unavailable
                  </span>
                )}
                <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 text-white font-code-sm text-[11px] backdrop-blur-sm">
                  {studyModality} • Image #{imageId}
                </div>
              </div>
            </div>
          )}

          {/* Channel 2: SRM Micro-Noise Residual */}
          {(activeTab === "quad" || activeTab === "srm") && (
            <div className="flex flex-col rounded-xl overflow-hidden bg-surface-container-lowest border border-surface-container-high/60 shadow-sm">
              <div className="px-3 py-2 bg-surface-container-low flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-primary" />
                  <span className="font-label-md text-xs font-semibold text-on-surface">
                    2. SRM Residual Filter (Stego Noise)
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded bg-primary-fixed text-on-primary-fixed font-label-sm text-[10px]">
                  30 High-Pass Sub-bands
                </span>
              </div>
              <div className="relative bg-[#0D1117] h-72 flex items-center justify-center overflow-hidden">
                {srmUrl ? (
                  <img
                    src={srmUrl}
                    alt="SRM Residual Filter"
                    className="max-h-full max-w-full object-contain filter contrast-125 transition-transform duration-200"
                    style={{ transform: `scale(${zoomLevel / 100})` }}
                  />
                ) : (
                  <span className="font-code-sm text-xs text-slate-500">
                    SRM noise model processing...
                  </span>
                )}
                <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 text-white font-code-sm text-[11px] backdrop-blur-sm">
                  Noise Discrepancy Stream
                </div>
              </div>
            </div>
          )}

          {/* Channel 3: Swin-UNet Localization Map */}
          {(activeTab === "quad" || activeTab === "heatmap") && (
            <div className="flex flex-col rounded-xl overflow-hidden bg-surface-container-lowest border border-surface-container-high/60 shadow-sm">
              <div className="px-3 py-2 bg-surface-container-low flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-tertiary" />
                  <span className="font-label-md text-xs font-semibold text-on-surface">
                    3. Swin-UNet Localization Mask
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed-variant font-label-sm text-[10px]">
                  {tamperConfidence ? `${(tamperConfidence * 100).toFixed(1)}% Conf` : "Pixel Heatmap"}
                </span>
              </div>
              <div className="relative bg-[#0D1117] h-72 flex items-center justify-center overflow-hidden">
                {heatmapUrl ? (
                  <img
                    src={heatmapUrl}
                    alt="Swin-UNet Heatmap"
                    className="max-h-full max-w-full object-contain transition-transform duration-200"
                    style={{ transform: `scale(${zoomLevel / 100})` }}
                  />
                ) : (
                  <span className="font-code-sm text-xs text-slate-500">
                    {anomalyDetected ? "Heatmap generating..." : "No pixel alterations detected"}
                  </span>
                )}
                <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 text-white font-code-sm text-[11px] backdrop-blur-sm">
                  Altered Bed: {tamperPercentage !== undefined ? `${tamperPercentage.toFixed(2)}%` : "0.00%"}
                </div>
              </div>
            </div>
          )}

          {/* Channel 4: Grad-CAM Neural Attention Map */}
          {activeTab === "quad" && (
            <div className="flex flex-col rounded-xl overflow-hidden bg-surface-container-lowest border border-surface-container-high/60 shadow-sm">
              <div className="px-3 py-2 bg-surface-container-low flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-secondary" />
                  <span className="font-label-md text-xs font-semibold text-on-surface">
                    4. Grad-CAM Neural Attention Map
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded bg-surface-container text-on-surface font-label-sm text-[10px]">
                  Bottleneck Focus
                </span>
              </div>
              <div className="relative bg-[#0D1117] h-72 flex items-center justify-center overflow-hidden">
                {heatmapUrl ? (
                  <img
                    src={heatmapUrl}
                    alt="Grad-CAM Attention Map"
                    className="max-h-full max-w-full object-contain filter hue-rotate-45 transition-transform duration-200"
                    style={{ transform: `scale(${zoomLevel / 100})` }}
                  />
                ) : previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Scan Focus"
                    className="max-h-full max-w-full object-contain opacity-60 transition-transform duration-200"
                    style={{ transform: `scale(${zoomLevel / 100})` }}
                  />
                ) : (
                  <span className="font-code-sm text-xs text-slate-500">
                    Attention map standby
                  </span>
                )}
                <div className="absolute bottom-2 left-2 px-2 py-1 rounded bg-black/60 text-white font-code-sm text-[11px] backdrop-blur-sm">
                  Salience Overlay
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
export default QuadViewport;
