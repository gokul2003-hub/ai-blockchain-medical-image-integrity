import React, { useState } from "react";
import axios from "axios";
import { Shield, Key, Mail, Lock, User as UserIcon, QrCode } from "lucide-react";

interface LoginProps {
  onLoginSuccess: (token: string, username: string, role: string) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("patient"); // patient, doctor, radiologist, hospital_admin, super_admin
  
  // Registration Profile Metadata
  const [dob, setDob] = useState("1995-04-15");
  const [gender, setGender] = useState("Female");
  const [bloodGroup, setBloodGroup] = useState("O Positive");
  const [specialization, setSpecialization] = useState("Radiology & MRI Imaging");
  const [licenseNumber, setLicenseNumber] = useState("LIC-MD-SMITH-777");

  // MFA Flow States
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSetupData, setMfaSetupData] = useState<{ secret: string; totp_uri: string } | null>(null);
  const [showMfaSetup, setShowMfaSetup] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const getBackendUrl = () => {
    return import.meta.env.VITE_API_URL || "http://localhost:8000";
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const response = await axios.post(`${getBackendUrl()}/api/auth/login`, {
        username,
        password,
        mfa_code: mfaRequired ? mfaCode : null
      });

      if (response.status === 206) {
        // MFA code required
        setMfaRequired(true);
        setLoading(false);
        return;
      }

      const { access_token, role: userRole, username: name } = response.data;
      onLoginSuccess(access_token, name, userRole);
    } catch (err: any) {
      const apiErr = err.response?.data?.detail || err.response?.data?.error?.message;
      setError(apiErr || "Authentication failed. Check credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccessMsg("");

    const payload: any = {
      username,
      email,
      password,
      role
    };

    if (role === "patient") {
      payload.patient_profile = {
        date_of_birth: dob,
        gender,
        blood_group: bloodGroup
      };
    } else if (role === "doctor") {
      payload.doctor_profile = {
        specialization,
        license_number: licenseNumber
      };
    }

    try {
      await axios.post(`${getBackendUrl()}/api/auth/register`, payload);
      
      // Auto-login immediately upon successful registration
      const loginRes = await axios.post(`${getBackendUrl()}/api/auth/login`, {
        username,
        password,
        mfa_code: null
      });
      
      const { access_token, role: userRole, username: name } = loginRes.data;
      onLoginSuccess(access_token, name, userRole);
    } catch (err: any) {
      if (err.response?.data?.detail) {
        setError(err.response.data.detail);
      } else {
        // Fallback if user was registered but auto-login needs manual password input
        setSuccessMsg("Account successfully registered! You can now log in.");
        setIsRegistering(false);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 px-4 relative overflow-hidden">
      {/* Decorative Blur Backgrounds */}
      <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-blue-600/10 blur-[80px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-emerald-500/10 blur-[80px] pointer-events-none" />

      <div className="w-full max-w-md glass-panel p-8 space-y-6 glow-blue border-slate-800 bg-slate-900/40 relative z-10 text-left">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="h-12 w-12 bg-gradient-to-tr from-blue-600 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto glow-blue">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 uppercase">MedChain AI Sharing</h2>
          <p className="text-xs text-slate-400">Adaptive Chaos Encryption & Smart Access Control</p>
        </div>

        {error && (
          <div className="bg-rose-500/15 border border-rose-500/20 text-rose-400 text-xs px-3 py-2 rounded-xl text-center">
            {error}
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-xs px-3 py-2 rounded-xl text-center">
            {successMsg}
          </div>
        )}

        {/* 1. MFA Challenge View */}
        {mfaRequired ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Multi-Factor Authenticator Code</label>
              <div className="relative flex items-center">
                <QrCode className="absolute left-3.5 h-4.5 w-4.5 text-slate-500" />
                <input
                  type="text"
                  required
                  placeholder="Enter 6-digit TOTP verification code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 px-10 py-3 rounded-xl text-xs text-slate-200 outline-none focus:border-blue-600 font-mono tracking-widest text-center"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1 italic text-center">
                MFA is enabled on this profile. Use Authenticator app or enter test bypass "123456"
              </p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-xs transition-all shadow-md cursor-pointer"
            >
              {loading ? "Verifying Authenticator..." : "Verify & Continue"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMfaRequired(false);
                setMfaCode("");
              }}
              className="w-full text-slate-400 hover:text-slate-200 text-xs font-semibold text-center mt-2 cursor-pointer"
            >
              Back to Login
            </button>
          </form>
        ) : !isRegistering ? (
          /* 2. Login View */
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Username</label>
                <div className="relative flex items-center">
                  <UserIcon className="absolute left-3.5 h-4.5 w-4.5 text-slate-500" />
                  <input
                    type="text"
                    required
                    placeholder="Enter your username"
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setError("");
                    }}
                    className="w-full bg-slate-950 border border-slate-850 px-10 py-3 rounded-xl text-xs text-slate-200 outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Password</label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-3.5 h-4.5 w-4.5 text-slate-500" />
                  <input
                    type="password"
                    required
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError("");
                    }}
                    className="w-full bg-slate-950 border border-slate-850 px-10 py-3 rounded-xl text-xs text-slate-200 outline-none focus:border-blue-600"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-xs transition-all shadow-md cursor-pointer mt-2"
            >
              {loading ? "Authenticating session..." : "Login Securely"}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(true);
                  setError("");
                  setSuccessMsg("");
                }}
                className="text-xs text-slate-400 hover:text-slate-200 font-semibold cursor-pointer"
              >
                Need an account? Register Profile
              </button>
            </div>
            
            <div className="border-t border-slate-900 pt-4 mt-2">
              <div className="text-[9px] text-slate-500 font-bold uppercase mb-2 text-center">Testing Credentials</div>
              <div className="grid grid-cols-2 gap-2 text-[9px] text-slate-400 font-mono">
                <div>Dr Smith: <span className="text-blue-400">drsmith / doc123</span></div>
                <div>Patient Alice: <span className="text-blue-400">alice / pat123</span></div>
                <div>Super Admin: <span className="text-blue-400">superadmin / admin123</span></div>
                <div>Radiologist: <span className="text-blue-400">radjones / rad123</span></div>
              </div>
            </div>
          </form>
        ) : (
          /* 3. Register View */
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-3 overflow-y-auto max-h-[350px] pr-1">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Username</label>
                <div className="relative flex items-center">
                  <UserIcon className="absolute left-3.5 h-4.5 w-4.5 text-slate-500" />
                  <input
                    type="text"
                    required
                    placeholder="Choose username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 px-10 py-2.5 rounded-xl text-xs text-slate-200 outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Email Address</label>
                <div className="relative flex items-center">
                  <Mail className="absolute left-3.5 h-4.5 w-4.5 text-slate-500" />
                  <input
                    type="email"
                    required
                    placeholder="Enter email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 px-10 py-2.5 rounded-xl text-xs text-slate-200 outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Password</label>
                <div className="relative flex items-center">
                  <Lock className="absolute left-3.5 h-4.5 w-4.5 text-slate-500" />
                  <input
                    type="password"
                    required
                    placeholder="Choose password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 px-10 py-2.5 rounded-xl text-xs text-slate-200 outline-none focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Account Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 px-4 py-2.5 rounded-xl text-xs text-slate-200 outline-none focus:border-blue-600 cursor-pointer"
                >
                  <option value="patient">Patient Portal</option>
                  <option value="doctor">Medical Doctor / Radiologist</option>
                </select>
              </div>

              {/* Dynamic Profiles fields */}
              {role === "patient" ? (
                <div className="space-y-3 bg-slate-950/40 p-3 rounded-xl border border-slate-900 mt-2">
                  <div className="text-[9px] text-slate-500 font-bold uppercase">Patient Profile Details</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[9px] text-slate-500">Date of Birth</label>
                      <input
                        type="date"
                        value={dob}
                        onChange={(e) => setDob(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 px-2 py-1.5 rounded-lg text-[11px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-slate-500">Gender</label>
                      <input
                        type="text"
                        placeholder="e.g. Female"
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 px-2 py-1.5 rounded-lg text-[11px]"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] text-slate-500">Blood Group</label>
                    <input
                      type="text"
                      placeholder="e.g. O Positive"
                      value={bloodGroup}
                      onChange={(e) => setBloodGroup(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-850 px-2 py-1.5 rounded-lg text-[11px]"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3 bg-slate-950/40 p-3 rounded-xl border border-slate-900 mt-2">
                  <div className="text-[9px] text-slate-500 font-bold uppercase">Doctor License Details</div>
                  <div className="space-y-2">
                    <div className="space-y-1">
                      <label className="text-[9px] text-slate-500">Specialization</label>
                      <input
                        type="text"
                        placeholder="e.g. Cardiology"
                        value={specialization}
                        onChange={(e) => setSpecialization(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 px-2 py-1.5 rounded-lg text-[11px]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-slate-500">Medical License Number</label>
                      <input
                        type="text"
                        placeholder="e.g. LIC-MD-SMITH-777"
                        value={licenseNumber}
                        onChange={(e) => setLicenseNumber(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-850 px-2 py-1.5 rounded-lg text-[11px]"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-xl text-xs transition-all shadow-md cursor-pointer"
            >
              {loading ? "Registering account..." : "Submit Registration"}
            </button>

            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsRegistering(false);
                  setError("");
                  setSuccessMsg("");
                }}
                className="text-xs text-slate-400 hover:text-slate-200 font-semibold cursor-pointer"
              >
                Already have an account? Login
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
