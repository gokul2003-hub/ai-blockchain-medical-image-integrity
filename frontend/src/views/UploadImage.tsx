import React, { useState, useEffect, useCallback } from "react";
import {
  Upload, FileImage, Users, Shield, Lock, Database,
  CheckCircle2, RefreshCw, AlertTriangle, ChevronRight, X,
} from "lucide-react";
import { apiClient, apiService } from "../services/api";
import { useToast } from "../components/Toast";

interface UploadImageProps {
  token: string;
  onViewChange: (view: string) => void;
  /** Fires with the REAL fast-accept payload (image_id, job_id, status). */
  onAccepted?: (payload: any) => void;
}

interface Patient {
  id: number;
  username: string;
  patient_profile: { id: number; blood_group: string } | null;
}

interface UploadResult {
  id: number;
  job_id?: string;
  status?: string;
  worker_queued?: boolean;
  worker_error?: string | null;
  trusted_hash?: string;
  storage_provider?: string;
  upload_accepted_ms?: number;
  message?: string;
}

type UploadType = "standard" | "dicom";

const STEPS = [
  { id: 1, label: "Select Image", icon: FileImage },
  { id: 2, label: "Validation",   icon: Shield },
  { id: 3, label: "Preprocessing",icon: RefreshCw },
  { id: 4, label: "Encryption",   icon: Lock },
  { id: 5, label: "Hash (SHA-3)", icon: Shield },
  { id: 6, label: "Secure Storage",icon: Database },
  { id: 7, label: "Blockchain Reg.",icon: CheckCircle2 },
];

export default function UploadImage({ token, onViewChange, onAccepted }: UploadImageProps) {
  const [uploadType, setUploadType] = useState<UploadType>("standard");
  const [patients, setPatients]   = useState<Patient[]>([]);
  const [patientId, setPatientId] = useState("");
  const [title, setTitle]         = useState("");
  const [modality, setModality]   = useState("MRI");
  const [file, setFile]           = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress]   = useState(0);
  const [result, setResult]       = useState<UploadResult | null>(null);
  const [error, setError]         = useState("");
  const { success, error: toastError } = useToast();

  const loadPatients = useCallback(async () => {
    try {
      const res = await apiClient.get("/api/users/patients");
      setPatients(Array.isArray(res.data) ? res.data : []);
      if (res.data?.length > 0 && res.data[0].patient_profile) {
        setPatientId(String(res.data[0].patient_profile.id));
      }
    } catch {
      // silently fail — patient list may be empty for radiologists
    }
  }, []);

  useEffect(() => { loadPatients(); }, [loadPatients]);

  const simulateStep = (step: number, delay = 600) =>
    new Promise<void>(res => setTimeout(() => { setCurrentStep(step); res(); }, delay));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !patientId || !title) return;

    setUploading(true);
    setError("");
    setResult(null);
    setCurrentStep(1);
    setProgress(5);

    const formData = new FormData();
    formData.append("title", title);
    formData.append("patient_id", patientId);
    formData.append("file", file);
    if (uploadType === "standard") formData.append("image_type", modality);

    try {
      // FAST-ACCEPT: the backend performs validation, preprocessing, 4D Chen +
      // AES-256-GCM, SHA-3, Digital Integrity Twin, encrypted storage and the
      // ledger registration, then queues the expensive AI forensic work and
      // returns immediately with real image_id / job_id.
      setProgress(10);
      const res = await apiService.uploadAsync(formData);

      // The backend really completed the integrity chain before returning.
      setProgress(100);
      for (let s = 2; s <= 7; s++) setCurrentStep(s);
      setResult({
        id: res.image_id,
        job_id: res.job_id,
        status: res.status,
        worker_queued: res.worker_queued,
        worker_error: res.worker_error,
        trusted_hash: res.trusted_sha3,
        storage_provider: res.storage_provider,
        upload_accepted_ms: res.upload_accepted_ms,
        message: res.message,
      });
      onAccepted?.(res);
      success(
        "Study Imported",
        res.worker_queued
          ? `"${title}" imported (Image #${res.image_id}). Security processing continues in the background.`
          : `"${title}" imported (Image #${res.image_id}), but background processing was NOT queued.`
      );
      setTitle("");
      setFile(null);
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Upload failed. Please check the file and try again.";
      setError(msg);
      toastError("Upload Failed", msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full space-y-5 max-w-5xl">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
          <Upload className="h-5 w-5 text-blue-400" />
          Secure Image Upload
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          All uploads are preprocessed, AES-256-GCM encrypted, SHA-3 hashed, and registered on the blockchain.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Step Indicator */}
        <div className="glass-panel p-5">
          <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-4">Upload Pipeline</h3>
          <div className="space-y-1">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const done = currentStep > step.id;
              const active = currentStep === step.id;
              return (
                <div key={step.id} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold border-2 transition-all ${
                      done   ? "bg-emerald-500 border-emerald-500 text-white" :
                      active ? "bg-blue-600 border-blue-500 text-white animate-pulse" :
                               "bg-slate-900 border-slate-700 text-slate-600"
                    }`}>
                      {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : step.id}
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`w-0.5 h-4 mt-0.5 rounded transition-colors ${done ? "bg-emerald-500/40" : "bg-slate-800"}`} />
                    )}
                  </div>
                  <div className="pt-1">
                    <div className={`text-xs font-semibold transition-colors ${
                      done ? "text-emerald-400" : active ? "text-blue-300" : "text-slate-600"
                    }`}>
                      {step.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Progress Bar */}
          {uploading && (
            <div className="mt-5">
              <div className="flex justify-between text-[10px] text-slate-500 mb-1">
                <span>Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-1.5 bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Upload Form */}
        <div className="lg:col-span-2 space-y-5">
          <div className="glass-panel p-6">
            {/* Upload type toggle */}
            <div className="flex gap-1 bg-slate-950 rounded-xl p-1 mb-5 w-fit">
              {(["standard", "dicom"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setUploadType(t)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    uploadType === t
                      ? "bg-blue-600 text-white shadow-md"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {t === "standard" ? "Standard Image" : "DICOM Scan"}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Patient */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Users className="h-3 w-3" /> Patient
                </label>
                <select
                  value={patientId}
                  onChange={e => setPatientId(e.target.value)}
                  required
                  className="w-full bg-slate-950 border border-slate-800 px-3 py-2.5 rounded-xl text-xs text-slate-200 outline-none focus:border-blue-600 cursor-pointer"
                  aria-label="Select patient"
                >
                  <option value="">Select patient...</option>
                  {patients.map(p => (
                    <option key={p.id} value={p.patient_profile?.id}>
                      {p.username}{p.patient_profile ? ` (${p.patient_profile.blood_group})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  Scan Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                  placeholder="e.g. Brain MRI T2 Contrast Enhanced"
                  className="w-full bg-slate-950 border border-slate-800 px-3 py-2.5 rounded-xl text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-blue-600"
                />
              </div>

              {/* Modality (standard only) */}
              {uploadType === "standard" && (
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Modality</label>
                  <select
                    value={modality}
                    onChange={e => setModality(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 px-3 py-2.5 rounded-xl text-xs text-slate-200 outline-none focus:border-blue-600 cursor-pointer"
                    aria-label="Select modality"
                  >
                    {["MRI", "CT", "XRay", "Ultrasound", "PET"].map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* File Drop */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  {uploadType === "dicom" ? "DICOM File (.dcm)" : "Image File"}
                </label>
                <label className="relative flex flex-col items-center justify-center border-2 border-dashed border-slate-800 hover:border-blue-500/40 rounded-2xl bg-slate-950 p-8 transition-all cursor-pointer">
                  <input
                    type="file"
                    onChange={e => setFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    accept={uploadType === "dicom" ? ".dcm" : "image/*"}
                    required
                    aria-label="Select file to upload"
                  />
                  <Upload className="h-7 w-7 text-slate-600 mb-2" />
                  {file ? (
                    <div className="text-center">
                      <div className="text-xs text-slate-300 font-semibold">{file.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <div className="text-xs text-slate-400">Click or drag file here</div>
                      <div className="text-[10px] text-slate-600 mt-0.5">
                        {uploadType === "dicom" ? "DICOM .dcm up to 50MB" : "PNG, JPEG up to 10MB"}
                      </div>
                    </div>
                  )}
                </label>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 flex items-center gap-2 text-xs text-rose-400">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  {error}
                  <button type="button" onClick={() => setError("")} className="ml-auto cursor-pointer">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={uploading || !file || !patientId || !title}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-lg shadow-blue-900/30"
              >
                {uploading ? (
                  <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Processing & Registering...</>
                ) : (
                  <><Lock className="h-3.5 w-3.5" /> Encrypt, Hash & Register</>
                )}
              </button>
            </form>
          </div>

          {/* Upload Receipt */}
          {result && (
            <div className="glass-panel p-5 border-emerald-800/30 glow-emerald">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-800/60 pb-3">
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-100">Upload Receipt — Blockchain Registered</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { label: "Image ID", value: `#${result.id}` },
                  { label: "Job ID", value: result.job_id ? result.job_id.slice(0, 18) : "N/A" },
                  { label: "Upload accepted", value: result.upload_accepted_ms != null ? `${result.upload_accepted_ms} ms` : "N/A" },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-900/60 rounded-xl p-3">
                    <div className="text-[9px] text-slate-600 font-bold uppercase tracking-wider mb-1">{label}</div>
                    <div className="text-slate-200 font-mono text-xs font-semibold">{value}</div>
                  </div>
                ))}
                <div className="col-span-2 sm:col-span-3 bg-slate-900/60 rounded-xl p-3">
                  <div className="text-[9px] text-slate-600 font-bold uppercase tracking-wider mb-1">Trusted SHA-3 Baseline</div>
                  <div className="font-hash text-emerald-400 break-all text-[10px]">{result.trusted_hash || "N/A"}</div>
                </div>
              </div>
              <div className="mt-3 text-[10px] text-slate-400 bg-slate-950/60 rounded-lg p-2.5 border border-slate-800">
                {result.worker_queued === false
                  ? `Study stored and integrity-registered, but background processing was NOT queued: ${result.worker_error || "worker broker unavailable"}. The study is NOT marked verified.`
                  : "Integrity chain complete (4D Chen → AES-256-GCM → SHA-3 → Digital Integrity Twin → encrypted storage → ledger). AI forensics continue in the background worker; this study is not marked verified until they finish."}
              </div>
              <button
                onClick={() => onViewChange("medical-images")}
                className="mt-3 flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 cursor-pointer"
              >
                View all images <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
