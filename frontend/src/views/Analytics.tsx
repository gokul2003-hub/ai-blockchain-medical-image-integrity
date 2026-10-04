import React, { useState, useEffect, useCallback } from "react";
import {
  Activity,
  BarChart2,
  PieChart as PieChartIcon,
  TrendingUp,
  ShieldAlert,
  RefreshCw,
  Layers,
  CheckCircle2,
  AlertTriangle,
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
  Legend,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";
import { apiClient } from "../services/api";

interface AnalyticsData {
  stats: {
    total_hospitals: number;
    total_doctors: number;
    total_images: number;
    total_transactions: number;
    verified_images: number;
    tampered_images: number;
    active_users: number;
    failed_logins: number;
    security_alerts: number;
  };
  daily_uploads: { date: string; count: number }[];
  tampering_statistics: { month: string; tampered: number; verified: number }[];
  access_statistics: { role: string; count: number }[];
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];
const CHART_TOOLTIP_STYLE = {
  backgroundColor: "#0f172a",
  borderColor: "#1e293b",
  borderRadius: "8px",
  fontSize: "12px",
  color: "#e2e8f0",
};

export default function Analytics({ token }: { token: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<AnalyticsData>("/api/analytics/dashboard");
      setData(res.data);
    } catch (err: any) {
      const msg =
        err.response?.data?.detail ||
        err.message ||
        "Failed to load analytics data.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 text-slate-500 gap-3">
        <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
        <div className="text-xs">Loading analytics with differential privacy...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="h-14 w-14 rounded-2xl bg-rose-500/10 flex items-center justify-center">
          <ShieldAlert className="h-7 w-7 text-rose-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-200">Analytics Unavailable</p>
          <p className="text-xs text-slate-500 mt-1">{error || "No data returned from server."}</p>
        </div>
        <button
          onClick={load}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl cursor-pointer transition-all"
          aria-label="Retry loading analytics"
        >
          Retry
        </button>
      </div>
    );
  }

  const { stats, daily_uploads, tampering_statistics, access_statistics } = data;

  const kpis = [
    {
      label: "Total Images",
      value: stats.total_images,
      icon: Layers,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Verified",
      value: stats.verified_images,
      icon: CheckCircle2,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Tampered",
      value: stats.tampered_images,
      icon: ShieldAlert,
      color: "text-rose-400",
      bg: "bg-rose-500/10",
    },
    {
      label: "Security Alerts",
      value: stats.security_alerts,
      icon: AlertTriangle,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
  ];

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-indigo-400" />
            System Analytics
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Differential privacy (ε=1.5 Laplace) applied — values are approximate.
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all cursor-pointer"
          aria-label="Refresh analytics"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <div key={i} className="glass-panel p-4 flex items-center gap-4">
            <div className={`p-3 rounded-xl border border-slate-800/80 ${k.bg}`}>
              <k.icon className={`h-5 w-5 ${k.color}`} />
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                {k.label}
              </div>
              <div className={`text-xl font-bold tabular-nums ${k.color}`}>
                ~{k.value.toLocaleString()}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upload Trends */}
        <div className="glass-panel p-5">
          <div className="flex items-center gap-2 mb-5 border-b border-slate-800/60 pb-3">
            <TrendingUp className="h-4 w-4 text-blue-400" />
            <h3 className="text-sm font-bold text-slate-200">Daily Upload Volume (7d)</h3>
          </div>
          <div className="h-60">
            {daily_uploads.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={daily_uploads} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="date"
                    stroke="#64748b"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    itemStyle={{ color: "#60a5fa" }}
                    cursor={{ stroke: "#334155" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Uploads"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3, fill: "#3b82f6" }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600 text-xs">
                No upload data available
              </div>
            )}
          </div>
        </div>

        {/* Access Distribution */}
        <div className="glass-panel p-5">
          <div className="flex items-center gap-2 mb-5 border-b border-slate-800/60 pb-3">
            <PieChartIcon className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-200">Access Distribution by Role</h3>
          </div>
          <div className="h-60">
            {access_statistics.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={access_statistics}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="count"
                    nameKey="role"
                    stroke="none"
                  >
                    {access_statistics.map((_entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    itemStyle={{ color: "#e2e8f0" }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "11px", color: "#94a3b8", paddingTop: "10px" }}
                    iconType="circle"
                    iconSize={8}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600 text-xs">
                No access data available
              </div>
            )}
          </div>
        </div>

        {/* Tampering Statistics */}
        <div className="glass-panel p-5 lg:col-span-2">
          <div className="flex items-center gap-2 mb-5 border-b border-slate-800/60 pb-3">
            <Activity className="h-4 w-4 text-rose-400" />
            <h3 className="text-sm font-bold text-slate-200">
              Integrity &amp; Tampering History
            </h3>
          </div>
          <div className="h-64">
            {tampering_statistics.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={tampering_statistics}
                  margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#1e293b"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="month"
                    stroke="#64748b"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#64748b"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    cursor={{ fill: "#1e293b" }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: "11px", color: "#94a3b8", paddingTop: "10px" }}
                    iconType="circle"
                    iconSize={8}
                  />
                  <Bar
                    dataKey="verified"
                    name="Verified"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                  <Bar
                    dataKey="tampered"
                    name="Tampered"
                    fill="#ef4444"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={40}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600 text-xs">
                No tampering statistics available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Additional Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Hospitals", value: stats.total_hospitals },
          { label: "Doctors", value: stats.total_doctors },
          { label: "Blockchain Txns", value: stats.total_transactions },
          { label: "Failed Logins", value: stats.failed_logins },
        ].map(({ label, value }) => (
          <div key={label} className="glass-panel p-4 text-center">
            <div className="text-[10px] text-slate-600 font-bold uppercase tracking-wider mb-1">
              {label}
            </div>
            <div className="text-lg font-bold text-slate-300 tabular-nums">
              ~{value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
