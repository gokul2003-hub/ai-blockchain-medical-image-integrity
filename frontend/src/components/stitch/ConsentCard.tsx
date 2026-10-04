import React from "react";

export interface ConsentItem {
  id: number;
  patient_id?: number;
  recipient_user_id?: number;
  image_id?: number | null;
  grantee_id?: number;
  grantee_name?: string;
  doctor_name?: string;
  doctor_id?: number;
  hospital_name?: string;
  action?: string;
  actions?: string[];
  permissions?: string[];
  purpose?: string;
  starts_at?: string;
  expires_at?: string | null;
  revoked_at?: string | null;
  created_at?: string;
  is_active?: boolean;
}

interface ConsentCardProps {
  consent: ConsentItem;
  onRevoke?: (id: number) => void;
  canRevoke?: boolean;
  className?: string;
}

export const ConsentCard: React.FC<ConsentCardProps> = ({
  consent,
  onRevoke,
  canRevoke = true,
  className = "",
}) => {
  const doctorName =
    consent.doctor_name || consent.grantee_name || `Medical Practitioner #${consent.recipient_user_id || consent.grantee_id || consent.doctor_id || "Unspecified"}`;
  const hospital = consent.hospital_name || "Authorized Healthcare Node";
  const action = Array.isArray(consent.actions)
    ? consent.actions.join(", ")
    : consent.action || "DIAGNOSTIC_REVIEW";
  // Real grant lifecycle: revoked_at set or expiry passed = not active
  const isActive =
    consent.is_active !== undefined
      ? consent.is_active !== false
      : !consent.revoked_at &&
        (!consent.expires_at || new Date(consent.expires_at).getTime() > Date.now());

  return (
    <div
      className={`bg-surface-container-lowest rounded-xl p-space-md border border-surface-container-high/60 shadow-sm flex flex-col justify-between gap-3 ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-xs shrink-0">
            {doctorName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0">
            <h4 className="font-headline-sm text-sm font-semibold text-on-surface truncate">
              {doctorName}
            </h4>
            <span className="font-body-sm text-[11px] text-on-surface-variant truncate block">
              {hospital}
            </span>
          </div>
        </div>

        <span
          className={`px-2 py-0.5 rounded-full font-label-sm text-[10px] font-semibold shrink-0 ${
            isActive
              ? "bg-secondary-fixed text-on-secondary-fixed"
              : "bg-surface-container text-outline"
          }`}
        >
          {isActive ? "Active Grant" : "Revoked"}
        </span>
      </div>

      <div className="space-y-1.5 text-xs text-on-surface-variant bg-surface-container-low p-2.5 rounded-lg">
        <div className="flex justify-between items-center">
          <span className="text-outline uppercase text-[10px] font-label-sm">
            Authorized Scope
          </span>
          <span className="font-code-sm font-semibold text-primary">
            {action}
          </span>
        </div>
        {consent.purpose && (
          <div className="flex justify-between items-center">
            <span className="text-outline uppercase text-[10px] font-label-sm">
              Clinical Purpose
            </span>
            <span className="truncate max-w-[180px] text-right font-medium text-on-surface">
              {consent.purpose}
            </span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-outline uppercase text-[10px] font-label-sm">
            Expires
          </span>
          <span className="text-on-surface">
            {consent.expires_at
              ? new Date(consent.expires_at).toLocaleDateString()
              : "Indefinite (Until Revoked)"}
          </span>
        </div>
      </div>

      {canRevoke && onRevoke && consent.is_active !== false && (
        <div className="pt-2 border-t border-surface-container-low flex justify-end">
          <button
            onClick={() => onRevoke(consent.id)}
            className="px-3 py-1 rounded bg-error-container text-on-error-container hover:bg-error hover:text-on-error transition-colors font-label-sm text-xs font-semibold flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">lock_reset</span>
            <span>Revoke Access</span>
          </button>
        </div>
      )}
    </div>
  );
};
export default ConsentCard;
