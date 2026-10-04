import React from "react";
import { 
  ScanLine, 
  Network, 
  LockKeyhole, 
  RotateCcw,
  Sparkles
} from "lucide-react";

export const FeatureSecurityCards: React.FC = () => {
  const features = [
    {
      title: "AI Forensics",
      subtitle: "Tamper Detection & Localization",
      tech: "SRM + Swin-UNet",
      icon: ScanLine,
      color: "from-cyan-500/20 to-blue-500/10",
      accent: "text-cyan-400",
      border: "hover:border-cyan-400/50",
      glow: "hover:shadow-cyan-500/20",
    },
    {
      title: "Blockchain",
      subtitle: "Immutable Audit Trail",
      tech: "PoA Consensus",
      icon: Network,
      color: "from-blue-500/20 to-indigo-500/10",
      accent: "text-blue-400",
      border: "hover:border-blue-400/50",
      glow: "hover:shadow-blue-500/20",
    },
    {
      title: "End-to-End",
      subtitle: "Encryption (AES-256 + 4D Chen)",
      tech: "Hyperchaotic Stream",
      icon: LockKeyhole,
      color: "from-indigo-500/20 to-purple-500/10",
      accent: "text-indigo-400",
      border: "hover:border-indigo-400/50",
      glow: "hover:shadow-indigo-500/20",
    },
    {
      title: "Self-Recovery",
      subtitle: "Restore Tampered Regions",
      tech: "Reversible Watermark",
      icon: RotateCcw,
      color: "from-teal-500/20 to-emerald-500/10",
      accent: "text-teal-400",
      border: "hover:border-teal-400/50",
      glow: "hover:shadow-teal-500/20",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 w-full">
      {features.map((feat) => {
        const Icon = feat.icon;
        return (
          <div
            key={feat.title}
            className={`group relative bg-slate-900/60 backdrop-blur-md rounded-xl p-3 border border-slate-700/60 shadow-lg transition-all duration-300 hover:-translate-y-0.5 ${feat.border} ${feat.glow} flex flex-col justify-between`}
          >
            <div>
              <div className="flex items-center justify-between mb-2">
                <div
                  className={`w-7 h-7 rounded-lg bg-gradient-to-br ${feat.color} border border-slate-700 flex items-center justify-center ${feat.accent} group-hover:scale-110 transition-transform duration-300`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-[9px] font-mono uppercase text-slate-400 px-1.5 py-0.5 rounded bg-slate-800/80">
                  {feat.tech}
                </span>
              </div>

              <h4 className="text-xs font-bold text-white font-['Outfit'] tracking-tight">
                {feat.title}
              </h4>
              <p className="text-[11px] text-slate-300 leading-tight mt-0.5">
                {feat.subtitle}
              </p>
            </div>

            <div className="mt-2 pt-1.5 border-t border-slate-800/70 flex items-center justify-between text-[9px] text-slate-400 font-mono">
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </span>
              <span className="text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                Inspect <Sparkles className="w-2.5 h-2.5" />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
export default FeatureSecurityCards;
