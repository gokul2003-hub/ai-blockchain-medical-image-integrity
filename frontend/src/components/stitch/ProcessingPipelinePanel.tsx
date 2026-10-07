import React, { useMemo } from "react";

/**
 * Live async security-processing panel.
 *
 * Every value shown here comes from GET /api/images/{id}/processing-status.
 * `progress` is a PIPELINE-STAGE position (the backend labels it
 * `progress_basis: "pipeline_stage"`), never a measured execution
 * percentage and never a client-side timer.
 */

export interface ProcessingJob {
  image_id: number;
  job_id: string | null;
  status: string;
  progress: number;
  progress_basis?: string;
  stages: string[];
  started_at?: string | null;
  completed_at?: string | null;
  error?: string | null;
  tamper_percentage?: number | null;
  confidence_score?: number | null;
  risk_score?: number | null;
  trust_score?: number | null;
}

const TERMINAL = ["COMPLETED", "FAILED", "NOT_QUEUED"];

/** Short, clinician-facing label for each real backend stage. */
const STAGE_LABEL: Record<string, string> = {
  QUEUED: "Upload accepted / queued",
  PREPROCESSING: "Preprocessing",
  ENCRYPTING: "4D Chen encryption (AES-256-GCM)",
  HASHING: "SHA-3 integrity hashing",
  DIT_CREATING: "Digital Integrity Twin",
  STORING: "Secure storage",
  BLOCKCHAIN_RECORDING: "Blockchain audit ledger",
  AI_QUEUED: "Queued for AI forensics",
  AI_PROCESSING: "AI forensics (SRM + Hybrid Swin-UNet)",
  FORENSIC_ANALYSIS: "Forensic localization + Grad-CAM",
  RISK_ASSESSMENT: "Risk & trust assessment",
  COMPLETED: "Completed",
};

interface Props {
  job: ProcessingJob;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export const ProcessingPipelinePanel: React.FC<Props> = ({ job, onRetry, onDismiss }) => {
  const stages = job.stages?.length ? job.stages : Object.keys(STAGE_LABEL);
  const currentIdx = useMemo(() => stages.indexOf(job.status), [stages, job.status]);
  const failed = job.status === "FAILED";
  const done = job.status === "COMPLETED";

  return (
    <div className="rounded-xl border border-primary/30 bg-surface-container-lowest p-4 space-y-3 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`material-symbols-outlined text-[20px] ${
              failed ? "text-error" : done ? "text-tertiary" : "text-primary"
            }`}
          >
            {failed ? "error" : done ? "verified" : "pending"}
          </span>
          <div>
            <p className="font-label-lg text-on-surface">Medical study imported</p>
            <p className="font-label-sm text-on-surface-variant">
              Image #{job.image_id}
              {job.job_id ? ` · Job ${String(job.job_id).slice(0, 8)}` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 rounded-full font-label-sm border ${
              failed
                ? "text-error border-error/40 bg-error/10"
                : done
                ? "text-tertiary border-tertiary/40 bg-tertiary/10"
                : "text-primary border-primary/40 bg-primary/10"
            }`}
          >
            {job.status}
          </span>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="text-on-surface-variant hover:text-on-surface"
              aria-label="Dismiss processing panel"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Stage-based progress - explicitly not a measured percentage. */}
      <div>
        <div className="flex items-center justify-between font-label-sm text-on-surface-variant mb-1">
          <span>
            Pipeline stage {Math.max(currentIdx + 1, 1)} of {stages.length}
          </span>
          <span>
            {job.progress}% of pipeline stages
            {job.progress_basis === "pipeline_stage" ? " (stage-based)" : ""}
          </span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-surface-container-high overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              failed ? "bg-error" : done ? "bg-tertiary" : "bg-primary"
            }`}
            style={{ width: `${Math.min(100, Math.max(0, job.progress))}%` }}
          />
        </div>
      </div>

      {/* Real backend stages - never client-side simulated. */}
      <ol className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {stages.map((stage, i) => {
          const complete = currentIdx > i || done;
          const current = currentIdx === i && !done && !failed;
          return (
            <li
              key={stage}
              className={`flex items-center gap-2 font-label-sm px-2 py-1 rounded-lg border ${
                current
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : complete
                  ? "border-tertiary/25 bg-tertiary/5 text-on-surface"
                  : "border-outline/20 text-on-surface-variant/60"
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">
                {complete ? "check_circle" : current ? "pending" : "radio_button_unchecked"}
              </span>
              <span className="truncate">{STAGE_LABEL[stage] ?? stage}</span>
            </li>
          );
        })}
      </ol>

      {job.error && (
        <p className="font-label-sm text-error bg-error/10 border border-error/30 rounded-lg p-2">
          {job.error}
        </p>
      )}

      {(job as any).lastError && !job.error && (
        <p className="font-label-sm text-on-surface-variant bg-surface-container-low border border-outline/25 rounded-lg p-2">
          Status refresh failed: {(job as any).lastError} — retrying automatically. The stage shown
          below is the last state the backend reported.
        </p>
      )}

      {done && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: "Tampered pixels", value: job.tamper_percentage, suffix: "%" },
            { label: "AI confidence", value: job.confidence_score, suffix: "" },
            { label: "Risk score", value: job.risk_score, suffix: "" },
            { label: "Trust score", value: job.trust_score, suffix: "" },
          ].map((m) => (
            <div key={m.label} className="bg-surface-container-low rounded-lg p-2">
              <p className="font-label-sm text-on-surface-variant">{m.label}</p>
              <p className="font-label-lg text-on-surface font-mono">
                {m.value == null ? "N/A" : `${m.value}${m.suffix}`}
              </p>
            </div>
          ))}
        </div>
      )}

      {failed && (
        <div className="flex items-center justify-between gap-2 bg-surface-container-low rounded-lg p-2">
          <p className="font-label-sm text-on-surface-variant">
            Upload and integrity registration succeeded; forensic analysis failed. This study is
            not marked verified.
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="shrink-0 px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-md hover:opacity-90"
            >
              Retry Analysis
            </button>
          )}
        </div>
      )}

      {!done && !failed && (
        <p className="font-label-sm text-on-surface-variant">
          Status {job.status === "QUEUED" ? "queued" : "in progress"} — you can keep working; this
          panel updates automatically.
        </p>
      )}
    </div>
  );
};

export { TERMINAL };