import React, { useState } from "react";
import { 
  ShieldCheck, 
  Moon, 
  Sun, 
  Globe, 
  HelpCircle, 
  Menu, 
  X,
  Lock
} from "lucide-react";

interface LoginHeaderProps {
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
}

export const LoginHeader: React.FC<LoginHeaderProps> = ({ 
  darkMode = true, 
  onToggleDarkMode 
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeLang, setActiveLang] = useState<"EN" | "ES" | "FR">("EN");
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const navLinks = [
    { label: "Home", href: "#hero" },
    { label: "About", href: "#about" },
    { label: "Features", href: "#features" },
    { label: "Security", href: "#security" },
    { label: "Research", href: "#research" },
    { label: "Contact", href: "#contact" },
  ];

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

          {/* Desktop Navigation Links */}
          <nav className="hidden lg:flex items-center gap-7">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-xs font-medium text-slate-300 hover:text-cyan-400 transition-colors tracking-wide py-1"
                onClick={(e) => {
                  e.preventDefault();
                }}
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Right Action Controls */}
          <div className="flex items-center gap-3 sm:gap-4">
            
            {/* Dark Mode Toggle */}
            <button
              type="button"
              onClick={onToggleDarkMode}
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
              aria-label="Toggle theme"
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60 transition-all"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-cyan-400" />}
            </button>

            {/* Language Selector */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowLangMenu(!showLangMenu)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60 text-xs font-medium transition-all"
                aria-label="Select language"
              >
                <Globe className="w-3.5 h-3.5 text-cyan-400" />
                <span>{activeLang}</span>
              </button>
              {showLangMenu && (
                <div className="absolute right-0 mt-2 w-28 bg-[#0b1428] rounded-lg shadow-2xl border border-cyan-500/20 py-1 z-50 text-xs">
                  {(["EN", "ES", "FR"] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => {
                        setActiveLang(lang);
                        setShowLangMenu(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 hover:bg-cyan-500/10 ${
                        activeLang === lang ? "text-cyan-400 font-semibold" : "text-slate-300"
                      }`}
                    >
                      {lang === "EN" ? "English" : lang === "ES" ? "Español" : "Français"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Help & Support Button */}
            <button
              type="button"
              onClick={() => setShowHelpModal(true)}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-medium transition-all"
            >
              <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
              <span>Help &amp; Support</span>
            </button>

            {/* Mobile Menu Toggle */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg bg-slate-800/80 text-slate-300 hover:text-white border border-slate-700/60"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-[#070e1e] border-b border-cyan-500/20 px-4 pt-3 pb-4 space-y-2">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={(e) => {
                  e.preventDefault();
                  setMobileMenuOpen(false);
                }}
                className="block px-3 py-2 rounded-md text-sm font-medium text-slate-300 hover:text-cyan-400 hover:bg-cyan-500/10 transition"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-2 border-t border-slate-800">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  setShowHelpModal(true);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-cyan-400 hover:bg-cyan-500/10 rounded-md font-medium"
              >
                <HelpCircle className="w-4 h-4" />
                <span>Help &amp; Clinical Support</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#0b1428] border border-cyan-500/30 rounded-2xl max-w-md w-full p-6 text-white shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-cyan-400">
                <Lock className="w-5 h-5" />
                <h3 className="font-bold text-base font-['Outfit']">MediSecure AI Support</h3>
              </div>
              <button
                onClick={() => setShowHelpModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="py-4 space-y-3 text-xs text-slate-300">
              <p>
                <strong>24/7 Clinical Emergency Assistance:</strong> For urgent access issues or break-glass authorization, contact your institutional Hospital Security Operations Center (HSOC).
              </p>
              <div className="p-3 bg-slate-900/90 rounded-lg border border-slate-800 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">HSOC Emergency Line:</span>
                  <span className="font-mono text-cyan-400">+1 (800) 555-MEDSEC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Protocol Spec:</span>
                  <span className="font-mono text-slate-200">DICOM PS3.15 + IEEE-802</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Consortium Ledger:</span>
                  <span className="font-mono text-emerald-400">Synced (Block #1,204,982)</span>
                </div>
              </div>
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
