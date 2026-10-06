import React, { useState } from "react";
import { KeyRound, ShieldAlert, Cpu, CheckCircle2, X } from "lucide-react";

export const AuthMethodButtons: React.FC = () => {
  const [modalState, setModalState] = useState<{
    open: boolean;
    title: string;
    type: "DID" | "FIDO2" | null;
    message: string;
  }>({
    open: false,
    title: "",
    type: null,
    message: "",
  });

  const handleDidClick = () => {
    setModalState({
      open: true,
      title: "Decentralized Identifier (DID / VC) Authentication",
      type: "DID",
      message:
        "W3C DID/VC cryptographic identity documents are fully issued by MediSecure AI upon user enrollment. Direct browser wallet signature authentication is currently in institutional pilot evaluation. Please sign in using your institutional username and master key.",
    });
  };

  const handleFido2Click = () => {
    setModalState({
      open: true,
      title: "Hardware Security Key (FIDO2 / WebAuthn)",
      type: "FIDO2",
      message:
        "FIDO2 authentication is not configured in this environment. Physical WebAuthn authenticators require an active institutional FIDO2 server registration. Please authenticate via username, password, and optional TOTP MFA.",
    });
  };

  return (
    <>
      <div className="space-y-2.5 my-4">
        <div className="relative flex items-center justify-center my-3">
          <div className="border-t border-slate-200 w-full" />
          <span className="bg-white px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
            Alternative Institutional Keys
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* DID / VC Button */}
          <button
            type="button"
            onClick={handleDidClick}
            aria-haspopup="dialog"
            className="flex flex-col items-center justify-center gap-1 py-2.5 px-3 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-100 text-slate-700 text-xs font-semibold shadow-sm transition-all hover:border-cyan-500/40 hover:text-cyan-800"
          >
            <span className="flex items-center justify-center gap-2">
              <Cpu className="w-4 h-4 text-cyan-600" />
              <span className="truncate">Login with DID / VC</span>
            </span>
            <span className="text-[10px] font-normal text-slate-500">
              View DID / VC sign-in availability
            </span>
          </button>

          {/* FIDO2 Button */}
          <button
            type="button"
            onClick={handleFido2Click}
            aria-haspopup="dialog"
            className="flex flex-col items-center justify-center gap-1 py-2.5 px-3 rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-100 text-slate-700 text-xs font-semibold shadow-sm transition-all hover:border-blue-500/40 hover:text-blue-800"
          >
            <span className="flex items-center justify-center gap-2">
              <KeyRound className="w-4 h-4 text-blue-600" />
              <span className="truncate">Login with FIDO2</span>
            </span>
            <span className="text-[10px] font-normal text-slate-500">
              View security key sign-in availability
            </span>
          </button>
        </div>
      </div>

      {/* Informative Modal (Never fakes authentication) */}
      {modalState.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    modalState.type === "DID"
                      ? "bg-cyan-50 text-cyan-600 border border-cyan-200"
                      : "bg-blue-50 text-blue-600 border border-blue-200"
                  }`}
                >
                  {modalState.type === "DID" ? (
                    <Cpu className="w-5 h-5" />
                  ) : (
                    <KeyRound className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 font-['Outfit']">
                    {modalState.title}
                  </h3>
                  <span className="text-[10px] uppercase font-mono text-slate-500 tracking-wider">
                    Institutional Specification Notice
                  </span>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => setModalState({ ...modalState, open: false })}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                {modalState.message}
              </p>

              <div className="mt-4 p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2.5 text-[11px] text-amber-900">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong>Zero-Trust Protocol Restriction:</strong> Authentication cannot be bypassed. Only backend-validated sessions with active cryptographic credentials can access clinical workspaces.
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setModalState({ ...modalState, open: false })}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl text-xs transition"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
export default AuthMethodButtons;
