import React, { useState, useEffect, useRef } from "react";

interface TopNavbarProps {
  username: string | null;
  role: string | null;
  onLogout: () => void;
  alertsCount?: number;
  onOpenAuditSearch?: () => void;
  onOpenMobileNav?: () => void;
  className?: string;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  username,
  role,
  onLogout,
  alertsCount = 0,
  onOpenAuditSearch,
  onOpenMobileNav,
  className = "",
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [themeDark, setThemeDark] = useState(true);
  const [lang, setLang] = useState<"EN" | "ES">("EN");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // "/" focuses global search, but never hijacks typing in form fields.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Apply the chosen theme globally: the existing `.light-mode` CSS overrides
  // (index.css) activate when this class is present on <html>/<body>.
  useEffect(() => {
    document.documentElement.classList.toggle("light-mode", !themeDark);
    document.body.classList.toggle("light-mode", !themeDark);
  }, [themeDark]);

  const getRoleDisplayName = () => {
    switch (role?.toLowerCase()) {
      case "doctor":
      case "radiologist":
        return { name: "Doctor / Radiologist", icon: "stethoscope" };
      case "super_admin":
      case "admin":
      case "hospital_admin":
        return { name: "Hospital Administrator", icon: "admin_panel_settings" };
      case "researcher":
        return { name: "Authorized Researcher", icon: "biotech" };
      case "patient":
        return { name: "Patient Portal", icon: "person" };
      default:
        return { name: role || "Clinical User", icon: "badge" };
    }
  };

  const roleMeta = getRoleDisplayName();

  return (
    <header
      className={`fixed top-4 left-4 right-4 lg:left-[18.5rem] h-16 z-30 bg-surface-container-lowest/85 backdrop-blur-xl border border-surface-container-high/40 rounded-3xl shadow-2xl ${className}`}
    >
      <div className="h-16 w-full px-4 lg:px-6 flex items-center justify-between gap-4">
        {/* Mobile nav trigger + Role Persona Capsule */}
        <div className="flex items-center gap-3">
          <button
            aria-label="Open navigation"
            type="button"
            onClick={onOpenMobileNav}
            className="lg:hidden p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high"
          >
            <span className="material-symbols-outlined text-[20px]" data-icon="menu" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container text-on-surface border border-surface-container-high/60 shadow-sm">
            <span className="material-symbols-outlined text-[18px] text-primary" data-icon={roleMeta.icon} aria-hidden="true" />
            <span className="font-label-md text-xs font-semibold hidden sm:inline">
              {roleMeta.name}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-xs">
            <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span className="tracking-wide font-medium">Ledger Synced</span>
          </div>
        </div>

        {/* Global Search */}
        <form
          className="hidden sm:flex flex-1 max-w-sm items-center gap-2 px-3 py-1.5 rounded-full bg-surface-container border border-surface-container-high/60"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("medisecure:search", { detail: searchQuery }));
          }}
        >
          <span className="material-symbols-outlined text-[18px] text-primary" data-icon="search" aria-hidden="true" />
          <input
            ref={searchInputRef}
            aria-label="Global search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search studies, patient ID, accession"
            className="bg-transparent text-xs text-on-surface placeholder:text-outline focus:outline-none w-full min-w-0"
          />
          <span
            aria-hidden="true"
            className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded border border-surface-container-high text-[10px] leading-none text-on-surface-variant font-label-sm select-none"
          >
            Press "/"
          </span>
        </form>

        {/* Right: Quick Tools, Alerts, Profile & Logout */}
        <div className="flex items-center gap-2 lg:gap-4">
          <div className="flex items-center gap-1">
            {/* Theme Toggle (dark blueprint is default) */}
            <button
              aria-label="Toggle theme"
              title="Toggle contrast profile"
              onClick={() => setThemeDark((v) => !v)}
              className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
              type="button"
            >
              <span
                className="material-symbols-outlined text-[20px]"
                data-icon={themeDark ? "dark_mode" : "light_mode"}
                aria-hidden="true"
              />
            </button>

            {/* Language toggle */}
            <button
              aria-label="Toggle language"
              title="UI language"
              onClick={() => setLang((l) => (l === "EN" ? "ES" : "EN"))}
              className="px-2 py-1 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors font-label-md text-xs font-semibold"
              type="button"
            >
              {lang}
            </button>

            {/* Notifications Button */}
            <div className="relative">
              <button
                aria-label="Open notifications"
                className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
                type="button"
              >
                <span className="material-symbols-outlined text-[20px]" data-icon="notifications" aria-hidden="true" />
                {alertsCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-error" />
                )}
              </button>
            </div>

            {/* Audit Quick Search */}
            {onOpenAuditSearch && (
              <button
                onClick={onOpenAuditSearch}
                aria-label="Audit ledger search"
                className="p-2 rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-colors"
                title="Inspect cryptographic ledger"
                type="button"
              >
                <span className="material-symbols-outlined text-[20px]" data-icon="fingerprint" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="h-6 w-px bg-surface-container-high" />

          {/* Profile & Logout */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:flex flex-col">
              <span className="font-label-md text-xs font-semibold text-on-surface leading-tight">
                {username || "Authorized User"}
              </span>
              <span className="font-label-sm text-[10px] text-on-surface-variant capitalize">
                {role || "Staff"}
              </span>
            </div>

            <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-xs shadow-sm">
              {(username || "U").slice(0, 2).toUpperCase()}
            </div>

            <button
              onClick={onLogout}
              type="button"
              aria-label="Logout"
              className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container/30 transition-colors"
              title="Sign Out of Clinical Suite"
            >
              <span className="material-symbols-outlined text-[18px]" data-icon="logout" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
export default TopNavbar;

