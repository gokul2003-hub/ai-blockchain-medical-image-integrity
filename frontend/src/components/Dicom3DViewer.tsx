import React, { useState, useEffect, useRef } from "react";
import { Layers, Sun, Eye, Sliders, Box, Maximize2 } from "lucide-react";

interface Dicom3DViewerProps {
  imageUrl?: string;
  title?: string;
}

export default function Dicom3DViewer({ imageUrl, title = "DICOM 3D Scan" }: Dicom3DViewerProps) {
  const [sliceIndex, setSliceIndex] = useState(16);
  const [activePlane, setActivePlane] = useState<"axial" | "sagittal" | "coronal">("axial");
  const [windowWidth, setWindowWidth] = useState(400);
  const [windowLevel, setWindowLevel] = useState(40);
  const [showHeatmap, setShowHeatmap] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Draw 3D Multi-Planar Reconstruction (MPR) slices dynamically
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Dark background
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, w, h);

    // Render simulated 3D volumetric slice grid
    const numCircles = 8;
    const cx = w / 2;
    const cy = h / 2;
    
    const contrast = Math.min(255, Math.max(0, (255 * (1000 / windowWidth))));
    const brightness = Math.min(100, Math.max(-100, windowLevel));

    // Draw slice grid / anatomy representation
    for (let r = numCircles * 12; r > 0; r -= 14) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + (sliceIndex % 5), 0, Math.PI * 2);
      const val = Math.floor(((r / (numCircles * 12)) * contrast) + brightness);
      ctx.strokeStyle = `rgb(${val}, ${val + 10}, ${val + 20})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Grid crosshairs for MPR plane alignment
    ctx.strokeStyle = "rgba(59, 130, 246, 0.4)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw 3D Tamper Bounding Box overlay if enabled
    if (showHeatmap && sliceIndex >= 12 && sliceIndex <= 20) {
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2.5;
      ctx.strokeRect(cx - 40, cy - 35, 75, 75);

      ctx.fillStyle = "rgba(239, 68, 68, 0.25)";
      ctx.fillRect(cx - 40, cy - 35, 75, 75);

      ctx.fillStyle = "#ef4444";
      ctx.font = "10px sans-serif";
      ctx.fillText("TAMPER ANOMALY DETECTED", cx - 38, cy - 42);
    }

    // Slice orientation text
    ctx.fillStyle = "#94a3b8";
    ctx.font = "11px monospace";
    ctx.fillText(`Plane: ${activePlane.toUpperCase()}`, 12, 20);
    ctx.fillText(`Slice: ${sliceIndex} / 32`, 12, 36);
    ctx.fillText(`W/L: ${windowWidth} / ${windowLevel}`, 12, 52);
  }, [sliceIndex, activePlane, windowWidth, windowLevel, showHeatmap]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <Box className="h-5 w-5 text-blue-400" />
          <h3 className="font-bold text-xs text-slate-100 uppercase tracking-wide">
            3D Volumetric DICOM MPR Workstation - {title}
          </h3>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
          3D Multi-Planar Active
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
        {/* Canvas Display */}
        <div className="lg:col-span-3 bg-slate-950 rounded-xl p-2 flex flex-col items-center relative border border-slate-850">
          <canvas ref={canvasRef} width={420} height={320} className="rounded-lg shadow-inner w-full max-w-[420px] h-[320px]" />
          
          <div className="w-full flex items-center justify-between mt-3 px-2 text-[11px] text-slate-400">
            <span>Slice Navigation</span>
            <span className="font-mono text-blue-400 font-bold">{sliceIndex} / 32</span>
          </div>
          <input
            type="range"
            min={1}
            max={32}
            value={sliceIndex}
            onChange={(e) => setSliceIndex(parseInt(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 my-2"
          />
        </div>

        {/* Workstation Controls */}
        <div className="space-y-4 text-left bg-slate-950/60 p-3.5 rounded-xl border border-slate-850">
          <div>
            <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1.5 mb-2">
              <Layers className="h-3.5 w-3.5 text-slate-400" /> MPR Viewing Plane
            </label>
            <div className="grid grid-cols-3 gap-1">
              {(["axial", "sagittal", "coronal"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setActivePlane(p)}
                  className={`py-1.5 text-[10px] font-bold uppercase rounded-lg border transition-all cursor-pointer ${
                    activePlane === p
                      ? "bg-blue-600 text-white border-blue-500 glow-blue"
                      : "bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1.5 mb-1">
              <Sun className="h-3.5 w-3.5 text-slate-400" /> Window Width ({windowWidth})
            </label>
            <input
              type="range"
              min={100}
              max={1500}
              value={windowWidth}
              onChange={(e) => setWindowWidth(parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div>
            <label className="text-[10px] text-slate-500 font-bold uppercase flex items-center gap-1.5 mb-1">
              <Sliders className="h-3.5 w-3.5 text-slate-400" /> Window Level ({windowLevel})
            </label>
            <input
              type="range"
              min={-200}
              max={300}
              value={windowLevel}
              onChange={(e) => setWindowLevel(parseInt(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
          </div>

          <div className="pt-2 border-t border-slate-850">
            <button
              onClick={() => setShowHeatmap(!showHeatmap)}
              className={`w-full py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition-all cursor-pointer ${
                showHeatmap
                  ? "bg-rose-950/40 text-rose-300 border-rose-900/60"
                  : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
            >
              <Eye className="h-4 w-4" />
              {showHeatmap ? "Hide 3D Tamper Bounding Box" : "Show 3D Tamper Bounding Box"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
