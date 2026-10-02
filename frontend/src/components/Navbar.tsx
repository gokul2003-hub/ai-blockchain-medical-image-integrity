import React, { useState, useEffect, useRef } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  LogOut,
  Menu,
  Shield,
  User as UserIcon,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { apiClient } from "../services/api";

interface NavbarProps {
  username: string;
  role: string;
  activeView: string;
  onLogout: () => void;
  alertsCount?: number;
  onMenuClick?: () => void;
}

type SystemStatus = "SECURE" | "WARNING" | "CRITICAL" | "UNKNOWN";
type ConnectionStatus = "CONNECTED" | "DEGRADED" | "OFFLINE";

const viewLabelMap: Record<string, string> = {
  dashboard: "Command Center",
  "medical-images": "Medical Images",
  "upload-image": "Upload Image",
  "image-viewer": "Image Viewer",
  "dicom-info": "DICOM Information",
  "integrity-verification": "Integrity Verification",
  "tamper-detection": "Tamper Detection",
  "tamper-localization": "Tamper Localization",
  "explainable-ai": "Explainable AI",
  "recovery-center": "Recovery Center",
  "recovery-history": "Recovery History",
  "blockchain-audit": "Blockchain Audit",
  "access-control": "Access Control",
  "consent-management": "Consent Management",
  "break-glass": "Break-Glass Access",
  "security-events": "Security Events",
  analytics: "Forensic Analytics",
  "system-analytics": "System Analytics",
  "user-management": "Users",
  hospitals: "Hospitals",
  "system-health": "System Health",
  "system-settings": "System Settings",
  "patient-records": "My Medical Files",
};

const roleLabelMap: Record<string, string> = {
  super_admin: "Super Admin",
  hospital_admin: "Hospital Admin",
  doctor: "Medical Specialist",
  radiologist: "Clinical Radiologist",
  patient: "Patient Portal",
};

const roleBadgeColor: Record<string, string> = {
  super_admin: "text-rose-300 bg-rose-400/10 border-rose-300/20",
  hospital_admin: "text-violet-300 bg-violet-400/10 border-violet-300/20",
  doctor: "text-blue-300 bg-blue-400/10 border-blue-300/20",
  radiologist: "text-cyan-300 bg-cyan-400/10 border-cyan-300/20",
  patient: "text-emerald-300 bg-emerald-400/10 border-emerald-300/20",
};

const systemStatusConfig: Record<SystemStatus, { color: string; dot: string; label: string }> = {
  SECURE: { color: "text-emerald-300", dot: "bg-emerald-400", label: "SECURE" },
  WARNING: { color: "text-amber-300", dot: "bg-amber-400", label: "WARNING" },
  CRITICAL: { color: "text-rose-300", dot: "bg-rose-400", label: "CRITICAL" },
  UNKNOWN: { color: "text-slate-400", dot: "bg-slate-500", label: "CHECKING" },
};

export default function Navbar({
  username,
  role,
  activeView,
  onLogout,
  alertsCount = 0,
  onMenuClick,
}: NavbarProps) {
  const [systemStatus, setSystemStatus] = useState<SystemStatus>("UNKNOWN");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("CONNECTED");
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await apiClient.get("/api/blockchain/verify-chain");
        setConnectionStatus("CONNECTED");
        setSystemStatus(res.data?.status === "SUCCESS" ? (alertsCount > 0 ? "WARNING" : "SECURE") : "CRITICAL");
      } catch (err: any) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          setConnectionStatus("CONNECTED");
          setSystemStatus(alertsCount > 0 ? "WARNING" : "SECURE");
        } else {
          setConnectionStatus("DEGRADED");
          setSystemStatus("WARNING");
        }
      }
    };

    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, [alertsCount]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) setProfileOpen(false);
      if (notificationsRef.current && !notificationsRef.current.contains(target)) setNotificationsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const statusCfg = systemStatusConfig[systemStatus];
  const viewLabel = viewLabelMap[activeView] || activeView;
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <nav className="navbar-shell sticky top-0 z-40 flex h-16 w-full items-center justify-between px-4 sm:px-6 lg:px-7">
      <div className="flex min-w-0 items-center gap-3 sm:gap-5">
        <button
          type="button"
          onClick={onMenuClick}
          className="rounded-xl border border-slate-700/50 bg-slate-900/50 p-2 text-slate-400 transition hover:border-blue-400/30 hover:bg-slate-800 hover:text-slate-100 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="flex flex-shrink-0 items-center gap-2.5">
          <div className="brand-mark h-9 w-9">
            <Shield className="h-[18px] w-[18px] text-white" strokeWidth={2.2} />
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="font-hash text-[11px] font-bold tracking-[0.2em] text-slate-100">MEDCHAIN</span>
            <span className="text-[9px] font-medium tracking-[0.08em] text-slate-500">CLINICAL TRUST LAYER</span>
          </div>
        </div>

        <div className="hidden min-w-0 items-center gap-2 border-l border-slate-800/80 pl-4 md:flex">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">Workspace</span>
          <ChevronRight className="h-3 w-3 text-slate-700" />
          <span className="truncate text-xs font-semibold text-slate-200">{viewLabel}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div
          className={`hidden items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1.5 text-[9px] font-bold tracking-[0.12em] sm:flex ${statusCfg.color}`}
          title="System security status"
        >
          <span className={`live-dot ${statusCfg.dot} ${systemStatus === "UNKNOWN" ? "animate-pulse" : ""}`} />
          <span>{statusCfg.label}</span>
        </div>

        <div
          className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[9px] font-semibold tracking-[0.08em] lg:flex ${
            connectionStatus === "CONNECTED"
              ? "border-emerald-400/15 bg-emerald-400/5 text-emerald-300"
              : connectionStatus === "DEGRADED"
                ? "border-amber-400/20 bg-amber-400/5 text-amber-300"
                : "border-rose-400/20 bg-rose-400/5 text-rose-300"
          }`}
          title="API connection status"
        >
          {connectionStatus === "CONNECTED" ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          <span>{connectionStatus}</span>
        </div>

        <div ref={notificationsRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setNotificationsOpen((open) => !open);
              setProfileOpen(false);
            }}
            className="relative rounded-xl border border-transparent p-2 text-slate-500 transition hover:border-slate-700/60 hover:bg-slate-800/70 hover:text-slate-200"
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
          >
            <Bell className="h-[17px] w-[17px]" />
            {alertsCount > 0 && (
              <span className="absolute right-1 top-1 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-400" />
              </span>
            )}
          </button>
          {notificationsOpen && (
            <div className="absolute right-0 top-full mt-3 w-72 animate-slide-in rounded-2xl border border-slate-700/70 bg-slate-900/95 p-3 shadow-2xl shadow-black/40 backdrop-blur-xl">
              <div className="mb-2 flex items-center justify-between border-b border-slate-800/80 px-1 pb-3">
                <div>
                  <p className="text-xs font-semibold text-slate-100">Security inbox</p>
                  <p className="mt-0.5 text-[10px] text-slate-500">Ledger events that need attention</p>
                </div>
                <button type="button" onClick={() => setNotificationsOpen(false)} className="text-slate-600 transition hover:text-slate-300" aria-label="Close notifications">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-400/10 bg-emerald-400/5 p-2.5">
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
                <div>
                  <p className="text-[11px] font-semibold text-emerald-200">Chain monitor active</p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-slate-500">
                    {alertsCount > 0 ? `${alertsCount} integrity alert${alertsCount === 1 ? "" : "s"} recorded.` : "No unresolved integrity alerts."}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => {
              setProfileOpen((open) => !open);
              setNotificationsOpen(false);
            }}
            className="flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900/60 px-2 py-1.5 transition hover:border-blue-400/25 hover:bg-slate-800/75 sm:gap-2.5 sm:px-2.5"
            aria-label="User profile menu"
            aria-expanded={profileOpen}
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-blue-300/20 bg-gradient-to-br from-blue-500/80 to-cyan-500/60 text-[10px] font-bold text-white shadow-lg shadow-blue-950/30">
              {initials}
            </div>
            <div className="hidden flex-col items-start sm:flex">
              <span className="max-w-[110px] truncate text-[11px] font-semibold leading-tight text-slate-200">{username}</span>
              <span className={`mt-0.5 rounded border px-1.5 py-[1px] text-[8px] font-bold uppercase tracking-[0.08em] ${roleBadgeColor[role] || "border-slate-600/30 bg-slate-500/10 text-slate-400"}`}>
                {roleLabelMap[role] || "User"}
              </span>
            </div>
            <ChevronDown className={`hidden h-3.5 w-3.5 text-slate-600 transition-transform sm:block ${profileOpen ? "rotate-180" : ""}`} />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full mt-3 w-60 animate-slide-in rounded-2xl border border-slate-700/70 bg-slate-900/95 p-2 shadow-2xl shadow-black/40 backdrop-blur-xl">
              <div className="flex items-center gap-3 rounded-xl bg-slate-800/45 px-3 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-xs font-bold text-blue-300">{initials}</div>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-100">{username}</p>
                  <p className="mt-0.5 truncate text-[10px] text-slate-500">{roleLabelMap[role] || "Authenticated user"}</p>
                </div>
              </div>
              <div className="my-2 h-px bg-slate-800/80" />
              <div className="flex items-center gap-2 px-3 py-2 text-[10px] text-slate-500">
                <UserIcon className="h-3.5 w-3.5 text-slate-600" />
                <span>Session protected by MFA</span>
              </div>
              <button
                type="button"
                onClick={onLogout}
                className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-400/10 hover:text-rose-200"
                aria-label="Logout"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out securely
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
