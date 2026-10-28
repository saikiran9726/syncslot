// SlotSync Owner Notifications & Reminders Operational Dashboard (E8, E8a, E9)
// Displays delivery mode banner (Real, Sandbox, or Dry-run), job timeline with honest status labels,
// manual retry for failures, and WhatsApp prefilled fallback links.

import React, { useState, useEffect } from 'react';
import {
  Bell,
  RefreshCw,
  AlertTriangle,
  RotateCcw,
  MessageCircle,
  Mail,
  Clock,
  CheckCircle,
  HelpCircle,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { NotificationJobStatus } from '../../shared/statusEnums';
import { utcToLocal } from '../../shared/availability';

interface NotificationJob {
  id: string;
  booking_id: string;
  booking_version: number;
  customer_id: string;
  channel: string;
  template_key: string;
  due_at_utc: string;
  status: NotificationJobStatus;
  attempt_count: number;
  next_attempt_at?: string;
  provider_message_id?: string;
  last_error_category?: string;
  created_at_utc: string;
  updated_at_utc: string;
  customer_name: string;
  customer_phone: string;
  normalized_phone?: string;
  customer_email?: string;
  booking_reference: string;
  appointment_start_at_utc: string;
}

export const NotificationsPage: React.FC = () => {
  const [jobs, setJobs] = useState<NotificationJob[]>([]);
  const [deliveryMode, setDeliveryMode] = useState<'real' | 'sandbox' | 'dry_run'>('dry_run');
  const [sandboxRecipient, setSandboxRecipient] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchJobs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const url = statusFilter === 'all'
        ? '/api/owner/notifications'
        : `/api/owner/notifications?status=${statusFilter}`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to load notifications.');
      }
      const data = (await res.json()) as any;
      setJobs(data.jobs || []);
      setDeliveryMode(data.delivery_mode || 'dry_run');
      setSandboxRecipient(data.sandbox_recipient || null);
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, [statusFilter]);

  const handleRetry = async (jobId: string) => {
    setRetryingId(jobId);
    try {
      const res = await fetch(`/api/owner/notifications/${jobId}/retry`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchJobs();
      }
    } catch (err) {
      console.error('Retry failed:', err);
    } finally {
      setRetryingId(null);
    }
  };

  /**
   * Exact required labels per Phase 7 specification:
   * - "Accepted by provider, delivery unconfirmed"
   * - "Dry-run (not sent)"
   * - "Skipped: <reason>"
   * - "Failed: <sanitized reason>"
   */
  const formatStatusDisplay = (job: NotificationJob): { label: string; badgeClass: string } => {
    switch (job.status) {
      case 'accepted':
        return {
          label: 'Accepted by provider, delivery unconfirmed',
          badgeClass: 'bg-accent-tint text-accent border-accent/30',
        };
      case 'simulated':
        return {
          label: 'Dry-run (not sent)',
          badgeClass: 'bg-surface text-ink-muted border-border',
        };
      case 'skipped_late':
        return {
          label: 'Skipped: Late (>15 min)',
          badgeClass: 'bg-warning-tint text-warning border-warning/30',
        };
      case 'skipped_quiet_hours':
        return {
          label: 'Skipped: Quiet Hours',
          badgeClass: 'bg-warning-tint text-warning border-warning/30',
        };
      case 'skipped_consent':
        return {
          label: 'Skipped: No Consent / Opted Out',
          badgeClass: 'bg-warning-tint text-warning border-warning/30',
        };
      case 'skipped_sandbox':
        return {
          label: 'Skipped: Sandbox Whitelist',
          badgeClass: 'bg-warning-tint text-warning border-warning/30',
        };
      case 'failed':
      case 'permanently_failed':
        return {
          label: `Failed: ${job.last_error_category || 'Delivery attempt failed'}`,
          badgeClass: 'bg-danger-tint text-danger border-danger/30',
        };
      case 'retry_scheduled':
        return {
          label: `Retry Scheduled (Attempt ${job.attempt_count}/3)`,
          badgeClass: 'bg-warning-tint text-warning border-warning/30',
        };
      case 'queued':
        return {
          label: 'Queued',
          badgeClass: 'bg-surface text-ink-muted border-border',
        };
      case 'sending':
        return {
          label: 'Sending',
          badgeClass: 'bg-accent-tint text-accent border-accent/30',
        };
      case 'superseded':
        return {
          label: 'Skipped: Booking Rescheduled',
          badgeClass: 'bg-surface text-ink-muted border-border',
        };
      case 'cancelled':
        return {
          label: 'Skipped: Booking Cancelled',
          badgeClass: 'bg-surface text-ink-muted border-border',
        };
      default:
        return {
          label: job.status,
          badgeClass: 'bg-surface text-ink-muted border-border',
        };
    }
  };

  const statusFilters = [
    { key: 'all', label: 'All Jobs' },
    { key: 'failed', label: 'Failed' },
    { key: 'accepted', label: 'Accepted by Provider' },
    { key: 'simulated', label: 'Dry-run' },
    { key: 'queued', label: 'Queued' },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-ink">Notifications & Reminders</h1>
          <p className="text-xs text-ink-muted mt-0.5">Automated booking notices, reminder queue, and delivery health</p>
        </div>

        <Button
          variant="secondary"
          size="sm"
          onClick={fetchJobs}
          isLoading={isLoading}
          title="Refresh Queue"
        >
          <RefreshCw className="w-4 h-4 mr-1.5" />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-danger-tint text-danger rounded-control text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Visible Delivery Mode Banner (E9) */}
      <div
        className={`p-4 rounded-card border shadow-subtle flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          deliveryMode === 'real'
            ? 'bg-success-tint/30 border-success/30'
            : deliveryMode === 'sandbox'
            ? 'bg-warning-tint/30 border-warning/30'
            : 'bg-surface border-border'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-3 h-3 rounded-full shrink-0 ${
              deliveryMode === 'real'
                ? 'bg-success animate-pulse'
                : deliveryMode === 'sandbox'
                ? 'bg-warning'
                : 'bg-ink-muted'
            }`}
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-ink uppercase tracking-wide">
                {deliveryMode === 'real'
                  ? 'Real Delivery Mode'
                  : deliveryMode === 'sandbox'
                  ? 'Sandbox Mode'
                  : 'Dry-run Mode'}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  deliveryMode === 'real'
                    ? 'bg-success-tint text-success border-success/30'
                    : deliveryMode === 'sandbox'
                    ? 'bg-warning-tint text-warning border-warning/30'
                    : 'bg-card text-ink-muted border-border'
                }`}
              >
                {deliveryMode === 'real'
                  ? 'Live Resend API'
                  : deliveryMode === 'sandbox'
                  ? 'Gated Whitelist'
                  : 'Simulation (No Real Emails Sent)'}
              </span>
            </div>
            <p className="text-xs text-ink-muted mt-0.5">
              {deliveryMode === 'real'
                ? 'Emails are securely dispatched via Resend API to real customer inboxes.'
                : deliveryMode === 'sandbox'
                ? `Emails are sent exclusively to sandbox recipient (${sandboxRecipient || 'not set'}). All other recipients are skipped.`
                : 'No RESEND_API_KEY detected. Notifications are honestly logged in local dry-run mode.'}
            </p>
          </div>
        </div>

        <a
          href="/app/settings"
          className="text-xs font-semibold text-accent hover:underline shrink-0"
        >
          Configure Settings →
        </a>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
        {statusFilters.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-3 py-1.5 rounded-control text-xs font-semibold whitespace-nowrap transition-colors focus-ring ${
              statusFilter === tab.key
                ? 'bg-accent text-card'
                : 'bg-card border border-border text-ink-muted hover:text-ink'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Jobs Queue Table */}
      <div className="bg-card border border-border rounded-card shadow-subtle overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3">
            <div className="h-10 bg-surface rounded animate-pulse" />
            <div className="h-10 bg-surface rounded animate-pulse" />
            <div className="h-10 bg-surface rounded animate-pulse" />
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-12 text-center">
            <Bell className="w-10 h-10 text-ink-muted/40 mx-auto mb-3" />
            <h3 className="font-semibold text-ink text-sm">No Notification Jobs Found</h3>
            <p className="text-xs text-ink-muted mt-1 max-w-sm mx-auto">
              When appointments are booked or confirmed, automated notifications and reminders will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {jobs.map((job) => {
              const statusDisplay = formatStatusDisplay(job);
              const cleanDigits = (job.normalized_phone || job.customer_phone).replace(/\D/g, '');
              const waUrl = `https://wa.me/${cleanDigits}?text=${encodeURIComponent(
                `Hello ${job.customer_name}, this is a reminder regarding your appointment (Ref: ${job.booking_reference}).`
              )}`;

              const isFailed = job.status === 'failed' || job.status === 'permanently_failed';

              return (
                <div
                  key={job.id}
                  className="p-4 sm:px-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-surface/50 transition-colors"
                >
                  {/* Left: Customer & Notice Type */}
                  <div className="min-w-[240px]">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-accent" />
                      <span className="font-semibold text-sm text-ink">{job.customer_name}</span>
                      <span className="text-xs font-mono text-ink-muted">({job.booking_reference})</span>
                    </div>
                    <div className="text-xs text-ink-muted mt-1 space-x-2">
                      <span className="font-medium text-ink capitalize">
                        {job.template_key.replace(/_/g, ' ')}
                      </span>
                      <span>•</span>
                      <span>{job.customer_email || 'No Email'}</span>
                    </div>
                  </div>

                  {/* Middle: Timing & Due Date */}
                  <div className="text-xs text-ink-muted min-w-[180px]">
                    <div className="flex items-center gap-1 font-medium text-ink">
                      <Clock className="w-3.5 h-3.5 text-ink-muted" />
                      <span>Due: {new Date(job.due_at_utc).toLocaleString()}</span>
                    </div>
                    {job.provider_message_id && (
                      <span className="text-[11px] font-mono text-ink-muted/80 block mt-0.5">
                        ID: {job.provider_message_id}
                      </span>
                    )}
                  </div>

                  {/* Right: Status Label & Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between md:justify-end gap-3 shrink-0">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-control border text-center ${statusDisplay.badgeClass}`}
                    >
                      {statusDisplay.label}
                    </span>

                    <div className="flex items-center gap-2">
                      {/* Manual Retry Button for failed jobs (E9) */}
                      {isFailed && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleRetry(job.id)}
                          isLoading={retryingId === job.id}
                          title="Retry delivery through claim processor"
                        >
                          <RotateCcw className="w-3.5 h-3.5 mr-1" />
                          Retry
                        </Button>
                      )}

                      {/* WhatsApp Fallback Link (E8a - opens in new tab, never claims sending) */}
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="py-1.5 px-2.5 rounded-control text-xs font-semibold bg-success-tint border border-success/30 text-success hover:bg-success-tint/80 focus-ring flex items-center gap-1"
                        title="Open prefilled message in WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
