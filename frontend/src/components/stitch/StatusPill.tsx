import React from "react";

export type StatusPillVariant =
  | "verified"
  | "tampered"
  | "pending"
  | "warning"
  | "neural"
  | "neutral";

interface StatusPillProps {
  variant?: StatusPillVariant;
  label: string;
  count?: number | string;
  icon?: string;
  pulse?: boolean;
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({
  variant = "neutral",
  label,
  count,
  icon,
  pulse = false,
  className = "",
}) => {
  const getStyles = () => {
    switch (variant) {
      case "verified":
        return {
          container: "bg-secondary-fixed text-on-secondary-fixed",
          dot: "bg-secondary",
          iconColor: "text-secondary",
        };
      case "tampered":
        return {
          container: "bg-error-container text-on-error-container",
          dot: "bg-error",
          iconColor: "text-error",
        };
      case "warning":
        return {
          container: "bg-amber-100 text-amber-900 border border-amber-300",
          dot: "bg-amber-600",
          iconColor: "text-amber-700",
        };
      case "neural":
        return {
          container: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
          dot: "bg-tertiary",
          iconColor: "text-tertiary",
        };
      case "pending":
        return {
          container: "bg-surface-container text-on-surface-variant",
          dot: "bg-primary",
          iconColor: "text-primary",
        };
      default:
        return {
          container: "bg-surface-container text-on-surface",
          dot: "bg-outline",
          iconColor: "text-outline",
        };
    }
  };

  const styles = getStyles();

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-label-sm text-xs font-semibold tracking-wide ${styles.container} ${className}`}
    >
      {pulse ? (
        <span className="relative flex h-2 w-2">
          <span
            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${styles.dot}`}
          />
          <span
            className={`relative inline-flex rounded-full h-2 w-2 ${styles.dot}`}
          />
        </span>
      ) : icon ? (
        <span
          className={`material-symbols-outlined text-[14px] ${styles.iconColor}`}
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          {icon}
        </span>
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
      )}
      <span>{label}</span>
      {count !== undefined && (
        <span className="ml-0.5 px-1 py-0.2 rounded font-code-sm text-[10px] bg-black/10">
          {count}
        </span>
      )}
    </span>
  );
};
export default StatusPill;
