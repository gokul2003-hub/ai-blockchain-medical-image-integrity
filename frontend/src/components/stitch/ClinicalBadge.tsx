import React from "react";

interface ClinicalBadgeProps {
  label: string;
  variant?: "primary" | "secondary" | "tertiary" | "error" | "neutral";
  icon?: string;
  className?: string;
}

export const ClinicalBadge: React.FC<ClinicalBadgeProps> = ({
  label,
  variant = "primary",
  icon,
  className = "",
}) => {
  const getStyles = () => {
    switch (variant) {
      case "secondary":
        return "bg-secondary-fixed text-on-secondary-fixed border border-secondary/20";
      case "tertiary":
        return "bg-tertiary-fixed text-on-tertiary-fixed-variant border border-tertiary/20";
      case "error":
        return "bg-error-container text-on-error-container border border-error/20";
      case "neutral":
        return "bg-surface-container text-on-surface-variant border border-outline/20";
      case "primary":
      default:
        return "bg-surface-container text-primary font-semibold border border-primary/20";
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-label-sm text-[11px] uppercase tracking-wider ${getStyles()} ${className}`}
    >
      {icon && (
        <span className="material-symbols-outlined text-[13px]">{icon}</span>
      )}
      <span>{label}</span>
    </span>
  );
};
export default ClinicalBadge;
