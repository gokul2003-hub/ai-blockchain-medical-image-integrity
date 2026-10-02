import React, { useState } from "react";
import axios from "axios";
import {
  Activity,
  ArrowRight,
  Check,
  Database,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Lock,
  Mail,
  QrCode,
  ScanLine,
  Shield,
  ShieldCheck,
  Sparkles,
  User as UserIcon,
} from "lucide-react";

interface LoginProps {
  onLoginSuccess: (token: string, username: string, role: string) => void;
}

const roles = [
  { value: "patient", label: "Patient Portal" },
  { value: "doctor", label: "Medical Doctor / Radiologist" },
];

export default function Login({ onLoginSuccess }: LoginProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("patient");

  const [dob, setDob] = useState("1995-04-15");
  const [gender, setGender] = useState("Female");
  const [bloodGroup, setBloodGroup] = useState("O Positive");
  const [specialization, setSpecialization] = useState("Radiology & MRI Imaging");
  const [licenseNumber, setLicenseNumber] = useState("LIC-MD-SMITH-777");

  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Keep browser calls relative so the Vite proxy and production reverse proxy work in previews.
  const getBackendUrl = () => import.meta.env.VITE_API_URL || "";

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const response = await axios.post(`${getBackendUrl()}/api/auth/login`, {
        username,
        password,
        mfa_code: mfaRequired ? mfaCode : null,
      });

      if (response.status === 206) {
        setMfaRequired(true);
        setLoading(false);
        return;
      }

      const { access_token, role: userRole, username: name } = response.data;
      onLoginSuccess(access_token, name, userRole);
    } catch (err: any) {
      const apiErr = err.response?.data?.detail || err.response?.data?.error?.message;
      setError(apiErr || "Authentication failed. Check your credentials and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMsg("");

    const payload: any = { username, email, password, role };
    if (role === "patient") {
      payload.patient_profile = { date_of_birth: dob, gender, blood_group: bloodGroup };
    } else if (role === "doctor") {
      payload.doctor_profile = { specialization, license_number: licenseNumber };
    }

    try {
      await axios.post(`${getBackendUrl()}/api/auth/register`, payload);
      const loginRes = await axios.post(`${getBackendUrl()}/api/auth/login`, {
        username,
        password,
        mfa_code: null,
      });
      const { access_token, role: userRole, username: name } = loginRes.data;
      onLoginSuccess(access_token, name, userRole);
    } catch (err: any) {
      if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else {
        setSuccessMsg("Account successfully registered. You can now sign in.");
        setIsRegistering(false);
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (registering: boolean) => {
    setIsRegistering(registering);
    setMfaRequired(false);
    setError("");
    setSuccessMsg("");
  };

  const inputClass = "auth-input px-10 py-3";
  const compactInputClass = "auth-input px-3 py-2.5";

  return (
    <main className="auth-page">
      <div className="auth-grid" aria-hidden="true" />

      <section className="auth-visual" aria-label="MedChain platform overview">
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="brand-mark h-10 w-10">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="font-hash text-xs font-bold tracking-[0.2em] text-slate-100">MEDCHAIN</p>
              <p className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-slate-500">Clinical trust layer</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/5 px-3 py-2 text-[9px] font-bold uppercase tracking-[0.13em] text-emerald-300">
            <span className="live-dot" /> Network protected
          </div>
        </div>

        <div className="relative z-10 my-auto max-w-2xl py-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-300/[0.06] px-3 py-2 text-[10px] font-bold uppercase tracking-[0.14em] text-blue-200">
            <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
            Evidence intelligence platform
          </div>
          <h1 className="max-w-xl text-5xl font-semibold leading-[1.04] tracking-[-0.045em] text-slate-100 xl:text-6xl">
            Integrity,
            <span className="block bg-gradient-to-r from-blue-300 via-cyan-200 to-emerald-200 bg-clip-text text-transparent">by design.</span>
          </h1>
          <p className="mt-6 max-w-lg text-sm leading-7 text-slate-400">
            Give every clinical image a verifiable chain of custody. MedChain combines explainable AI forensics with a tamper-evident ledger, so teams can move quickly without losing trust.
          </p>

          <div className="auth-orbit" aria-hidden="true">
            <div className="auth-orbit-core">
              <ShieldCheck className="h-14 w-14 text-white" strokeWidth={1.4} />
            </div>
            <div className="auth-node auth-node-one"><ScanLine /> AI forensics</div>
            <div className="auth-node auth-node-two"><Database /> Immutable ledger</div>
            <div className="auth-node auth-node-three"><Fingerprint /> Verified identity</div>
          </div>

          <div className="grid max-w-xl grid-cols-3 gap-3">
            {[
              ["01", "Protect", "Adaptive access"],
              ["02", "Prove", "Hash-backed evidence"],
              ["03", "Recover", "Trusted originals"],
            ].map(([index, title, detail]) => (
              <div key={title} className="border-l border-slate-700/70 pl-3">
                <p className="font-hash text-[10px] text-cyan-300/70">{index}</p>
                <p className="mt-1 text-xs font-semibold text-slate-200">{title}</p>
                <p className="mt-1 text-[10px] text-slate-500">{detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-5 text-[10px] text-slate-600">
          <span>HIPAA-aware workflows</span>
          <span className="h-1 w-1 rounded-full bg-slate-700" />
          <span>AI-assisted verification</span>
          <span className="h-1 w-1 rounded-full bg-slate-700" />
          <span>Auditable by default</span>
        </div>
      </section>

      <section className="auth-card-wrap">
        <div className="auth-card">
          <div className="mb-7 flex items-start justify-between gap-4">
            <div className="flex items-center gap-2.5 sm:hidden">
              <div className="brand-mark h-9 w-9"><Shield className="h-[18px] w-[18px] text-white" /></div>
              <div>
                <p className="font-hash text-[11px] font-bold tracking-[0.18em] text-slate-100">MEDCHAIN</p>
                <p className="text-[9px] uppercase tracking-[0.12em] text-slate-600">Secure workspace</p>
              </div>
            </div>
            <div className="block">
              <p className="eyebrow">Secure workspace</p>
              <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-100">
                {mfaRequired ? "Verify your identity" : isRegistering ? "Create your profile" : "Welcome back"}
              </h2>
              <p className="mt-2 max-w-xs text-xs leading-5 text-slate-500">
                {mfaRequired ? "A second factor is required before we open your clinical workspace." : "Sign in to review evidence, monitor integrity, and collaborate securely."}
              </p>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/5 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-[0.1em] text-emerald-300">
              <Lock className="h-3 w-3" /> Encrypted
            </div>
          </div>

          {!mfaRequired && (
            <div className="mb-7 flex gap-6 border-b border-slate-800/80">
              <button type="button" onClick={() => switchMode(false)} className={`auth-tab pb-3 text-xs font-semibold ${!isRegistering ? "auth-tab-active" : ""}`}>
                Sign in
              </button>
              <button type="button" onClick={() => switchMode(true)} className={`auth-tab pb-3 text-xs font-semibold ${isRegistering ? "auth-tab-active" : ""}`}>
                Register profile
              </button>
            </div>
          )}

          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-300/20 bg-rose-300/[0.07] px-3 py-2.5 text-xs text-rose-200" role="alert">
              <Activity className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-rose-300" />
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-emerald-300/20 bg-emerald-300/[0.07] px-3 py-2.5 text-xs text-emerald-200" role="status">
              <Check className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-300" />
              <span>{successMsg}</span>
            </div>
          )}

          {mfaRequired ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="rounded-2xl border border-blue-300/15 bg-blue-300/[0.045] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-300/20 bg-blue-400/10">
                    <QrCode className="h-5 w-5 text-blue-300" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-200">Authenticator challenge</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-slate-500">Enter the six-digit code from your authenticator app.</p>
                  </div>
                </div>
              </div>
              <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500" htmlFor="mfa-code">Verification code</label>
              <input
                id="mfa-code"
                type="text"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000 000"
                value={mfaCode}
                onChange={(event) => setMfaCode(event.target.value)}
                className="auth-input px-4 py-4 text-center font-mono text-lg tracking-[0.35em]"
              />
              <p className="text-center text-[10px] leading-relaxed text-slate-600">For the development environment, the test bypass code is 123456.</p>
              <button type="submit" disabled={loading} className="group flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3 text-xs font-bold text-white shadow-lg shadow-blue-950/35 transition hover:bg-blue-400 disabled:cursor-wait disabled:opacity-60">
                {loading ? "Verifying authenticator…" : "Verify & continue"}
                {!loading && <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />}
              </button>
              <button type="button" onClick={() => { setMfaRequired(false); setMfaCode(""); }} className="w-full text-center text-xs font-semibold text-slate-500 transition hover:text-slate-200">Use a different account</button>
            </form>
          ) : !isRegistering ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500" htmlFor="login-username">Username</label>
                <div className="relative">
                  <UserIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                  <input id="login-username" type="text" required autoComplete="username" placeholder="Enter your username" value={username} onChange={(event) => { setUsername(event.target.value); setError(""); }} className={inputClass} />
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500" htmlFor="login-password">Password</label>
                  <span className="text-[10px] text-slate-600">Protected session</span>
                </div>
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                  <input id="login-password" type={showPassword ? "text" : "password"} required autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(event) => { setPassword(event.target.value); setError(""); }} className={`${inputClass} pr-11`} />
                  <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-600 transition hover:text-slate-300" aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} className="group flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3.5 text-xs font-bold text-white shadow-lg shadow-blue-950/35 transition hover:bg-blue-400 hover:shadow-blue-500/20 disabled:cursor-wait disabled:opacity-60">
                {loading ? "Authenticating session…" : "Enter secure workspace"}
                {!loading && <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />}
              </button>

              <div className="flex items-center gap-3 py-1 text-[9px] uppercase tracking-[0.12em] text-slate-600">
                <span className="h-px flex-1 bg-slate-800/80" />
                <span>demo access</span>
                <span className="h-px flex-1 bg-slate-800/80" />
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800/80 bg-slate-950/30 p-2.5 text-[10px]">
                <div className="rounded-lg px-2 py-1.5"><p className="text-slate-500">Medical specialist</p><p className="mt-0.5 font-mono text-blue-300">drsmith / doc123</p></div>
                <div className="rounded-lg px-2 py-1.5"><p className="text-slate-500">Patient portal</p><p className="mt-0.5 font-mono text-blue-300">alice / pat123</p></div>
                <div className="rounded-lg px-2 py-1.5"><p className="text-slate-500">Super admin</p><p className="mt-0.5 font-mono text-blue-300">superadmin / admin123</p></div>
                <div className="rounded-lg px-2 py-1.5"><p className="text-slate-500">Radiologist</p><p className="mt-0.5 font-mono text-blue-300">radjones / rad123</p></div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="max-h-[370px] space-y-4 overflow-y-auto pr-1">
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500" htmlFor="register-username">Username</label>
                  <div className="relative"><UserIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" /><input id="register-username" type="text" required placeholder="Choose a username" value={username} onChange={(event) => setUsername(event.target.value)} className={inputClass} /></div>
                </div>
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500" htmlFor="register-email">Email address</label>
                  <div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" /><input id="register-email" type="email" required placeholder="you@hospital.org" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></div>
                </div>
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500" htmlFor="register-password">Password</label>
                  <div className="relative"><Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" /><input id="register-password" type={showPassword ? "text" : "password"} required placeholder="Create a secure password" value={password} onChange={(event) => setPassword(event.target.value)} className={`${inputClass} pr-11`} /><button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-600 transition hover:text-slate-300" aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div>
                </div>
                <div>
                  <label className="mb-2 block text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500" htmlFor="register-role">Account role</label>
                  <select id="register-role" value={role} onChange={(event) => setRole(event.target.value)} className={`${compactInputClass} cursor-pointer`}>
                    {roles.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </div>

                {role === "patient" ? (
                  <div className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-950/30 p-3.5">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500"><UserIcon className="h-3.5 w-3.5 text-cyan-300" /> Patient profile</div>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-[10px] text-slate-500">Date of birth<input type="date" value={dob} onChange={(event) => setDob(event.target.value)} className={`${compactInputClass} mt-1.5`} /></label>
                      <label className="text-[10px] text-slate-500">Gender<input type="text" placeholder="e.g. Female" value={gender} onChange={(event) => setGender(event.target.value)} className={`${compactInputClass} mt-1.5`} /></label>
                    </div>
                    <label className="block text-[10px] text-slate-500">Blood group<input type="text" placeholder="e.g. O Positive" value={bloodGroup} onChange={(event) => setBloodGroup(event.target.value)} className={`${compactInputClass} mt-1.5`} /></label>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-950/30 p-3.5">
                    <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500"><ShieldCheck className="h-3.5 w-3.5 text-cyan-300" /> Professional credentials</div>
                    <label className="block text-[10px] text-slate-500">Specialization<input type="text" placeholder="e.g. Cardiology" value={specialization} onChange={(event) => setSpecialization(event.target.value)} className={`${compactInputClass} mt-1.5`} /></label>
                    <label className="block text-[10px] text-slate-500">Medical license number<input type="text" placeholder="e.g. LIC-MD-SMITH-777" value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)} className={`${compactInputClass} mt-1.5`} /></label>
                  </div>
                )}
              </div>
              <button type="submit" disabled={loading} className="group flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3.5 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-950/25 transition hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60">
                {loading ? "Creating secure profile…" : "Create secure profile"}
                {!loading && <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />}
              </button>
            </form>
          )}

          <div className="mt-6 flex items-center justify-center gap-2 text-[10px] text-slate-600">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/70" />
            <span>Every access event is recorded on the integrity ledger.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
