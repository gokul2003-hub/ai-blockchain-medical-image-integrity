import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Images, Search, Filter, RefreshCw, Upload, Eye, ShieldCheck,
  BrainCircuit, RefreshCcw, Link2, Download, AlertTriangle,
  ChevronLeft, ChevronRight, ScanSearch,
} from "lucide-react";
import { apiClient } from "../services/api";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";

interface MedicalImage {
  id: number;
  title: string;
  patient_id: number;
  image_type: string;
  quality_score: number;
  entropy: number;
  quarantine_status: boolean;
  created_at: string;
}

interface MedicalImagesProps {
  token: string;
  onViewChange: (view: string) => void;
  onSelectImage: (id: number) => void;
}

const PAGE_SIZE = 15;

const modalityColors: Record<string, string> = {
  MRI: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  CT: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  XRay: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  Ultrasound: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  PET: "bg-purple-500/15 text-purple-400 border-purple-500/30",
};

export default function MedicalImages({ token, onViewChange, onSelectImage }: MedicalImagesProps) {
  const [images, setImages] = useState<MedicalImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [modalityFilter, setModalityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [page, setPage] = useState(1);
  const { error: toastError } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.get("/api/images/list");
      setImages(Array.isArray(res.data) ? res.data : []);
      setPage(1);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to load medical images.";
      setError(msg);
      toastError("Load Failed", msg);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    return images.filter((img) => {
      const matchSearch = !search || img.title.toLowerCase().includes(search.toLowerCase()) ||
        String(img.id).includes(search);
      const matchModality = modalityFilter === "All" || img.image_type === modalityFilter;
      const matchStatus = statusFilter === "All" ||
        (statusFilter === "Quarantined" && img.quarantine_status) ||
        (statusFilter === "Verified" && !img.quarantine_status);
      return matchSearch && matchModality && matchStatus;
    });
  }, [images, search, modalityFilter, statusFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const qualityColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 60) return "text-amber-400";
    return "text-rose-400";
  };

  return (
    <div className="w-full space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Images className="h-5 w-5 text-blue-400" />
            Medical Images
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {images.length} encrypted scans · {images.filter(i => i.quarantine_status).length} quarantined
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            aria-label="Refresh image list"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={() => onViewChange("upload-image")}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all cursor-pointer shadow-md shadow-blue-900/30"
            aria-label="Upload new image"
          >
            <Upload className="h-3.5 w-3.5" />
            Upload Image
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-panel p-3 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search by title or ID..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full bg-slate-950 border border-slate-800 pl-8 pr-3 py-2 rounded-lg text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-blue-600 transition-colors"
            aria-label="Search images"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-500 flex-shrink-0" />
          <select
            value={modalityFilter}
            onChange={(e) => { setModalityFilter(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 px-2 py-2 rounded-lg text-xs text-slate-300 outline-none cursor-pointer focus:border-blue-600"
            aria-label="Filter by modality"
          >
            {["All", "MRI", "CT", "XRay", "Ultrasound", "PET"].map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-slate-950 border border-slate-800 px-2 py-2 rounded-lg text-xs text-slate-300 outline-none cursor-pointer focus:border-blue-600"
            aria-label="Filter by status"
          >
            {["All", "Verified", "Quarantined"].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <span className="text-[10px] text-slate-600 ml-auto">
          {filtered.length} result{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 flex items-center gap-3 text-xs text-rose-400">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          {error}
          <button onClick={load} className="ml-auto underline cursor-pointer hover:text-rose-300">Retry</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="glass-panel p-16 flex items-center justify-center gap-3 text-slate-500 text-xs">
          <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
          Loading encrypted scans from secure storage...
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <div className="glass-panel p-16 flex flex-col items-center justify-center gap-3 text-center">
          <Images className="h-10 w-10 text-slate-700" />
          <p className="text-slate-400 text-sm font-medium">
            {images.length === 0 ? "No medical images found" : "No images match your filters"}
          </p>
          {images.length === 0 && (
            <button
              onClick={() => onViewChange("upload-image")}
              className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl cursor-pointer"
            >
              Upload First Image
            </button>
          )}
        </div>
      )}

      {/* Table */}
      {!loading && !error && paginated.length > 0 && (
        <div className="glass-panel overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800/60 bg-slate-900/40">
                  {["#", "ID", "Title", "Modality", "Quality", "Uploaded", "Status", "Actions"].map(h => (
                    <th key={h} className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/30">
                {paginated.map((img, idx) => (
                  <tr key={img.id} className="hover:bg-slate-900/30 transition-colors group">
                    <td className="py-3 px-4 text-[10px] text-slate-600">
                      {(page - 1) * PAGE_SIZE + idx + 1}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-500">
                      #{img.id}
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs font-semibold text-slate-200 truncate max-w-[160px] block" title={img.title}>
                        {img.title}
                      </span>
                      <span className="text-[10px] text-slate-600">Patient #{img.patient_id}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${modalityColors[img.image_type] || "bg-slate-500/15 text-slate-400 border-slate-500/30"}`}>
                        {img.image_type}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-mono font-semibold ${qualityColor(img.quality_score)}`}>
                        {img.quality_score.toFixed(1)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[11px] text-slate-500 whitespace-nowrap">
                      {new Date(img.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge
                        status={img.quarantine_status ? "QUARANTINED" : "VERIFIED"}
                        size="xs"
                        pulse={img.quarantine_status}
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { onSelectImage(img.id); onViewChange("image-viewer"); }}
                          className="p-1.5 text-blue-400 hover:bg-blue-500/20 rounded-lg cursor-pointer transition-colors"
                          title="View Image"
                          aria-label={`View image ${img.id}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { onSelectImage(img.id); onViewChange("integrity-verification"); }}
                          className="p-1.5 text-emerald-400 hover:bg-emerald-500/20 rounded-lg cursor-pointer transition-colors"
                          title="Verify Integrity"
                          aria-label={`Verify image ${img.id}`}
                        >
                          <ShieldCheck className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => { onSelectImage(img.id); onViewChange("tamper-detection"); }}
                          className="p-1.5 text-purple-400 hover:bg-purple-500/20 rounded-lg cursor-pointer transition-colors"
                          title="AI Analysis"
                          aria-label={`Analyze image ${img.id}`}
                        >
                          <BrainCircuit className="h-3.5 w-3.5" />
                        </button>
                        {img.quarantine_status && (
                          <button
                            onClick={() => { onSelectImage(img.id); onViewChange("recovery-center"); }}
                            className="p-1.5 text-teal-400 hover:bg-teal-500/20 rounded-lg cursor-pointer transition-colors"
                            title="Recover Image"
                            aria-label={`Recover image ${img.id}`}
                          >
                            <RefreshCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => { onSelectImage(img.id); onViewChange("blockchain-audit"); }}
                          className="p-1.5 text-slate-400 hover:bg-slate-500/20 rounded-lg cursor-pointer transition-colors"
                          title="Blockchain Audit"
                          aria-label={`Audit image ${img.id}`}
                        >
                          <Link2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-800/40 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                Page {page} of {totalPages} · {filtered.length} total
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 disabled:opacity-30 cursor-pointer transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 disabled:opacity-30 cursor-pointer transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
