import React, { useState, useEffect, useCallback } from "react";
import { AlertTriangle, ShieldAlert, Activity, Filter, RefreshCw } from "lucide-react";
import { apiClient } from "../services/api";

interface BlockTx {
  id: number;
  block_index: number;
  transaction_hash: string;
  type: string;
  payload: string;
  timestamp: string;
}

export default function SecurityEvents({ token }: { token: string }) {
  const [events, setEvents] = useState<BlockTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState("All");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/api/blockchain/blocks");
      if (Array.isArray(res.data)) {
        // Filter out security-relevant events
        const secEvents = res.data.filter(b => 
          b.type === "TAMPER_ALERT" || b.type === "QUARANTINE" || b.type === "ACCESS_REVOKE"
        ).reverse();
        setEvents(secEvents);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredEvents = events.filter(e => {
    if (severityFilter === "All") return true;
    if (severityFilter === "Critical" && (e.type === "TAMPER_ALERT" || e.type === "QUARANTINE")) return true;
    if (severityFilter === "Warning" && e.type === "ACCESS_REVOKE") return true;
    return false;
  });

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-rose-400" />
            Security Events
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Real-time monitoring of security alerts, tampering attempts, and quarantine events.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all cursor-pointer disabled:opacity-50"
            aria-label="Refresh events"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <Filter className="h-3.5 w-3.5 text-slate-500" />
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 px-2 py-1.5 rounded-lg text-xs text-slate-300 outline-none cursor-pointer focus:border-rose-500"
          >
            <option value="All">All Severities</option>
            <option value="Critical">Critical (Tamper / Quarantine)</option>
            <option value="Warning">Warning (Revoke)</option>
          </select>
        </div>
      </div>

      <div className="glass-panel overflow-hidden">
        {loading ? (
          <div className="p-8 flex items-center justify-center text-slate-500 text-xs">
            <Activity className="h-4 w-4 animate-spin mr-2" /> Monitoring network...
          </div>
        ) : filteredEvents.length > 0 ? (
          <div className="divide-y divide-slate-800/40">
            {filteredEvents.map(evt => {
              const isCritical = evt.type === "TAMPER_ALERT";
              return (
                <div key={evt.id} className="p-4 flex gap-4 hover:bg-slate-900/30 transition-colors">
                  <div className={`mt-1 h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isCritical ? "bg-rose-500/20 text-rose-400" : "bg-amber-500/20 text-amber-400"
                  }`}>
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className={`text-sm font-bold ${isCritical ? "text-rose-400" : "text-amber-400"}`}>
                        {evt.type.replace("_", " ")}
                      </div>
                      <div className="text-[10px] text-slate-500">{new Date(evt.timestamp).toLocaleString()}</div>
                    </div>
                    <div className="text-xs text-slate-300 bg-slate-900/50 p-2 rounded border border-slate-800/50 break-all font-mono">
                      {evt.payload}
                    </div>
                    <div className="text-[10px] text-slate-500 pt-1">
                      Tx Hash: <span className="font-hash text-indigo-400">{evt.transaction_hash}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center text-slate-500 text-xs flex flex-col items-center">
            <ShieldAlert className="h-8 w-8 text-slate-700 mb-2" />
            No security events detected.
          </div>
        )}
      </div>
    </div>
  );
}
