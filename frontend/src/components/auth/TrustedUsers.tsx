import React from "react";
import { Building2, Stethoscope, Microscope, UserCheck } from "lucide-react";

export const TrustedUsers: React.FC = () => {
  const groups = [
    { label: "Hospitals", icon: Building2, count: "50+ Networks" },
    { label: "Doctors", icon: Stethoscope, count: "1,200+ Clinicians" },
    { label: "Researchers", icon: Microscope, count: "30+ Labs" },
    { label: "Patients", icon: UserCheck, count: "100k+ Scans Secured" },
  ];

  return (
    <div className="w-full pt-4 border-t border-slate-800/80">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5 font-['Space_Grotesk']">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
        Trusted by Healthcare Professionals, Researchers and Patients
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {groups.map((g) => {
          const Icon = g.icon;
          return (
            <div
              key={g.label}
              className="flex items-center gap-2 p-2 rounded-lg bg-slate-900/40 border border-slate-800/70 hover:border-cyan-500/30 transition-colors"
            >
              <div className="w-6 h-6 rounded-md bg-cyan-500/10 text-cyan-400 flex items-center justify-center shrink-0">
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="overflow-hidden">
                <span className="text-xs font-semibold text-slate-200 block truncate">
                  {g.label}
                </span>
                <span className="text-[9px] text-slate-400 font-mono block truncate">
                  {g.count}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default TrustedUsers;
