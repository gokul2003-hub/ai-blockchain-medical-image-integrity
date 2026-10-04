import React, { useState } from "react";
import {
  LayoutDashboard,
  Images,
  Upload,
  Eye,
  FileCode2,
  ShieldCheck,
  ScanSearch,
  Crosshair,
  BrainCircuit,
  RefreshCcw,
  History,
  BadgeCheck,
  Link2,
  Lock,
  FileKey2,
  AlertOctagon,
  BarChart3,
  Activity,
  Server,
  Users,
  Settings,
  Building2,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
} from "lucide-react";

interface SidebarProps {
  role: string;
  activeView: string;
  onViewChange: (view: string) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  roles?: string[]; // undefined = all roles permitted in this section
}

interface NavSection {
  title: string;
  items: NavItem[];
  roles?: string[]; // undefined = all roles
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
  // Patient-only sections
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

export default function Sidebar({ role, activeView, onViewChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Filter sections and items based on role
  const visibleSections = allSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.roles || item.roles.includes(role)),
    }))
    .filter((section) => {
      if (section.roles && !section.roles.includes(role)) return false;
      return section.items.length > 0;
    });

  return (
    <aside
      className={`h-[calc(100vh-4rem)] bg-slate-950/70 border-r border-slate-800/60 flex flex-col z-20 sticky top-16 transition-all duration-300 ${
        collapsed ? "w-[56px]" : "w-60"
      }`}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-6 h-6 w-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center z-30 hover:bg-slate-700 transition-colors cursor-pointer shadow-md"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronRight className="h-3 w-3 text-slate-400" />
        ) : (
          <ChevronLeft className="h-3 w-3 text-slate-400" />
        )}
      </button>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {visibleSections.map((section, si) => (
          <div key={si} className={collapsed ? "mb-1" : "mb-2"}>
            {/* Section header */}
            {!collapsed && (
              <div className="text-[9px] text-slate-600 font-bold uppercase tracking-widest px-3 py-1.5 mt-1">
                {section.title}
              </div>
            )}
            {collapsed && si > 0 && (
              <div className="border-t border-slate-800/60 my-1.5 mx-1" />
            )}

            {section.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onViewChange(item.id)}
                  title={collapsed ? item.label : undefined}
                  aria-label={item.label}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium tracking-wide transition-all cursor-pointer group relative ${
                    isActive
                      ? "bg-blue-600 text-white shadow-md shadow-blue-900/30"
                      : "text-slate-500 hover:bg-slate-800/60 hover:text-slate-200"
                  }`}
                >
                  <Icon
                    className={`flex-shrink-0 ${collapsed ? "h-4.5 w-4.5" : "h-4 w-4"} ${
                      isActive ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                    }`}
                  />
                  {!collapsed && (
                    <span className="truncate">{item.label}</span>
                  )}
                  {/* Active indicator dot */}
                  {isActive && collapsed && (
                    <span className="absolute right-1 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-blue-400" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer status */}
      <div className="border-t border-slate-800/60 p-3">
        {collapsed ? (
          <div className="flex justify-center">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" title="Blockchain: Online" />
          </div>
        ) : (
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-600 font-medium">Blockchain</span>
            <span className="flex items-center gap-1 text-emerald-500 font-bold">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              ONLINE
            </span>
          </div>
        )}
      </div>
    </aside>
  );
}
