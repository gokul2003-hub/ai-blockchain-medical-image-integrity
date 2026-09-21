import React, { useState, useEffect } from "react";
import Login from "./views/Login";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";

// Dashboard Views
import SuperAdminDashboard from "./views/SuperAdminDashboard";
import DoctorDashboard from "./views/DoctorDashboard";
import PatientDashboard from "./views/PatientDashboard";

// Icons for fallback screens
import { ShieldCheck, Users, Upload, RefreshCw } from "lucide-react";
import axios from "axios";

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem("med_token"));
  const [username, setUsername] = useState<string | null>(localStorage.getItem("med_username"));
  const [role, setRole] = useState<string | null>(localStorage.getItem("med_role"));
  const [activeView, setActiveView] = useState("dashboard");
  const [darkMode, setDarkMode] = useState<boolean>(true);

  // Keep track of alerts
  const [alertsCount, setAlertsCount] = useState(0);

  useEffect(() => {
    // 1. Setup Axios response interceptor for 401 Unauthorized handling
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response && error.response.status === 401) {
          console.warn("Authentication error (401 Unauthorized). Evicting session token.");
          handleLogout();
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []);

  useEffect(() => {
    if (token) {
      // Validate stored token against backend /api/users/me
      axios
        .get(`${getBackendUrl()}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        })
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
        .catch((err) => {
          if (err.response?.status === 401) {
            handleLogout();
          }
        });
    }
  }, [token]);

  useEffect(() => {
    if (token && role === "super_admin") {
      pollAlerts();
    }
  }, [token, role]);

  const getBackendUrl = () => {
    return import.meta.env.VITE_API_URL || "http://localhost:8000";
  };

  const pollAlerts = async () => {
    try {
      const response = await axios.get(`${getBackendUrl()}/api/blockchain/blocks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (Array.isArray(response.data)) {
        const count = response.data.filter((b: any) => b.type === "TAMPER_ALERT").length;
        setAlertsCount(count);
      }
    } catch {
      // ignore
    }
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
    
    setToken(null);
    setUsername(null);
    setRole(null);
  };

  // If not logged in, render Login View
  if (!token || !username || !role) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Render content based on user role and selected sidebar view
  const renderMainContent = () => {
    // 1. Super Admin Routing
    if (role === "super_admin") {
      if (activeView === "dashboard" || activeView === "hospitals" || activeView === "blockchain" || activeView === "logs") {
        return <SuperAdminDashboard token={token} />;
      }
    }
    
    // 2. Doctor Routing
    if (role === "doctor") {
      if (activeView === "dashboard" || activeView === "upload" || activeView === "patient-list" || activeView === "blockchain") {
        return <DoctorDashboard token={token} />;
      }
      if (activeView === "permissions") {
        return (
          <div className="glass-panel p-8 text-center text-slate-500 text-xs flex flex-col items-center justify-center h-80">
            <ShieldCheck className="h-10 w-10 text-slate-600 mb-3 animate-pulse" />
            Consent rules are managed securely by Patients. You have active authorization to view patient scans mapped under Dr. {username}.
          </div>
        );
      }
    }

    // 3. Patient Routing
    if (role === "patient") {
      return <PatientDashboard token={token} activeView={activeView} />;
    }

    // 4. Hospital Admin Routing
    if (role === "hospital_admin") {
      if (activeView === "dashboard") {
        return <SuperAdminDashboard token={token} />;
      }
      if (activeView === "staff") {
        return (
          <div className="glass-panel p-8 text-center text-slate-500 text-xs flex flex-col items-center justify-center h-80">
            <Users className="h-10 w-10 text-slate-600 mb-3" />
            Hospital staff configuration can be registered by sending API requests to hospital admin endpoints.
          </div>
        );
      }
    }

    // 5. Radiologist Routing
    if (role === "radiologist") {
      if (activeView === "dashboard" || activeView === "upload" || activeView === "blockchain") {
        return <DoctorDashboard token={token} />;
      }
      if (activeView === "radiology-queue") {
        return (
          <div className="glass-panel p-8 text-center text-slate-500 text-xs flex flex-col items-center justify-center h-80">
            <Upload className="h-10 w-10 text-slate-600 mb-3 animate-bounce" />
            Pending imaging reviews are synchronized in real-time. Use the Upload tab to add pre-processed diagnostics.
          </div>
        );
      }
    }

    // Fallback
    return (
      <div className="text-center py-12 text-slate-400 text-xs">
        Under development. Active view: {activeView} for role: {role}
      </div>
    );
  };

  return (
    <div className={`min-h-screen ${darkMode ? "bg-slate-950 text-slate-100" : "light-mode text-slate-900"} flex flex-col`}>
      <Navbar 
        username={username} 
        role={role} 
        onLogout={handleLogout} 
        alertsCount={alertsCount}
        darkMode={darkMode}
        onToggleTheme={() => setDarkMode(!darkMode)}
      />
      <div className={`flex-1 flex overflow-hidden ${darkMode ? "bg-slate-950" : "light-mode"}`}>
        <Sidebar 
          role={role} 
          activeView={activeView} 
          onViewChange={setActiveView} 
        />
        <main className={`flex-1 overflow-y-auto p-6 ${darkMode ? "bg-slate-950" : "light-mode"}`}>
          <div className="max-w-7xl mx-auto">
            {renderMainContent()}
          </div>
        </main>
      </div>
    </div>
  );
}
