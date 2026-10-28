import React from 'react';
import { BookingStatus, NotificationJobStatus } from '../../../shared/statusEnums';

export type BadgeStatus = BookingStatus | NotificationJobStatus | 'demo';

export interface StatusBadgeProps {
  status: BadgeStatus;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  label,
  size = 'md',
  className = '',
}) => {
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
  }[size];

  // Map each status to high-contrast WCAG AA compliant colors
  const statusConfig: Record<string, { bg: string; text: string; dot: string; defaultLabel: string }> = {
    // Booking Statuses
    pending: {
      bg: 'bg-warning-tint',
      text: 'text-warning',
      dot: 'bg-warning',
      defaultLabel: 'Pending Approval',
    },
    confirmed: {
      bg: 'bg-accent-tint',
      text: 'text-accent',
      dot: 'bg-accent',
      defaultLabel: 'Confirmed',
    },
    completed: {
      bg: 'bg-success-tint',
      text: 'text-success',
      dot: 'bg-success',
      defaultLabel: 'Completed',
    },
    cancelled: {
      bg: 'bg-danger-tint',
      text: 'text-danger',
      dot: 'bg-danger',
      defaultLabel: 'Cancelled',
    },
    no_show: {
      bg: 'bg-surface border border-border',
      text: 'text-ink-muted',
      dot: 'bg-ink-muted',
      defaultLabel: 'No Show',
    },

    // Notification Statuses
    queued: {
      bg: 'bg-info-tint',
      text: 'text-info',
      dot: 'bg-info',
      defaultLabel: 'Queued',
    },
    sending: {
      bg: 'bg-info-tint',
      text: 'text-info',
      dot: 'bg-info animate-pulse',
      defaultLabel: 'Sending',
    },
    accepted: {
      bg: 'bg-success-tint',
      text: 'text-success',
      dot: 'bg-success',
      defaultLabel: 'Accepted',
    },
    delivered: {
      bg: 'bg-success-tint',
      text: 'text-success',
      dot: 'bg-success',
      defaultLabel: 'Delivered',
    },
    simulated: {
      bg: 'bg-accent-tint border border-accent/20',
      text: 'text-accent',
      dot: 'bg-accent',
      defaultLabel: 'Simulated Sandbox',
    },
    retry_scheduled: {
      bg: 'bg-warning-tint',
      text: 'text-warning',
      dot: 'bg-warning',
      defaultLabel: 'Retrying',
    },
    failed: {
      bg: 'bg-danger-tint',
      text: 'text-danger',
      dot: 'bg-danger',
      defaultLabel: 'Failed',
    },
    permanently_failed: {
      bg: 'bg-danger-tint border border-danger/30',
      text: 'text-danger',
      dot: 'bg-danger',
      defaultLabel: 'Permanent Failure',
    },
    skipped_late: {
      bg: 'bg-surface border border-border',
      text: 'text-ink-muted',
      dot: 'bg-ink-muted',
      defaultLabel: 'Skipped (Late)',
    },
    skipped_quiet_hours: {
      bg: 'bg-surface border border-border',
      text: 'text-ink-muted',
      dot: 'bg-ink-muted',
      defaultLabel: 'Quiet Hours Shift',
    },
    skipped_no_channel: {
      bg: 'bg-surface border border-border',
      text: 'text-ink-muted',
      dot: 'bg-ink-muted',
      defaultLabel: 'No Channel',
    },
    skipped_consent: {
      bg: 'bg-surface border border-border',
      text: 'text-ink-muted',
      dot: 'bg-ink-muted',
      defaultLabel: 'No Consent',
    },
    superseded: {
      bg: 'bg-surface border border-border',
      text: 'text-ink-muted',
      dot: 'bg-ink-muted',
      defaultLabel: 'Superseded',
    },
    handled_manually: {
      bg: 'bg-accent-tint',
      text: 'text-accent',
      dot: 'bg-accent',
      defaultLabel: 'Handled via WhatsApp',
    },

    // Demo Mode
    demo: {
      bg: 'bg-warning-tint border border-warning/40',
      text: 'text-warning font-bold tracking-wide',
      dot: 'bg-warning',
      defaultLabel: 'DEMO MODE',
    },
  };

  const config = statusConfig[status] || {
    bg: 'bg-surface',
    text: 'text-ink-muted',
    dot: 'bg-ink-muted',
    defaultLabel: status,
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full select-none ${sizeStyles} ${config.bg} ${config.text} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dot}`} />
      <span>{label || config.defaultLabel}</span>
    </span>
  );
};

export const DemoBadge: React.FC<{ preset?: string }> = ({ preset = 'Salon Preset' }) => {
  return (
    <div
      role="status"
      className="inline-flex items-center gap-2 px-3 py-1 bg-warning-tint border border-warning/30 text-warning text-xs font-bold rounded-control select-none shadow-subtle"
    >
      <span className="w-2 h-2 rounded-full bg-warning animate-pulse" />
      <span>DEMO MODE — {preset.toUpperCase()}</span>
    </div>
  );
};
