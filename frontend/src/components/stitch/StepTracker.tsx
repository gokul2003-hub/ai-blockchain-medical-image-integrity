import React from "react";

export interface StepItem {
  number: string | number;
  title: string;
  description: string;
  status: "complete" | "current" | "upcoming";
}

interface StepTrackerProps {
  steps: StepItem[];
  title?: string;
  stageBadge?: string;
  className?: string;
}

export const StepTracker: React.FC<StepTrackerProps> = ({
  steps,
  title = "Automated Neural Restoration Pipeline",
  stageBadge,
  className = "",
}) => {
  return (
    <div
      className={`bg-surface-container-lowest rounded-xl p-space-lg border border-surface-container-high/60 shadow-sm ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-space-md border-b border-surface-container-low mb-space-md">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-primary">
            route
          </span>
          <span className="font-headline-sm text-base font-semibold text-on-surface">
            {title}
          </span>
        </div>
        {stageBadge && (
          <span className="font-label-sm text-xs text-secondary font-semibold uppercase tracking-wider bg-secondary-fixed/50 px-3 py-1 rounded-full">
            {stageBadge}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {steps.map((step, idx) => {
          const isComplete = step.status === "complete";
          const isCurrent = step.status === "current";

          return (
            <div
              key={idx}
              className={`flex flex-col p-3 rounded-lg transition-all border ${
                isCurrent
                  ? "bg-surface-container-lowest border-primary shadow-sm ring-1 ring-primary/30"
                  : isComplete
                  ? "bg-surface-container-low/80 border-surface-container"
                  : "bg-surface-container-low/40 border-transparent opacity-60"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className={`font-label-sm font-code-sm text-xs font-bold ${
                    isCurrent ? "text-primary" : "text-outline"
                  }`}
                >
                  {step.number}
                </span>
                {isComplete ? (
                  <span
                    className="material-symbols-outlined text-[18px] text-secondary"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    check_circle
                  </span>
                ) : isCurrent ? (
                  <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-outline-variant" />
                )}
              </div>
              <span className="font-label-md text-xs font-semibold text-on-surface line-clamp-1">
                {step.title}
              </span>
              <span className="font-body-sm text-[11px] text-on-surface-variant mt-1 line-clamp-2">
                {step.description}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default StepTracker;
