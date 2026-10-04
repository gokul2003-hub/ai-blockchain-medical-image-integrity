import React from "react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  unit?: string;
  icon: string;
  iconBgClass?: string;
  iconColorClass?: string;
  valueColorClass?: string;
  footerText?: string;
  footerBadgeText?: string;
  footerBadgeClass?: string;
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  unit,
  icon,
  iconBgClass = "bg-surface-container-low text-primary",
  iconColorClass,
  valueColorClass = "text-on-surface",
  footerText,
  footerBadgeText,
  footerBadgeClass = "bg-surface-container text-on-surface font-semibold",
  className = "",
}) => {
  return (
    <div
      className={`bg-surface-container-lowest rounded-xl p-space-lg shadow-sm hover:shadow-md transition-shadow relative overflow-hidden flex flex-col justify-between border border-surface-container-high/60 ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline block">
            {title}
          </span>
          <div className="flex items-baseline gap-1.5 pt-1">
            <span
              className={`font-display-lg text-3xl md:text-4xl tracking-tight font-semibold ${valueColorClass}`}
            >
              {value}
            </span>
            {unit && (
              <span className="font-body-sm text-body-sm text-on-surface-variant font-normal">
                {unit}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="font-body-sm text-xs text-on-surface-variant pt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBgClass} ${iconColorClass || ""}`}
        >
          <span className="material-symbols-outlined text-[22px]">{icon}</span>
        </div>
      </div>

      {(footerText || footerBadgeText) && (
        <div className="pt-3 mt-3 border-t border-surface-container-low flex items-center justify-between gap-2 text-xs">
          {footerText && (
            <span className="font-body-sm text-on-surface-variant truncate">
              {footerText}
            </span>
          )}
          {footerBadgeText && (
            <span
              className={`px-2 py-0.5 rounded font-label-sm text-[11px] shrink-0 ${footerBadgeClass}`}
            >
              {footerBadgeText}
            </span>
          )}
        </div>
      )}
    </div>
  );
};
export default MetricCard;
