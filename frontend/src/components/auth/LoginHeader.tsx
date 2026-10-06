import React, { useEffect, useState } from "react";
import { ShieldCheck, HelpCircle, X, Lock } from "lucide-react";

export const LoginHeader: React.FC = () => {
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Close the Help dialog with the Escape key
  useEffect(() => {
    if (!showHelpModal) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowHelpModal(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showHelpModal]);

  return (
    <>
      <header className="w-full bg-[#070e1e]/90 backdrop-blur-md border-b border-cyan-500/15 sticky top-0 z-50 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 p-[1.5px] shadow-lg shadow-cyan-500/20">
              <div className="w-full h-full bg-[#070e1e] rounded-[10px] flex items-center justify-center text-cyan-400">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-white font-['Outfit']">
                  MediSecure <span className="text-cyan-400">AI</span>
                </span>
                <span className="hidden sm:inline-flex text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  Trust Protocol v4.2
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono hidden md:block">
                Clinical Blockchain &amp; Neural Forensics
              </p>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Help & Support Button */}
            <button
              type="button"
              onClick={() => setShowHelpModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-medium transition-all"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Help &amp; Support</span>
            </button>
          </div>
        </div>
      </header>

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-dialog-title"
            className="bg-[#0b1428] border border-cyan-500/30 rounded-2xl max-w-md w-full p-6 text-white shadow-2xl relative"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-cyan-400">
                <Lock className="w-5 h-5" />
                <h3 id="help-dialog-title" className="font-bold text-base font-['Outfit']">
                  MediSecure AI Support
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close help dialog"
                onClick={() => setShowHelpModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="py-4 space-y-3 text-xs text-slate-300">
              <p>
                <strong>Clinical access assistance:</strong> For urgent access issues or break-glass authorization, contact your institutional Hospital Security Operations Center (HSOC).
              </p>
              <p className="text-[11px] text-slate-400">
                Dual-custody verification is required for all role escalation and manual audit log overrides.
              </p>
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelpModal(false)}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg text-xs transition"
              >
                Close Notice
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
export default LoginHeader;
