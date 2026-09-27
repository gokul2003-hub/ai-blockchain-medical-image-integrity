import React, { useState, useEffect, useCallback } from "react";
import { History, RefreshCw, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { apiClient } from "../services/api";
import StatusBadge from "../components/StatusBadge";
import { useToast } from "../components/Toast";

interface RecoveryEvent {
  id: number;
  block_index: number;
  transaction_hash: string;
  type: string;
  payload: string;
  timestamp: string;
}

interface ParsedRecovery {
  image_id?: number;
  user_id?: number;
  verification_passed?: boolean;
  recovered_hash?: string;
  recovered_image_hash?: string;
  trusted_hash?: string;
  psnr?: number;
  ssim?: number;
  blockchain_tx_hash?: string;
}

export default function RecoveryHistory({ token }: { token: string }) {
  const [events, setEvents] = useState<RecoveryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { error: toastError } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiClient.get("/api/blockchain/blocks");
      const allBlocks: RecoveryEvent[] = Array.isArray(res.data) ? res.data : [];
      const recoveryBlocks = allBlocks.filter(
        (b) =>
          b.type === "RECOVERY" ||
          b.type === "RECOVERY_COMPLETED" ||
          b.type === "image_recovered" ||
          (b.type === "VERIFY" && typeof b.payload === "string" && b.payload.includes("RECOVERY"))
      );
      setEvents(recoveryBlocks.reverse());
    } catch (err: any) {
      const msg = err.response?.data?.detail || "Failed to load recovery history.";
      setError(msg);
      toastError("Load Failed", msg);
    } finally {
      setLoading(false);
    }
  }, [toastError]);

  useEffect(() => {
    load();
  }, [load]);

  const parsePayload = (payload: string): ParsedRecovery => {
    try {
      return JSON.parse(payload);
    } catch {
      return {};
    }
  };

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <History className="h-5 w-5 text-teal-400" />
            Recovery History
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Immutable record of all self-recovery operations from the blockchain audit trail.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all cursor-pointer disabled:opacity-50"
          aria-label="Refresh recovery history"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="glass-panel p-12 flex items-center justify-center gap-3 text-slate-500 text-xs">
          <RefreshCw className="h-4 w-4 animate-spin text-teal-500" />
          Loading recovery records from blockchain...
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-xs text-rose-400 flex items-center gap-2">
          {error}
          <button onClick={load} className="ml-auto underline cursor-pointer">Retry</button>
        </div>
      )}

      {/* Empty */}
      {!loading && !error && events.length === 0 && (
        <div className="glass-panel p-16 flex flex-col items-center justify-center gap-3 text-center">
          <History className="h-10 w-10 text-slate-700" />
          <p className="text-slate-500 text-sm font-medium">No recovery operations recorded</p>
          <p className="text-slate-600 text-xs">Recovery events will appear here once an image has been recovered.</p>
        </div>
      )}

      {/* Events Table */}
      {!loading && !error && events.length > 0 && (
        <div className="glass-panel overflow-hidden">
          <div className="p-4 border-b border-slate-800/60 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Recovery Events ({events.length})
            </span>
            <StatusBadge status="RECOVERED" size="xs" />
          </div>
          <div className="divide-y divide-slate-800/40">
            {events.map((event) => {
              const parsed = parsePayload(event.payload);
              const isExpanded = expandedId === event.id;
              const verPassed = parsed.verification_passed;

              return (
                <div key={event.id} className="hover:bg-slate-900/30 transition-colors">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : event.id)}
                    className="w-full flex items-center gap-4 px-4 py-3 text-left cursor-pointer"
                    aria-expanded={isExpanded}
                    aria-label={`Recovery event block ${event.block_index}`}
                  >
                    {/* Block index */}
                    <span className="text-[10px] font-mono text-slate-600 w-16 flex-shrink-0">
                      #{event.block_index}
                    </span>

                    {/* Image ID */}
                    <span className="text-xs text-slate-400 w-20 flex-shrink-0">
                      {parsed.image_id ? `Image #${parsed.image_id}` : "—"}
                    </span>

                    {/* Result */}
                    <div className="flex-shrink-0">
                      {verPassed === true ? (
                        <StatusBadge status="VERIFIED" size="xs" />
                      ) : verPassed === false ? (
                        <StatusBadge status="FAILED" size="xs" />
                      ) : (
                        <StatusBadge status="RECOVERED" size="xs" />
                      )}
                    </div>

                    {/* TX Hash */}
                    <span className="font-hash text-slate-600 flex-1 truncate hidden sm:block">
                      {event.transaction_hash.slice(0, 20)}...
                    </span>

                    {/* Timestamp */}
                    <span className="text-[11px] text-slate-500 flex-shrink-0 hidden md:block">
                      {new Date(event.timestamp).toLocaleString()}
                    </span>

                    {/* Expand icon */}
                    <span className="text-slate-600 flex-shrink-0">
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </span>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 bg-slate-950/40">
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs mt-2">
                        {[
                          { label: "Block Index", value: `#${event.block_index}` },
                          { label: "Image ID", value: parsed.image_id ? `#${parsed.image_id}` : "—" },
                          { label: "Verification Passed", value: verPassed != null ? String(verPassed) : "—" },
                          { label: "PSNR", value: parsed.psnr != null ? `${parsed.psnr.toFixed(2)} dB` : "—" },
                          { label: "SSIM", value: parsed.ssim != null ? parsed.ssim.toFixed(4) : "—" },
                          { label: "Timestamp", value: new Date(event.timestamp).toLocaleString() },
                        ].map(({ label, value }) => (
                          <div key={label} className="bg-slate-900/60 rounded-lg p-2.5">
                            <div className="text-[9px] text-slate-600 font-bold uppercase tracking-wider mb-1">{label}</div>
                            <div className="text-slate-200 font-mono text-[11px]">{value}</div>
                          </div>
                        ))}
                        <div className="sm:col-span-2 lg:col-span-3 bg-slate-900/60 rounded-lg p-2.5">
                          <div className="text-[9px] text-slate-600 font-bold uppercase tracking-wider mb-1">Transaction Hash</div>
                          <div className="text-slate-400 font-hash break-all">{event.transaction_hash}</div>
                        </div>
                        {(parsed.recovered_hash || parsed.recovered_image_hash) && (
                          <div className="sm:col-span-2 lg:col-span-3 bg-emerald-900/20 border border-emerald-800/30 rounded-lg p-2.5">
                            <div className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider mb-1">Recovered SHA-3 Hash</div>
                            <div className="text-emerald-400 font-hash break-all text-[10px]">{parsed.recovered_hash || parsed.recovered_image_hash}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
