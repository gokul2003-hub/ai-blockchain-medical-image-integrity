import React, { useState } from "react";
import {
  Activity,
  AlertOctagon,
  BarChart3,
  BrainCircuit,
  Building2,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Eye,
  FileCode2,
  FileKey2,
  History,
  Images,
  LayoutDashboard,
  Link2,
  Lock,
  RefreshCcw,
  ScanSearch,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Upload,
  Users,
  X,
} from "lucide-react";

interface SidebarProps {
  role: string;
  activeView: string;
  onViewChange: (view: string) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  roles?: string[];
}

interface NavSection {
  title: string;
  items: NavItem[];
  roles?: string[];
}

const allSections: NavSection[] = [
  {
    title: "Overview",
    items: [{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Medical Imaging",
    items: [
      { id: "medical-images", label: "Medical Images", icon: Images },
      { id: "upload-image", label: "Upload Image", icon: Upload, roles: ["super_admin", "doctor", "radiologist"] },
      { id: "image-viewer", label: "Image Viewer", icon: Eye },
      { id: "dicom-info", label: "DICOM Information", icon: FileCode2 },
    ],
    roles: ["super_admin", "hospital_admin", "doctor", "radiologist"],
  },
  {
    title: "AI Forensics",
    items: [
      { id: "integrity-verification", label: "Integrity Verification", icon: ShieldCheck },
      { id: "tamper-detection", label: "Tamper Detection", icon: ScanSearch },
      { id: "tamper-localization", label: "Tamper Localization", icon: Crosshair },
      { id: "explainable-ai", label: "Explainable AI", icon: BrainCircuit },
    ],
    roles: ["super_admin", "hospital_admin", "doctor", "radiologist"],
  },
  {
    title: "Recovery",
    items: [
      { id: "recovery-center", label: "Recovery Center", icon: RefreshCcw },
      { id: "recovery-history", label: "Recovery History", icon: History },
    ],
    roles: ["super_admin", "hospital_admin", "doctor", "radiologist"],
  },
  {
    title: "Security",
    items: [
      { id: "blockchain-audit", label: "Blockchain Audit", icon: Link2 },
      { id: "access-control", label: "Access Control", icon: Lock, roles: ["super_admin", "doctor"] },
      { id: "consent-management", label: "Consent Management", icon: FileKey2 },
      { id: "break-glass", label: "Break-Glass Access", icon: AlertOctagon, roles: ["super_admin", "doctor", "radiologist"] },
      { id: "security-events", label: "Security Events", icon: ShieldAlert },
    ],
    roles: ["super_admin", "hospital_admin", "doctor", "radiologist"],
  },
  {
    title: "Analytics",
    items: [
      { id: "analytics", label: "Forensic Analytics", icon: BarChart3 },
      { id: "system-analytics", label: "System Analytics", icon: Activity },
    ],
    roles: ["super_admin", "hospital_admin", "doctor", "radiologist"],
  },
  {
    title: "Administration",
    items: [
      { id: "user-management", label: "Users", icon: Users },
      { id: "hospitals", label: "Hospitals", icon: Building2 },
      { id: "system-health", label: "System Health", icon: Server },
      { id: "system-settings", label: "System Settings", icon: Settings },
    ],
    roles: ["super_admin", "hospital_admin"],
  },
  {
    title: "My Health Records",
    items: [
      { id: "patient-records", label: "My Medical Files", icon: Images },
      { id: "consent-management", label: "My Consents", icon: FileKey2 },
      { id: "blockchain-audit", label: "Access Audit", icon: Link2 },
      { id: "security-events", label: "Access History", icon: History },
    ],
    roles: ["patient"],
  },
];

const roleLabel: Record<string, string> = {
  super_admin: "Super Admin",
  hospital_admin: "Hospital Admin",
  doctor: "Medical Specialist",
  radiologist: "Clinical Radiologist",
  patient: "Patient Portal",
};

export default function Sidebar({ role, activeView, onViewChange, mobileOpen = false, onMobileClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const visibleSections = allSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.roles || item.roles.includes(role)),
    }))
    .filter((section) => !section.roles || section.roles.includes(role))
    .filter((section) => section.items.length > 0);

  return (
    <aside
      className={`sidebar-shell fixed left-0 top-16 z-40 flex h-[calc(100vh-4rem)] w-[286px] flex-col transition-[width,transform] duration-300 lg:sticky lg:top-16 lg:z-20 lg:translate-x-0 ${
        collapsed ? "lg:w-[76px]" : "lg:w-[272px]"
      } ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      aria-label="Primary navigation"
    >
      <div className="flex h-[4.4rem] flex-shrink-0 items-center justify-between border-b border-slate-800/70 px-4">
        <div className={`flex items-center gap-2.5 ${collapsed ? "lg:hidden" : ""}`}>
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-400/10">
            <Activity className="h-4 w-4 text-cyan-300" />
          </div>
          <div>
            <p className="text-[11px] font-bold tracking-[0.13em] text-slate-200">SECURITY OPS</p>
            <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.1em] text-slate-600">{roleLabel[role] || "Workspace"}</p>
          </div>
        </div>
        <div className={`mx-auto hidden h-8 w-8 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-400/10 ${collapsed ? "lg:flex" : ""}`}>
          <ShieldCheck className="h-4 w-4 text-cyan-300" />
        </div>
        <button
          type="button"
          onClick={onMobileClose}
          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-100 lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setCollapsed((value) => !value)}
          className="absolute -right-3 top-[4.8rem] hidden h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-slate-400 shadow-lg transition hover:border-blue-400/40 hover:bg-slate-700 hover:text-white lg:flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Workspace sections">
        {visibleSections.map((section, sectionIndex) => (
          <div key={`${section.title}-${sectionIndex}`} className="mb-5">
            {!collapsed && (
              <div className="mb-2 flex items-center gap-2 px-3 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">
                <span>{section.title}</span>
                {section.title === "Security" && <span className="h-1 w-1 rounded-full bg-cyan-400/60" />}
              </div>
            )}
            {collapsed && sectionIndex > 0 && <div className="mx-2 mb-3 border-t border-slate-800/70" />}
            <div className="space-y-1">
              {section.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeView === item.id;
                return (
                  <button
                    key={`${section.title}-${item.id}`}
                    type="button"
                    onClick={() => onViewChange(item.id)}
                    title={collapsed ? item.label : undefined}
                    aria-label={item.label}
                    className={`nav-item group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-semibold tracking-[0.01em] ${
                      collapsed ? "lg:justify-center lg:px-0" : ""
                    } ${isActive ? "nav-item-active text-slate-100" : "text-slate-500"}`}
                  >
                    <Icon className={`h-[17px] w-[17px] flex-shrink-0 transition-colors ${isActive ? "text-blue-300" : "text-slate-600 group-hover:text-slate-300"}`} />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {isActive && !collapsed && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(48,213,208,0.8)]" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="flex-shrink-0 border-t border-slate-800/70 p-3">
        <div className={`rounded-xl border border-emerald-400/10 bg-emerald-400/[0.035] p-3 ${collapsed ? "lg:p-2" : ""}`}>
          {collapsed ? (
            <div className="flex justify-center" title="Blockchain online">
              <span className="live-dot" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-slate-400">Blockchain network</span>
                <span className="flex items-center gap-1.5 text-[9px] font-bold tracking-[0.12em] text-emerald-300">
                  <span className="live-dot" /> LIVE
                </span>
              </div>
              <div className="status-line mt-3 opacity-70" />
              <p className="mt-2 text-[9px] leading-relaxed text-slate-600">Ledger integrity is continuously monitored.</p>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
