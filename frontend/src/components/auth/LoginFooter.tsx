import React, { useState } from "react";
import { Shield, ExternalLink, X } from "lucide-react";

export const LoginFooter: React.FC = () => {
  const [modalContent, setModalContent] = useState<{
    open: boolean;
    title: string;
    body: string;
  }>({
    open: false,
    title: "",
    body: "",
  });

  const links = [
    {
      label: "Privacy Policy",
      body: "MediSecure AI enforces HIPAA and GDPR compliant biometric & DICOM de-identification protocols. Scans are cryptographically hashed and verified using private consortium consensus.",
    },
    {
      label: "Terms of Service",
      body: "Access to MediSecure AI clinical workspaces is governed by institutional credentials. Unauthorized credential sharing or synthetic tamper injection is strictly audited and logged.",
    },
    {
      label: "Data Protection",
      body: "All radiological assets are protected with AES-256-GCM authenticated encryption cascaded with 4D Chen hyperchaotic parameterization to ensure information-theoretic zero disclosure.",
    },
    {
      label: "Research Ethics",
      body: "Institutional Review Board (IRB) ethical standards are embedded into researcher workspaces. All training and validation cohorts require cryptographically attested patient consent.",
    },
  ];

  return (
    <>
      <footer className="w-full bg-[#050b18] border-t border-cyan-500/15 py-4 px-4 sm:px-6 lg:px-8 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          
          {/* Brand & Copyright */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-white font-['Outfit']">MediSecure AI</span>
            <span>•</span>
            <span className="text-[11px] text-slate-400">
              © 2026 MediSecure AI. All rights reserved.
            </span>
          </div>

          {/* Compliance & Policy Links */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px]">
            {links.map((link) => (
              <button
                key={link.label}
                type="button"
                onClick={() =>
                  setModalContent({
                    open: true,
                    title: link.label,
                    body: link.body,
                  })
                }
                className="hover:text-cyan-400 transition-colors"
              >
                {link.label}
              </button>
            ))}
          </div>

          {/* System Status & Version */}
          <div className="flex items-center gap-3 text-[11px] font-mono">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>System Online</span>
            </div>
            <span className="text-slate-500">v1.0.0</span>
          </div>
        </div>
      </footer>

      {/* Modal for Policy Links */}
      {modalContent.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0b1428] border border-cyan-500/30 rounded-2xl max-w-md w-full p-6 text-white shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-cyan-400">
                <Shield className="w-5 h-5" />
                <h3 className="font-bold text-base font-['Outfit']">
                  {modalContent.title}
                </h3>
              </div>
              <button
                onClick={() => setModalContent({ ...modalContent, open: false })}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="py-4 text-xs text-slate-300 leading-relaxed">
              {modalContent.body}
            </div>
            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setModalContent({ ...modalContent, open: false })}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg text-xs transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
export default LoginFooter;
