import React, { useState, useEffect } from "react";
import axios from "axios";
import { Server, Settings, ShieldCheck } from "lucide-react";

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

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("med_token"));
  const [username, setUsername] = useState<string | null>(localStorage.getItem("med_username"));
  const [role, setRole] = useState<string | null>(localStorage.getItem("med_role"));
  const [activeView, setActiveView] = useState("dashboard");
  const [darkMode] = useState<boolean>(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  
  // Shared state across views
  const [selectedImageId, setSelectedImageId] = useState<number | null>(null);

  // Keep track of alerts
  const [alertsCount, setAlertsCount] = useState(0);

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
    if (token && role === "super_admin") { pollAlerts(); }
  }, [token, role]);

  // Keep browser requests relative in preview/production. Vite proxies /api locally.
  const getBackendUrl = () => import.meta.env.VITE_API_URL || "";

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
    setActiveView("dashboard");
  };

  const handleLogout = () => {
    localStorage.removeItem("med_token");
    localStorage.removeItem("med_username");
    localStorage.removeItem("med_role");
    setToken(null); setUsername(null); setRole(null);
  };

  if (!token || !username || !role) {
    return (
      <ToastProvider>
        <Login onLoginSuccess={handleLoginSuccess} />
      </ToastProvider>
    );
  }

  // Route new views based on ID from Sidebar
  const renderMainContent = () => {
    // ----------------------------------------------------
    // Legacy mapping (Patient dashboard is highly custom)
    // ----------------------------------------------------
    if (role === "patient" && ["dashboard", "patient-records"].includes(activeView)) {
      return <PatientDashboard token={token} activeView={activeView} />;
    }

    // ----------------------------------------------------
    // New UI Routing
    // ----------------------------------------------------
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
      
      // Secondary admin/system tabs
      case "user-management":
      case "hospitals":
        return <SuperAdminDashboard token={token} />;
      case "system-health":
        return (
          <div className="glass-panel p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center gap-3">
            <Server className="h-10 w-10 text-slate-600 mb-1" />
            <p className="text-slate-400 font-semibold text-sm">System Health Monitor</p>
            <p className="text-slate-500 text-xs max-w-sm">
              Detailed service health endpoints are not yet exposed by the backend API.
              Use the Blockchain Audit view to confirm ledger integrity, or check backend logs directly.
            </p>
          </div>
        );
      case "system-settings":
        return (
          <div className="glass-panel p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center">
            <Settings className="h-10 w-10 text-slate-600 mb-3 animate-[spin_4s_linear_infinite]" />
            System parameters can only be modified via CLI by the root administrator.
          </div>
        );

      default:
        return (
          <div className="text-center py-12 text-slate-400 text-xs">
            <ShieldCheck className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            Under development. Active view: {activeView} for role: {role}
          </div>
        );
    }
  };

  return (
    <ToastProvider>
      <div className={`app-shell ${darkMode ? "text-slate-100" : "light-mode text-slate-900"} flex min-h-screen flex-col`}>
        <Navbar
          username={username}
          role={role}
          onLogout={handleLogout}
          alertsCount={alertsCount}
          activeView={activeView}
          onMenuClick={() => setMobileNavOpen(true)}
        />
        <div className="relative flex min-h-0 flex-1">
          {mobileNavOpen && (
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setMobileNavOpen(false)}
              className="fixed inset-0 z-30 bg-slate-950/70 backdrop-blur-sm lg:hidden"
            />
          )}
          <Sidebar
            role={role}
            activeView={activeView}
            onViewChange={(view) => {
              setActiveView(view);
              setMobileNavOpen(false);
            }}
            mobileOpen={mobileNavOpen}
            onMobileClose={() => setMobileNavOpen(false)}
          />
          <main className="app-main min-h-[calc(100vh-4rem)] flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
            <div key={activeView} className="animate-page-enter mx-auto w-full max-w-[1440px]">
              {renderMainContent()}
            </div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
