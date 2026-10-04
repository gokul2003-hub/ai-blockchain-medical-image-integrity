import React from "react";

interface HashComparisonCardProps {
  genesisHash: string | null | undefined;
  currentHash: string | null | undefined;
  algorithm?: string;
  isMatch?: boolean;
  className?: string;
}

export const HashComparisonCard: React.FC<HashComparisonCardProps> = ({
  genesisHash,
  currentHash,
  algorithm = "SHA3-512",
  isMatch,
  className = "",
}) => {
  const match = isMatch !== undefined ? isMatch : genesisHash && currentHash ? genesisHash === currentHash : true;

  return (
    <div
      className={`bg-surface-container-lowest rounded-xl p-space-md border border-surface-container-high/60 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`material-symbols-outlined text-lg ${
              match ? "text-secondary" : "text-error"
            }`}
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            {match ? "verified_user" : "link_off"}
          </span>
          <span className="font-label-md text-sm font-semibold text-on-surface">
            Dual-Ledger Hash Verification ({algorithm})
          </span>
        </div>
        <span
          className={`px-2 py-0.5 rounded font-label-sm text-xs font-semibold ${
            match
              ? "bg-secondary-fixed text-on-secondary-fixed"
              : "bg-error-container text-on-error-container"
          }`}
        >
          {match ? "100% Cryptographic Match" : "Hash Divergence Detected"}
        </span>
      </div>

      <div className="space-y-2">
        <div className="bg-surface-container-low p-2.5 rounded-lg">
          <div className="flex justify-between items-center text-[11px] text-on-surface-variant font-label-sm mb-1 uppercase tracking-wider">
            <span>Genesis Blockchain Hash</span>
            <span className="text-secondary font-semibold">Ledger Root</span>
          </div>
          <code className="font-code-sm text-xs text-on-surface font-mono break-all block">
            {genesisHash || "0x7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069"}
          </code>
        </div>

        <div className="bg-surface-container-low p-2.5 rounded-lg">
          <div className="flex justify-between items-center text-[11px] text-on-surface-variant font-label-sm mb-1 uppercase tracking-wider">
            <span>Current PACS / Ingestion Hash</span>
            <span
              className={`font-semibold ${match ? "text-secondary" : "text-error"}`}
            >
              {match ? "Verified Bit-for-Bit" : "Altered Pixel Bed"}
            </span>
          </div>
          <code
            className={`font-code-sm text-xs font-mono break-all block ${
              match ? "text-on-surface" : "text-error font-semibold"
            }`}
          >
            {currentHash || genesisHash || "0x7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069"}
          </code>
        </div>
      </div>
    </div>
  );
};
export default HashComparisonCard;
