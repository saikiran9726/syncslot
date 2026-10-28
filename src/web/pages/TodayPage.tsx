// SlotSync Owner Today Command Center Page (C1)
// Displays dynamic metrics in business timezone, next up appointment with actions,
// and chronological today schedule timeline.

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  RefreshCw,
  Phone,
  MessageCircle,
  AlertCircle,
  TrendingUp,
  CheckCircle,
  Clock3,
  CalendarCheck,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { QuickAddModal } from '../components/QuickAddModal';
import { BookingDetailDrawer } from '../components/BookingDetailDrawer';
import { utcToLocal } from '../../shared/availability';

interface TodayBooking {
  id: string;
  reference: string;
  start_at_utc: string;
  end_at_utc: string;
  status: any;
  source: string;
  price_minor: number;
  currency: string;
  notes?: string;
  possible_match: number;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  normalized_phone?: string;
  customer_email?: string;
  service_id: string;
  service_name: string;
  duration_minutes: number;
}

interface TodayMetrics {
  total: number;
  confirmed: number;
  pending: number;
  completed: number;
  cancelled: number;
  no_show: number;
  completed_revenue_minor: number;
  expected_revenue_minor: number;
  needs_attention: number;
}

export const TodayPage: React.FC = () => {
  const [metrics, setMetrics] = useState<TodayMetrics>({
    total: 0,
    confirmed: 0,
    pending: 0,
    completed: 0,
    cancelled: 0,
    no_show: 0,
    completed_revenue_minor: 0,
    expected_revenue_minor: 0,
    needs_attention: 0,
  });
  const [bookings, setBookings] = useState<TodayBooking[]>([]);
  const [nextUp, setNextUp] = useState<TodayBooking | null>(null);
  const [todayDate, setTodayDate] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('Asia/Kolkata');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals & Drawer
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const fetchTodayData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/owner/dashboard/today');
      if (!res.ok) {
        throw new Error('Could not load today dashboard data.');
      }
      const data = (await res.json()) as any;
      setMetrics(data.metrics || {});
      setBookings(data.bookings || []);
      setNextUp(data.next_up || null);
      setTodayDate(data.today_date || new Date().toISOString().slice(0, 10));
      setTimezone(data.timezone || 'Asia/Kolkata');
    } catch (err: any) {
      setError(err.message || 'Failed to load today data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTodayData();
  }, []);

  // Format today's date nicely for human display
  const displayDateStr = todayDate
    ? new Date(todayDate + 'T00:00:00Z').toLocaleDateString('en-US', {
        timeZone: 'UTC',
        weekday: 'long',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-ink">Today's Command Center</h1>
          <div className="flex items-center gap-2 text-xs font-semibold text-ink-muted mt-1">
            <Calendar className="w-3.5 h-3.5 text-accent" />
            <span>{displayDateStr}</span>
            <span className="mx-1">•</span>
            <span>{timezone}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchTodayData}
            isLoading={isLoading}
            title="Refresh Today Data"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button
            variant="primary"
            onClick={() => setIsQuickAddOpen(true)}
            className="shadow-subtle"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Quick Add
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-danger-tint text-danger rounded-control text-xs font-semibold flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Metric Cards (C1) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-card border border-border rounded-card p-4 shadow-subtle">
          <span className="text-xs font-bold text-ink-muted uppercase tracking-wider block">Total Today</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-display font-bold text-ink">{metrics.total}</span>
            <span className="text-xs text-ink-muted">bookings</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-card p-4 shadow-subtle">
          <span className="text-xs font-bold text-accent uppercase tracking-wider block">Confirmed</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-display font-bold text-accent">{metrics.confirmed}</span>
            <span className="text-xs text-ink-muted">ready</span>
          </div>
        </div>

        <div className={`bg-card border rounded-card p-4 shadow-subtle ${
          metrics.pending > 0 ? 'border-warning/50 bg-warning-tint/20' : 'border-border'
        }`}>
          <span className="text-xs font-bold text-warning uppercase tracking-wider block">Pending Approval</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-display font-bold text-warning">{metrics.pending}</span>
            <span className="text-xs text-ink-muted">triage</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-card p-4 shadow-subtle">
          <span className="text-xs font-bold text-success uppercase tracking-wider block">Completed</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-display font-bold text-success">{metrics.completed}</span>
            <span className="text-xs text-ink-muted">done</span>
          </div>
        </div>

        <div className="bg-card border border-border rounded-card p-4 shadow-subtle col-span-2 sm:col-span-1">
          <span className="text-xs font-bold text-ink-muted uppercase tracking-wider block">Today's Revenue</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-display font-bold text-ink">
              ₹{(metrics.completed_revenue_minor / 100).toFixed(0)}
            </span>
            <span className="text-[11px] text-ink-muted">
              (₹{(metrics.expected_revenue_minor / 100).toFixed(0)} exp.)
            </span>
          </div>
        </div>
      </div>

      {/* Next Up Appointment Card */}
      {nextUp && (
        <div className="bg-accent-tint/40 border border-accent/30 rounded-card p-5 shadow-subtle">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-accent animate-ping" />
              <span className="text-xs font-bold uppercase tracking-wider text-accent">Next Up Appointment</span>
            </div>
            <StatusBadge status={nextUp.status} size="sm" />
          </div>

          {(() => {
            const startL = utcToLocal(nextUp.start_at_utc, timezone);
            const endL = utcToLocal(nextUp.end_at_utc, timezone);
            const cleanDigits = (nextUp.normalized_phone || nextUp.customer_phone).replace(/\D/g, '');
            const waLink = `https://wa.me/${cleanDigits}?text=${encodeURIComponent(
              `Hello ${nextUp.customer_name}, looking forward to seeing you at ${startL.time} for your ${nextUp.service_name} appointment.`
            )}`;

            return (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Clock3 className="w-4 h-4 text-accent" />
                    <span className="font-bold text-base text-ink">
                      {startL.time} – {endL.time}
                    </span>
                    <span className="text-xs text-ink-muted">({nextUp.duration_minutes} min)</span>
                  </div>
                  <h3 className="font-semibold text-lg text-ink mt-1">{nextUp.customer_name}</h3>
                  <p className="text-xs text-ink-muted">{nextUp.service_name} • ₹{(nextUp.price_minor / 100).toFixed(0)}</p>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href={`tel:${nextUp.customer_phone}`}
                    className="p-2.5 rounded-control bg-card border border-border text-ink hover:bg-surface focus-ring"
                    title="Call customer"
                  >
                    <Phone className="w-4 h-4" />
                  </a>
                  <a
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-control bg-success-tint border border-success/30 text-success hover:bg-success-tint/80 focus-ring"
                    title="Prefilled WhatsApp message"
                  >
                    <MessageCircle className="w-4 h-4" />
                  </a>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setSelectedBookingId(nextUp.id)}
                  >
                    Manage
                  </Button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Today's Schedule Timeline (C1) */}
      <div className="bg-card border border-border rounded-card shadow-subtle overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-accent" />
            <h2 className="font-semibold text-base text-ink">Today's Schedule</h2>
            <span className="text-xs bg-surface px-2 py-0.5 rounded text-ink-muted font-bold">
              {bookings.length}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 space-y-3">
            <div className="h-10 bg-surface rounded animate-pulse" />
            <div className="h-10 bg-surface rounded animate-pulse" />
            <div className="h-10 bg-surface rounded animate-pulse" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="p-12 text-center">
            <Calendar className="w-10 h-10 text-ink-muted/40 mx-auto mb-3" />
            <h3 className="font-semibold text-ink text-sm">No Appointments Today</h3>
            <p className="text-xs text-ink-muted mt-1 max-w-sm mx-auto">
              Your schedule is completely open for today. Click Quick Add to book a walk-in, phone, or WhatsApp client.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsQuickAddOpen(true)}
              className="mt-4"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Quick Add Appointment
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {bookings.map((b) => {
              const startL = utcToLocal(b.start_at_utc, timezone);
              const endL = utcToLocal(b.end_at_utc, timezone);

              return (
                <div
                  key={b.id}
                  onClick={() => setSelectedBookingId(b.id)}
                  className="p-4 sm:px-5 hover:bg-surface transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                >
                  <div className="flex items-start sm:items-center gap-4">
                    {/* Time block */}
                    <div className="shrink-0 w-24 text-left">
                      <span className="font-mono font-bold text-sm text-ink block">{startL.time}</span>
                      <span className="text-[11px] text-ink-muted">{endL.time}</span>
                    </div>

                    {/* Customer & Service */}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-ink group-hover:text-accent transition-colors">
                          {b.customer_name}
                        </span>
                        {b.possible_match === 1 && (
                          <span className="text-[10px] bg-warning-tint text-warning px-1.5 py-0.5 rounded font-bold">
                            Match?
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-ink-muted mt-0.5">
                        <span>{b.service_name}</span>
                        <span>•</span>
                        <span>₹{(b.price_minor / 100).toFixed(0)}</span>
                        <span>•</span>
                        <span className="capitalize">{b.source}</span>
                      </div>
                    </div>
                  </div>

                  {/* Badges & Action */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <StatusBadge status={b.status} size="sm" />
                    <span className="text-xs font-semibold text-accent opacity-0 group-hover:opacity-100 transition-opacity hidden sm:inline">
                      View →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Add Modal */}
      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onSuccess={() => fetchTodayData()}
        initialDate={todayDate}
        businessTimezone={timezone}
      />

      {/* Booking Detail Drawer */}
      <BookingDetailDrawer
        bookingId={selectedBookingId}
        isOpen={Boolean(selectedBookingId)}
        onClose={() => setSelectedBookingId(null)}
        onStatusUpdated={() => fetchTodayData()}
        businessTimezone={timezone}
      />
    </div>
  );
};
