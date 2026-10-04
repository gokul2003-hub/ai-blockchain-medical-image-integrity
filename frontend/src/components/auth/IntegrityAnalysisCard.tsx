import React from "react";
import { CheckCircle2, AlertTriangle, Info, ShieldCheck } from "lucide-react";

export const IntegrityAnalysisCard: React.FC = () => {
  const analysisRows = [
    {
      label: "Hash Verification",
      status: "Valid",
      icon: CheckCircle2,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
    },
    {
      label: "Blockchain Record",
      status: "Valid",
      icon: CheckCircle2,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
    },
    {
      label: "IPFS Storage",
      status: "Valid",
      icon: CheckCircle2,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
    },
    {
      label: "AI Analysis",
      status: "Tampered",
      icon: AlertTriangle,
      color: "text-rose-400",
      bg: "bg-rose-500/10",
      border: "border-rose-500/30",
    },
    {
      label: "Region Localization",
      status: "Completed",
      icon: Info,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/30",
    },
  ];

  return (
    <div className="w-full max-w-xs bg-slate-900/80 backdrop-blur-xl rounded-xl p-3.5 border border-cyan-500/30 shadow-2xl shadow-cyan-950/50 transition-all hover:border-cyan-400/50">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/60">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-cyan-400" />
          <span className="text-[11px] font-bold tracking-wider uppercase text-cyan-300 font-['Space_Grotesk']">
            Integrity Analysis
          </span>
        </div>
        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-mono px-1.5 py-0.5 rounded bg-slate-800/80">
          Forensic Telemetry
        </span>
      </div>

      <div className="space-y-1.5">
        {analysisRows.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.label}
              className="flex items-center justify-between text-xs py-1 px-1.5 rounded-md hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Icon className={`w-3.5 h-3.5 ${row.color}`} />
                <span className="text-slate-200 text-[11px] font-medium">{row.label}</span>
              </div>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${row.bg} ${row.color} ${row.border}`}
              >
                {row.status}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 pt-2 border-t border-slate-800 flex items-center justify-between text-[9px] text-slate-400 font-mono">
        <span>Dual Ledger SHA-3 Engine</span>
        <span className="text-cyan-400/80">Active Scan</span>
      </div>
    </div>
  );
};
export default IntegrityAnalysisCard;
