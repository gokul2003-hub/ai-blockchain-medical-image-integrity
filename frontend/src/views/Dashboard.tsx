import React, { useState, useEffect, useCallback } from "react";
import {
  Image,
  ShieldCheck,
  ShieldAlert,
  Blocks,
  Users,
  AlertTriangle,
  RefreshCw,
  ArrowRight,
  Lock,
  Search,
  ScanLine,
  MapPin,
  Archive,
  RotateCcw,
  CheckCircle2,
  BookOpen,
  Upload,
  Clock,
  ChevronRight,
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
} from "recharts";
import { apiClient } from "../services/api";
import { useToast } from "../components/Toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  total_hospitals: number;
  total_doctors: number;
  total_images: number;
  total_transactions: number;
  verified_images: number;
  tampered_images: number;
  active_users: number;
  failed_logins: number;
  security_alerts: number;
}

interface DailyUpload {
  date: string;
  count: number;
}

interface TamperingStatistic {
  month: string;
  tampered: number;
  verified: number;
}

interface AccessStatistic {
  role: string;
  count: number;
}

interface AnalyticsData {
  stats: DashboardStats;
  daily_uploads: DailyUpload[];
  tampering_statistics: TamperingStatistic[];
  access_statistics: AccessStatistic[];
}

interface BlockchainBlock {
  id: number;
  block_index: number;
  transaction_hash: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

interface DashboardProps {
  token: string;
  onViewChange: (view: string) => void;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const LIFECYCLE_STEPS = [
  { icon: Lock,         label: "PROTECT",   color: "text-blue-400",    bg: "bg-blue-500/10",    border: "border-blue-500/30" },
  { icon: Archive,      label: "STORE",     color: "text-indigo-400",  bg: "bg-indigo-500/10",  border: "border-indigo-500/30" },
  { icon: ShieldCheck,  label: "VERIFY",    color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  { icon: Search,       label: "DETECT",    color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/30" },
  { icon: MapPin,       label: "LOCALIZE",  color: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/30" },
  { icon: ShieldAlert,  label: "QUARANTINE",color: "text-rose-400",    bg: "bg-rose-500/10",    border: "border-rose-500/30" },
  { icon: RotateCcw,    label: "RECOVER",   color: "text-cyan-400",    bg: "bg-cyan-500/10",    border: "border-cyan-500/30" },
  { icon: ScanLine,     label: "RE-VERIFY", color: "text-teal-400",    bg: "bg-teal-500/10",    border: "border-teal-500/30" },
  { icon: BookOpen,     label: "AUDIT",     color: "text-purple-400",  bg: "bg-purple-500/10",  border: "border-purple-500/30" },
];

const BLOCK_TYPE_CONFIG: Record<string, { color: string; label: string }> = {
  UPLOAD:         { color: "bg-blue-500/15 text-blue-400 border-blue-500/30",       label: "Upload" },
  VERIFY:         { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", label: "Verify" },
  TAMPER_ALERT:   { color: "bg-rose-500/15 text-rose-400 border-rose-500/30",       label: "Tamper Alert" },
  ACCESS_GRANT:   { color: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",       label: "Access Grant" },
  ACCESS_REVOKE:  { color: "bg-amber-500/15 text-amber-400 border-amber-500/30",    label: "Access Revoke" },
  RECOVERY:       { color: "bg-teal-500/15 text-teal-400 border-teal-500/30",       label: "Recovery" },
};

const PIE_COLORS = ["#10B981", "#EF4444", "#3B82F6", "#06B6D4"];

const CHART_TOOLTIP_STYLE = {
  backgroundColor: "#0F172A",
  border: "1px solid #334155",
  borderRadius: "12px",
  fontSize: "11px",
  color: "#E2E8F0",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString("en-US", {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

function extractImageId(payload: Record<string, unknown>): string | null {
  const id = payload?.image_id ?? payload?.imageId ?? payload?.id;
  return id != null ? String(id) : null;
}

function extractActor(payload: Record<string, unknown>): string | null {
  const actor =
    payload?.uploaded_by ?? payload?.verified_by ?? payload?.actor ??
    payload?.granted_to ?? payload?.revoked_from ?? payload?.user;
  return actor != null ? String(actor) : null;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  accentClass,
  iconColor,
  iconBg,
  onClick,
  ariaLabel,
}: {
  icon: React.ElementType;
  label: string;
  value: number | undefined;
  accentClass: string;
  iconColor: string;
  iconBg: string;
  onClick?: () => void;
  ariaLabel: string;
}) {
  const displayValue = value != null ? `~${value.toLocaleString()}` : "—";

  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className={`glass-panel ${accentClass} p-5 flex items-center gap-4 w-full text-left transition-all duration-200 hover:brightness-110 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer group`}
    >
      <div className={`h-11 w-11 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div>
        <div className="text-2xl font-bold text-slate-100 tabular-nums leading-tight mt-0.5">{displayValue}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-slate-700 ml-auto flex-shrink-0 group-hover:text-slate-400 transition-colors" />
    </button>
  );
}

function BlockTypeBadge({ type }: { type: string }) {
  const cfg = BLOCK_TYPE_CONFIG[type] ?? {
    color: "bg-slate-700/30 text-slate-400 border-slate-600/30",
    label: type,
  };
  return (
    <span className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function TimelineItem({ block }: { block: BlockchainBlock }) {
  const imageId = extractImageId(block.payload);
  const actor = extractActor(block.payload);

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-800/50 last:border-0">
      <div className="flex flex-col items-center gap-1 pt-0.5 flex-shrink-0">
        <div className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-1" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <BlockTypeBadge type={block.type} />
          {imageId && (
            <span className="text-[10px] text-slate-500 font-mono">#{imageId}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          {actor && (
            <span className="text-[10px] text-slate-400 truncate max-w-[100px]">{actor}</span>
          )}
          <span className="text-[10px] text-slate-600 ml-auto flex-shrink-0 flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {formatTimestamp(block.timestamp)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Dashboard({ token: _token, onViewChange }: DashboardProps) {
  const toast = useToast();

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [blocks, setBlocks]       = useState<BlockchainBlock[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const [analyticsRes, blocksRes] = await Promise.all([
        apiClient.get<AnalyticsData>("/api/analytics/dashboard"),
        apiClient.get<BlockchainBlock[]>("/api/blockchain/blocks"),
      ]);
      setAnalytics(analyticsRes.data);
      setBlocks(Array.isArray(blocksRes.data) ? blocksRes.data : []);
      if (silent) toast.success("Dashboard refreshed", "Latest analytics loaded.");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string }; statusText?: string } })
          ?.response?.data?.detail ??
        (err as { response?: { statusText?: string } })?.response?.statusText ??
        "Failed to load dashboard data.";
      setError(msg);
      if (!silent) toast.error("Load failed", msg);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const stats = analytics?.stats;
  const recentBlocks = [...blocks].reverse().slice(0, 15);

  const last7Uploads = (analytics?.daily_uploads ?? []).slice(-7);

  const riskData = stats
    ? [
        { name: "Verified",  value: stats.verified_images },
        { name: "Tampered",  value: stats.tampered_images },
        { name: "Analyzing", value: Math.max(0, stats.total_images - stats.verified_images - stats.tampered_images) },
        { name: "Recovered", value: 0 }, // enriched when backend exposes it
      ].filter((d) => d.value > 0)
    : [];

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="h-[70vh] flex flex-col items-center justify-center gap-3 text-slate-500">
        <RefreshCw className="h-7 w-7 text-blue-500 animate-spin" />
        <p className="text-xs">Connecting to blockchain ledger &amp; computing aggregates…</p>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────

  if (error && !analytics) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-rose-500/10 flex items-center justify-center">
          <AlertTriangle className="h-7 w-7 text-rose-400" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-200">Failed to load dashboard</p>
          <p className="text-xs text-slate-500 mt-1">{error}</p>
        </div>
        <button
          onClick={() => fetchData()}
          aria-label="Retry loading dashboard"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="w-full space-y-6 text-left">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-100">
            Command Center
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time medical image integrity &amp; forensics monitoring
          </p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          aria-label="Refresh dashboard data"
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          icon={Image}
          label="Total Images"
          value={stats?.total_images}
          accentClass="kpi-total"
          iconColor="text-blue-400"
          iconBg="bg-blue-500/10"
          onClick={() => onViewChange("medical-images")}
          ariaLabel="View all medical images"
        />
        <KpiCard
          icon={ShieldCheck}
          label="Verified"
          value={stats?.verified_images}
          accentClass="kpi-verified"
          iconColor="text-emerald-400"
          iconBg="bg-emerald-500/10"
          onClick={() => onViewChange("medical-images")}
          ariaLabel="View verified images"
        />
        <KpiCard
          icon={ShieldAlert}
          label="Tampered"
          value={stats?.tampered_images}
          accentClass="kpi-tampered"
          iconColor="text-rose-400"
          iconBg="bg-rose-500/10"
          onClick={() => onViewChange("tamper-detection")}
          ariaLabel="View tampered images"
        />
        <KpiCard
          icon={Blocks}
          label="Blockchain Events"
          value={stats?.total_transactions}
          accentClass="kpi-blockchain"
          iconColor="text-purple-400"
          iconBg="bg-purple-500/10"
          onClick={() => onViewChange("blockchain-audit")}
          ariaLabel="View blockchain events"
        />
        <KpiCard
          icon={Users}
          label="Active Users"
          value={stats?.active_users}
          accentClass="kpi-verified"
          iconColor="text-cyan-400"
          iconBg="bg-cyan-500/10"
          onClick={() => onViewChange("user-management")}
          ariaLabel="View active users"
        />
        <KpiCard
          icon={AlertTriangle}
          label="Security Alerts"
          value={stats?.security_alerts}
          accentClass="kpi-tampered"
          iconColor="text-amber-400"
          iconBg="bg-amber-500/10"
          onClick={() => onViewChange("security-events")}
          ariaLabel="View security alerts"
        />
      </div>

      {/* DP Notice */}
      <p className="text-[10px] text-slate-600 -mt-2">
        * Privacy-preserving analytics (ε=1.5 Laplace DP) — values approximate actual counts.
      </p>

      {/* ── Security Lifecycle Visual ── */}
      <div className="glass-panel p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Security Lifecycle Pipeline
          </h3>
          <span className="text-[10px] text-slate-600 font-mono">ISO 27001 · HIPAA</span>
        </div>

        {/* Steps row — scrollable on small screens */}
        <div className="flex items-center gap-0 overflow-x-auto pb-1 min-w-0">
          {LIFECYCLE_STEPS.map((step, idx) => {
            const Icon = step.icon;
            return (
              <React.Fragment key={step.label}>
                <div
                  className={`flex flex-col items-center gap-1.5 flex-shrink-0 px-3 py-2.5 rounded-xl border ${step.border} ${step.bg} min-w-[80px] group transition-all hover:brightness-110`}
                >
                  <Icon className={`h-4 w-4 ${step.color}`} />
                  <span className={`text-[9px] font-bold tracking-widest uppercase ${step.color}`}>
                    {step.label}
                  </span>
                </div>
                {idx < LIFECYCLE_STEPS.length - 1 && (
                  <ArrowRight className="h-3 w-3 text-slate-700 flex-shrink-0 mx-0.5" />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Gradient progress line */}
        <div className="mt-3 h-0.5 rounded-full bg-gradient-to-r from-blue-600 via-cyan-500 to-purple-500 opacity-40" />
      </div>

      {/* ── Charts + Timeline Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Bar Chart — Daily Uploads */}
        <div className="glass-panel p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Upload className="h-3.5 w-3.5 text-blue-400" />
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Daily Uploads (7d)
            </h3>
          </div>
          <div className="h-52">
            {last7Uploads.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={last7Uploads} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    stroke="#475569"
                    fontSize={9}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v: string) => v.slice(5)} // MM-DD
                  />
                  <YAxis
                    stroke="#475569"
                    fontSize={9}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={{ color: "#94A3B8", fontSize: 10 }}
                    cursor={{ fill: "rgba(59,130,246,0.07)" }}
                  />
                  <Bar dataKey="count" name="Uploads" fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600 text-xs">
                No upload data available
              </div>
            )}
          </div>
        </div>

        {/* Pie Chart — Risk Distribution */}
        <div className="glass-panel p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ScanLine className="h-3.5 w-3.5 text-cyan-400" />
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Risk Distribution
            </h3>
          </div>
          <div className="h-52">
            {riskData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={riskData}
                    cx="50%"
                    cy="45%"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={3}
                    dataKey="value"
                    nameKey="name"
                    stroke="none"
                  >
                    {riskData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    itemStyle={{ color: "#E2E8F0", fontSize: 11 }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    wrapperStyle={{ fontSize: "10px", color: "#94A3B8" }}
                    iconType="circle"
                    iconSize={8}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-600 text-xs">
                No risk data yet
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity Timeline */}
        <div className="glass-panel p-5 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Blocks className="h-3.5 w-3.5 text-purple-400" />
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Recent Activity
              </h3>
            </div>
            <button
              onClick={() => onViewChange("blockchain")}
              aria-label="View full blockchain ledger"
              className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors font-semibold cursor-pointer flex items-center gap-1"
            >
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto max-h-56 pr-1">
            {recentBlocks.length > 0 ? (
              recentBlocks.map((block) => (
                <TimelineItem key={block.id} block={block} />
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-600 py-8">
                <Blocks className="h-8 w-8 opacity-30" />
                <span className="text-xs">No blockchain events yet</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick Actions strip ── */}
      <div className="glass-panel p-4">
        <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-3">Quick Actions</p>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Upload Image",     view: "upload-image",      icon: Upload,    color: "bg-blue-600 hover:bg-blue-500 text-white" },
            { label: "Medical Images",   view: "medical-images",    icon: Image,     color: "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700" },
            { label: "Blockchain Ledger",view: "blockchain-audit",  icon: Blocks,    color: "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700" },
            { label: "AI Forensics",     view: "tamper-detection",  icon: ScanLine,  color: "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700" },
            { label: "Security Events",  view: "security-events",   icon: BookOpen,  color: "bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700" },
          ].map(({ label, view, icon: Icon, color }) => (
            <button
              key={view}
              onClick={() => onViewChange(view)}
              aria-label={`Navigate to ${label}`}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${color}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
