import React, { useState, useRef } from "react";

interface FileUploadZoneProps {
  onUpload: (formData: FormData, isDicom: boolean) => Promise<void>;
  patients?: Array<{ id: number; name?: string; username: string }>;
  isDoctorOrAdmin?: boolean;
  className?: string;
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({
  onUpload,
  patients = [],
  isDoctorOrAdmin = false,
  className = "",
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState<string>("");
  const [imageType, setImageType] = useState<string>("MRI");
  const [patientId, setPatientId] = useState<string>("");
  const [uploading, setUploading] = useState<boolean>(false);
  const [dragOver, setDragOver] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const validateAndSetFile = (f: File) => {
    setError(null);
    setSuccess(null);
    const ext = f.name.split(".").pop()?.toLowerCase();
    const isDicom = ext === "dcm" || f.type.includes("dicom");
    const isImage = ["png", "jpg", "jpeg"].includes(ext || "") || f.type.startsWith("image/");

    if (!isDicom && !isImage) {
      setError("Supported file formats are DICOM (.dcm), PNG, or JPEG.");
      return;
    }

    setFile(f);
    if (!title) {
      setTitle(f.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select an image or DICOM study file.");
      return;
    }
    if (isDoctorOrAdmin && patients.length > 0 && !patientId) {
      setError("Please assign the scan to a patient.");
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const ext = file.name.split(".").pop()?.toLowerCase();
      const isDicom = ext === "dcm" || file.type.includes("dicom");

      const fd = new FormData();
      fd.append("file", file);
      if (title) fd.append("title", title);
      fd.append("image_type", imageType);
      if (patientId) fd.append("patient_id", patientId);

      await onUpload(fd, isDicom);
      setSuccess(`Scan "${file.name}" successfully registered with tamper-proof cryptographic ledger.`);
      setFile(null);
      setTitle("");
      setPatientId("");
      if (inputRef.current) inputRef.current.value = "";
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || "Failed to upload and secure scan.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`bg-surface-container-lowest rounded-xl p-space-lg border border-surface-container-high/60 shadow-sm space-y-4 ${className}`}
    >
      <div className="flex items-center justify-between pb-3 border-b border-surface-container-low">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[22px] text-primary">
            cloud_upload
          </span>
          <div>
            <h3 className="font-headline-sm text-base font-semibold text-on-surface">
              Secure Clinical Ingestion
            </h3>
            <p className="font-body-sm text-xs text-on-surface-variant">
              DICOM PS3.15 & standard scan registration with 4D chaos encryption and SHA-3 ledger hashing
            </p>
          </div>
        </div>
        <span className="px-2.5 py-0.5 rounded font-label-sm text-[11px] bg-secondary-fixed text-on-secondary-fixed font-semibold">
          AES-256-GCM Armed
        </span>
      </div>

      {/* Drag & Drop Box */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleFileDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors flex flex-col items-center justify-center gap-2 ${
          dragOver
            ? "border-primary bg-primary/5"
            : file
            ? "border-secondary bg-secondary/5"
            : "border-surface-container-high bg-surface-container-low hover:bg-surface-container"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".dcm,image/png,image/jpeg"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              validateAndSetFile(e.target.files[0]);
            }
          }}
        />

        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            file ? "bg-secondary-fixed text-secondary" : "bg-surface-container text-primary"
          }`}
        >
          <span className="material-symbols-outlined text-2xl">
            {file ? "task" : "upload_file"}
          </span>
        </div>

        {file ? (
          <div className="text-center">
            <span className="font-headline-sm text-sm font-semibold text-on-surface block">
              {file.name}
            </span>
            <span className="font-body-sm text-xs text-on-surface-variant">
              {(file.size / 1024 / 1024).toFixed(2)} MB • Ready for cryptographic anchoring
            </span>
          </div>
        ) : (
          <div className="text-center">
            <span className="font-headline-sm text-sm font-semibold text-on-surface block">
              Drag &amp; drop scan or browse
            </span>
            <span className="font-body-sm text-xs text-on-surface-variant">
              Supports DICOM (.dcm), PNG, and JPEG formats (Max 50MB)
            </span>
          </div>
        )}
      </div>

      {/* Metadata Inputs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="font-label-sm text-xs text-on-surface font-semibold block mb-1">
            Study / Scan Title
          </label>
          <input
            type="text"
            placeholder="e.g. Brain MRI Axial FLAIR"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full bg-surface-container-low text-on-surface font-body-sm text-xs px-3 py-2 rounded-lg border border-surface-container-high/60 focus:outline-none focus:border-primary"
          />
        </div>

        <div>
          <label className="font-label-sm text-xs text-on-surface font-semibold block mb-1">
            Modality
          </label>
          <select
            value={imageType}
            onChange={(e) => setImageType(e.target.value)}
            className="w-full bg-surface-container-low text-on-surface font-body-sm text-xs px-3 py-2 rounded-lg border border-surface-container-high/60 focus:outline-none focus:border-primary"
          >
            <option value="MRI">Magnetic Resonance Imaging (MRI)</option>
            <option value="CT">Computed Tomography (CT)</option>
            <option value="XRAY">Digital Radiography (X-Ray)</option>
            <option value="ULTRASOUND">Ultrasound Sonogram</option>
            <option value="HISTOLOGY">Histopathology</option>
          </select>
        </div>

        {isDoctorOrAdmin && patients.length > 0 && (
          <div>
            <label className="font-label-sm text-xs text-on-surface font-semibold block mb-1">
              Assign to Patient
            </label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full bg-surface-container-low text-on-surface font-body-sm text-xs px-3 py-2 rounded-lg border border-surface-container-high/60 focus:outline-none focus:border-primary"
            >
              <option value="">Select patient record...</option>
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.username} (ID: #{p.id})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="p-2.5 rounded-lg bg-error-container text-on-error-container font-body-sm text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">warning</span>
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="p-2.5 rounded-lg bg-secondary-container text-on-secondary-container font-body-sm text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">verified</span>
          <span>{success}</span>
        </div>
      )}

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={!file || uploading}
          className="px-5 py-2 rounded-lg bg-primary text-on-primary font-headline-sm text-xs font-semibold hover:bg-primary-container disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2"
        >
          {uploading ? (
            <>
              <span className="material-symbols-outlined text-sm animate-spin">
                progress_activity
              </span>
              <span>Encrypting &amp; Anchoring...</span>
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-sm">enhanced_encryption</span>
              <span>Register &amp; Anchor to Ledger</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
};
export default FileUploadZone;
