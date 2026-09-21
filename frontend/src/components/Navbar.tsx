import { Shield, LogOut, User as UserIcon, Bell, Sun, Moon } from "lucide-react";

interface NavbarProps {
  username: string;
  role: string;
  onLogout: () => void;
  alertsCount?: number;
  darkMode?: boolean;
  onToggleTheme?: () => void;
}

export default function Navbar({ username, role, onLogout, alertsCount = 0, darkMode = true, onToggleTheme }: NavbarProps) {
  const getRoleLabel = (r: string) => {
    switch (r) {
      case "super_admin": return "Super Admin";
      case "hospital_admin": return "Hospital Admin";
      case "doctor": return "Medical Specialist";
      case "radiologist": return "Clinical Radiologist";
      case "patient": return "Patient Portal";
      default: return "User";
    }
  };

  const getRoleBadgeColor = (r: string) => {
    switch (r) {
      case "super_admin": return "bg-red-500/20 text-red-400 border border-red-500/30";
      case "hospital_admin": return "bg-purple-500/20 text-purple-400 border border-purple-500/30";
      case "doctor": return "bg-blue-500/20 text-blue-400 border border-blue-500/30";
      case "radiologist": return "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30";
      case "patient": return "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
      default: return "bg-slate-500/20 text-slate-400";
    }
  };

  return (
    <nav className="h-16 w-full glass-panel rounded-none border-t-0 border-x-0 flex items-center justify-between px-6 z-30 sticky top-0 bg-slate-950/85">
      {/* Brand Logo */}
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 bg-gradient-to-tr from-blue-600 to-emerald-500 rounded-xl flex items-center justify-center glow-blue">
          <Shield className="h-5 w-5 text-white" />
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-sm tracking-wide text-slate-100 uppercase">MedChain AI</span>
          <span className="text-[10px] text-slate-400 font-medium">Secured Clinical Sharing</span>
        </div>
      </div>

      {/* User Actions */}
      <div className="flex items-center gap-4">
        {/* Alerts / Notifications */}
        {role === "super_admin" && (
          <div className="relative cursor-pointer p-2 hover:bg-slate-800 rounded-full transition-colors group">
            <Bell className="h-5 w-5 text-slate-300 group-hover:text-slate-100" />
            {alertsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-red-500 rounded-full animate-ping" />
            )}
          </div>
        )}

        {/* Profile Card */}
        <div className="flex items-center gap-3 bg-slate-900 border border-slate-850 px-3 py-1.5 rounded-xl">
          <div className="h-7 w-7 rounded-lg bg-slate-800 flex items-center justify-center">
            <UserIcon className="h-4 w-4 text-slate-300" />
          </div>
          <div className="flex flex-col text-left">
            <span className="text-xs font-semibold text-slate-200">{username}</span>
            <span className={`text-[9px] px-1 rounded font-bold uppercase mt-0.5 ${getRoleBadgeColor(role)}`}>
              {getRoleLabel(role)}
            </span>
          </div>
        </div>

        {/* Theme Switcher Toggle */}
        <button 
          onClick={onToggleTheme}
          className="p-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-slate-100 border border-slate-800/80 rounded-xl transition-all cursor-pointer"
          title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Logout Button */}
        <button 
          onClick={onLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-rose-950/40 text-slate-300 hover:text-rose-400 border border-slate-850 hover:border-rose-900/60 text-xs font-medium rounded-xl transition-all cursor-pointer"
        >
          <LogOut className="h-4.5 w-4.5" />
          Logout
        </button>
      </div>
    </nav>
  );
}
