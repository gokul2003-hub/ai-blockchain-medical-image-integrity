import React, { useEffect, useState } from "react";
import { apiService } from "../services/api";
import { LoadingState, ErrorState } from "./stitch/States";

interface ProfilePanelProps {
  token: string;
  role: string;
  username: string;
}

export const ProfilePanel: React.FC<ProfilePanelProps> = ({ token, role, username }) => {
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scans, setScans] = useState<any[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiService
      .getSessionProfile()
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.response?.data?.detail || "Unable to load your profile.");
      })
      .finally(() => !cancelled && setLoading(false));
    // Real imaging-integrity stats from the scoped image list (RBAC-applied).
    apiService
      .listImages()
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setScans(data);
      })
      .catch(() => !cancelled && setScans(null));
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) return <LoadingState message="Loading your clinical identity profile..." />;
  if (error) return <ErrorState message={error} />;

  const totalScans = scans?.length ?? null;
  const flaggedScans = scans ? scans.filter((s: any) => s.quarantine_status).length : null;
  const verifiedScans = scans ? totalScans! - flaggedScans! : null;
  const rememberMe = typeof localStorage !== "undefined" && localStorage.getItem("med_remember") === "true";

  return (
    <div className="space-y-6">
      <div className="pb-2 border-b border-surface-container-low">
        <h1 className="font-headline-xl text-2xl md:text-3xl font-bold text-on-surface tracking-tight">
          My Clinical Profile
        </h1>
        <p className="font-body-sm text-xs text-on-surface-variant">
          Authenticated identity and role metadata for this session.
        </p>
      </div>

      <div className="bg-surface-container-lowest rounded-xl p-6 border border-surface-container-high/60 shadow-sm grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline block">Username</span>
          <span className="font-headline-sm text-sm font-semibold text-on-surface">{profile?.username || username}</span>
        </div>
        <div>
          <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline block">Role</span>
          <span className="font-headline-sm text-sm font-semibold text-primary capitalize">{profile?.role || role}</span>
        </div>
        <div>
          <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline block">Email</span>
          <span className="font-headline-sm text-sm font-semibold text-on-surface">{profile?.email || "—"}</span>
        </div>
        <div>
          <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline block">Hospital ID</span>
          <span className="font-headline-sm text-sm font-semibold text-on-surface">{profile?.hospital_id ?? "—"}</span>
        </div>
        <div>
          <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline block">User ID</span>
          <span className="font-code-sm text-xs text-on-surface">{profile?.id ?? "—"}</span>
        </div>
        <div>
          <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline block">Session</span>
          <span className="font-label-sm text-xs text-secondary font-semibold">Active — JWT Bearer</span>
        </div>
        {profile && "mfa_enabled" in profile && (
          <div>
            <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline block">MFA</span>
            <span className={`font-label-sm text-xs font-semibold ${profile.mfa_enabled ? "text-secondary" : "text-outline"}`}>
              {profile.mfa_enabled ? "Enabled" : "Not enabled"}
            </span>
          </div>
        )}
      </div>

      {/* Clinical Access + Security Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-surface-container-lowest rounded-xl p-6 border border-surface-container-high/60 shadow-sm space-y-4">
          <h2 className="font-headline-sm text-sm font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-primary">health_and_safety</span>
            Clinical Access
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline block">Hospital ID</span>
              <span className="font-headline-sm text-sm font-semibold text-on-surface">{profile?.hospital_id ?? "—"}</span>
            </div>
            <div>
              <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline block">Access Status</span>
              <span className="font-label-sm text-xs text-secondary font-semibold">Authorized</span>
            </div>
            <div>
              <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline block">Imaging Access</span>
              <span className="font-headline-sm text-sm font-semibold text-on-surface">
                {totalScans === null ? "—" : `${totalScans} scoped record${totalScans === 1 ? "" : "s"}`}
              </span>
            </div>
            <div>
              <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline block">Account</span>
              <span className="font-headline-sm text-sm font-semibold text-on-surface">{profile?.username || username}</span>
            </div>
          </div>
        </div>

        <div className="bg-surface-container-lowest rounded-xl p-6 border border-surface-container-high/60 shadow-sm space-y-4">
          <h2 className="font-headline-sm text-sm font-semibold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-primary">verified_user</span>
            Security &amp; Imaging Integrity
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline block">Authentication</span>
              <span className="font-label-sm text-xs text-secondary font-semibold">Active — JWT Bearer</span>
            </div>
            <div>
              <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline block">Session Recall</span>
              <span className="font-label-sm text-xs text-on-surface-variant font-semibold">
                {rememberMe ? "Persistent (remembered)" : "This device only"}
              </span>
            </div>
            <div>
              <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline block">Registered Scans</span>
              <span className="font-headline-sm text-sm font-semibold text-on-surface">{totalScans ?? "—"}</span>
            </div>
            <div>
              <span className="font-label-sm text-[10px] uppercase tracking-wider text-outline block">SHA-3 Integrity</span>
              <span className="font-label-sm text-xs font-semibold text-secondary">
                {verifiedScans === null ? "—" : flaggedScans! > 0 ? `${verifiedScans} verified · ${flaggedScans} flagged` : `${verifiedScans} verified`}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
export default ProfilePanel;
