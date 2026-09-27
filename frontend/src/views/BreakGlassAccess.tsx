import React, { useState, useEffect } from "react";
import { Siren, ShieldAlert, AlertTriangle, Key, Search, User, Images } from "lucide-react";
import { apiClient } from "../services/api";
import { useToast } from "../components/Toast";
import ConfirmDialog from "../components/ConfirmDialog";

interface ImageRecord {
  id: number;
  title: string;
  patient_id: number;
}

interface BreakGlassAccessProps {
  token: string;
  role?: string | null;
}

export default function BreakGlassAccess({ token, role }: BreakGlassAccessProps) {
  const [images, setImages] = useState<ImageRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null);
  const [justification, setJustification] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { error: toastError, success } = useToast();

  const isEligibleRole = !role || ["doctor", "radiologist", "super_admin"].includes(role);

  useEffect(() => {
    // Only load all images if we can, else rely on user entering the exact ID
    apiClient.get("/api/images/list")
      .then(res => setImages(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  }, []);

  const handleOverride = async () => {
    if (!selectedImageId || !justification) return;
    setConfirmOpen(false);
    setLoading(true);

    try {
      await apiClient.post(`/api/permissions/emergency-override/${selectedImageId}?justification=${encodeURIComponent(justification)}`);
      success(
        "Emergency Override Authorized", 
        "Break-glass access granted. Action recorded in immutable audit log and patient notified."
      );
      setJustification("");
      setSelectedImageId(null);
    } catch (err: any) {
      toastError(
        "Emergency Override Failed", 
        err.response?.data?.detail || "Failed to authorize emergency access."
      );
    } finally {
      setLoading(false);
    }
  };

  const filteredImages = images.filter(img => 
    !search || img.title.toLowerCase().includes(search.toLowerCase()) || String(img.id).includes(search)
  );

  return (
    <div className="w-full space-y-6 max-w-4xl">
      <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-6">
        <h2 className="text-xl font-bold tracking-tight text-rose-400 flex items-center gap-2">
          <Siren className="h-6 w-6" />
          Emergency Break-Glass Access
        </h2>
        <p className="text-xs text-rose-200 mt-2">
          This facility allows authorized clinical staff to bypass standard consent controls in life-threatening emergencies.
          <br/><strong>WARNING:</strong> All break-glass events trigger critical security alerts, generate immutable blockchain audit records, and notify the Chief Information Security Officer (CISO) and the patient. Misuse is subject to severe disciplinary and legal action.
        </p>
      </div>

      {!isEligibleRole && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-xs text-amber-300 flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Role Ineligible for Emergency Access:</span> Break-glass access is strictly restricted to clinical staff (Doctors, Radiologists) and System Administrators. Your role (<span className="font-mono text-amber-200">{role}</span>) is not authorized to invoke emergency overrides.
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm Emergency Override"
        message="Are you absolutely sure you want to invoke emergency break-glass access? This action cannot be undone and will be permanently recorded in the blockchain audit ledger."
        confirmLabel="Invoke Emergency Access"
        cancelLabel="Cancel"
        destructive={true}
        onConfirm={handleOverride}
        onCancel={() => setConfirmOpen(false)}
      />

      <div className="glass-panel p-6 space-y-6">
        <div className="flex items-center gap-2 border-b border-slate-800/60 pb-3">
          <ShieldAlert className="h-5 w-5 text-amber-500" />
          <h3 className="text-sm font-bold text-slate-200">Override Authorization Form</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Target Selection */}
          <div className="space-y-4">
            <div>
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2 block">
                Target Image / Data Record
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search by ID or Title..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 pl-9 pr-3 py-2.5 rounded-xl text-xs text-slate-200 outline-none focus:border-rose-500"
                />
              </div>
            </div>
            
            <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl max-h-56 overflow-y-auto">
              {filteredImages.length > 0 ? (
                filteredImages.map(img => (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImageId(img.id)}
                    className={`w-full text-left px-3 py-2.5 text-xs transition-colors border-b border-slate-800/40 last:border-0 ${
                      selectedImageId === img.id ? "bg-rose-500/20 text-rose-300" : "hover:bg-slate-900 text-slate-400"
                    }`}
                  >
                    <div className="font-bold">{img.title}</div>
                    <div className="text-[9px] text-slate-500 mt-0.5 flex gap-2">
                      <span>Image #{img.id}</span>
                      <span>Patient #{img.patient_id}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="p-4 text-center text-slate-500 text-xs">
                  No records found matching search.
                </div>
              )}
            </div>
          </div>

          {/* Justification and Submit */}
          <div className="space-y-4 flex flex-col">
            <div className="flex-1">
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2 block">
                Clinical Justification (Required)
              </label>
              <textarea
                value={justification}
                onChange={e => setJustification(e.target.value)}
                placeholder="Describe the life-threatening emergency or clinical imperative..."
                className="w-full h-40 bg-slate-950 border border-slate-800 p-3 rounded-xl text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-rose-500 resize-none"
              />
              <div className="text-[10px] text-slate-500 mt-1 flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 flex-shrink-0 text-amber-500 mt-0.5" />
                Justification must be at least 15 characters and will be permanently recorded on the blockchain ledger.
              </div>
            </div>

            <button
              onClick={() => setConfirmOpen(true)}
              disabled={loading || !isEligibleRole || !selectedImageId || justification.trim().length < 15}
              className="w-full flex items-center justify-center gap-2 py-3 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl cursor-pointer shadow-lg shadow-rose-900/20 transition-colors mt-auto"
            >
              {loading ? "Processing Override..." : "Invoke Emergency Access"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
