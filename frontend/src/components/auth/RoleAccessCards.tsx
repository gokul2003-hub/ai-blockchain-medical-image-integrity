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
      desc: "View and analyze authorized medical images with AI tamper overlays.",
      icon: Stethoscope,
      badge: "Clinical Care",
      badgeColor: "bg-cyan-50 text-cyan-700 border-cyan-200",
      accent: "text-cyan-600",
    },
    {
      name: "Hospital Administrator",
      key: "admin",
      desc: "Manage users, audit security events, and configure governance policies.",
      icon: ShieldCheck,
      badge: "Governance",
      badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
      accent: "text-blue-600",
    },
    {
      name: "Authorized Researcher",
      key: "researcher",
      desc: "Analyze approved, privacy-preserved, and de-identified DICOM cohorts.",
      icon: Microscope,
      badge: "Analytics",
      badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
      accent: "text-purple-600",
    },
    {
      name: "Patient",
      key: "patient",
      desc: "Access personal radiographic studies, consent logs, and integrity status.",
      icon: UserCheck,
      badge: "Personal Health",
      badgeColor: "bg-teal-50 text-teal-700 border-teal-200",
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
              className={`p-2.5 rounded-xl border text-left transition-all duration-200 ${
                isSelected
                  ? "border-cyan-500 bg-cyan-50/40 shadow-sm"
                  : "border-slate-150 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <Icon className={`w-3.5 h-3.5 ${r.accent}`} />
                  <span className="text-xs font-semibold text-slate-800">
                    {r.name}
                  </span>
                </div>
                <span
                  className={`text-[9px] font-semibold px-1.5 py-0.2 rounded border ${r.badgeColor}`}
                >
                  {r.badge}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-snug">
                {r.desc}
              </p>
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
