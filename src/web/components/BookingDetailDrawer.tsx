// SlotSync Booking Detail Drawer
// Slide-over drawer with appointment inspection, state transitions, audit trail, and WhatsApp prefill.

import React, { useState, useEffect } from 'react';
import {
  X,
  Clock,
  Phone,
  MessageCircle,
  Calendar,
  AlertTriangle,
  History,
  CheckCircle,
  XCircle,
  UserX,
  FileText,
} from 'lucide-react';
import { StatusBadge } from './ui/StatusBadge';
import { Button } from './ui/Button';
import { BookingStatus } from '../../shared/statusEnums';
import { utcToLocal } from '../../shared/availability';

export interface BookingDetailDrawerProps {
  bookingId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusUpdated?: () => void;
  businessTimezone?: string;
}

interface BookingDetails {
  id: string;
  reference: string;
  start_at_utc: string;
  end_at_utc: string;
  business_timezone: string;
  source: string;
  status: BookingStatus;
  price_minor: number;
  currency: string;
  version: number;
  notes?: string;
  possible_match: number;
  cancelled_reason?: string;
  created_at_utc: string;
  updated_at_utc: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  normalized_phone?: string;
  customer_email?: string;
  service_id: string;
  service_name: string;
  duration_minutes: number;
  buffer_minutes: number;
}

interface BookingEvent {
  id: string;
  actor_type: string;
  actor_id: string;
  event_type: string;
  from_status?: string;
  to_status?: string;
  payload_json?: string;
  created_at_utc: string;
}

export const BookingDetailDrawer: React.FC<BookingDetailDrawerProps> = ({
  bookingId,
  isOpen,
  onClose,
  onStatusUpdated,
  businessTimezone = 'Asia/Kolkata',
}) => {
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [events, setEvents] = useState<BookingEvent[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cancellation reason state
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Fetch booking details and audit events
  const loadBooking = async () => {
    if (!bookingId) return;
    setIsLoading(true);
    setError(null);
    try {
      const [res, notifRes] = await Promise.all([
        fetch(`/api/owner/bookings/${bookingId}`),
        fetch(`/api/owner/notifications?booking_id=${bookingId}`),
      ]);
      if (!res.ok) {
        throw new Error('Could not find booking record.');
      }
      const data = (await res.json()) as any;
      setBooking(data.booking);
      setEvents(data.events || []);

      if (notifRes.ok) {
        const notifData = (await notifRes.json()) as any;
        setNotifications(notifData.jobs || []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load booking');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && bookingId) {
      setShowCancelPrompt(false);
      setCancelReason('');
      loadBooking();
    } else {
      setBooking(null);
      setEvents([]);
      setError(null);
    }
  }, [isOpen, bookingId]);

  if (!isOpen) return null;

  // Handle status update
  const handleTransition = async (targetStatus: BookingStatus, reason?: string) => {
    if (!bookingId) return;
    setIsTransitioning(true);
    setError(null);
    try {
      const res = await fetch(`/api/owner/bookings/${bookingId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus, reason }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        throw new Error(data.error?.message || 'Status transition failed');
      }

      setShowCancelPrompt(false);
      await loadBooking();
      if (onStatusUpdated) onStatusUpdated();
    } catch (err: any) {
      setError(err.message || 'Status transition failed');
    } finally {
      setIsTransitioning(false);
    }
  };

  // Timezone formatting
  const tz = booking?.business_timezone || businessTimezone;
  const startLocal = booking ? utcToLocal(booking.start_at_utc, tz) : { date: '', time: '' };
  const endLocal = booking ? utcToLocal(booking.end_at_utc, tz) : { date: '', time: '' };

  // Format WhatsApp link with honest prefilled text (NEVER claims sent)
  const phoneDigits = (booking?.normalized_phone || booking?.customer_phone || '').replace(/\D/g, '');
  const waGreeting = booking
    ? `Hello ${booking.customer_name}, this is regarding your ${booking.service_name} appointment on ${startLocal.date} at ${startLocal.time} (Ref: ${booking.reference}).`
    : '';
  const waUrl = `https://wa.me/${phoneDigits}?text=${encodeURIComponent(waGreeting)}`;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-ink/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over panel */}
      <div className="relative w-full max-w-md bg-card h-full shadow-overlay flex flex-col z-10 overflow-hidden">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-surface shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm text-ink">{booking?.reference || 'Appointment'}</span>
              {booking && <StatusBadge status={booking.status} size="sm" />}
            </div>
            <p className="text-xs text-ink-muted mt-0.5">Booking Details & Audit Log</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-control text-ink-muted hover:text-ink hover:bg-card focus-ring transition-colors"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {error && (
            <div className="p-3 bg-danger-tint text-danger rounded-control text-xs font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-4 animate-pulse">
              <div className="h-6 bg-surface rounded w-1/2" />
              <div className="h-20 bg-surface rounded" />
              <div className="h-20 bg-surface rounded" />
            </div>
          ) : booking ? (
            <>
              {/* Customer Information Card */}
              <div className="bg-surface rounded-card p-4 border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink-muted uppercase tracking-wider">Customer</span>
                  {booking.possible_match === 1 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning-tint text-warning border border-warning/30">
                      Name Mismatch
                    </span>
                  )}
                </div>
                <div>
                  <h3 className="font-semibold text-ink text-base">{booking.customer_name}</h3>
                  <p className="text-xs text-ink-muted">{booking.customer_phone}</p>
                  {booking.customer_email && (
                    <p className="text-xs text-ink-muted mt-0.5">{booking.customer_email}</p>
                  )}
                </div>

                {/* Direct Action Contacts */}
                <div className="flex items-center gap-2 pt-1">
                  <a
                    href={`tel:${booking.customer_phone}`}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-control text-xs font-semibold bg-card border border-border text-ink hover:bg-surface focus-ring transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5 text-ink-muted" />
                    <span>Call</span>
                  </a>
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-control text-xs font-semibold bg-success-tint border border-success/30 text-success hover:bg-success-tint/80 focus-ring transition-colors"
                    title="Opens prefilled chat in WhatsApp"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </a>
                </div>
              </div>

              {/* Service & Schedule Card */}
              <div className="bg-surface rounded-card p-4 border border-border space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink-muted uppercase tracking-wider">Appointment</span>
                  <span className="text-xs font-bold text-ink">
                    ₹{(booking.price_minor / 100).toFixed(0)}
                  </span>
                </div>
                <div>
                  <h4 className="font-medium text-ink text-sm">{booking.service_name}</h4>
                  <div className="flex items-center gap-1.5 text-xs text-ink-muted mt-1">
                    <Calendar className="w-3.5 h-3.5 text-accent" />
                    <span>{startLocal.date}</span>
                    <span className="mx-1">•</span>
                    <Clock className="w-3.5 h-3.5 text-accent" />
                    <span>
                      {startLocal.time} – {endLocal.time} ({booking.duration_minutes} min)
                    </span>
                  </div>
                </div>

                <div className="text-xs text-ink-muted flex items-center gap-2 pt-1 border-t border-border/50">
                  <span>Source:</span>
                  <span className="font-semibold capitalize text-ink bg-card px-2 py-0.5 rounded border border-border">
                    {booking.source}
                  </span>
                </div>

                {booking.notes && (
                  <div className="text-xs bg-card p-2.5 rounded border border-border text-ink">
                    <span className="font-semibold block mb-0.5 text-ink-muted">Notes:</span>
                    {booking.notes}
                  </div>
                )}

                {booking.cancelled_reason && (
                  <div className="text-xs bg-danger-tint p-2.5 rounded border border-danger/20 text-danger">
                    <span className="font-semibold block mb-0.5">Cancellation Reason:</span>
                    {booking.cancelled_reason}
                  </div>
                )}
              </div>

              {/* Status Action Buttons */}
              <div className="space-y-2 pt-1">
                <span className="block text-xs font-bold text-ink-muted uppercase tracking-wider">
                  Update Status
                </span>

                {/* If Pending: Approve */}
                {booking.status === 'pending' && (
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => handleTransition('confirmed')}
                    isLoading={isTransitioning}
                  >
                    <CheckCircle className="w-4 h-4 mr-1.5" />
                    Approve Appointment
                  </Button>
                )}

                {/* If Confirmed: Mark Completed & Mark No-Show */}
                {booking.status === 'confirmed' && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant="primary"
                      onClick={() => handleTransition('completed')}
                      isLoading={isTransitioning}
                    >
                      <CheckCircle className="w-4 h-4 mr-1.5" />
                      Mark Completed
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => handleTransition('no_show')}
                      isLoading={isTransitioning}
                    >
                      <UserX className="w-4 h-4 mr-1.5" />
                      Mark No-Show
                    </Button>
                  </div>
                )}

                {/* Cancel Action (if not already cancelled or completed) */}
                {booking.status !== 'cancelled' && booking.status !== 'completed' && (
                  <div>
                    {!showCancelPrompt ? (
                      <button
                        type="button"
                        onClick={() => setShowCancelPrompt(true)}
                        className="w-full mt-2 py-2 px-3 rounded-control text-xs font-semibold text-danger border border-danger/30 hover:bg-danger-tint focus-ring transition-colors flex items-center justify-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Cancel Appointment</span>
                      </button>
                    ) : (
                      <div className="p-3 bg-danger-tint/30 border border-danger/30 rounded-control mt-2 space-y-2">
                        <label className="block text-xs font-semibold text-danger">
                          Reason for cancellation (optional):
                        </label>
                        <input
                          type="text"
                          value={cancelReason}
                          onChange={(e) => setCancelReason(e.target.value)}
                          placeholder="e.g. Customer requested, emergency"
                          className="w-full text-xs p-2 rounded border border-border bg-card text-ink focus-ring"
                        />
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setShowCancelPrompt(false)}
                            disabled={isTransitioning}
                          >
                            Keep Booking
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => handleTransition('cancelled', cancelReason)}
                            isLoading={isTransitioning}
                          >
                            Confirm Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Audit Event Trail */}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center gap-1.5 text-xs font-bold text-ink-muted uppercase tracking-wider">
                  <History className="w-3.5 h-3.5" />
                  <span>Audit Trail</span>
                </div>
                <div className="space-y-2">
                  {events.length === 0 ? (
                    <p className="text-xs text-ink-muted">No audit events recorded.</p>
                  ) : (
                    events.map((evt) => (
                      <div
                        key={evt.id}
                        className="text-xs bg-surface p-2.5 rounded border border-border space-y-0.5"
                      >
                        <div className="flex items-center justify-between font-medium text-ink">
                          <span className="capitalize">{evt.event_type.replace(/_/g, ' ')}</span>
                          <span className="text-[10px] text-ink-muted">
                            {new Date(evt.created_at_utc).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="text-[11px] text-ink-muted">
                          Actor: <span className="font-semibold">{evt.actor_type}</span>
                          {evt.from_status && evt.to_status && (
                            <span>
                              {' '}• Transitioned from <em>{evt.from_status}</em> to{' '}
                              <strong>{evt.to_status}</strong>
                            </span>
                          )}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Notification History Timeline (E8) */}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-ink-muted uppercase tracking-wider">
                    Notification History
                  </span>
                  <span className="text-[10px] text-ink-muted font-mono">{notifications.length} notices</span>
                </div>
                <div className="space-y-2">
                  {notifications.length === 0 ? (
                    <p className="text-xs text-ink-muted">No notifications scheduled or dispatched.</p>
                  ) : (
                    notifications.map((n) => {
                      let label = n.status;
                      let badgeColor = 'bg-surface text-ink-muted border-border';
                      if (n.status === 'accepted') {
                        label = 'Accepted by provider, delivery unconfirmed';
                        badgeColor = 'bg-accent-tint text-accent border-accent/30';
                      } else if (n.status === 'simulated') {
                        label = 'Dry-run (not sent)';
                        badgeColor = 'bg-surface text-ink-muted border-border';
                      } else if (n.status.startsWith('skipped_')) {
                        const reason = n.status === 'skipped_late' ? 'Late (>15 min)' : n.status === 'skipped_consent' ? 'Opted out' : 'Restricted';
                        label = `Skipped: ${reason}`;
                        badgeColor = 'bg-warning-tint text-warning border-warning/30';
                      } else if (n.status === 'failed' || n.status === 'permanently_failed') {
                        label = `Failed: ${n.last_error_category || 'Delivery error'}`;
                        badgeColor = 'bg-danger-tint text-danger border-danger/30';
                      }

                      return (
                        <div key={n.id} className="text-xs bg-surface p-2.5 rounded border border-border space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold capitalize text-ink">
                              {n.template_key.replace(/_/g, ' ')}
                            </span>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${badgeColor}`}>
                              {label}
                            </span>
                          </div>
                          <div className="text-[10px] text-ink-muted flex items-center justify-between">
                            <span>Due: {new Date(n.due_at_utc).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                            {n.provider_message_id && <span>Msg: {n.provider_message_id}</span>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Drawer Footer */}
        <div className="p-4 border-t border-border bg-surface shrink-0 flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
