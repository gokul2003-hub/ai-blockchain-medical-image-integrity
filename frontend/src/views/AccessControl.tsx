import React, { useState, useEffect, useCallback } from "react";
import { Key, Activity, Clock, RefreshCw, ShieldAlert } from "lucide-react";
import { apiClient } from "../services/api";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";

interface Permission {
  id: number;
  patient_id: number;
  doctor_id: number | null;
  hospital_id: number | null;
  access_type: string;
  is_active: boolean;
  expires_at: string;
}

export default function AccessControl({ token, role }: { token: string; role: string }) {
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbiddenError, setForbiddenError] = useState<string | null>(null);
  const { error: toastError, success } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setForbiddenError(null);
    try {
      const res = await apiClient.get("/api/permissions");
      setPermissions(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      if (err.response?.status === 403) {
        setForbiddenError(
          err.response?.data?.detail || "Your role is not permitted to view or manage access control policies."
        );
      } else if (err.response?.status !== 401) {
        toastError("Load Failed", err.response?.data?.detail || "Could not load access control list.");
      }
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { load(); }, [load]);

  const revoke = async (id: number) => {
    try {
      await apiClient.post(`/api/permissions/revoke/${id}`);
      success("Access Revoked", "Permission has been successfully revoked.");
      load();
    } catch (err: any) {
      toastError("Revocation Failed", err.response?.data?.detail || "Failed to revoke access.");
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <Key className="h-5 w-5 text-indigo-400" />
            Access Control
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Manage and monitor institutional access control policies.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all cursor-pointer disabled:opacity-50 flex-shrink-0"
          aria-label="Refresh permissions"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/40">
          <h3 className="text-xs font-semibold text-slate-300">Active Permissions</h3>
        </div>
        {loading ? (
          <div className="p-8 flex items-center justify-center text-slate-500 text-xs">
            <Activity className="h-4 w-4 animate-spin mr-2" /> Loading...
          </div>
        ) : forbiddenError ? (
          <div className="p-12 text-center text-slate-400 text-xs flex flex-col items-center">
            <ShieldAlert className="h-8 w-8 text-amber-500 mb-2" />
            <div className="text-sm font-semibold text-slate-200">Access Restricted</div>
            <p className="text-slate-400 mt-1 max-w-md">{forbiddenError}</p>
          </div>
        ) : permissions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/40 border-b border-slate-800/40">
                  {["ID", "Patient ID", "Doctor ID", "Hospital ID", "Access Type", "Expires", "Status", "Actions"].map(h => (
                    <th key={h} className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/30">
                {permissions.map(p => (
                  <tr key={p.id} className="hover:bg-slate-900/30 transition-colors">
                    <td className="py-3 px-4 text-xs font-mono text-slate-500">#{p.id}</td>
                    <td className="py-3 px-4 text-xs text-slate-300">{p.patient_id}</td>
                    <td className="py-3 px-4 text-xs text-slate-300">{p.doctor_id ?? "—"}</td>
                    <td className="py-3 px-4 text-xs text-slate-300">{p.hospital_id ?? "—"}</td>
                    <td className="py-3 px-4 text-[10px] font-semibold">
                      <span className="bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded">{p.access_type}</span>
                    </td>
                    <td className="py-3 px-4 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 flex-shrink-0" />
                        {new Date(p.expires_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={p.is_active ? "ACTIVE" : "REVOKED"} size="xs" />
                    </td>
                    <td className="py-3 px-4">
                      {p.is_active && (role === "super_admin" || role === "patient") && (
                        <button
                          onClick={() => revoke(p.id)}
                          className="text-[10px] px-2 py-1 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded border border-rose-500/20 transition-colors cursor-pointer"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center">
            <Key className="h-8 w-8 text-slate-700 mb-2" />
            No active access controls found.
          </div>
        )}
      </div>
    </div>
  );
}
