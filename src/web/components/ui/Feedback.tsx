import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, WifiOff, RefreshCw } from 'lucide-react';
import { Button } from './Button';

// --- INLINE ALERT ---

export interface InlineAlertProps {
  variant?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  children: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const InlineAlert: React.FC<InlineAlertProps> = ({
  variant = 'info',
  title,
  children,
  action,
  className = '',
}) => {
  const config = {
    info: {
      bg: 'bg-info-tint/60 border-info/30',
      text: 'text-info',
      icon: <Info className="w-5 h-5 text-info shrink-0" />,
    },
    success: {
      bg: 'bg-success-tint/60 border-success/30',
      text: 'text-success',
      icon: <CheckCircle2 className="w-5 h-5 text-success shrink-0" />,
    },
    warning: {
      bg: 'bg-warning-tint/70 border-warning/30',
      text: 'text-warning',
      icon: <AlertTriangle className="w-5 h-5 text-warning shrink-0" />,
    },
    danger: {
      bg: 'bg-danger-tint/60 border-danger/30',
      text: 'text-danger',
      icon: <AlertCircle className="w-5 h-5 text-danger shrink-0" />,
    },
  }[variant];

  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-3 p-4 rounded-card border ${config.bg} ${className}`}
    >
      {config.icon}
      <div className="flex-1 text-sm">
        {title && <h3 className={`font-semibold ${config.text} mb-0.5`}>{title}</h3>}
        <div className="text-ink leading-relaxed text-xs sm:text-sm">{children}</div>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className={`text-xs font-bold underline hover:opacity-80 shrink-0 ${config.text}`}
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

// --- EMPTY STATE ---

export interface EmptyStateProps {
  title: string;
  reason: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  reason,
  action,
  icon,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 bg-card rounded-card border border-border/80 shadow-subtle ${className}`}
    >
      {icon ? (
        <div className="p-3 mb-4 rounded-full bg-surface text-ink-muted">{icon}</div>
      ) : (
        <div className="p-3 mb-4 rounded-full bg-accent-tint text-accent">
          <Info className="w-6 h-6" />
        </div>
      )}
      <h3 className="font-display text-lg font-semibold text-ink mb-1">{title}</h3>
      <p className="text-sm text-ink-muted max-w-sm mb-6 leading-relaxed">{reason}</p>
      {action && (
        <Button variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
};

// --- ERROR STATE WITH RETRY ---

export interface ErrorStateProps {
  title?: string;
  reason: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Unable to Load Content',
  reason,
  onRetry,
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={`flex flex-col items-center justify-center text-center p-8 bg-card rounded-card border border-danger/20 shadow-subtle ${className}`}
    >
      <div className="p-3 mb-4 rounded-full bg-danger-tint text-danger">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h3 className="font-display text-lg font-semibold text-ink mb-1">{title}</h3>
      <p className="text-sm text-ink-muted max-w-sm mb-6 leading-relaxed">{reason}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} leftIcon={<RefreshCw className="w-4 h-4" />}>
          Try Again
        </Button>
      )}
    </div>
  );
};

// --- SKELETON LOADERS ---

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <div
      className={`bg-border/60 rounded animate-pulse motion-reduce:animate-none ${className}`}
      aria-hidden="true"
    />
  );
};

export const SkeletonCard: React.FC = () => {
  return (
    <div className="p-5 bg-card rounded-card border border-border shadow-subtle flex flex-col gap-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
};

export const SkeletonList: React.FC<{ rows?: number }> = ({ rows = 4 }) => {
  return (
    <div className="flex flex-col gap-2.5">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-between p-4 bg-card rounded-control border border-border"
        >
          <div className="flex items-center gap-3 w-full">
            <Skeleton className="w-10 h-10 rounded-full shrink-0" />
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-8 w-20 rounded-control shrink-0" />
        </div>
      ))}
    </div>
  );
};

// --- OFFLINE BANNER ---

export const OfflineBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      className="bg-ink text-white px-4 py-2.5 flex items-center justify-center gap-2 text-xs font-semibold select-none sticky top-0 z-50 shadow-md"
    >
      <WifiOff className="w-4 h-4 text-warning" />
      <span>Working Offline — reconnecting when internet is available</span>
    </div>
  );
};

// --- TOAST NOTIFICATIONS ---

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'warning' | 'danger';
  message: string;
}

export const Toast: React.FC<{
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none p-4 safe-bottom">
      {toasts.map((toast) => {
        const isError = toast.type === 'danger';
        return (
          <div
            key={toast.id}
            role={isError ? 'alert' : 'status'}
            className="pointer-events-auto bg-card border border-border shadow-overlay rounded-control p-4 flex items-center justify-between gap-3 text-sm text-ink animate-in fade-in slide-in-from-bottom-2 duration-150"
          >
            <span className="leading-snug">{toast.message}</span>
            <button
              onClick={() => onDismiss(toast.id)}
              className="text-xs font-bold text-ink-muted hover:text-ink shrink-0 p-1"
            >
              Dismiss
            </button>
          </div>
        );
      })}
    </div>
  );
};
