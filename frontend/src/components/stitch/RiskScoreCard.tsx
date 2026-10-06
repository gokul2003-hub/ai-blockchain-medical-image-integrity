import React from "react";

interface RiskScoreCardProps {
  score: number | null | undefined;
  riskLevel?: string;
  tamperConfidence?: number;
  anomalyDetected?: boolean;
  className?: string;
}

export const RiskScoreCard: React.FC<RiskScoreCardProps> = ({
  score,
  riskLevel,
  tamperConfidence,
  anomalyDetected,
  className = "",
}) => {
  const displayScore = score !== undefined && score !== null ? Math.round(score) : null;
  const isHighRisk = (displayScore !== null && displayScore >= 70) || anomalyDetected;
  const isMedRisk = displayScore !== null && displayScore >= 35 && displayScore < 70;

  const colorClass = isHighRisk
    ? "text-error"
    : isMedRisk
    ? "text-amber-600"
    : "text-secondary";

  const barColor = isHighRisk
    ? "bg-error"
    : isMedRisk
    ? "bg-amber-500"
    : "bg-secondary";

  return (
    <div
      className={`bg-surface-container-lowest rounded-xl p-space-md border border-surface-container-high/60 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-semibold">
          AI Tamper Risk Score
        </span>
        <span
          className={`px-2 py-0.5 rounded font-label-sm text-[11px] font-semibold ${
            isHighRisk
              ? "bg-error-container text-on-error-container"
              : isMedRisk
              ? "bg-amber-100 text-amber-900"
              : "bg-secondary-fixed text-on-secondary-fixed"
          }`}
        >
          {riskLevel || (isHighRisk ? "CRITICAL RISK" : isMedRisk ? "MODERATE" : "MINIMAL RISK")}
        </span>
      </div>

      <div className="flex items-baseline gap-2 my-2">
        <span className={`font-display-lg text-4xl font-bold ${colorClass}`}>
          {displayScore !== null ? `${displayScore}/100` : "N/A"}
        </span>
        <span className="font-body-sm text-xs text-on-surface-variant">
          {displayScore === null
            ? "No risk assessment yet"
            : isHighRisk
            ? "Adversarial Inpainting Likely"
            : "Integrity Threshold Passed"}
        </span>
      </div>

      {displayScore !== null && (
        <div className="w-full h-2 rounded-full bg-surface-container my-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${Math.min(100, Math.max(0, displayScore))}%` }}
          />
        </div>
      )}

      {tamperConfidence !== undefined && (
        <div className="flex justify-between items-center text-xs text-on-surface-variant pt-2 border-t border-surface-container-low font-code-sm">
          <span>Neural Confidence</span>
          <span className="font-semibold text-on-surface">
            {(tamperConfidence * 100).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
};
export default RiskScoreCard;
