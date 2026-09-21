import React, { useState, useEffect, useCallback } from "react";
import {
  Shield,
  ShieldAlert,
  Key,
  Clock,
  Lock,
  RefreshCw,
  UserCheck,
  Trash2,
  History,
  FileImage,
  Download,
  Eye,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  Database,
  FileLock2,
  User,
} from "lucide-react";
import { apiClient, API_BASE_URL } from "../services/api";

interface PatientDashboardProps {
  token: string;
  activeView?: string;
}

// ─────────────────────────────────────────────────────────
// Sub-View: Dashboard (Overview / Stats)
// ─────────────────────────────────────────────────────────
function DashboardView({ token }: { token: string }) {
  const [profile, setProfile] = useState<any>(null);
  const [images, setImages] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [profileRes, imgRes, permRes] = await Promise.all([
          apiClient.get("/api/users/me"),
          apiClient.get("/api/images/list"),
          apiClient.get("/api/permissions"),
        ]);
        setProfile(profileRes.data);
        setImages(Array.isArray(imgRes.data) ? imgRes.data : []);
        setPermissions(Array.isArray(permRes.data) ? permRes.data : []);
      } catch (err: any) {
        setError("Failed to load dashboard data. Please try refreshing.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-500 text-xs animate-pulse">
        Loading patient dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-rose-500/15 border border-rose-500/20 text-rose-400 text-xs px-4 py-3 rounded-xl">
        {error}
      </div>
    );
  }

  const activeGrants = permissions.filter((p) => p.is_active !== false);
  const totalImages = images.length;

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-100">
          Patient Dashboard
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Welcome back,{" "}
          <span className="text-blue-400 font-semibold">
            {profile?.username}
          </span>
          . Your medical records are secured on the blockchain.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-4 space-y-2">
          <div className="flex items-center gap-2 text-slate-400 text-[10px] uppercase tracking-wider">
            <FileImage className="h-3.5 w-3.5 text-blue-500" />
            Medical Files
          </div>
          <div className="text-2xl font-bold text-slate-100">{totalImages}</div>
          <div className="text-[10px] text-slate-500">Encrypted scans stored</div>
        </div>

        <div className="glass-panel p-4 space-y-2">
          <div className="flex items-center gap-2 text-slate-400 text-[10px] uppercase tracking-wider">
            <Key className="h-3.5 w-3.5 text-emerald-500" />
            Active Grants
          </div>
          <div className="text-2xl font-bold text-slate-100">{activeGrants.length}</div>
          <div className="text-[10px] text-slate-500">Authorized access rules</div>
        </div>

        <div className="glass-panel p-4 space-y-2">
          <div className="flex items-center gap-2 text-slate-400 text-[10px] uppercase tracking-wider">
            <Shield className="h-3.5 w-3.5 text-violet-500" />
            Encryption
          </div>
          <div className="text-2xl font-bold text-emerald-400">AES-256</div>
          <div className="text-[10px] text-slate-500">4D Hyperchaotic cipher</div>
        </div>

        <div className="glass-panel p-4 space-y-2">
          <div className="flex items-center gap-2 text-slate-400 text-[10px] uppercase tracking-wider">
            <Database className="h-3.5 w-3.5 text-amber-500" />
            Blockchain
          </div>
          <div className="text-2xl font-bold text-emerald-400">Active</div>
          <div className="text-[10px] text-slate-500">Immutable audit ledger</div>
        </div>
      </div>

      {/* Patient Profile Card */}
      {profile?.patient_profile && (
        <div className="glass-panel p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
            <User className="h-4 w-4 text-blue-500" />
            Your Health Record Identity
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Date of Birth", value: profile.patient_profile.date_of_birth },
              { label: "Blood Group", value: profile.patient_profile.blood_group },
              { label: "Gender", value: profile.patient_profile.gender },
              { label: "Record ID", value: `#${profile.patient_profile.id}` },
            ].map(({ label, value }) => (
              <div key={label}>
                <span className="text-[9px] text-slate-500 font-bold uppercase tracking-wider">
                  {label}
                </span>
                <div className="text-slate-200 font-semibold text-sm mt-0.5">
                  {value || "—"}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Files Preview */}
      {images.length > 0 && (
        <div className="glass-panel p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
            <FileImage className="h-4 w-4 text-blue-500" />
            Recent Medical Scans
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-900 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  <th className="py-2 px-3">Title</th>
                  <th className="py-2 px-3">Modality</th>
                  <th className="py-2 px-3">AI Score</th>
                  <th className="py-2 px-3">Uploaded</th>
                  <th className="py-2 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60">
                {images.slice(0, 5).map((img) => (
                  <tr key={img.id} className="hover:bg-slate-900/20 text-xs">
                    <td className="py-2.5 px-3 font-semibold text-slate-200 truncate max-w-[160px]">
                      {img.title}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400">{img.modality || "—"}</td>
                    <td className="py-2.5 px-3">
                      <span className="bg-slate-900 text-blue-400 border border-slate-800 px-2 py-0.5 rounded text-[10px] font-bold">
                        {img.quality_score != null
                          ? `${(img.quality_score * 100).toFixed(1)}%`
                          : "—"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                      {img.created_at
                        ? new Date(img.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Sub-View: My Medical Files
// ─────────────────────────────────────────────────────────
function MedicalFilesView({ token }: { token: string }) {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState<number | null>(null);

  const loadImages = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.get("/api/images/list");
      setImages(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to load medical files.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  const handleDownload = async (imageId: number, title: string) => {
    setDownloading(imageId);
    try {
      const res = await apiClient.get(`/api/images/download/${imageId}`, {
        responseType: "arraybuffer",
      });
      const blob = new Blob([res.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title.replace(/\s+/g, "_")}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Download failed. You may not have permission.");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">
            My Medical Files
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            All your encrypted medical scans stored securely on the blockchain ledger.
          </p>
        </div>
        <button
          onClick={loadImages}
          className="px-4 py-2 bg-slate-900 border border-slate-800 text-xs font-semibold rounded-xl hover:bg-slate-800 cursor-pointer flex items-center gap-1.5 self-start"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </div>

      {error && (
        <div className="bg-rose-500/15 border border-rose-500/20 text-rose-400 text-xs px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-64 flex items-center justify-center text-slate-500 text-xs animate-pulse">
          Fetching encrypted scans from secure storage...
        </div>
      ) : images.length === 0 ? (
        <div className="glass-panel p-12 flex flex-col items-center justify-center text-center gap-3">
          <FileImage className="h-10 w-10 text-slate-600" />
          <p className="text-slate-500 text-xs">
            No medical scans found. Your assigned doctor will upload scans after your appointment.
          </p>
        </div>
      ) : (
        <div className="glass-panel p-6 space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-900 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  <th className="py-2.5 px-3">Title / Description</th>
                  <th className="py-2.5 px-3">Modality</th>
                  <th className="py-2.5 px-3">AI Confidence</th>
                  <th className="py-2.5 px-3">Encryption</th>
                  <th className="py-2.5 px-3">Uploaded</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900/60">
                {images.map((img) => (
                  <tr key={img.id} className="hover:bg-slate-900/20 text-xs">
                    <td className="py-3 px-3">
                      <div className="font-semibold text-slate-200">{img.title}</div>
                      {img.description && (
                        <div className="text-slate-500 text-[10px] mt-0.5 truncate max-w-[200px]">
                          {img.description}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className="bg-slate-900 text-slate-300 border border-slate-800 px-2 py-0.5 rounded text-[10px] font-semibold">
                        {img.modality || "SCAN"}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {img.quality_score != null ? (
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${(img.quality_score * 100).toFixed(0)}%` }}
                            />
                          </div>
                          <span className="text-blue-400 font-bold">
                            {(img.quality_score * 100).toFixed(1)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-emerald-400 font-bold text-[10px] flex items-center gap-1">
                        <Shield className="h-3 w-3" /> AES-256
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-400 text-[11px]">
                      {img.created_at
                        ? new Date(img.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => handleDownload(img.id, img.title)}
                        disabled={downloading === img.id}
                        className="text-blue-400 hover:text-white bg-slate-950 hover:bg-blue-600 border border-blue-900/40 px-2.5 py-1.5 rounded-xl cursor-pointer transition-all disabled:opacity-50 text-[10px] font-semibold flex items-center gap-1.5 ml-auto"
                        title="Download Decrypted Scan"
                      >
                        {downloading === img.id ? (
                          <RefreshCw className="h-3 w-3 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3" />
                        )}
                        Download
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-[10px] text-slate-600 pt-2 border-t border-slate-900">
            {images.length} scan{images.length !== 1 ? "s" : ""} found · All files are
            AES-256 encrypted · Downloads are logged on the blockchain ledger.
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Sub-View: Grant Access Control
// ─────────────────────────────────────────────────────────
function AccessControlView({ token }: { token: string }) {
  const [profile, setProfile] = useState<any>(null);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [hospitals, setHospitals] = useState<any[]>([]);

  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [selectedHospitalId, setSelectedHospitalId] = useState("");
  const [accessType, setAccessType] = useState("READ");
  const [expiresInHours, setExpiresInHours] = useState("24");
  const [allowEmergency, setAllowEmergency] = useState(false);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [userRes, permRes, docRes, hospRes] = await Promise.all([
        apiClient.get("/api/users/me"),
        apiClient.get("/api/permissions"),
        apiClient.get("/api/users/doctors"),
        apiClient.get("/api/hospitals"),
      ]);
      setProfile(userRes.data);
      setPermissions(Array.isArray(permRes.data) ? permRes.data : []);
      setDoctors(Array.isArray(docRes.data) ? docRes.data : []);
      setHospitals(Array.isArray(hospRes.data) ? hospRes.data : []);
    } catch (err: any) {
      setError("Failed to load access control data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.patient_profile) return;
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      await apiClient.post("/api/permissions", {
        patient_id: profile.patient_profile.id,
        doctor_id: selectedDoctorId ? parseInt(selectedDoctorId) : null,
        hospital_id: selectedHospitalId ? parseInt(selectedHospitalId) : null,
        access_type: accessType,
        expires_in_hours: expiresInHours ? parseInt(expiresInHours) : null,
        is_emergency: allowEmergency,
      });
      setSuccess("Smart contract permission granted and registered on the blockchain!");
      setSelectedDoctorId("");
      setSelectedHospitalId("");
      setAllowEmergency(false);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to grant access rule.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (permId: number) => {
    setActionLoading(permId);
    setError("");
    setSuccess("");
    try {
      await apiClient.post(`/api/permissions/revoke/${permId}`, {});
      setSuccess("Permission revoked. Smart contract access terminated.");
      fetchData();
    } catch (err: any) {
      setError("Failed to revoke access rule.");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">
            Grant Access Control
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Authorise or revoke specific doctors and hospitals access to your medical images.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-slate-900 border border-slate-800 text-xs font-semibold rounded-xl hover:bg-slate-800 cursor-pointer flex items-center gap-1.5 self-start"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Reload Ledger
        </button>
      </div>

      {success && (
        <div className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-xs px-4 py-3 rounded-xl">
          {success}
        </div>
      )}
      {error && (
        <div className="bg-rose-500/15 border border-rose-500/20 text-rose-400 text-xs px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Active Consent Clearances */}
        <div className="lg:col-span-2 glass-panel p-6 space-y-4">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide border-b border-slate-900 pb-3 flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-blue-500" /> Active Consent Clearances
          </h3>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-slate-500 text-xs animate-pulse">
              Querying smart contract permissions registry...
            </div>
          ) : permissions.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-slate-500 text-xs text-center p-6 bg-slate-950/20 border border-slate-900 rounded-2xl">
              <div className="space-y-2">
                <Lock className="h-8 w-8 text-slate-700 mx-auto" />
                <p>No active access grants found. Your medical scans are fully locked.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-900 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Authorized Entity</th>
                    <th className="py-2.5 px-3">Scope</th>
                    <th className="py-2.5 px-3">Emergency</th>
                    <th className="py-2.5 px-3">Expiration</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900">
                  {permissions.map((perm) => {
                    const doc = doctors.find(
                      (d) => d.doctor_profile?.id === perm.doctor_id
                    );
                    const hosp = hospitals.find((h) => h.id === perm.hospital_id);
                    const entityLabel = doc
                      ? `Dr. ${doc.username} (${doc.doctor_profile?.specialization})`
                      : hosp
                      ? `Hospital: ${hosp.name}`
                      : "Any Staff";

                    return (
                      <tr key={perm.id} className="hover:bg-slate-900/20 text-xs">
                        <td className="py-3 px-3 font-semibold text-slate-200">
                          {entityLabel}
                        </td>
                        <td className="py-3 px-3">
                          <span className="bg-slate-900 text-slate-300 border border-slate-800 px-2 py-0.5 rounded text-[10px] font-bold">
                            {perm.access_type}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`text-[10px] font-bold ${
                              perm.is_emergency ? "text-rose-400" : "text-slate-500"
                            }`}
                          >
                            {perm.is_emergency ? "ENABLED" : "DISABLED"}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-400 text-[11px]">
                          {perm.expires_at
                            ? new Date(perm.expires_at).toLocaleString()
                            : "Permanent"}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => handleRevoke(perm.id)}
                            disabled={actionLoading === perm.id}
                            className="text-rose-500 hover:text-white bg-slate-950 hover:bg-rose-600 border border-rose-900/40 p-1.5 rounded-xl cursor-pointer transition-all disabled:opacity-50"
                            title="Revoke Permission"
                          >
                            {actionLoading === perm.id ? (
                              <RefreshCw className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: Grant Form */}
        <div className="space-y-6 text-left">
          {profile?.patient_profile && (
            <div className="glass-panel p-5 space-y-3 bg-gradient-to-br from-slate-900/60 to-slate-950/20">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                Patient Information Card
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-[9px] text-slate-500 font-bold uppercase">DOB</span>
                  <div className="text-slate-200 font-semibold mt-0.5">
                    {profile.patient_profile.date_of_birth}
                  </div>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 font-bold uppercase">Blood</span>
                  <div className="text-slate-200 font-semibold mt-0.5">
                    {profile.patient_profile.blood_group}
                  </div>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 font-bold uppercase">Gender</span>
                  <div className="text-slate-200 font-semibold mt-0.5">
                    {profile.patient_profile.gender}
                  </div>
                </div>
                <div>
                  <span className="text-[9px] text-slate-500 font-bold uppercase">Record ID</span>
                  <div className="text-slate-200 font-semibold mt-0.5">
                    #{profile.patient_profile.id}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="glass-panel p-6 space-y-4">
            <div className="border-b border-slate-900 pb-3">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1">
                <Lock className="h-4 w-4 text-blue-500" /> Grant Access Key
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">
                Authorise smart contract records directly on the blockchain.
              </p>
            </div>

            <form onSubmit={handleGrant} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  Select Specialist
                </label>
                <select
                  value={selectedDoctorId}
                  onChange={(e) => {
                    setSelectedDoctorId(e.target.value);
                    if (e.target.value) setSelectedHospitalId("");
                  }}
                  className="w-full bg-slate-950 border border-slate-800 px-3 py-2.5 rounded-xl text-xs text-slate-300 outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="">Specific Doctor (Optional)...</option>
                  {doctors.map((d) => (
                    <option key={d.id} value={d.doctor_profile?.id}>
                      Dr. {d.username} ({d.doctor_profile?.specialization})
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-center text-[10px] text-slate-600 font-semibold uppercase">
                Or
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  Select Hospital
                </label>
                <select
                  value={selectedHospitalId}
                  onChange={(e) => {
                    setSelectedHospitalId(e.target.value);
                    if (e.target.value) setSelectedDoctorId("");
                  }}
                  className="w-full bg-slate-950 border border-slate-800 px-3 py-2.5 rounded-xl text-xs text-slate-300 outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="">Specific Hospital (Optional)...</option>
                  {hospitals.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    Scope
                  </label>
                  <select
                    value={accessType}
                    onChange={(e) => setAccessType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 px-2 py-2 rounded-lg text-[11px] text-slate-300 outline-none"
                  >
                    <option value="READ">Read Only</option>
                    <option value="DOWNLOAD">Full Download</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                    Duration
                  </label>
                  <select
                    value={expiresInHours}
                    onChange={(e) => setExpiresInHours(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 px-2 py-2 rounded-lg text-[11px] text-slate-300 outline-none"
                  >
                    <option value="1">1 Hour</option>
                    <option value="24">24 Hours</option>
                    <option value="168">7 Days</option>
                    <option value="720">30 Days</option>
                    <option value="">Permanent</option>
                  </select>
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-slate-950 p-3 rounded-xl border border-slate-900">
                <input
                  type="checkbox"
                  id="allowEmergency"
                  checked={allowEmergency}
                  onChange={(e) => setAllowEmergency(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-800 bg-slate-900 outline-none cursor-pointer"
                />
                <div className="text-[10px] leading-tight">
                  <label htmlFor="allowEmergency" className="font-bold text-rose-400 cursor-pointer">
                    Enable Emergency Access Override
                  </label>
                  <p className="text-slate-500 mt-0.5">
                    Authorized staff can access records immediately during emergencies with full blockchain audit.
                  </p>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || (!selectedDoctorId && !selectedHospitalId)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-xs transition-all shadow-md cursor-pointer disabled:opacity-50"
              >
                {submitting ? "Registering smart consent..." : "Authorize Contract Access"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Sub-View: My Access Audits
// ─────────────────────────────────────────────────────────
function AccessAuditsView({ token }: { token: string }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const typeColorMap: Record<string, string> = {
    UPLOAD: "text-blue-400",
    ACCESS_GRANT: "text-emerald-400",
    ACCESS_REVOKE: "text-rose-400",
    VERIFY: "text-violet-400",
    DOWNLOAD: "text-amber-400",
    TAMPER_ALERT: "text-rose-500",
    RECOVERY: "text-cyan-400",
  };

  const typeLabelMap: Record<string, string> = {
    UPLOAD: "New clinical scan registered",
    ACCESS_GRANT: "Access granted to specialist",
    ACCESS_REVOKE: "Access rights revoked",
    VERIFY: "Medical image decrypted and verified",
    DOWNLOAD: "Secure download performed",
    TAMPER_ALERT: "⚠ Tampering detected — integrity alert",
    RECOVERY: "Image self-recovery executed",
  };

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Fetch blockchain blocks and filter to patient's own logs
      const [userRes, blocksRes] = await Promise.all([
        apiClient.get("/api/users/me"),
        apiClient.get("/api/blockchain/blocks"),
      ]);
      const myPatId = userRes.data.patient_profile?.id;
      const myUserId = userRes.data.id;
      const blocks = Array.isArray(blocksRes.data) ? blocksRes.data : [];

      if (myPatId) {
        const filtered = blocks.filter((block: any) => {
          try {
            const payload =
              typeof block.payload === "string"
                ? JSON.parse(block.payload)
                : block.payload;
            const txData = payload.data || {};
            const patId =
              txData.patient_id ??
              txData.details?.patient_id ??
              payload.patient_id ??
              payload.data?.patient_id;
            const actorId = txData.user_id ?? payload.user_id;
            return patId === myPatId || actorId === myUserId;
          } catch {
            return false;
          }
        });
        setLogs(filtered);
      } else {
        // Fallback: show all if no patient profile
        setLogs(blocks);
      }
    } catch (err: any) {
      setError("Failed to load audit logs from blockchain.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">
            My Access Audits
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Immutable blockchain ledger of all events related to your medical records.
          </p>
        </div>
        <button
          onClick={loadLogs}
          className="px-4 py-2 bg-slate-900 border border-slate-800 text-xs font-semibold rounded-xl hover:bg-slate-800 cursor-pointer flex items-center gap-1.5 self-start"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh Ledger
        </button>
      </div>

      {error && (
        <div className="bg-rose-500/15 border border-rose-500/20 text-rose-400 text-xs px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-64 flex items-center justify-center text-slate-500 text-xs animate-pulse">
          Synchronizing with blockchain ledger...
        </div>
      ) : logs.length === 0 ? (
        <div className="glass-panel p-12 flex flex-col items-center justify-center text-center gap-3">
          <History className="h-10 w-10 text-slate-600" />
          <p className="text-slate-500 text-xs">
            No ledger activity found yet. Events will appear here after your first scan is uploaded or accessed.
          </p>
        </div>
      ) : (
        <div className="glass-panel p-6 space-y-3">
          {logs.map((log) => {
            let payload: any = {};
            try {
              payload =
                typeof log.payload === "string" ? JSON.parse(log.payload) : log.payload;
            } catch {
              payload = {};
            }
            const data = payload.data || {};
            const logType = log.type || data.action || "EVENT";
            const colorClass = typeColorMap[logType] || "text-slate-400";
            const label = typeLabelMap[logType] || logType;

            return (
              <div
                key={log.id}
                className="flex items-start justify-between gap-4 p-4 bg-slate-950 rounded-xl border border-slate-900 hover:border-slate-800 transition-all"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[9px] font-black uppercase tracking-widest ${colorClass} bg-slate-900 px-2 py-0.5 rounded border border-slate-800`}
                    >
                      {logType}
                    </span>
                  </div>
                  <div className="text-xs text-slate-300 font-medium">{label}</div>
                  <div className="font-mono text-[9px] text-slate-600 truncate">
                    TX: {log.transaction_hash}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-slate-500 font-mono">
                    {log.timestamp
                      ? new Date(log.timestamp).toLocaleString()
                      : "—"}
                  </div>
                  <div className="text-[9px] text-slate-600 mt-0.5">Block #{log.id}</div>
                </div>
              </div>
            );
          })}
          <div className="text-[10px] text-slate-600 pt-2 border-t border-slate-900 text-center">
            {logs.length} blockchain event{logs.length !== 1 ? "s" : ""} found ·
            Immutable ledger — cannot be altered or deleted.
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Main Export: PatientDashboard (routes sub-views)
// ─────────────────────────────────────────────────────────
export default function PatientDashboard({ token, activeView = "dashboard" }: PatientDashboardProps) {
  switch (activeView) {
    case "patient-records":
      return <MedicalFilesView token={token} />;
    case "patient-permissions":
      return <AccessControlView token={token} />;
    case "logs":
      return <AccessAuditsView token={token} />;
    case "dashboard":
    default:
      return <DashboardView token={token} />;
  }
}
