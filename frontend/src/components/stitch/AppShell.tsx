import React, { useState } from "react";
import { RoleSidebar } from "./RoleSidebar";
import { TopNavbar } from "./TopNavbar";

interface AppShellProps {
  role: string | null;
  username: string | null;
  activePath: string;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  alertsCount?: number;
  assignedCount?: number;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  role,
  username,
  activePath,
  onNavigate,
  onLogout,
  alertsCount = 0,
  assignedCount = 0,
  children,
}) => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleNavigate = (path: string) => {
    onNavigate(path);
    setMobileNavOpen(false);
  };

  return (
    <div className="bg-surface font-body-md text-body-md text-on-surface antialiased min-h-screen">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <RoleSidebar
          role={role}
          activePath={activePath}
          onNavigate={handleNavigate}
          assignedCount={assignedCount}
          onLogout={onLogout}
          username={username}
        />
      </div>

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw]">
            <RoleSidebar
              role={role}
              activePath={activePath}
              onNavigate={handleNavigate}
              assignedCount={assignedCount}
              drawer
              onLogout={onLogout}
              username={username}
            />
          </div>
        </div>
      )}

      <div className="lg:pl-[18.5rem] px-4 flex flex-col min-h-screen relative z-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary-fixed/20 via-surface to-surface">
        <TopNavbar
          username={username}
          role={role}
          onLogout={onLogout}
          alertsCount={alertsCount}
          onOpenAuditSearch={() => handleNavigate("blockchain-audit-and-reports")}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />

        <main className="flex-1 w-full pt-24 lg:pt-28 pb-8">
          <div className="max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
export default AppShell;
