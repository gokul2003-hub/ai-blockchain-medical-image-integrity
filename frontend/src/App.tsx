import React, { useState, useEffect } from "react";
import axios from "axios";
import { ShieldCheck, Users, Upload, RefreshCw, FileCode2, Settings, Building2, Server } from "lucide-react";

import { apiClient } from "./services/api";
import { ToastProvider } from "./components/Toast";
import Login from "./views/Login";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";

// Legacy Views (for Patient mostly, or fallback)
import PatientDashboard from "./views/PatientDashboard";
import SuperAdminDashboard from "./views/SuperAdminDashboard";

// New Core Redesign Views
import Dashboard from "./views/Dashboard";
import MedicalImages from "./views/MedicalImages";
import UploadImage from "./views/UploadImage";
import ImageViewer from "./views/ImageViewer";
import IntegrityVerification from "./views/IntegrityVerification";
import AIForensics from "./views/AIForensics";
import TamperLocalization from "./views/TamperLocalization";
import ExplainableAI from "./views/ExplainableAI";
import RecoveryCenter from "./views/RecoveryCenter";
import RecoveryHistory from "./views/RecoveryHistory";
import BlockchainAudit from "./views/BlockchainAudit";
import AccessControl from "./views/AccessControl";
import ConsentManagement from "./views/ConsentManagement";
import BreakGlassAccess from "./views/BreakGlassAccess";
import SecurityEvents from "./views/SecurityEvents";
import Analytics from "./views/Analytics";
import DicomInfo from "./views/DicomInfo";

import SecurityAlertsPanel from "./components/SecurityAlertsPanel";
import ProfilePanel from "./components/ProfilePanel";

// Stitch Clinical Architecture
import LoginGateway from "./components/stitch/LoginGateway";
import AppShell from "./components/stitch/AppShell";
import DoctorWorkspace from "./views/stitch/DoctorWorkspace";
import AdminWorkspace from "./views/stitch/AdminWorkspace";
import PatientWorkspace from "./views/stitch/PatientWorkspace";
import ResearcherWorkspace from "./views/stitch/ResearcherWorkspace";

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("med_token"));
  const [username, setUsername] = useState<string | null>(localStorage.getItem("med_username"));
  const [role, setRole] = useState<string | null>(localStorage.getItem("med_role"));
  const [activeView, setActiveView] = useState<string>("dashboard");
  const [darkMode, setDarkMode] = useState<boolean>(false); // Default to Stitch Clinical Light
  const [uiMode, setUiMode] = useState<"stitch" | "legacy">("stitch");

  // Shared state across views
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null);

  // Keep track of alerts
  const [alertsCount, setAlertsCount] = useState<number>(0);

  useEffect(() => {
    // Determine initial view based on role
    if (role) {
      const r = role.toLowerCase();
      if (r === "doctor" || r === "radiologist") {
        setActiveView("doctor-dashboard");
      } else if (r === "admin" || r === "super_admin" || r === "hospital_admin") {
        setActiveView("admin-workspace");
      } else if (r === "researcher") {
        setActiveView("researcher-dashboard");
      } else if (r === "patient") {
        setActiveView("patient-dashboard");
      }
    }
  }, [role]);

  useEffect(() => {
    // Setup 401 Unauthorized handling on apiClient and axios
    const handleAuthExpired = () => {
      console.warn("Authentication error (401 Unauthorized). Evicting session token.");
      handleLogout();
    };

    window.addEventListener("auth:unauthorized", handleAuthExpired);

    const clientInterceptor = apiClient.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response && error.response.status === 401) {
          handleAuthExpired();
        }
        return Promise.reject(error);
      }
    );

    const axiosInterceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response && error.response.status === 401) {
          handleAuthExpired();
        }
        return Promise.reject(error);
      }
    );

    return () => {
      window.removeEventListener("auth:unauthorized", handleAuthExpired);
      apiClient.interceptors.response.eject(clientInterceptor);
      axios.interceptors.response.eject(axiosInterceptor);
    };
  }, []);

  useEffect(() => {
    if (token) {
      axios
        .get(`${getBackendUrl()}/api/users/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => {
          if (res.data.username && res.data.username !== username) {
            setUsername(res.data.username);
            localStorage.setItem("med_username", res.data.username);
          }
          if (res.data.role && res.data.role !== role) {
            setRole(res.data.role);
            localStorage.setItem("med_role", res.data.role);
          }
        })
        .catch((err) => { if (err.response?.status === 401) handleLogout(); });
    }
  }, [token]);

  useEffect(() => {
    if (token) { pollAlerts(); }
  }, [token]);

  const getBackendUrl = () => import.meta.env.VITE_API_URL || "http://localhost:8000";

  const pollAlerts = async () => {
    try {
      const response = await axios.get(`${getBackendUrl()}/api/blockchain/blocks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (Array.isArray(response.data)) {
        const count = response.data.filter((b: any) => b.type === "TAMPER_ALERT").length;
        setAlertsCount(count);
      }
    } catch { /* ignore */ }
  };

  const handleLoginSuccess = (accessToken: string, user: string, userRole: string) => {
    localStorage.setItem("med_token", accessToken);
    localStorage.setItem("med_username", user);
    localStorage.setItem("med_role", userRole);
    setToken(accessToken);
    setUsername(user);
    setRole(userRole);
    const r = userRole.toLowerCase();
    if (r === "doctor" || r === "radiologist") {
      setActiveView("doctor-dashboard");
    } else if (r === "admin" || r === "super_admin" || r === "hospital_admin") {
      setActiveView("admin-workspace");
    } else if (r === "researcher") {
      setActiveView("researcher-dashboard");
    } else if (r === "patient") {
      setActiveView("patient-dashboard");
    } else {
      setActiveView("dashboard");
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("med_token");
    localStorage.removeItem("med_username");
    localStorage.removeItem("med_role");
    setToken(null);
    setUsername(null);
    setRole(null);
  };

  if (!token || !username || !role) {
    return (
      <ToastProvider>
        <LoginGateway onLoginSuccess={handleLoginSuccess} />
      </ToastProvider>
    );
  }

  // -------------------------------------------------------------------------
  // STITCH CLINICAL ROLE ROUTING ARCHITECTURE
  // -------------------------------------------------------------------------
  const normalizedRole = role.toLowerCase();
  const isDoctorRole = normalizedRole === "doctor" || normalizedRole === "radiologist";
  const isAdminRole = normalizedRole === "admin" || normalizedRole === "super_admin" || normalizedRole === "hospital_admin";
  const isResearcherRole = normalizedRole === "researcher";
  const isPatientRole = normalizedRole === "patient";

  const renderStitchContent = () => {
    // Shared cross-role panels
    if (activeView === "profile") {
      return <ProfilePanel token={token} role={role} username={username} />;
    }
    if (activeView === "security-alerts") {
      return <SecurityAlertsPanel token={token} />;
    }

    // 1. DOCTOR / RADIOLOGIST WORKSPACE
    if (isDoctorRole) {
      return (
        <DoctorWorkspace
          token={token}
          activeSubPath={activeView}
          onNavigate={setActiveView}
          selectedImageId={selectedImageId}
          onSelectImage={setSelectedImageId}
        />
      );
    }

    // 2. HOSPITAL ADMIN WORKSPACE
    if (isAdminRole) {
      return (
        <AdminWorkspace
          token={token}
          activeSubPath={activeView}
          onNavigate={setActiveView}
        />
      );
    }

    // 3. RESEARCHER WORKSPACE
    if (isResearcherRole) {
      return (
        <ResearcherWorkspace
          token={token}
          activeSubPath={activeView}
          onNavigate={setActiveView}
        />
      );
    }

    // 4. PATIENT WORKSPACE
    if (isPatientRole) {
      return (
        <PatientWorkspace
          token={token}
          username={username}
          activeSubPath={activeView}
          onNavigate={setActiveView}
        />
      );
    }

    // Fallback for custom staff roles
    return (
      <DoctorWorkspace
        token={token}
        activeSubPath={activeView}
        onNavigate={setActiveView}
        selectedImageId={selectedImageId}
        onSelectImage={setSelectedImageId}
      />
    );
  };

  // -------------------------------------------------------------------------
  // LEGACY ROUTING ARCHITECTURE (PRESERVED 100% FOR COMPATIBILITY)
  // -------------------------------------------------------------------------
  const renderLegacyContent = () => {
    if (role === "patient" && ["dashboard", "patient-records"].includes(activeView)) {
      return <PatientDashboard token={token} activeView={activeView} />;
    }

    switch (activeView) {
      case "dashboard":
        return <Dashboard token={token} onViewChange={setActiveView} />;
      case "medical-images":
        return <MedicalImages token={token} onViewChange={setActiveView} onSelectImage={setSelectedImageId} />;
      case "upload-image":
        return <UploadImage token={token} onViewChange={setActiveView} />;
      case "image-viewer":
        return <ImageViewer token={token} selectedImageId={selectedImageId} onViewChange={setActiveView} />;
      case "dicom-info":
        return (
          <DicomInfo
            token={token}
            selectedImageId={selectedImageId}
            onSelectImage={setSelectedImageId}
            onViewChange={setActiveView}
          />
        );
      case "integrity-verification":
        return <IntegrityVerification token={token} selectedImageId={selectedImageId} onSelectImage={setSelectedImageId} onViewChange={setActiveView} />;
      case "tamper-detection":
        return <AIForensics token={token} selectedImageId={selectedImageId} onSelectImage={setSelectedImageId} onViewChange={setActiveView} />;
      case "tamper-localization":
        return <TamperLocalization token={token} selectedImageId={selectedImageId} onSelectImage={setSelectedImageId} />;
      case "explainable-ai":
        return <ExplainableAI token={token} selectedImageId={selectedImageId} onSelectImage={setSelectedImageId} />;
      case "recovery-center":
        return <RecoveryCenter token={token} selectedImageId={selectedImageId} onSelectImage={setSelectedImageId} onViewChange={setActiveView} />;
      case "recovery-history":
        return <RecoveryHistory token={token} />;
      case "blockchain-audit":
        return <BlockchainAudit token={token} role={role} />;
      case "access-control":
        return <AccessControl token={token} role={role} />;
      case "consent-management":
        return <ConsentManagement token={token} role={role} />;
      case "break-glass":
        return <BreakGlassAccess token={token} role={role} />;
      case "security-events":
        return <SecurityEvents token={token} />;
      case "analytics":
      case "system-analytics":
        return <Analytics token={token} />;
      case "user-management":
      case "hospitals":
        return <SuperAdminDashboard token={token} />;
      default:
        return (
          <div className="text-center py-12 text-slate-400 text-xs">
            <ShieldCheck className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            Active legacy view: {activeView} for role: {role}
          </div>
        );
    }
  };

  // Render Stitch Clinical Experience as Primary
  if (uiMode === "stitch") {
    return (
      <ToastProvider>
        <AppShell
          role={role}
          username={username}
          activePath={activeView}
          onNavigate={setActiveView}
          onLogout={handleLogout}
          alertsCount={alertsCount}
        >
          {/* Header Bar Mode Switcher */}
          <div className="mb-4 flex items-center justify-between pb-2 border-b border-surface-container-low text-xs">
            <div className="flex items-center gap-2">
              <span className="font-label-sm font-semibold text-primary uppercase tracking-wider text-[11px]">
                MediSecure AI Clinical Suite
              </span>
              <span className="px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed text-[10px] font-semibold">
                Ledger Verified
              </span>
            </div>
            <button
              onClick={() => {
                setUiMode("legacy");
                setDarkMode(true);
              }}
              className="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1 font-label-sm text-[11px]"
              title="Access legacy diagnostic dashboards"
            >
              <span className="material-symbols-outlined text-sm">dashboard_customize</span>
              <span>Open Legacy Suite</span>
            </button>
          </div>

          {renderStitchContent()}
        </AppShell>
      </ToastProvider>
    );
  }

  // Legacy Theme & Layout
  return (
    <ToastProvider>
      <div className={`min-h-screen ${darkMode ? "bg-slate-950 text-slate-100" : "light-mode text-slate-900"} flex flex-col`}>
        <Navbar 
          username={username} 
          role={role} 
          onLogout={handleLogout} 
          alertsCount={alertsCount}
          activeView={activeView}
        />
        <div className="bg-slate-900/80 px-6 py-1.5 flex items-center justify-between text-xs border-b border-slate-800 text-slate-400">
          <span>Legacy Diagnostic Environment Active</span>
          <button
            onClick={() => setUiMode("stitch")}
            className="text-emerald-400 hover:underline font-semibold flex items-center gap-1"
          >
            Switch to Stitch Clinical Architecture →
          </button>
        </div>
        <div className={`flex-1 flex overflow-hidden ${darkMode ? "bg-slate-950" : "light-mode"}`}>
          <Sidebar 
            role={role} 
            activeView={activeView} 
            onViewChange={setActiveView} 
          />
          <main className={`flex-1 overflow-y-auto p-6 ${darkMode ? "bg-slate-950" : "light-mode"}`}>
            <div className="max-w-7xl mx-auto">
              {renderLegacyContent()}
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
