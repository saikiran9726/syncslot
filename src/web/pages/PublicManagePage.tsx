// SlotSync Self-Service Customer Appointment Management
// Allows customers to view, download .ics, reschedule, or cancel within cutoff policy rules.

import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Feedback';
import { Dialog } from '../components/ui/Dialog';
import { apiClient } from '../lib/apiClient';
import { downloadIcsFile } from '../../shared/ics';
import {
  Calendar,
  Clock,
  MapPin,
  Download,
  AlertCircle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ChevronRight,
  Info,
} from 'lucide-react';

interface ManageBookingData {
  id: string;
  reference: string;
  service_id: string;
  start_at_utc: string;
  end_at_utc: string;
  business_timezone: string;
  status: 'confirmed' | 'cancelled' | 'completed' | 'pending';
  price_minor: number;
  currency: string;
  version: number;
  notes: string | null;
  service_name: string;
  duration_minutes: number;
  buffer_minutes: number;
  customer_name: string;
  display_phone: string;
  business_name: string;
  business_slug: string;
  address: string | null;
  contact_phone: string | null;
  cancel_cutoff_hours: number;
  cancellation_policy_text: string | null;
  can_cancel: boolean;
  can_reschedule: boolean;
}

interface AvailableSlot {
  start_at_utc: string;
  end_at_utc: string;
  local_date: string;
  display_time: string;
}

export const PublicManagePage: React.FC<{ slug: string; token: string }> = ({ slug, token }) => {
  const [booking, setBooking] = useState<ManageBookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Cancellation modal
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);

  // Reschedule state
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [selectedNewSlot, setSelectedNewSlot] = useState<AvailableSlot | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Fetch booking details
  const fetchBooking = async () => {
    try {
      const res = await apiClient.get<{ booking: ManageBookingData }>(
        `/api/public/${slug}/manage/${token}`
      );
      if (res.data && res.data.booking) {
        setBooking(res.data.booking);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooking();
  }, [slug, token]);

  // Format date and time for display
  const formattedDateTime = () => {
    if (!booking) return '';
    try {
      const d = new Date(booking.start_at_utc);
      return d.toLocaleString('en-US', {
        timeZone: booking.business_timezone || 'Asia/Kolkata',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return booking.start_at_utc;
    }
  };

  // Download .ics
  const handleDownloadIcs = () => {
    if (!booking) return;
    downloadIcsFile({
      reference: booking.reference,
      businessName: booking.business_name,
      serviceName: booking.service_name,
      startAtUtc: booking.start_at_utc,
      endAtUtc: booking.end_at_utc,
      description: `Appointment for ${booking.service_name} at ${booking.business_name}. Reference: ${booking.reference}`,
      location: booking.address || undefined,
    });
  };

  // Handle Cancel
  const handleConfirmCancel = async () => {
    if (!booking) return;
    setCancelling(true);
    try {
      const res = await apiClient.post(`/api/public/${slug}/manage/${token}/cancel`, {
        reason: cancelReason.trim() || undefined,
      });
      if (res.data) {
        setCancelSuccess(true);
        setShowCancelDialog(false);
        fetchBooking();
      }
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Unable to cancel appointment. Please contact the business.');
    } finally {
      setCancelling(false);
    }
  };

  // Helper to format Date to YYYY-MM-DD in a given timezone
  const getDateInTimezone = (date: Date, timeZone: string): string => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  };

  const getIsoDateInTimezone = (isoString: string, timeZone: string): string => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(isoString));
  };

  // Handle Reschedule slot search
  const loadRescheduleSlots = async (dateStr: string, autoFindNext = false) => {
    if (!booking) return;

    const tz = booking.business_timezone || 'Asia/Kolkata';
    const todayStr = getDateInTimezone(new Date(), tz);

    if (dateStr < todayStr) {
      setAvailableSlots([]);
      setRescheduleError('Please select today or a future date. Past dates cannot be booked.');
      return;
    }

    setSlotsLoading(true);
    setRescheduleError(null);
    try {
      const res = await apiClient.get<{ slots?: AvailableSlot[]; available_slots?: AvailableSlot[] }>(
        `/api/public/${slug}/availability?service_id=${booking.service_id}&date=${dateStr}&exclude_booking_id=${booking.id}&manage_token=${token}`
      );
      const slots = res.data?.slots || res.data?.available_slots || [];
      if (slots.length > 0) {
        setAvailableSlots(slots);
      } else if (autoFindNext) {
        // Look up the next 14 days for the earliest date with available slots
        const futureLimit = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        const futureStr = getDateInTimezone(futureLimit, tz);

        const rangeRes = await apiClient.get<{ slots?: AvailableSlot[]; available_slots?: AvailableSlot[] }>(
          `/api/public/${slug}/availability?service_id=${booking.service_id}&from=${todayStr}&to=${futureStr}&exclude_booking_id=${booking.id}&manage_token=${token}`
        );
        const rangeSlots = rangeRes.data?.slots || rangeRes.data?.available_slots || [];
        if (rangeSlots.length > 0) {
          const firstDate = rangeSlots[0].local_date;
          setRescheduleDate(firstDate);
          setAvailableSlots(rangeSlots.filter((s) => s.local_date === firstDate));
        } else {
          setAvailableSlots([]);
        }
      } else {
        setAvailableSlots([]);
      }
    } catch (err: any) {
      setAvailableSlots([]);
      setRescheduleError(
        err.response?.data?.error?.message || 'Unable to load available slots for this date.'
      );
    } finally {
      setSlotsLoading(false);
    }
  };

  // Open Reschedule Modal with default valid date
  const handleOpenReschedule = () => {
    if (!booking) return;
    const tz = booking.business_timezone || 'Asia/Kolkata';
    const todayStr = getDateInTimezone(new Date(), tz);
    const bookingDateStr = getIsoDateInTimezone(booking.start_at_utc, tz);
    const initialDate = bookingDateStr >= todayStr ? bookingDateStr : todayStr;

    setRescheduleDate(initialDate);
    setSelectedNewSlot(null);
    setRescheduleError(null);
    setShowRescheduleDialog(true);
    loadRescheduleSlots(initialDate, true);
  };

  // Handle Reschedule submit
  const handleConfirmReschedule = async () => {
    if (!booking || !selectedNewSlot) return;
    setRescheduling(true);
    setRescheduleError(null);

    try {
      const res = await apiClient.post(`/api/public/${slug}/manage/${token}/reschedule`, {
        new_start_at_utc: selectedNewSlot.start_at_utc,
      });

      if (res.data) {
        setShowRescheduleDialog(false);
        setSelectedNewSlot(null);
        fetchBooking();
      }
    } catch (err: any) {
      setRescheduleError(
        err.response?.data?.error?.message || 'Failed to reschedule. The slot may have been taken.'
      );
    } finally {
      setRescheduling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface py-12 px-4 max-w-lg mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (notFound || !booking) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="max-w-md w-full bg-card p-8 rounded-sheet border border-border shadow-card">
          <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center mx-auto mb-4 text-ink-muted">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="font-serif text-2xl text-ink font-semibold">Appointment Not Found</h1>
          <p className="text-sm text-ink-muted mt-2">
            This management link may be expired, invalid, or already deleted.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold tracking-wider text-accent uppercase">
              Manage Appointment
            </span>
            <h1 className="font-serif text-2xl font-bold text-ink mt-0.5">{booking.business_name}</h1>
          </div>
          <StatusBadge
            status={
              booking.status === 'confirmed'
                ? 'confirmed'
                : booking.status === 'cancelled'
                ? 'cancelled'
                : 'completed'
            }
            label={booking.status.toUpperCase()}
          />
        </div>

        {/* Cancellation Notice if Cancelled */}
        {booking.status === 'cancelled' && (
          <div className="bg-danger/10 border border-danger/30 rounded-card p-4 text-xs text-danger flex items-start space-x-2.5">
            <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-sm">This appointment has been cancelled</p>
              <p className="mt-0.5">The reserved time has been freed. You can book a new appointment at any time.</p>
            </div>
          </div>
        )}

        {/* Main Details Card */}
        <div className="bg-card rounded-sheet border border-border shadow-card p-6 space-y-5">
          <div className="flex justify-between items-center pb-4 border-b border-border">
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-muted font-medium">Reference Code</div>
              <div className="font-mono text-xl font-bold text-accent tracking-widest mt-0.5">
                {booking.reference}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-ink-muted">Customer</div>
              <div className="font-medium text-ink text-sm mt-0.5">{booking.customer_name}</div>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div className="flex items-start justify-between py-1">
              <span className="text-ink-muted">Service</span>
              <span className="font-medium text-ink text-right">{booking.service_name}</span>
            </div>

            <div className="flex items-start justify-between py-1">
              <span className="text-ink-muted">When</span>
              <span className="font-medium text-ink tabular-nums text-right">
                {formattedDateTime()}
              </span>
            </div>

            <div className="flex items-start justify-between py-1">
              <span className="text-ink-muted">Duration</span>
              <span className="font-medium text-ink tabular-nums">{booking.duration_minutes} mins</span>
            </div>

            <div className="flex items-start justify-between py-1">
              <span className="text-ink-muted">Price</span>
              <span className="font-medium text-ink tabular-nums font-mono">
                ₹{(booking.price_minor / 100).toFixed(0)}
              </span>
            </div>

            {booking.address && (
              <div className="flex items-start justify-between py-1">
                <span className="text-ink-muted">Location</span>
                <span className="font-medium text-ink text-right max-w-[220px]">{booking.address}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-border space-y-2.5">
            <Button variant="secondary" className="w-full justify-center" onClick={handleDownloadIcs}>
              <Download className="w-4 h-4 mr-2" /> Add to Calendar (.ics)
            </Button>

            {booking.status === 'confirmed' && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button
                  variant="secondary"
                  disabled={!booking.can_reschedule}
                  onClick={handleOpenReschedule}
                  className="w-full justify-center"
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Reschedule
                </Button>

                <Button
                  variant="danger"
                  disabled={!booking.can_cancel}
                  onClick={() => setShowCancelDialog(true)}
                  className="w-full justify-center"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          {/* Policy Information */}
          <div className="bg-surface rounded-card p-3.5 border border-border text-xs text-ink-muted space-y-1">
            <div className="font-medium text-ink flex items-center">
              <Info className="w-3.5 h-3.5 mr-1 text-accent" /> Policy Information
            </div>
            <p>
              {booking.cancellation_policy_text ||
                `Changes and cancellations must be made at least ${booking.cancel_cutoff_hours || 2} hours before appointment time.`}
            </p>
          </div>
        </div>

        {/* Back Link */}
        <div className="text-center pt-2">
          <a
            href={`/b/${slug}`}
            className="text-xs text-accent hover:underline font-medium inline-flex items-center"
          >
            Visit {booking.business_name} Public Booking Page <ChevronRight className="w-3 h-3 ml-0.5" />
          </a>
        </div>
      </div>

      {/* Cancel Confirmation Dialog */}
      <Dialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        title="Cancel Appointment"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-muted">
            Are you sure you want to cancel your appointment for <strong className="text-ink">{booking.service_name}</strong> on <strong className="text-ink">{formattedDateTime()}</strong>?
          </p>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              Cancellation Reason (Optional)
            </label>
            <textarea
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Schedule conflict..."
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-card text-ink focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="flex justify-end space-x-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCancelDialog(false)} disabled={cancelling}>
              Keep Appointment
            </Button>
            <Button variant="danger" loading={cancelling} onClick={handleConfirmCancel}>
              Confirm Cancellation
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog
        isOpen={showRescheduleDialog}
        onClose={() => setShowRescheduleDialog(false)}
        title="Reschedule Appointment"
      >
        <div className="space-y-4">
          <p className="text-xs text-ink-muted">
            Select a new date and available slot for your {booking.service_name}.
          </p>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">Pick Date</label>
            <input
              type="date"
              min={booking ? getDateInTimezone(new Date(), booking.business_timezone || 'Asia/Kolkata') : undefined}
              value={rescheduleDate}
              onChange={(e) => {
                const val = e.target.value;
                setRescheduleDate(val);
                setSelectedNewSlot(null);
                if (val) {
                  loadRescheduleSlots(val, false);
                } else {
                  setAvailableSlots([]);
                }
              }}
              className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-card text-ink focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          {slotsLoading && <Skeleton className="h-20 w-full" />}

          {!slotsLoading && rescheduleDate && availableSlots.length === 0 && !rescheduleError && (
            <div className="text-xs text-ink-muted text-center py-3 bg-surface rounded border border-border space-y-1">
              <p className="font-medium text-ink">No available slots on this date.</p>
              <p className="text-[11px]">The business may be closed, fully booked, or outside notice limits. Please pick another date.</p>
            </div>
          )}

          {!slotsLoading && availableSlots.length > 0 && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              <label className="block text-xs font-medium text-ink">Choose New Time</label>
              <div className="grid grid-cols-3 gap-1.5">
                {availableSlots.map((slot) => {
                  const isSelected = selectedNewSlot?.start_at_utc === slot.start_at_utc;
                  return (
                    <button
                      key={slot.start_at_utc}
                      type="button"
                      onClick={() => setSelectedNewSlot(slot)}
                      className={`py-1.5 px-2 text-xs font-mono rounded border transition-all ${
                        isSelected
                          ? 'border-accent bg-accent text-white'
                          : 'border-border bg-surface text-ink hover:border-accent'
                      }`}
                    >
                      {slot.display_time}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {rescheduleError && (
            <div className="text-xs text-danger bg-danger/10 p-2.5 rounded border border-danger/20">
              {rescheduleError}
            </div>
          )}

          <div className="flex justify-end space-x-2 pt-2 border-t border-border">
            <Button variant="secondary" onClick={() => setShowRescheduleDialog(false)} disabled={rescheduling}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!selectedNewSlot || rescheduling}
              loading={rescheduling}
              onClick={handleConfirmReschedule}
            >
              Confirm Reschedule
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
