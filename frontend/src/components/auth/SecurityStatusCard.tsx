import React from "react";
import { CheckCircle2, ShieldAlert, Award } from "lucide-react";

interface SecurityStatusCardProps {
  score?: number;
  isIllustrative?: boolean;
}

export const SecurityStatusCard: React.FC<SecurityStatusCardProps> = ({
  score = 98,
  isIllustrative = true,
}) => {
  const verifiedItems = [
    "Authorized Access",
    "Consent Verified",
    "Data Integrity",
    "Secure Storage",
    "Audit Logged",
  ];

  return (
    <div className="w-full max-w-xs bg-slate-900/80 backdrop-blur-xl rounded-xl p-3.5 border border-blue-500/30 shadow-2xl shadow-blue-950/50 transition-all hover:border-blue-400/50">
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-700/60">
        <div className="flex items-center gap-1.5">
          <Award className="w-4 h-4 text-blue-400" />
          <span className="text-[11px] font-bold tracking-wider uppercase text-blue-300 font-['Space_Grotesk']">
            Security Status
          </span>
        </div>
        {isIllustrative && (
          <span className="text-[9px] uppercase tracking-wider text-slate-400 font-mono px-1.5 py-0.5 rounded bg-slate-800/80">
            Illustrative Metric
          </span>
        )}
      </div>

      {/* Trust Score circular / large metric */}
      <div className="flex items-center gap-4 py-1">
        <div className="relative w-14 h-14 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 p-[2px] flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <div className="w-full h-full bg-[#0a1128] rounded-full flex flex-col items-center justify-center">
            <span className="text-base font-extrabold text-cyan-400 font-['Outfit'] leading-none">
              {score}%
            </span>
            <span className="text-[8px] uppercase tracking-tighter text-slate-400 font-mono mt-0.5">
              Score
            </span>
          </div>
        </div>

        <div>
          <h4 className="text-xs font-semibold text-white">Trust Score</h4>
          <p className="text-[10px] text-slate-400 leading-tight">
            High Confidence Zero-Trust Multi-Party Validation
          </p>
        </div>
      </div>

      {/* Verified Items Checklist */}
      <div className="space-y-1 mt-2 pt-2 border-t border-slate-800/80">
        {verifiedItems.map((item) => (
          <div key={item} className="flex items-center gap-1.5 text-[11px] text-slate-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
export default SecurityStatusCard;
