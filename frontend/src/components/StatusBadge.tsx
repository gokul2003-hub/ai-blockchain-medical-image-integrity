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
  PENDING:    { color: "bg-slate-500/15 text-slate-300 border-slate-500/30", icon: Clock },
  ACTIVE:     { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  REVOKED:    { color: "bg-slate-500/15 text-slate-300 border-slate-500/40", icon: Lock },
  EXPIRED:    { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: Clock },
  SECURE:     { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: ShieldCheck },
  WARNING:    { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: ShieldAlert },
  CRITICAL:   { color: "bg-rose-500/15 text-rose-400 border-rose-500/30", icon: ShieldX },
  CONNECTED:  { color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  DEGRADED:   { color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: ShieldAlert },
  OFFLINE:    { color: "bg-slate-600/15 text-slate-300 border-slate-500/40", icon: XCircle },
  UNKNOWN:    { color: "bg-slate-500/15 text-slate-300 border-slate-500/30", icon: Clock },
};

const sizeMap = {
  xs: "text-[10px] px-1.5 py-0.5 gap-1",
  sm: "text-[10px] px-2 py-0.5 gap-1",
  md: "text-xs px-2.5 py-1 gap-1.5",
};

// Plain-language explanations shown as the native tooltip on the badge.
// Keys are lower-cased, trimmed status strings (underscores -> spaces).
const statusTips: Record<string, string> = {
  // Domain-specific labels reported by the Plerdy UX audit
  "sha-3 valid": "content hash matches the anchored ledger value",
  "sha3 valid": "content hash matches the anchored ledger value",
  "ready for sign-off": "awaiting radiologist sign-off",
  "ready for signoff": "awaiting radiologist sign-off",
  "suspected tampering": "integrity check flagged this study",
  "tamper flagged": "study is quarantined pending forensic review",
  "trust index": "composite confidence score (0-100)",
  "twin anchor id": "blockchain anchor reference for this study",
  "integrity status": "cryptographic verification state",
  // Shared StatusType values
  verified: "cryptographic verification passed",
  valid: "content hash matches the anchored ledger value",
  tampered: "content hash does not match the anchored ledger value",
  quarantined: "isolated from clinical use pending forensic review",
  recovered: "integrity restored from a verified backup",
  analyzing: "integrity verification is in progress",
  processing: "study is being processed",
  failed: "verification could not be completed",
  pending: "waiting for verification to start",
  active: "currently active",
  revoked: "access credential has been revoked",
  expired: "credential or consent has expired",
  secure: "no integrity issues detected",
  clean: "no tampering detected",
  warning: "integrity check raised a warning",
  critical: "critical integrity issue detected",
  connected: "service is reachable",
  degraded: "reachable but running with reduced performance",
  offline: "service is unreachable",
  unknown: "status could not be determined",
};

const formatBadgeTitle = (raw: unknown): string => {
  const label =
    typeof raw === "string" ? raw.trim().replace(/_/g, " ").replace(/\s+/g, " ") : "";
  if (!label) return "Unknown: status could not be determined";
  const explanation = statusTips[label.toLowerCase()];
  if (explanation) return `${label}: ${explanation}`;
  // Fallback: humanized status itself (no invented wording)
  return label.charAt(0).toUpperCase() + label.slice(1);
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
  const badgeTitle = formatBadgeTitle(status);

  return (
    <span
      title={badgeTitle}
      className={`inline-flex items-center font-bold uppercase tracking-wider rounded-full border ${config.color} ${sizeMap[size]} ${pulse ? "animate-pulse" : ""}`}
    >
      {showIcon && (
        <Icon className={`${iconSizeMap[size]} ${isSpinning ? "animate-spin" : ""} flex-shrink-0`} />
      )}
      {status}
    </span>
  );
}
