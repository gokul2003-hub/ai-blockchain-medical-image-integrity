import React from "react";
import { 
  ShieldCheck, 
  Activity, 
  Cpu, 
  Eye, 
  AlertCircle, 
  Crosshair,
  Lock,
  Layers
} from "lucide-react";
import IntegrityAnalysisCard from "./IntegrityAnalysisCard";
import SecurityStatusCard from "./SecurityStatusCard";
import FeatureSecurityCards from "./FeatureSecurityCards";
import TrustedUsers from "./TrustedUsers";

export const LoginHero: React.FC = () => {
  return (
    <div className="relative w-full h-full bg-gradient-to-b from-[#060c1c] via-[#091329] to-[#050b18] text-white p-6 sm:p-8 lg:p-10 flex flex-col justify-between overflow-hidden border-r border-cyan-500/20">
      
      {/* Background Decorative Tech Grid & Glowing Orbs */}
      <div 
        className="absolute inset-0 opacity-[0.07] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #38bdf8 1px, transparent 0)`,
          backgroundSize: "28px 28px"
        }}
      />
      <div className="absolute -top-32 -left-32 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -right-24 w-80 h-80 bg-blue-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Hero Header & Brand Presentation */}
      <div className="relative z-10 space-y-4">
        
        {/* Protocol Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>ZERO-TRUST CLINICAL CRYPTOGRAPHY</span>
          <span className="text-slate-500">•</span>
          <span className="text-[11px] text-slate-300">IEEE-TIFS Spec</span>
        </div>

        {/* Main Branding & Multi-Line Headline */}
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-sm font-semibold tracking-wider uppercase font-['Space_Grotesk'] mb-1">
            <ShieldCheck className="w-4 h-4" />
            MediSecure AI Platform
          </div>
          
          <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold tracking-tight font-['Outfit'] leading-[1.15] text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-300">
            Secure Medical Images <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-300">
              Trusted Healthcare
            </span> <br />
            Smarter Tomorrow
          </h1>

          <p className="mt-3 text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl font-['Public_Sans']">
            An AI-Driven Blockchain Framework for Continuous Medical Image Integrity Verification, Tamper Forensics, and Self-Recovery.
          </p>
        </div>
      </div>

      {/* Central Medical Image & AI Forensics Showcase */}
      <div className="relative z-10 my-6 flex flex-col items-center justify-center">
        
        {/* Central Scan Container */}
        <div className="relative w-full max-w-lg aspect-[16/10] sm:aspect-[16/9] rounded-2xl bg-slate-950/80 border border-cyan-500/30 overflow-hidden shadow-2xl shadow-cyan-950/40 backdrop-blur-md flex items-center justify-center">
          
          {/* Medical Scan Grid Overlay */}
          <div 
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage: `linear-gradient(to right, #00f2fe 1px, transparent 1px), linear-gradient(to bottom, #00f2fe 1px, transparent 1px)`,
              backgroundSize: "24px 24px"
            }}
          />

          {/* Animated Scanning Beam */}
          <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_15px_#22d3ee] animate-[bounce_4s_infinite] pointer-events-none z-20 opacity-80" />

          {/* Stylized Brain MRI Vector Illustration with AI Forensic Segmentation */}
          <div className="relative w-48 h-48 sm:w-56 sm:h-56 flex items-center justify-center">
            
            {/* Outer Anatomical Cranial Boundary (Cyan) */}
            <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-[0_0_12px_rgba(6,182,212,0.4)]">
              {/* Brain Hemisphere Contours */}
              <path
                d="M100 20 C60 20 30 50 30 95 C30 135 55 170 100 180 C145 170 170 135 170 95 C170 50 140 20 100 20 Z"
                fill="none"
                stroke="#0284c7"
                strokeWidth="2.5"
                strokeDasharray="4 2"
                className="opacity-75"
              />

              {/* Internal Gyri & Sulci (Blue/Cyan Secure Region) */}
              <path
                d="M70 45 Q90 55 80 80 T60 120 Q85 140 100 160"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.8"
                className="opacity-60"
              />
              <path
                d="M130 45 Q110 55 120 80 T140 120 Q115 140 100 160"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="1.8"
                className="opacity-60"
              />
              <path
                d="M100 25 V175"
                fill="none"
                stroke="#0ea5e9"
                strokeWidth="1"
                strokeDasharray="2 3"
                className="opacity-40"
              />

              {/* Tampered Detection Region (Red / Orange Glowing Mask in Frontal-Temporal Lobe) */}
              <g className="animate-pulse">
                <rect
                  x="115"
                  y="60"
                  width="45"
                  height="40"
                  rx="6"
                  fill="rgba(239, 68, 68, 0.25)"
                  stroke="#ef4444"
                  strokeWidth="2"
                  strokeDasharray="3 2"
                />
                {/* Crosshairs & Points */}
                <circle cx="137" cy="80" r="3" fill="#f87171" />
                <line x1="125" y1="80" x2="149" y2="80" stroke="#f87171" strokeWidth="1" />
                <line x1="137" y1="68" x2="137" y2="92" stroke="#f87171" strokeWidth="1" />
              </g>

              {/* Secure Region Marker (Teal / Cyan) */}
              <rect
                x="45"
                y="65"
                width="38"
                height="35"
                rx="6"
                fill="rgba(6, 182, 212, 0.15)"
                stroke="#06b6d4"
                strokeWidth="1.5"
              />
              <circle cx="64" cy="82" r="2.5" fill="#22d3ee" />
            </svg>

            {/* Corner Tech Reticles */}
            <div className="absolute top-2 left-2 text-[10px] font-mono text-cyan-400/80 flex items-center gap-1">
              <Crosshair className="w-3 h-3 text-cyan-400" />
              <span>MRI AXIAL T2 #42</span>
            </div>
            <div className="absolute top-2 right-2 text-[10px] font-mono text-slate-400">
              FOA: 240mm
            </div>
            <div className="absolute bottom-2 left-2 text-[10px] font-mono text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>PS3.15 CERTIFIED</span>
            </div>
            <div className="absolute bottom-2 right-2 text-[10px] font-mono text-cyan-400">
              SRM-SWIN RESIDUAL
            </div>
          </div>

          {/* AI Tamper Detection Overlay HUD Label */}
          <div className="absolute top-3 inset-x-3 sm:inset-x-6 flex items-center justify-between pointer-events-none">
            <div className="bg-slate-900/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-red-500/40 shadow-lg flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <div>
                <div className="text-[11px] font-bold text-red-400 font-['Space_Grotesk'] tracking-wide">
                  AI Tamper Detection
                </div>
                <div className="text-[9px] text-slate-300 font-mono">
                  Region: Frontal Lobe • Risk: High (0.87) • Status: Altered
                </div>
              </div>
            </div>

            <div className="hidden sm:block text-[9px] text-slate-400 font-mono bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
              Static Forensic Simulation
            </div>
          </div>
        </div>

        {/* Floating Glass Cards Overlaying Scan on Desktop/Tablet */}
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <IntegrityAnalysisCard />
          <SecurityStatusCard score={98} isIllustrative={true} />
        </div>
      </div>

      {/* Feature Cards Grid (4 Compact Cards) */}
      <div className="relative z-10 my-3">
        <FeatureSecurityCards />
      </div>

      {/* Trusted Users Bottom-Left Section */}
      <div className="relative z-10 mt-2">
        <TrustedUsers />
      </div>

    </div>
  );
};
export default LoginHero;
