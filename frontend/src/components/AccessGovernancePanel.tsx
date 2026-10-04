import React, { useEffect, useState } from "react";
import { apiService } from "../services/api";
import { LoadingState, EmptyState, ErrorState } from "./stitch/States";

export const AccessGovernancePanel: React.FC = () => {
  const [consents, setConsents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.listConsentGrants();
      setConsents(Array.isArray(data) ? data : data?.grants || []);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Unable to load consent grants.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <LoadingState message="Loading consent grants..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  if (consents.length === 0) {
    return (
      <EmptyState
        icon="shield_person"
        title="No Consent Grants"
        description="No consent grants are currently registered for this institution."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-surface-container-high/60 bg-surface-container-lowest">
      <table className="w-full text-left font-body-sm text-xs">
        <thead className="bg-surface-container-low text-on-surface-variant text-[11px] uppercase">
          <tr>
            <th className="py-2.5 px-3">Grant ID</th>
            <th className="py-2.5 px-3">Grantee</th>
            <th className="py-2.5 px-3">Action</th>
            <th className="py-2.5 px-3">Purpose</th>
            <th className="py-2.5 px-3">Expires</th>
            <th className="py-2.5 px-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-container-low">
          {consents.map((c: any) => (
            <tr key={c.id} className="hover:bg-surface-container-low/50">
              <td className="py-2.5 px-3 font-code-sm text-primary font-semibold">#{c.id}</td>
              <td className="py-2.5 px-3 text-on-surface">User #{c.grantee_id}</td>
              <td className="py-2.5 px-3 text-on-surface-variant">{c.action}</td>
              <td className="py-2.5 px-3 text-on-surface-variant">{c.purpose || "—"}</td>
              <td className="py-2.5 px-3 text-on-surface-variant">
                {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "No expiry"}
              </td>
              <td className="py-2.5 px-3">
                <span
                  className={`px-2 py-0.5 rounded-full font-label-sm text-[10px] font-semibold ${
                    c.revoked
                      ? "bg-error-container text-on-error-container"
                      : "bg-secondary-fixed text-on-secondary-fixed"
                  }`}
                >
                  {c.revoked ? "REVOKED" : "ACTIVE"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
export default AccessGovernancePanel;
