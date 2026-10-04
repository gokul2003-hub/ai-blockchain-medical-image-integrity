import React, { useState, useEffect, useCallback } from "react";
import { UserCheck, Shield, Activity, Clock, RefreshCw } from "lucide-react";
import { apiClient } from "../services/api";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";

interface Consent {
  id: number;
  patient_id: number;
  recipient_user_id: number;
  image_id: number | null;
  actions: string[];
  purpose: string;
  starts_at: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

export default function ConsentManagement({ token, role }: { token: string; role: string }) {
  const [consents, setConsents] = useState<Consent[]>([]);
  const [loading, setLoading] = useState(true);
  const { error: toastError, success } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/api/permissions/consents");
      setConsents(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      if (err.response?.status !== 401 && err.response?.status !== 403) {
        toastError("Load Failed", err.response?.data?.detail || "Could not load consents.");
      }
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => { load(); }, [load]);

  const revoke = async (id: number) => {
    try {
      await apiClient.post(`/api/permissions/consent/revoke/${id}?reason=Patient+Requested+Revocation`);
      success("Consent Revoked", "The consent has been immediately revoked.");
      load();
    } catch (err: any) {
      toastError("Revocation Failed", err.response?.data?.detail || "Failed to revoke consent.");
    }
  };

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-indigo-400" />
            Consent Management
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Patient-centric consent directives, granular permissions, and data sharing rules.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all cursor-pointer disabled:opacity-50 flex-shrink-0"
          aria-label="Refresh consents"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800/40">
          <h3 className="text-xs font-semibold text-slate-300">Active Consents</h3>
        </div>
        {loading ? (
          <div className="p-8 flex items-center justify-center text-slate-500 text-xs">
            <Activity className="h-4 w-4 animate-spin mr-2" /> Loading...
          </div>
        ) : consents.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-900/40 border-b border-slate-800/40">
                  {["ID", "Recipient", "Target (Image)", "Actions", "Purpose", "Expiration", "Status", "Revoke"].map(h => (
                    <th key={h} className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/30">
                {consents.map(c => {
                  const isActive = !c.revoked_at && new Date(c.expires_at) > new Date();
                  return (
                    <tr key={c.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="py-3 px-4 text-xs font-mono text-slate-500">#{c.id}</td>
                      <td className="py-3 px-4 text-xs text-slate-300">User #{c.recipient_user_id}</td>
                      <td className="py-3 px-4 text-xs text-slate-300">{c.image_id ? `Image #${c.image_id}` : "All Data"}</td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1">
                          {c.actions.map(a => (
                            <span key={a} className="bg-slate-800 text-[9px] px-1.5 py-0.5 rounded text-slate-300">{a}</span>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[10px] text-slate-400">{c.purpose}</td>
                      <td className="py-3 px-4 text-[11px] text-slate-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(c.expires_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={isActive ? "ACTIVE" : (c.revoked_at ? "REVOKED" : "EXPIRED")} size="xs" />
                      </td>
                      <td className="py-3 px-4">
                        {isActive && (role === "super_admin" || role === "patient") && (
                          <button
                            onClick={() => revoke(c.id)}
                            className="text-[10px] px-2 py-1 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 rounded border border-rose-500/20 transition-colors"
                          >
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center">
             <Shield className="h-8 w-8 text-slate-700 mb-2" />
             No active consent directives found.
          </div>
        )}
      </div>
    </div>
  );
}
