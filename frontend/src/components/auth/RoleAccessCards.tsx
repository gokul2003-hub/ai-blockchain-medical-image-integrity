import React from "react";
import { Stethoscope, ShieldCheck, Microscope, UserCheck, ArrowUpRight } from "lucide-react";

interface RoleAccessCardsProps {
  onSelectRoleInfo?: (roleKey: string) => void;
  selectedRole?: string;
}

export const RoleAccessCards: React.FC<RoleAccessCardsProps> = ({
  onSelectRoleInfo,
  selectedRole,
}) => {
  const roles = [
    {
      name: "Doctor / Radiologist",
      key: "doctor",
      desc: "Clinical image review and AI forensic analysis",
      action: "Continue as Doctor",
      icon: Stethoscope,
      accent: "text-cyan-600",
    },
    {
      name: "Hospital Administrator",
      key: "admin",
      desc: "Governance, access control and audit oversight",
      action: "Explore Admin",
      icon: ShieldCheck,
      accent: "text-blue-600",
    },
    {
      name: "Authorized Researcher",
      key: "researcher",
      desc: "Secure access to approved research imaging",
      action: "Continue as Researcher",
      icon: Microscope,
      accent: "text-purple-600",
    },
    {
      name: "Patient",
      key: "patient",
      desc: "View your authorized medical imaging records",
      action: "Continue as Patient",
      icon: UserCheck,
      accent: "text-teal-600",
    },
  ];

  return (
    <div className="mt-5 pt-4 border-t border-slate-100">
      <div className="flex items-center justify-between mb-2.5">
        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 font-['Space_Grotesk']">
          Authorized Role Architecture
        </h4>
        <span className="text-[10px] text-slate-400 font-mono">
          RBAC Policy Enforced
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {roles.map((r) => {
          const Icon = r.icon;
          const isSelected = selectedRole === r.key;
          return (
            <button
              key={r.name}
              type="button"
              onClick={() => onSelectRoleInfo && onSelectRoleInfo(r.key)}
              aria-label={`${r.action} — ${r.name}. ${r.desc}`}
              aria-pressed={isSelected}
              className={`group p-3 rounded-xl border text-left transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 ${
                isSelected
                  ? "border-cyan-500 bg-cyan-50/40 shadow-sm"
                  : "border-slate-150 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <Icon className={`w-4 h-4 shrink-0 ${r.accent}`} />
                <span className="text-[13px] font-bold text-slate-800 leading-tight">
                  {r.name}
                </span>
              </div>

              <p className="text-xs text-slate-500 leading-snug mb-2.5">
                {r.desc}
              </p>

              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 group-hover:text-slate-900">
                {r.action}
                <ArrowUpRight
                  className={`w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${
                    isSelected ? "text-cyan-600" : "text-slate-400 group-hover:text-slate-600"
                  }`}
                  aria-hidden="true"
                />
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-slate-400 text-center mt-2 italic">
        Role-based access requires valid cryptographic credentials. Frontend selection does not bypass backend authorization.
      </p>
    </div>
  );
};
export default RoleAccessCards;
