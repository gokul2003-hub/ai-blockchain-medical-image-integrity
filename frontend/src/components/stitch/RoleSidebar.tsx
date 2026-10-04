import React from "react";

export type ClinicalRole = "doctor" | "radiologist" | "admin" | "super_admin" | "researcher" | "patient";

interface RoleSidebarProps {
  role: string | null;
  activePath: string;
  onNavigate: (path: string) => void;
  assignedCount?: number;
  className?: string;
  drawer?: boolean;
  onLogout?: () => void;
  username?: string | null;
}

export const RoleSidebar: React.FC<RoleSidebarProps> = ({
  role,
  activePath,
  onNavigate,
  assignedCount = 0,
  className = "",
  drawer = false,
  onLogout,
  username,
}) => {
  const normalizedRole = (role || "").toLowerCase();
  const isDoctor = normalizedRole === "doctor" || normalizedRole === "radiologist";
  const isAdmin = normalizedRole === "admin" || normalizedRole === "super_admin" || normalizedRole === "hospital_admin";
  const isResearcher = normalizedRole === "researcher";
  const isPatient = normalizedRole === "patient";

  const renderNavGroup = (title: string, items: Array<{ id: string; label: string; icon: string; count?: number; badge?: string }>) => (
    <div className="space-y-1 mb-4">
      <div className="px-3 py-1 font-label-sm text-[11px] uppercase tracking-wider text-outline font-semibold">
        {title}
      </div>
      {items.map((item) => {
        const isActive = activePath === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-label-md text-xs transition-colors ${
              isActive
                ? "bg-surface-container text-primary font-semibold shadow-sm"
                : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`material-symbols-outlined text-[18px] ${
                  isActive ? "text-primary" : "text-on-surface-variant"
                }`}
                style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
            </div>
            {item.count !== undefined && item.count > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant font-code-sm text-[10px]">
                {item.count}
              </span>
            )}
            {item.badge && (
              <span className="px-1.5 py-0.5 rounded bg-error-container text-on-error-container font-code-sm text-[10px]">
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <aside
      className={`${drawer ? "relative h-full w-full rounded-none border-r" : "fixed left-4 top-4 bottom-4 w-64"} bg-surface-container-lowest/90 backdrop-blur-xl z-40 flex flex-col ${drawer ? "" : "rounded-3xl"} border border-surface-container-high/40 shadow-2xl ${className}`}
    >
      {/* Brand Header */}
      <div className="h-16 px-6 flex items-center gap-3 border-b border-surface-container-low">
        <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-primary font-bold text-sm shadow-sm border border-primary/20">
          <span className="material-symbols-outlined text-lg text-primary">
            local_hospital
          </span>
        </div>
        <div className="flex flex-col">
          <span className="font-headline-sm text-sm text-primary tracking-tight font-semibold">
            MediSecure AI
          </span>
          <span className="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider">
            Clinical Integrity Platform
          </span>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-1">
        {/* DOCTOR / RADIOLOGIST NAVIGATION */}
        {isDoctor && (
          <>
            {renderNavGroup("Clinical Diagnostic Suite", [
              { id: "doctor-dashboard", label: "Dashboard", icon: "grid_view" },
              { id: "assigned-images", label: "Medical Images", icon: "folder_shared", count: assignedCount },
              { id: "image-review-and-verification", label: "DICOM Review", icon: "fact_check" },
              { id: "ai-tamper-forensics", label: "AI Forensic Analysis", icon: "biotech" },
              { id: "risk-analysis", label: "Risk Analysis", icon: "crisis_alert" },
              { id: "self-recovery-studio", label: "Self-Recovery", icon: "healing" },
              { id: "integrity-proof", label: "Integrity Proof", icon: "verified_user" },
            ])}
            {renderNavGroup("Governance & Trust", [
              { id: "blockchain-audit-and-reports", label: "Blockchain Audit", icon: "verified" },
              { id: "patient-consent-directory", label: "Patient Consent", icon: "shield_person" },
              { id: "security-alerts", label: "Security Alerts", icon: "notifications_active" },
              { id: "profile", label: "Profile", icon: "account_circle" },
            ])}
          </>
        )}

        {/* HOSPITAL ADMIN NAVIGATION */}
        {isAdmin && (
          <>
            {renderNavGroup("Institutional Governance", [
              { id: "admin-workspace", label: "Dashboard", icon: "admin_panel_settings" },
              { id: "user-management", label: "User Management", icon: "group" },
              { id: "access-governance", label: "Access Governance", icon: "policy" },
              { id: "hospitals-directory", label: "DICOM/PACS Nodes", icon: "domain" },
            ])}
            {renderNavGroup("Security & Audit Ledger", [
              { id: "blockchain-audit-and-reports", label: "Blockchain Audit", icon: "account_tree" },
              { id: "security-monitoring", label: "Security Monitoring", icon: "security" },
              { id: "system-health", label: "System Health", icon: "health_and_safety" },
              { id: "security-alerts", label: "Security Alerts", icon: "notifications_active" },
              { id: "profile", label: "Profile", icon: "account_circle" },
            ])}
          </>
        )}

        {/* RESEARCHER NAVIGATION */}
        {isResearcher && (
          <>
            {renderNavGroup("Federated Research Suite", [
              { id: "researcher-dashboard", label: "Dashboard", icon: "insights" },
              { id: "research-dataset", label: "Research Dataset", icon: "dataset" },
              { id: "fhe-benchmark", label: "FHE / Privacy Lab", icon: "calculate" },
              { id: "crypto-benchmarks", label: "NPCR / UACI Benchmarks", icon: "science" },
              { id: "federated-simulation", label: "Model Results", icon: "hub" },
            ])}
            {renderNavGroup("Audit & Compliance", [
              { id: "blockchain-audit-and-reports", label: "Dataset Lineage", icon: "verified" },
              { id: "security-alerts", label: "Security Alerts", icon: "notifications_active" },
              { id: "profile", label: "Profile", icon: "account_circle" },
            ])}
          </>
        )}

        {/* PATIENT NAVIGATION */}
        {isPatient && (
          <>
            {renderNavGroup("Patient Medical Vault", [
              { id: "patient-dashboard", label: "Dashboard", icon: "home_health" },
              { id: "patient-images", label: "My Medical Images", icon: "perm_media" },
              { id: "patient-upload", label: "Upload New Scan", icon: "cloud_upload" },
            ])}
            {renderNavGroup("Privacy & Consent", [
              { id: "patient-consent", label: "My Consent & Access", icon: "lock_person" },
              { id: "security-alerts", label: "Security Alerts", icon: "notifications_active" },
              { id: "profile", label: "Profile", icon: "account_circle" },
            ])}
          </>
        )}
      </nav>

      {/* Bottom DICOM Node Status Card */}
      <div className="p-3 bg-transparent border-t border-surface-container-low/50">
        <div className="p-3 rounded-2xl bg-surface-container/60 backdrop-blur-md flex flex-col gap-1 border border-surface-container-high/30">
          <div className="flex items-center justify-between">
            <span className="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider">
              DICOM PACS Node
            </span>
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
          </div>
          <span className="font-code-sm text-xs text-primary font-semibold">
            AE_TITLE: RAD_STATION_9
          </span>
          <span className="font-label-sm text-[10px] text-on-surface-variant">
            TLS 1.3 Strict Mutual Auth
          </span>
        </div>

        {/* Profile & Logout */}
        <div className="mt-3 flex items-center justify-between gap-2 px-1">
          <button
            onClick={() => onNavigate("profile")}
            className="flex items-center gap-2 text-on-surface-variant hover:text-primary transition-colors"
          >
            <span className="w-7 h-7 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-[11px]">
              {(username || "U").slice(0, 2).toUpperCase()}
            </span>
            <span className="font-label-md text-xs truncate max-w-[7rem]">
              {username || "Account"}
            </span>
          </button>
          {onLogout && (
            <button
              onClick={onLogout}
              aria-label="Log out"
              className="p-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container/30 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
};
export default RoleSidebar;
