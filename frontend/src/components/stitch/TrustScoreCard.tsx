import React from "react";

interface TrustScoreCardProps {
  score: number | null | undefined;
  nodeHealth?: string;
  chainSynced?: boolean;
  className?: string;
}

export const TrustScoreCard: React.FC<TrustScoreCardProps> = ({
  score,
  nodeHealth = "100%",
  chainSynced = true,
  className = "",
}) => {
  const displayScore = score !== undefined && score !== null ? Math.round(score) : null;
  const hasScore = displayScore !== null;
  const isHealthy = hasScore && (displayScore as number) >= 80;

  return (
    <div
      className={`bg-surface-container-lowest rounded-xl p-space-md border border-surface-container-high/60 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-label-sm text-label-sm uppercase tracking-wider text-outline font-semibold">
          Cybersecurity Trust Index
        </span>
        <span
          className={`px-2 py-0.5 rounded font-label-sm text-[11px] font-semibold flex items-center gap-1 ${
            !hasScore
              ? "bg-surface-container text-on-surface-variant"
              : isHealthy
              ? "bg-secondary-fixed text-on-secondary-fixed"
              : "bg-error-container text-on-error-container"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              !hasScore ? "bg-outline" : isHealthy ? "bg-secondary" : "bg-error"
            }`}
          />
          {!hasScore ? "Awaiting Assessment" : chainSynced ? "Consensus Validated" : "Sync Required"}
        </span>
      </div>

      <div className="flex items-baseline gap-2 my-2">
        <span className="font-display-lg text-4xl font-bold text-secondary">
          {hasScore ? `${displayScore}%` : "N/A"}
        </span>
        <span className="font-body-sm text-xs text-on-surface-variant">
          {hasScore ? "Dual-Ledger Cryptographic Anchor" : "No trust assessment yet"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-surface-container-low text-xs">
        <div className="flex flex-col">
          <span className="text-outline uppercase text-[10px] tracking-wider">
            Consensus Node Health
          </span>
          <span className="font-code-sm font-semibold text-on-surface">
            {nodeHealth} Strict PBFT
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-outline uppercase text-[10px] tracking-wider">
            Hash Standard
          </span>
          <span className="font-code-sm font-semibold text-on-surface">
            SHA3-512 + IPFS
          </span>
        </div>
      </div>
    </div>
  );
};
export default TrustScoreCard;
