import React from "react";

export const LoadingState: React.FC<{ message?: string; heightClass?: string }> = ({
  message = "Loading verified clinical records...",
  heightClass = "py-16",
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center ${heightClass} text-center space-y-3 bg-surface-container-lowest/60 rounded-xl border border-surface-container-high/40`}
    >
      <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin flex items-center justify-center">
        <span className="material-symbols-outlined text-primary text-sm opacity-50">
          progress_activity
        </span>
      </div>
      <p className="font-body-md text-sm text-on-surface-variant font-medium">
        {message}
      </p>
      <span className="font-label-sm text-xs text-outline uppercase tracking-wider">
        Cryptographic Channel Active
      </span>
    </div>
  );
};

export const EmptyState: React.FC<{
  icon?: string;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}> = ({
  icon = "inbox",
  title,
  description,
  actionText,
  onAction,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center py-12 px-6 text-center space-y-3 bg-surface-container-lowest rounded-xl border border-surface-container-high/60 ${className}`}
    >
      <div className="w-12 h-12 rounded-xl bg-surface-container-low flex items-center justify-center text-outline">
        <span className="material-symbols-outlined text-2xl">{icon}</span>
      </div>
      <h3 className="font-headline-sm text-base font-semibold text-on-surface">
        {title}
      </h3>
      <p className="font-body-sm text-xs text-on-surface-variant max-w-md">
        {description}
      </p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="mt-2 px-4 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-xs hover:bg-primary-container transition-colors shadow-sm"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};

export const ErrorState: React.FC<{
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}> = ({
  title = "Telemetry Error",
  message,
  onRetry,
  className = "",
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center py-10 px-6 text-center space-y-3 bg-error-container/20 rounded-xl border border-error-container ${className}`}
    >
      <div className="w-10 h-10 rounded-full bg-error-container text-error flex items-center justify-center">
        <span className="material-symbols-outlined text-xl">error</span>
      </div>
      <div className="space-y-1">
        <h4 className="font-headline-sm text-sm font-semibold text-on-surface">
          {title}
        </h4>
        <p className="font-body-sm text-xs text-on-surface-variant max-w-md break-words">
          {message}
        </p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-3 py-1 rounded bg-surface-container text-primary font-label-sm text-xs hover:bg-surface-container-high transition-colors flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-sm">refresh</span>
          <span>Retry Operation</span>
        </button>
      )}
    </div>
  );
};
