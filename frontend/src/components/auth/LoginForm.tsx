import React, { useState } from "react";
import { 
  ShieldCheck, 
  Lock, 
  User, 
  Mail, 
  Eye, 
  EyeOff, 
  Key, 
  ArrowRight, 
  AlertCircle, 
  CheckCircle2, 
  HelpCircle,
  ShieldAlert,
  Loader2
} from "lucide-react";
import { apiService, API_BASE_URL } from "../../services/api";
import AuthMethodButtons from "./AuthMethodButtons";
import RoleAccessCards from "./RoleAccessCards";
import SecurityNotice from "./SecurityNotice";

interface LoginFormProps {
  onLoginSuccess: (token: string, username: string, role: string) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLoginSuccess }) => {
  const [activeTab, setActiveTab] = useState<"signin" | "register">("signin");
  
  // Form State
  const [username, setUsername] = useState<string>("drsmith");
  const [password, setPassword] = useState<string>("DocSecure123!");
  const [email, setEmail] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [rememberMe, setRememberMe] = useState<boolean>(true);
  
  // MFA State
  const [showMfa, setShowMfa] = useState<boolean>(false);
  const [mfaCode, setMfaCode] = useState<string>("");
  
  // UI State
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>("doctor");
  const [showForgotModal, setShowForgotModal] = useState<boolean>(false);

  // Secure Registration State (role-specific identity)
  const [regRole, setRegRole] = useState<"doctor" | "patient" | "researcher" | "admin">("doctor");
  const [identityId, setIdentityId] = useState<string>("");
  const [institution, setInstitution] = useState<string>("");
  const [verifyState, setVerifyState] = useState<"idle" | "verifying" | "verified" | "failed">("idle");
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  const identityFieldLabel =
    regRole === "doctor" ? "Doctor ID" :
    regRole === "patient" ? "Patient ID" :
    regRole === "researcher" ? "Researcher ID" : "Admin ID";
  const identityPlaceholder =
    regRole === "doctor" ? "DR-123456" :
    regRole === "patient" ? "PT-123456" :
    regRole === "researcher" ? "RES-123456" : "ADM-123456";

  // Server-side identity verification (never trust client-side checks)
  const handleVerifyIdentity = async () => {
    if (!identityId.trim() || verifyState === "verifying") return;
    setVerifyState("verifying");
    setVerifyMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/verify-identity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: regRole, identity_id: identityId.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setVerifyState("verified");
        setVerifyMsg("Identity verified by MediSecure registry.");
      } else {
        setVerifyState("failed");
        setVerifyMsg(data.message || "Unable to verify the supplied identity information.");
      }
    } catch {
      setVerifyState("failed");
      setVerifyMsg("Unable to reach the verification service. Please try again.");
    }
  };

  // Role info selector fills testing presets for convenience
  const handleSelectRolePreset = (roleKey: string) => {
    setSelectedRoleKey(roleKey);
    setError(null);
    if (roleKey === "patient") {
      setUsername("alice");
      setPassword("PatSecure123!");
    } else if (roleKey === "doctor") {
      setUsername("drsmith");
      setPassword("DocSecure123!");
    } else if (roleKey === "radiologist") {
      setUsername("radjones");
      setPassword("RadSecure123!");
    } else if (roleKey === "admin") {
      setUsername("hospadmin");
      setPassword("HospAdmin123!");
    } else if (roleKey === "researcher") {
      setUsername("drsmith"); // Researcher suite accessible to physician/researcher credentials
      setPassword("DocSecure123!");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (activeTab === "register") {
        if (verifyState !== "verified") {
          setError("Please verify your identity ID against the registry before creating the account.");
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          setLoading(false);
          return;
        }
        if (password.length < 8) {
          setError("Master password must contain at least 8 characters.");
          setLoading(false);
          return;
        }

        // Call role-specific backend registration endpoint (server-side identity validation)
        const regEndpoint =
          regRole === "doctor" ? `${API_BASE_URL}/api/auth/register/doctor` :
          regRole === "patient" ? `${API_BASE_URL}/api/auth/register/patient` :
          regRole === "researcher" ? `${API_BASE_URL}/api/auth/register/researcher` :
          `${API_BASE_URL}/api/auth/register/admin`;

        const regPayload: Record<string, unknown> = {
          identity_id: identityId.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
        };
        if (regRole === "researcher" || regRole === "admin") {
          regPayload.institution = institution.trim() || "Unspecified Institution";
        }

        await fetch(regEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(regPayload),
        }).then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            const detail = typeof body.detail === "string"
              ? body.detail
              : Array.isArray(body.detail)
                ? body.detail.map((d: any) => d.msg).join(", ")
                : "Unable to verify the supplied identity information.";
            throw new Error(detail);
          }
          return r.json();
        });

        setSuccessMsg("Identity verified and account provisioned. Please sign in.");
        setActiveTab("signin");
        setConfirmPassword("");
        setIdentityId("");
        setVerifyState("idle");
        setVerifyMsg(null);
      } else {
        // Call real backend login API
        const data = await apiService.login({
          username: username.trim(),
          password,
          mfa_code: mfaCode.trim() || undefined,
        });

        // A successful response means credentials + optional MFA already
        // validated server-side (backend returns mfa_enabled, never mfa_required).
        const role = (data.role || "patient").toLowerCase();
        setSuccessMsg("Cryptographic identity verified. Redirecting to workspace...");
        
        // Save session if rememberMe checked (or standard storage)
        if (rememberMe) {
          localStorage.setItem("med_remember", "true");
        } else {
          localStorage.removeItem("med_remember");
        }

        // Trigger onLoginSuccess which routes according to real backend role
        setTimeout(() => {
          onLoginSuccess(data.access_token, data.username || username, role);
        }, 400);
      }
    } catch (err: any) {
      if (!navigator.onLine) {
        setError("Unable to connect to MediSecure AI. Please check your network connection.");
      } else if (err.response) {
        const status = err.response.status;
        const detail = err.response.data?.detail;
        
        if (status === 401) {
          if (typeof detail === "string" && detail.includes("MFA code")) {
            // Backend explicitly demands a TOTP/recovery code — show MFA input
            setShowMfa(true);
            setError(null);
            setSuccessMsg("Additional verification required. Enter your 6-digit TOTP code.");
          } else {
            setError("Invalid username or password.");
          }
        } else if (status === 403) {
          setError("You are not authorized to access this workspace.");
        } else if (status === 423) {
          setError("Account locked due to consecutive failed attempts. Contact HSOC.");
        } else if (status === 500) {
          setError("MediSecure AI authentication server error. Please retry shortly.");
        } else if (typeof detail === "string") {
          setError(detail);
        } else if (Array.isArray(detail)) {
          setError(detail.map((d: any) => d.msg).join(", "));
        } else {
          setError("Authentication failed. Please verify your credentials.");
        }
      } else if (err.request) {
        setError("Unable to connect to MediSecure AI. Please try again.");
      } else {
        setError(err.message || "An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto bg-white rounded-3xl p-6 sm:p-9 shadow-2xl shadow-slate-900/10 border border-slate-100 flex flex-col justify-between">
      
      {/* Container Header */}
      <div>
        {/* Brand Logo & Title */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 p-[1.5px] shadow-md shadow-blue-500/20">
              <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center text-blue-600">
                <ShieldCheck className="w-5 h-5 text-cyan-600" />
              </div>
            </div>
            <div>
              <span className="font-bold text-base text-slate-900 font-['Outfit'] block leading-tight">
                MediSecure <span className="text-cyan-600">AI</span>
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                Clinical Trust Enclave
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200/60 text-emerald-700 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-[11px]">Enclave Online</span>
          </div>
        </div>

        {/* Heading */}
        <div className="mb-6">
          <h2 className="text-2xl font-extrabold text-slate-900 font-['Outfit'] tracking-tight">
            {activeTab === "signin" ? "Sign in to your account" : "Create new identity"}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {activeTab === "signin" 
              ? "Access your authorized medical imaging and forensic workspace."
              : "Register a secure decentralized identity under clinical trust governance."}
          </p>
        </div>

        {/* Tab Controls: Sign In vs Create Account */}
        <div className="flex p-1 bg-slate-100 rounded-xl mb-6">
          <button
            type="button"
            onClick={() => {
              setActiveTab("signin");
              setError(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "signin"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("register");
              setError(null);
              setSuccessMsg(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              activeTab === "register"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Feedback / Alert Banners */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span className="leading-snug">{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span className="leading-snug">{successMsg}</span>
          </div>
        )}

        {/* Authentication Form */}
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Role-Specific Registration Fields (Register tab only) */}
          {activeTab === "register" && (
            <div className="space-y-3 p-3 rounded-xl bg-slate-50/80 border border-slate-200">
              {/* Role Selection Cards */}
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Select account role">
                {([
                  ["doctor", "Doctor / Radiologist"],
                  ["admin", "Hospital Administrator"],
                  ["researcher", "Researcher"],
                  ["patient", "Patient"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={regRole === key}
                    onClick={() => {
                      setRegRole(key);
                      setVerifyState("idle");
                      setVerifyMsg(null);
                      setIdentityId("");
                    }}
                    className={`px-2.5 py-2 rounded-lg text-[11px] font-semibold border transition-all focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
                      regRole === key
                        ? "bg-cyan-600 text-white border-cyan-600 shadow-sm"
                        : "bg-white text-slate-600 border-slate-200 hover:border-cyan-400 hover:text-cyan-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Role-Specific Identity ID + live verification */}
              <div>
                <label htmlFor="identity-id" className="text-xs font-semibold text-slate-700 block mb-1">
                  {identityFieldLabel} <span className="text-cyan-600">(verified server-side)</span>
                </label>
                <div className="flex gap-2">
                  <input
                    id="identity-id"
                    type="text"
                    value={identityId}
                    onChange={(e) => {
                      setIdentityId(e.target.value.toUpperCase());
                      setVerifyState("idle");
                      setVerifyMsg(null);
                    }}
                    placeholder={identityPlaceholder}
                    className="flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyIdentity}
                    disabled={!identityId.trim() || verifyState === "verifying"}
                    className="px-3 py-2.5 rounded-xl text-[11px] font-semibold bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-1.5"
                  >
                    {verifyState === "verifying" ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Verifying…</>
                    ) : (
                      "Verify Identity"
                    )}
                  </button>
                </div>

                {/* Verification Status (backend-confirmed only) */}
                {verifyState === "verified" && (
                  <p className="mt-1.5 text-[11px] text-emerald-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Identity Verified
                  </p>
                )}
                {verifyState === "failed" && verifyMsg && (
                  <p className="mt-1.5 text-[11px] text-red-600 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {verifyMsg}
                  </p>
                )}
                {verifyState === "verifying" && (
                  <p className="mt-1.5 text-[11px] text-cyan-700 flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Contacting identity registry…
                  </p>
                )}
              </div>

              {/* Institution (Researcher / Admin only) */}
              {(regRole === "researcher" || regRole === "admin") && (
                <div>
                  <label htmlFor="reg-institution" className="text-xs font-semibold text-slate-700 block mb-1">
                    Institution
                  </label>
                  <input
                    id="reg-institution"
                    type="text"
                    required
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    placeholder="e.g. Metro General Hospital"
                    className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 transition-all"
                  />
                </div>
              )}

              {regRole === "admin" && (
                <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 leading-snug">
                  Administrator accounts require a pre-provisioned Admin ID and institutional authorization.
                  Self-service signup is not permitted.
                </p>
              )}
            </div>
          )}

          {/* Username or Email Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label 
                htmlFor="login-username" 
                className="text-xs font-semibold text-slate-700"
              >
                Username or Email
              </label>
              <span className="text-[10px] text-slate-400 font-mono">
                Institutional ID
              </span>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <User className="w-4 h-4" />
              </div>
              <input
                id="login-username"
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. dr.sharma@medisecure.health"
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 transition-all font-sans"
              />
            </div>
          </div>

          {/* Email Input (Register tab only) */}
          {activeTab === "register" && (
            <div>
              <label 
                htmlFor="register-email" 
                className="text-xs font-semibold text-slate-700 block mb-1"
              >
                Institutional Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="register-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. clinician@hospital.org"
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 transition-all font-sans"
                />
              </div>
            </div>
          )}

          {/* Password Input with Visibility Toggle */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label 
                htmlFor="login-password" 
                className="text-xs font-semibold text-slate-700"
              >
                Password
              </label>
              {activeTab === "signin" && (
                <button
                  type="button"
                  onClick={() => setPassword("Password123!")}
                  className="text-[11px] text-cyan-600 hover:text-cyan-700 font-medium hover:underline flex items-center gap-1"
                >
                  <Key className="w-3 h-3" />
                  Fill Demo Key
                </button>
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 transition-all font-sans"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm Password (Register tab only) */}
          {activeTab === "register" && (
            <div>
              <label 
                htmlFor="confirm-password" 
                className="text-xs font-semibold text-slate-700 block mb-1"
              >
                Confirm Master Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="confirm-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500 transition-all font-sans"
                />
              </div>
            </div>
          )}

          {/* MFA Challenge Input (Shown when requested by backend) */}
          {showMfa && (
            <div className="p-3.5 rounded-xl bg-cyan-50/60 border border-cyan-200 space-y-2 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-cyan-900 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-cyan-600" />
                  MFA TOTP 6-Digit Code
                </label>
                <span className="text-[10px] text-cyan-700 font-mono">Authenticator App</span>
              </div>
              <input
                type="text"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="000000"
                className="w-full bg-white text-center tracking-widest text-lg font-mono font-bold py-2 rounded-lg border border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          )}

          {/* Remember Me & Forgot Password (Sign in tab) */}
          {activeTab === "signin" && (
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded text-cyan-600 border-slate-300 focus:ring-cyan-500 cursor-pointer accent-cyan-600"
                />
                <span>Remember me</span>
              </label>

              <button
                type="button"
                onClick={() => setShowForgotModal(true)}
                className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 hover:underline"
              >
                Forgot password?
              </button>
            </div>
          )}

          {/* Primary Action Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 rounded-xl text-white font-semibold text-xs font-['Outfit'] tracking-wide bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:via-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-500/25 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2 group"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{activeTab === "register" ? "Provisioning Identity..." : "Authenticating..."}</span>
              </>
            ) : (
              <>
                <span>{activeTab === "register" ? "Create Cryptographic Identity" : "Sign In"}</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </>
            )}
          </button>
        </form>

        {/* DID / FIDO2 Alternative Auth Buttons */}
        <AuthMethodButtons />

        {/* Role Information Cards */}
        <RoleAccessCards 
          selectedRole={selectedRoleKey}
          onSelectRoleInfo={handleSelectRolePreset}
        />

        {/* Compact Security Message */}
        <SecurityNotice />

      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center">
            <div className="w-10 h-10 rounded-full bg-cyan-50 text-cyan-600 mx-auto flex items-center justify-center mb-3">
              <HelpCircle className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-sm text-slate-900 font-['Outfit']">
              Credential Recovery Notice
            </h3>
            <p className="text-xs text-slate-600 mt-2 leading-relaxed">
              MediSecure AI uses zero-knowledge decentralized identity schemas. Password resets must be validated by your institutional hospital administrator or HSOC key custodian.
            </p>
            <div className="mt-4 p-2.5 bg-slate-50 rounded-lg text-[11px] text-slate-600 font-mono">
              HSOC Contact: security@medisecure.health
            </div>
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-medium transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default LoginForm;
