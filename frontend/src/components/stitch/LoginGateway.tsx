import React from "react";
import LoginHeader from "../auth/LoginHeader";
import LoginHero from "../auth/LoginHero";
import LoginForm from "../auth/LoginForm";
import LoginFooter from "../auth/LoginFooter";

interface LoginGatewayProps {
  onLoginSuccess: (token: string, username: string, role: string) => void;
}

export const LoginGateway: React.FC<LoginGatewayProps> = ({ onLoginSuccess }) => {
  return (
    <div className="min-h-screen bg-[#070d1e] text-slate-100 flex flex-col justify-between selection:bg-cyan-500 selection:text-white font-sans antialiased overflow-x-hidden">
      
      {/* Top Header (brand + help) */}
      <LoginHeader />

      {/* Main Two-Column Content Showcase */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5 flex items-center justify-center">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-stretch rounded-3xl bg-[#081126]/60 backdrop-blur-xl border border-cyan-500/20 shadow-2xl shadow-cyan-950/40 overflow-hidden lg:max-h-[calc(100vh-12.5rem)] lg:overflow-y-auto">
          
          {/* Left Column: Dark Futuristic Medical Security Showcase (7 Cols on LG) */}
          <div className="lg:col-span-7 flex flex-col">
            <LoginHero />
          </div>

          {/* Right Column: White / Ivory Authentication Panel (5 Cols on LG) */}
          <div className="lg:col-span-5 bg-gradient-to-b from-slate-100 to-slate-200/90 p-4 sm:p-6 lg:p-8 flex items-center justify-center">
            {/* Constrain the form so it never stretches to the full panel width */}
            <div className="w-full max-w-md mx-auto">
              <LoginForm onLoginSuccess={onLoginSuccess} />
            </div>
          </div>

        </div>
      </main>

      {/* Persistent System Footer */}
      <LoginFooter />

    </div>
  );
};

export default LoginGateway;
