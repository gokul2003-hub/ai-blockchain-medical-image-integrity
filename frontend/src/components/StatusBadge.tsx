import React from "react";
import { ShieldCheck, ShieldAlert, ShieldX, Clock, Lock, Unlock, Activity, RefreshCw, XCircle, CheckCircle2 } from "lucide-react";

export type StatusType =
  | "VERIFIED"
  | "TAMPERED"
  | "QUARANTINED"
  | "RECOVERED"
  | "ANALYZING"
  | "PROCESSING"
  | "FAILED"
  | "PENDING"
  | "ACTIVE"
  | "REVOKED"
  | "EXPIRED"
  | "SECURE"
  | "WARNING"
  | "CRITICAL"
  | "CONNECTED"
  | "DEGRADED"
  | "OFFLINE"
  | "UNKNOWN";

interface StatusBadgeProps {
  status: StatusType | string;
  size?: "xs" | "sm" | "md";
  pulse?: boolean;
  showIcon?: boolean;
}

const statusConfig: Record<string, { color: string; icon: React.ElementType; label?: string }> = {
  VERIFIED:   { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: ShieldCheck },
  TAMPERED:   { color: "bg-rose-500/15 text-rose-400 border-rose-500/30", icon: ShieldAlert },
  QUARANTINED:{ color: "bg-orange-500/15 text-orange-400 border-orange-500/30", icon: ShieldX },
  RECOVERED:  { color: "bg-teal-500/15 text-teal-400 border-teal-500/30", icon: ShieldCheck },
  ANALYZING:  { color: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: Activity },
  PROCESSING: { color: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: RefreshCw },
  FAILED:     { color: "bg-rose-500/15 text-rose-400 border-rose-500/30", icon: XCircle },
  PENDING:    { color: "bg-slate-500/15 text-slate-400 border-slate-500/30", icon: Clock },
  ACTIVE:     { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  REVOKED:    { color: "bg-slate-500/15 text-slate-500 border-slate-600/30", icon: Lock },
  EXPIRED:    { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: Clock },
  SECURE:     { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: ShieldCheck },
  WARNING:    { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: ShieldAlert },
  CRITICAL:   { color: "bg-rose-500/15 text-rose-400 border-rose-500/30", icon: ShieldX },
  CONNECTED:  { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  DEGRADED:   { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: ShieldAlert },
  OFFLINE:    { color: "bg-slate-600/15 text-slate-500 border-slate-600/30", icon: XCircle },
  UNKNOWN:    { color: "bg-slate-500/15 text-slate-400 border-slate-500/30", icon: Clock },
};

const sizeMap = {
  xs: "text-[9px] px-1.5 py-0.5 gap-1",
  sm: "text-[10px] px-2 py-0.5 gap-1",
  md: "text-xs px-2.5 py-1 gap-1.5",
};

const iconSizeMap = {
  xs: "h-2.5 w-2.5",
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
};

export default function StatusBadge({
  status,
  size = "sm",
  pulse = false,
  showIcon = true,
}: StatusBadgeProps) {
  const config = statusConfig[status?.toUpperCase()] || statusConfig["UNKNOWN"];
  const Icon = config.icon;
  const isSpinning = status === "ANALYZING" || status === "PROCESSING";

  return (
    <span
      className={`inline-flex items-center font-bold uppercase tracking-wider rounded-full border ${config.color} ${sizeMap[size]} ${pulse ? "animate-pulse" : ""}`}
    >
      {showIcon && (
        <Icon className={`${iconSizeMap[size]} ${isSpinning ? "animate-spin" : ""} flex-shrink-0`} />
      )}
      {status}
    </span>
  );
}
