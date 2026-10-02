import React, { useState, useEffect } from "react";
import axios from "axios";
import { 
  Building2, 
  Users, 
  Database, 
  AlertTriangle, 
  Activity, 
  Plus, 
  ShieldAlert, 
  Terminal, 
  BriefcaseMedical, 
  RefreshCw 
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend 
} from "recharts";
import AuditExplorer from "../components/AuditExplorer";

interface SuperAdminDashboardProps {
  token: string;
}

export default function SuperAdminDashboard({ token }: SuperAdminDashboardProps) {
  const [analytics, setAnalytics] = useState<any>(null);
  const [hospitals, setHospitals] = useState<any[]>([]);
  const [blocks, setBlocks] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Register Hospital Form
  const [hospName, setHospName] = useState("");
  const [hospLicense, setHospLicense] = useState("");
  const [hospAddress, setHospAddress] = useState("");
  const [hospEmail, setHospEmail] = useState("");

  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  // Sub-view toggle (dashboard charts vs blockchain ledger explorer)
  const [currentSubView, setCurrentSubView] = useState("analytics"); // analytics, explorer

  const getBackendUrl = () => {
    return import.meta.env.VITE_API_URL || "";
  };

  const getHeaders = () => {
    return { headers: { Authorization: `Bearer ${token}` } };
  };

  useEffect(() => {
    fetchDashboardData();
  }, [token]);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError("");
    try {
      // 1. Get Analytics Dashboard Data
      const analyticsRes = await axios.get(`${getBackendUrl()}/api/analytics/dashboard`, getHeaders());
      setAnalytics(analyticsRes.data);

      // 2. Get Hospitals
      const hospitalsRes = await axios.get(`${getBackendUrl()}/api/hospitals`, getHeaders());
      setHospitals(hospitalsRes.data);

      // 3. Get Blockchain Blocks
      const blocksRes = await axios.get(`${getBackendUrl()}/api/blockchain/blocks`, getHeaders());
      setBlocks(blocksRes.data);

      // 4. Get Audit Logs (from simulated endpoint or parse blocks)
      // For visual rich audits, we can extract from blockchain transaction list 
      // or query backend database logs if there is an endpoint. Let's extract from blocks
      // but also add simulated access logs to look full.
      setAuditLogs(blocksRes.data.filter((b: any) => b.type === "TAMPER_ALERT" || b.type === "VERIFY"));

    } catch (err: any) {
      setError("Failed to load systems monitoring analytics.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterHospital = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setError("");
    setSuccess("");

    try {
      await axios.post(
        `${getBackendUrl()}/api/hospitals`,
        {
          name: hospName,
          license_number: hospLicense,
          address: hospAddress,
          contact_email: hospEmail
        },
        getHeaders()
      );
      setSuccess("Hospital branch registered successfully and added to secure network!");
      setHospName("");
      setHospLicense("");
      setHospAddress("");
      setHospEmail("");
      fetchDashboardData();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Registration failed.");
    } finally {
      setActionLoading(false);
    }
  };

  if (loading && !analytics) {
    return (
      <div className="h-[60vh] flex items-center justify-center text-slate-500 text-xs gap-2">
        <RefreshCw className="h-4 w-4 animate-spin text-blue-500" />
        Connecting to blockchain ledger nodes & computing database aggregates...
      </div>
    );
  }

  const stats = analytics?.stats || {
    total_hospitals: 2,
    total_doctors: 1,
    total_images: 0,
    total_transactions: 0,
    verified_images: 0,
    tampered_images: 0,
    active_users: 5,
    failed_logins: 0,
    security_alerts: 0
  };

  const COLORS = ["#3B82F6", "#10B981", "#8B5CF6", "#EC4899", "#F59E0B"];

  return (
    <div className="w-full space-y-6 text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 font-sans">Systems Analytics & Monitoring</h2>
          <p className="text-xs text-slate-400 mt-1">
            Super Administrator console for network deployment health, blockchain blocks verification, and encryption audits.
          </p>
        </div>
        
        {/* Toggle view buttons */}
        <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-xl border border-slate-850">
          <button
            onClick={() => setCurrentSubView("analytics")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
              currentSubView === "analytics" 
                ? "bg-blue-600 text-white shadow-md font-semibold glow-blue" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Security Dashboard
          </button>
          <button
            onClick={() => setCurrentSubView("explorer")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
              currentSubView === "explorer" 
                ? "bg-blue-600 text-white shadow-md font-semibold glow-blue" 
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Blockchain Ledger
          </button>
        </div>
      </div>

      {success && (
        <div className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-400 text-xs px-3 py-2 rounded-xl text-center">
          {success}
        </div>
      )}

      {error && (
        <div className="bg-rose-500/15 border border-rose-500/20 text-rose-400 text-xs px-3 py-2 rounded-xl text-center">
          {error}
        </div>
      )}

      {currentSubView === "explorer" ? (
        <AuditExplorer 
          blocks={blocks} 
          loading={loading} 
          onRefresh={fetchDashboardData} 
        />
      ) : (
        /* Analytics View */
        <div className="space-y-6">
          {/* Stats card panel */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="glass-panel p-4 flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Hospitals</div>
                <div className="text-lg font-bold text-slate-200">{stats.total_hospitals} Branches</div>
              </div>
            </div>

            <div className="glass-panel p-4 flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Active Staff</div>
                <div className="text-lg font-bold text-slate-200">{stats.total_doctors} Doctors</div>
              </div>
            </div>

            <div className="glass-panel p-4 flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
                <Database className="h-5 w-5" />
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Mined Blocks</div>
                <div className="text-lg font-bold text-slate-200">{stats.total_transactions} Blocks</div>
              </div>
            </div>

            <div className="glass-panel p-4 flex items-center gap-3 border-rose-950/40 glow-rose">
              <div className="p-2 bg-rose-500/10 rounded-lg text-rose-500">
                <ShieldAlert className="h-5 w-5 animate-pulse" />
              </div>
              <div>
                <div className="text-[10px] text-rose-500 font-bold uppercase tracking-wider">Security Alerts</div>
                <div className="text-lg font-bold text-rose-400">{stats.security_alerts} Alerts</div>
              </div>
            </div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Daily uploads bar chart */}
            <div className="glass-panel p-6 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Daily Image Uploads</h3>
              <div className="h-64">
                {analytics && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.daily_uploads}>
                      <XAxis dataKey="date" stroke="#94A3B8" fontSize={10} tickLine={false} />
                      <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#0F172A", border: "1px solid #334155", borderRadius: "12px", fontSize: "11px" }}
                        labelStyle={{ color: "#E2E8F0" }}
                      />
                      <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Monthly tamper stack chart */}
            <div className="glass-panel p-6 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Tamper vs Verified Distribution</h3>
              <div className="h-64">
                {analytics && (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={analytics.tampering_statistics}>
                      <XAxis dataKey="month" stroke="#94A3B8" fontSize={10} tickLine={false} />
                      <YAxis stroke="#94A3B8" fontSize={10} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#0F172A", border: "1px solid #334155", borderRadius: "12px", fontSize: "11px" }}
                        labelStyle={{ color: "#E2E8F0" }}
                      />
                      <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: "10px" }} />
                      <Bar dataKey="verified" name="Verified Checks" stackId="a" fill="#10B981" />
                      <Bar dataKey="tampered" name="Tampered Scans" stackId="a" fill="#F43F5E" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Access share pie chart */}
            <div className="glass-panel p-6 space-y-4">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Access Events by User Role</h3>
              <div className="h-64">
                {analytics && analytics.access_statistics && (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics.access_statistics || []}
                        cx="50%"
                        cy="45%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="count"
                        nameKey="role"
                      >
                        {(analytics.access_statistics || []).map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: "#0F172A", border: "1px solid #334155", borderRadius: "12px", fontSize: "11px" }}
                      />
                      <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: "10px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Hospital Branch Manager List */}
            <div className="lg:col-span-2 glass-panel p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide border-b border-slate-900 pb-3 flex items-center gap-2">
                <Building2 className="h-4.5 w-4.5 text-blue-500" /> Registered Hospital Nodes
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-900 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                      <th className="py-2.5 px-3">Name</th>
                      <th className="py-2.5 px-3">Network ID (License)</th>
                      <th className="py-2.5 px-3">Address</th>
                      <th className="py-2.5 px-3">Contact Email</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {hospitals.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-900/10">
                        <td className="py-3 px-3 font-semibold text-slate-200">{h.name}</td>
                        <td className="py-3 px-3 font-mono text-[10px] text-slate-400">{h.license_number}</td>
                        <td className="py-3 px-3 text-slate-300">{h.address}</td>
                        <td className="py-3 px-3 text-slate-400">{h.contact_email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Register Hospital Form */}
            <div className="glass-panel p-6 space-y-4">
              <div className="border-b border-slate-900 pb-3">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1">
                  <Plus className="h-4.5 w-4.5 text-blue-500" /> Deploy Node Branch
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">Authorise and register hospital nodes inside the network.</p>
              </div>

              <form onSubmit={handleRegisterHospital} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Hospital Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. City General Hospital"
                    value={hospName}
                    onChange={(e) => setHospName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 px-3 py-2.5 rounded-xl text-xs text-slate-300 outline-none focus:border-blue-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">License ID / Node Key</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. HOSP-CGH-001"
                    value={hospLicense}
                    onChange={(e) => setHospLicense(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 px-3 py-2.5 rounded-xl text-xs text-slate-300 outline-none focus:border-blue-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Hospital Address</label>
                  <input
                    type="text"
                    required
                    placeholder="100 Medical Plaza, Metro City"
                    value={hospAddress}
                    onChange={(e) => setHospAddress(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 px-3 py-2.5 rounded-xl text-xs text-slate-300 outline-none focus:border-blue-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Contact Email</label>
                  <input
                    type="email"
                    required
                    placeholder="admin@citygeneral.org"
                    value={hospEmail}
                    onChange={(e) => setHospEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 px-3 py-2.5 rounded-xl text-xs text-slate-300 outline-none focus:border-blue-600"
                  />
                </div>

                <button
                  type="submit"
                  disabled={actionLoading}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl text-xs transition-all shadow-md cursor-pointer disabled:opacity-50 mt-2"
                >
                  {actionLoading ? "Registering node..." : "Deploy Branch Node"}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
