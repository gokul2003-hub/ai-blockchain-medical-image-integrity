import React from "react";
import { ShieldCheck } from "lucide-react";

export const SecurityNotice: React.FC = () => {
  return (
    <div className="mt-4 p-3 rounded-xl bg-gradient-to-r from-blue-50/70 via-cyan-50/50 to-slate-50 border border-blue-100/80 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-600 flex items-center justify-center shrink-0 shadow-sm border border-blue-200/50">
        <ShieldCheck className="w-4 h-4" />
      </div>
      <div>
        <h5 className="text-xs font-bold text-slate-800 font-['Outfit']">
          Your Data. Your Control. Our Secure Future.
        </h5>
        <p className="text-[11px] text-slate-500 leading-tight">
          Protected by Advanced Cryptography, Blockchain and AI Forensics.
        </p>
      </div>
    </div>
  );
};
export default SecurityNotice;
