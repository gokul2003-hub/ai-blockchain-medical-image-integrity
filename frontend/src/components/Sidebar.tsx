import React from "react";
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  FileLock2, 
  Upload, 
  Download, 
  Database, 
  History,
  ShieldCheck,
  BriefcaseMedical
} from "lucide-react";

interface SidebarProps {
  role: string;
  activeView: string;
  onViewChange: (view: string) => void;
}

export default function Sidebar({ role, activeView, onViewChange }: SidebarProps) {
  
  const getSidebarItems = (r: string) => {
    const items = [];
    
    // All users get access to general stats/dashboard
    items.push({ id: "dashboard", label: "Dashboard", icon: LayoutDashboard });
    
    if (r === "super_admin") {
      items.push({ id: "hospitals", label: "Hospitals", icon: Building2 });
      items.push({ id: "blockchain", label: "Blockchain Explorer", icon: Database });
      items.push({ id: "logs", label: "Audit Ledger", icon: History });
    }
    else if (r === "hospital_admin") {
      items.push({ id: "staff", label: "Manage Staff", icon: Users });
      items.push({ id: "blockchain", label: "Blockchain Explorer", icon: Database });
    }
    else if (r === "doctor") {
      items.push({ id: "patient-list", label: "Patient Scans", icon: BriefcaseMedical });
      items.push({ id: "upload", label: "Upload Image", icon: Upload });
      items.push({ id: "permissions", label: "Access Rights", icon: FileLock2 });
      items.push({ id: "blockchain", label: "Blockchain Explorer", icon: Database });
    }
    else if (r === "radiologist") {
      items.push({ id: "radiology-queue", label: "Diagnoses Queue", icon: BriefcaseMedical });
      items.push({ id: "upload", label: "Upload Scan", icon: Upload });
      items.push({ id: "blockchain", label: "Blockchain Explorer", icon: Database });
    }
    else if (r === "patient") {
      items.push({ id: "patient-records", label: "My Medical Files", icon: ShieldCheck });
      items.push({ id: "patient-permissions", label: "Grant Access Control", icon: FileLock2 });
      items.push({ id: "logs", label: "My Access Audits", icon: History });
    }
    
    return items;
  };

  const menuItems = getSidebarItems(role);

  return (
    <aside className="w-64 h-[calc(100vh-4rem)] bg-slate-950/40 border-r border-slate-900 flex flex-col p-4 z-20 sticky top-16">
      <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-4 px-2">Navigation</div>
      
      <nav className="flex-1 flex flex-col gap-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all cursor-pointer ${
                isActive 
                  ? "bg-blue-600 text-white font-semibold glow-blue" 
                  : "text-slate-400 hover:bg-slate-900/60 hover:text-slate-200"
              }`}
            >
              <Icon className="h-4.5 w-4.5" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Footer System Status */}
      <div className="border-t border-slate-900 pt-4 mt-auto">
        <div className="flex items-center justify-between px-2 text-[10px] text-slate-500">
          <span>Decentralized Ledger:</span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-400 font-bold">ONLINE</span>
          </span>
        </div>
      </div>
    </aside>
  );
}
