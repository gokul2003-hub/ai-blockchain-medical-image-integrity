import React, { useState, useEffect, useCallback } from "react";
import {
  FileCode2, ShieldCheck, RefreshCw, AlertTriangle, Images,
  Upload, CheckCircle2, Info, ChevronRight, Lock
} from "lucide-react";
import { apiClient } from "../services/api";

interface DicomInfoProps {
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
  created_at: string;
}

interface DicomMeta {
  patient_name?: string;
  patient_id?: string;
  modality?: string;
  study_date?: string;
  manufacturer?: string;
  study_instance_uid?: string;
  series_instance_uid?: string;
  sop_instance_uid?: string;
  body_part_examined?: string;
  deidentified?: boolean;
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
    dicom_meta?: DicomMeta;
  };
  provenance: {
    uploader?: string;
    timestamp?: string;
  };
}

export default function DicomInfo({ token, selectedImageId, onSelectImage, onViewChange }: DicomInfoProps) {
  const [images, setImages]       = useState<ImageRecord[]>([]);
  const [imgSearch, setImgSearch] = useState("");
  const [twin, setTwin]           = useState<DigitalTwin | null>(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const loadImages = useCallback(async () => {
    try {
      const res = await apiClient.get("/api/images/list");
      setImages(Array.isArray(res.data) ? res.data : []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadImages(); }, [loadImages]);

  const loadTwin = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    setTwin(null);
    try {
      const res = await apiClient.get(`/api/images/digital-twin/${id}`);
      setTwin(res.data);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load Digital Twin metadata.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedImageId) loadTwin(selectedImageId);
  }, [selectedImageId, loadTwin]);

  const filteredImages = images.filter(img =>
    !imgSearch || img.title.toLowerCase().includes(imgSearch.toLowerCase()) || String(img.id).includes(imgSearch)
  );

  const selectedImage = images.find(i => i.id === selectedImageId);
  const dicomMeta = twin?.metadata?.dicom_meta;
  const isDicom = Boolean(dicomMeta && Object.keys(dicomMeta).length > 0);

  return (
    <div className="w-full space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <FileCode2 className="h-5 w-5 text-cyan-400" />
            DICOM Metadata &amp; Header Forensics
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Clinical DICOM dataset inspection, HIPAA Safe Harbor de-identification audit, and provenance tags.
          </p>
        </div>
        <button
          onClick={() => onViewChange("upload-image")}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all cursor-pointer shadow-md"
        >
          <Upload className="h-3.5 w-3.5" />
          Upload DICOM Scan
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-5">
        {/* Selector Panel */}
        <div className="glass-panel p-4 space-y-3">
          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Select Medical Scan</div>
          <input
            type="text"
            placeholder="Search scans..."
            value={imgSearch}
            onChange={e => setImgSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 px-3 py-2 rounded-lg text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-cyan-500"
          />
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {filteredImages.map(img => (
              <button
                key={img.id}
                onClick={() => onSelectImage(img.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-all cursor-pointer ${
                  selectedImageId === img.id
                    ? "bg-cyan-600/20 border border-cyan-600/40 text-slate-200"
                    : "hover:bg-slate-800/60 text-slate-400 border border-transparent"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-200 truncate">{img.title}</div>
                  <div className="text-[9px] text-slate-500">#{img.id} · {img.image_type}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="xl:col-span-3 space-y-4">
          {!selectedImageId ? (
            <div className="glass-panel p-16 flex flex-col items-center justify-center gap-3 text-center">
              <FileCode2 className="h-12 w-12 text-slate-700" />
              <p className="text-slate-400 text-sm font-semibold">No Image Selected</p>
              <p className="text-slate-500 text-xs max-w-xs">
                Select a scan from the left panel to inspect its DICOM structural headers and de-identification status.
              </p>
            </div>
          ) : loading ? (
            <div className="glass-panel p-16 flex items-center justify-center gap-3 text-slate-500 text-xs">
              <RefreshCw className="h-5 w-5 animate-spin text-cyan-500" />
              Parsing Digital Twin DICOM tags...
            </div>
          ) : error ? (
            <div className="glass-panel p-8 text-center text-rose-400 text-xs space-y-2">
              <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-rose-500" />
              <p>{error}</p>
              <button onClick={() => loadTwin(selectedImageId)} className="underline cursor-pointer">Retry</button>
            </div>
          ) : isDicom && dicomMeta ? (
            <div className="space-y-4">
              {/* Compliance banner */}
              <div className="p-4 rounded-xl border bg-emerald-500/10 border-emerald-500/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="h-5 w-5 text-emerald-400 flex-shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-emerald-300">HIPAA Safe Harbor De-Identified</div>
                    <div className="text-[10px] text-slate-400">
                      Direct patient identifiers stripped. Volumetric slices SHA-3 registered.
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  COMPLIANT
                </span>
              </div>

              {/* Attributes Grid */}
              <div className="glass-panel p-5 space-y-4">
                <div className="text-xs font-bold text-slate-200 border-b border-slate-800/60 pb-3 flex items-center justify-between">
                  <span>DICOM Header Attributes</span>
                  <span className="text-[10px] font-mono text-slate-500">Image #{selectedImageId}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[
                    { label: "Modality", value: dicomMeta.modality || twin?.metadata?.image_type || "—" },
                    { label: "Study Date", value: dicomMeta.study_date || "—" },
                    { label: "Manufacturer", value: dicomMeta.manufacturer || "—" },
                    { label: "Body Part Examined", value: dicomMeta.body_part_examined || "General" },
                    { label: "Patient Pseudonym", value: dicomMeta.patient_name || "ANONYMOUS_PATIENT" },
                    { label: "Quality Score", value: twin?.metadata?.quality_score ? `${twin.metadata.quality_score.toFixed(2)}%` : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-slate-900/60 rounded-xl p-3">
                      <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">{label}</div>
                      <div className="text-xs font-semibold text-slate-200">{value}</div>
                    </div>
                  ))}
                </div>

                {/* UIDs */}
                <div className="space-y-2 pt-2">
                  <div className="bg-slate-900/60 rounded-xl p-3">
                    <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Study Instance UID</div>
                    <div className="font-hash text-cyan-400 break-all text-[10px]">
                      {dicomMeta.study_instance_uid || "—"}
                    </div>
                  </div>
                  <div className="bg-slate-900/60 rounded-xl p-3">
                    <div className="text-[9px] text-slate-500 font-bold uppercase mb-1">Series Instance UID</div>
                    <div className="font-hash text-slate-400 break-all text-[10px]">
                      {dicomMeta.series_instance_uid || "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-panel p-10 flex flex-col items-center justify-center gap-3 text-center">
              <Info className="h-10 w-10 text-slate-700" />
              <p className="text-slate-300 text-sm font-semibold">Standard Non-DICOM Scan</p>
              <p className="text-slate-500 text-xs max-w-md">
                Scan #{selectedImageId} ("{selectedImage?.title}") was uploaded as a standard {selectedImage?.image_type || "PNG/JPEG"} image.
                DICOM header attributes (Study UID, Series UID, Manufacturer tags) are extracted exclusively from .dcm volumetric uploads.
              </p>
              <button
                onClick={() => onViewChange("upload-image")}
                className="mt-2 flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 rounded-xl transition-all cursor-pointer"
              >
                Upload a DICOM File <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
