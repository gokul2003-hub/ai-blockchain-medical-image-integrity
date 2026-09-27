import React, { useState, useEffect, useRef } from "react";
import {
  Shield,
  LogOut,
  User as UserIcon,
  Bell,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wifi,
  WifiOff,
  RefreshCw,
} from "lucide-react";
import { apiClient } from "../services/api";

interface NavbarProps {
  username: string;
  role: string;
  activeView: string;
  onLogout: () => void;
  alertsCount?: number;
}

type SystemStatus = "SECURE" | "WARNING" | "CRITICAL" | "UNKNOWN";
type ConnectionStatus = "CONNECTED" | "DEGRADED" | "OFFLINE";

const viewLabelMap: Record<string, string> = {
  dashboard: "Dashboard",
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
  super_admin: "bg-red-500/20 text-red-400 border-red-500/30",
  hospital_admin: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  doctor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  radiologist: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  patient: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
};

const systemStatusConfig: Record<SystemStatus, { color: string; dot: string; label: string; Icon: React.ElementType }> = {
  SECURE:  { color: "text-emerald-400", dot: "bg-emerald-500", label: "SECURE",  Icon: CheckCircle2 },
  WARNING: { color: "text-amber-400",   dot: "bg-amber-500",   label: "WARNING", Icon: AlertTriangle },
  CRITICAL:{ color: "text-rose-400",    dot: "bg-rose-500",    label: "CRITICAL",Icon: XCircle },
  UNKNOWN: { color: "text-slate-400",   dot: "bg-slate-500",   label: "CHECKING",Icon: RefreshCw },
};

export default function Navbar({ username, role, activeView, onLogout, alertsCount = 0 }: NavbarProps) {
  const [systemStatus, setSystemStatus] = useState<SystemStatus>("UNKNOWN");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("CONNECTED");
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Poll system status via blockchain verify-chain
  useEffect(() => {
    const check = async () => {
      try {
        const res = await apiClient.get("/api/blockchain/verify-chain");
        setConnectionStatus("CONNECTED");
        if (res.data?.status === "SUCCESS") {
          setSystemStatus(alertsCount > 0 ? "WARNING" : "SECURE");
        } else {
          setSystemStatus("CRITICAL");
        }
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

  // Close profile dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const statusCfg = systemStatusConfig[systemStatus];

  const viewLabel = viewLabelMap[activeView] || activeView;

  return (
    <nav className="h-14 w-full bg-slate-950/90 border-b border-slate-800/60 backdrop-blur-md flex items-center justify-between px-5 z-30 sticky top-0">
      {/* Left: Brand + Breadcrumb */}
      <div className="flex items-center gap-4 min-w-0">
        {/* Logo */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="h-8 w-8 bg-gradient-to-br from-blue-600 to-cyan-500 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/30">
            <Shield className="h-4.5 w-4.5 text-white" />
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="font-bold text-xs tracking-widest text-slate-100 uppercase">MedChain AI</span>
            <span className="text-[9px] text-slate-500 font-medium tracking-wide">Forensic Security Platform</span>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 border-l border-slate-800 pl-4">
          <span className="text-slate-600">Platform</span>
          <ChevronRight className="h-3 w-3 text-slate-700" />
          <span className="text-slate-300 font-semibold truncate max-w-[200px]">{viewLabel}</span>
        </div>
      </div>

      {/* Right: Status + Controls */}
      <div className="flex items-center gap-2.5">
        {/* System Status Indicator */}
        <div
          className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/80 border border-slate-800/80 text-[10px] font-bold ${statusCfg.color}`}
          title="System Security Status"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot} ${systemStatus === "UNKNOWN" ? "animate-spin" : "animate-pulse"}`} />
          <span>SYS: {statusCfg.label}</span>
        </div>

        {/* Connection Status */}
        <div
          className={`hidden lg:flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-medium ${
            connectionStatus === "CONNECTED"
              ? "bg-slate-900/60 border-slate-800/60 text-slate-500"
              : connectionStatus === "DEGRADED"
              ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
              : "bg-rose-500/10 border-rose-500/20 text-rose-500"
          }`}
          title="API Connection Status"
        >
          {connectionStatus === "CONNECTED" ? (
            <Wifi className="h-3 w-3" />
          ) : (
            <WifiOff className="h-3 w-3" />
          )}
          <span>{connectionStatus}</span>
        </div>

        {/* Notifications */}
        <button
          className="relative p-2 text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 rounded-lg transition-all cursor-pointer"
          aria-label="Notifications"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {alertsCount > 0 && (
            <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-rose-500 animate-ping" />
          )}
        </button>

        {/* Profile Dropdown */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800/60 rounded-lg transition-all cursor-pointer"
            aria-label="User profile menu"
            aria-expanded={profileOpen}
          >
            <div className="h-6 w-6 rounded-md bg-slate-800 flex items-center justify-center flex-shrink-0">
              <UserIcon className="h-3.5 w-3.5 text-slate-400" />
            </div>
            <div className="hidden sm:flex flex-col items-start">
              <span className="text-[11px] font-semibold text-slate-200 leading-tight">{username}</span>
              <span className={`text-[9px] px-1.5 rounded font-bold uppercase leading-tight border ${roleBadgeColor[role] || "bg-slate-500/20 text-slate-400 border-slate-500/30"}`}>
                {roleLabelMap[role] || "User"}
              </span>
            </div>
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-1 z-50">
              <div className="px-3 py-2 border-b border-slate-800">
                <div className="text-xs font-semibold text-slate-200">{username}</div>
                <div className="text-[10px] text-slate-500">{roleLabelMap[role]}</div>
              </div>
              <div className="border-t border-slate-800 mt-1 pt-1">
                <button
                  onClick={onLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/30 transition-all cursor-pointer"
                  aria-label="Logout"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
