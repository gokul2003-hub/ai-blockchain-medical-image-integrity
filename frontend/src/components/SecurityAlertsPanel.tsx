import React, { useEffect, useState } from "react";
import { apiService } from "../services/api";
import { LoadingState, EmptyState, ErrorState } from "./stitch/States";

interface SecurityAlertsPanelProps {
  token: string;
}

export const SecurityAlertsPanel: React.FC<SecurityAlertsPanelProps> = ({ token }) => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const blocks = await apiService.getBlockchainBlocks();
      const tamper = Array.isArray(blocks)
        ? blocks.filter((b: any) => b.type === "TAMPER_ALERT" || b.action === "TAMPER_DETECTED")
        : [];
      setAlerts(tamper);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Unable to load security alerts from the ledger.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [token]);

  if (loading) return <LoadingState message="Scanning ledger for security events..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between pb-2 border-b border-surface-container-low">
        <div>
          <h1 className="font-headline-xl text-2xl md:text-3xl font-bold text-on-surface tracking-tight">
            Security Alerts
          </h1>
          <p className="font-body-sm text-xs text-on-surface-variant">
            Tamper incidents and forensic escalations recorded on the integrity ledger.
          </p>
        </div>
        <button
          onClick={load}
          className="px-3 py-2 rounded-lg bg-surface-container text-on-surface font-label-md text-xs hover:bg-surface-container-high flex items-center gap-1.5"
        >
          <span className="material-symbols-outlined text-sm">sync</span>
          Refresh
        </button>
      </div>

      {alerts.length === 0 ? (
        <EmptyState
          icon="verified_user"
          title="No Active Threats"
          description="No tamper events are currently recorded on the blockchain."
        />
      ) : (
        <div className="space-y-3">
          {alerts.map((a: any, i: number) => (
            <div
              key={a.id ?? i}
              className="bg-error-container/30 border border-error/30 rounded-xl p-4 flex items-start gap-3"
            >
              <span className="material-symbols-outlined text-error">warning</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-headline-sm text-sm font-semibold text-error">
                    {a.type || a.action || "Security Event"}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label-sm text-[10px] font-semibold">
                    CRITICAL
                  </span>
                </div>
                <p className="font-body-sm text-xs text-on-surface-variant mt-1">
                  {a.description || a.payload_hash || JSON.stringify(a.metadata ?? {})}
                </p>
                <span className="font-code-sm text-[10px] text-outline">
                  Block #{a.block_number ?? a.index ?? "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default SecurityAlertsPanel;
