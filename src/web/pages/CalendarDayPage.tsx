// SlotSync Owner Calendar Day Schedule Page (C2)
// Visual hourly schedule grid with date navigation, appointment cards, and Quick Add intake.

import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Plus,
  RefreshCw,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { QuickAddModal } from '../components/QuickAddModal';
import { BookingDetailDrawer } from '../components/BookingDetailDrawer';
import { utcToLocal } from '../../shared/availability';

interface CalendarBooking {
  id: string;
  reference: string;
  start_at_utc: string;
  end_at_utc: string;
  business_timezone: string;
  source: string;
  status: any;
  price_minor: number;
  currency: string;
  notes?: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  service_id: string;
  service_name: string;
  duration_minutes: number;
}

export const CalendarDayPage: React.FC = () => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [quickAddHour, setQuickAddHour] = useState<string>('10:00');

  const fetchBookings = async (dateStr: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/owner/bookings?date=${dateStr}&limit=100`);
      if (!res.ok) {
        throw new Error('Failed to load schedule for this date.');
      }
      const data = (await res.json()) as any;
      setBookings(data.bookings || []);
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings(selectedDate);
  }, [selectedDate]);

  // Date navigation helpers
  const handlePrevDay = () => {
    const d = new Date(selectedDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    setSelectedDate(d.toISOString().slice(0, 10));
  };

  const handleGoToday = () => {
    setSelectedDate(todayStr);
  };

  const formattedDate = new Date(selectedDate + 'T00:00:00Z').toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  // Hourly grid: 08:00 to 20:00 (13 hours)
  const hours = Array.from({ length: 13 }, (_, i) => i + 8);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Navigation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-ink">Calendar Schedule</h1>
          <p className="text-xs text-ink-muted mt-0.5">Visual hourly timeline and intake</p>
        </div>

        {/* Date Selector & Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-card border border-border rounded-control p-0.5">
            <button
              onClick={handlePrevDay}
              className="p-1.5 rounded text-ink hover:bg-surface focus-ring"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleGoToday}
              className={`px-2.5 py-1 text-xs font-semibold rounded focus-ring ${
                selectedDate === todayStr ? 'bg-accent text-card' : 'text-ink hover:bg-surface'
              }`}
            >
              Today
            </button>
            <button
              onClick={handleNextDay}
              className="p-1.5 rounded text-ink hover:bg-surface focus-ring"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-control border border-border bg-card text-ink focus-ring font-medium"
          />

          <Button
            variant="secondary"
            size="sm"
            onClick={() => fetchBookings(selectedDate)}
            isLoading={isLoading}
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>

          <Button
            variant="primary"
            onClick={() => {
              setQuickAddHour('10:00');
              setIsQuickAddOpen(true);
            }}
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

      {/* Date Header Banner */}
      <div className="bg-card border border-border rounded-card p-4 shadow-subtle flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-accent" />
          <span className="font-semibold text-sm text-ink">{formattedDate}</span>
        </div>
        <span className="text-xs font-bold text-ink-muted bg-surface px-2.5 py-1 rounded">
          {bookings.length} {bookings.length === 1 ? 'Appointment' : 'Appointments'}
        </span>
      </div>

      {/* Hourly Schedule Grid (C2) */}
      <div className="bg-card border border-border rounded-card shadow-subtle overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-4">
            <div className="h-12 bg-surface rounded animate-pulse" />
            <div className="h-12 bg-surface rounded animate-pulse" />
            <div className="h-12 bg-surface rounded animate-pulse" />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {hours.map((hour) => {
              const hourPrefix = `${hour.toString().padStart(2, '0')}:`;
              const hourLabel = `${hour % 12 || 12}:00 ${hour >= 12 ? 'PM' : 'AM'}`;

              // Find bookings that start in this hour
              const matchingBookings = bookings.filter((b) => {
                const tz = b.business_timezone || 'Asia/Kolkata';
                const local = utcToLocal(b.start_at_utc, tz);
                return local.time.startsWith(hourPrefix);
              });

              return (
                <div
                  key={hour}
                  className="flex flex-col sm:flex-row sm:items-start min-h-[72px] hover:bg-surface/50 transition-colors group"
                >
                  {/* Left Hour Label */}
                  <div className="w-24 shrink-0 p-3 sm:py-4 sm:px-4 text-xs font-mono font-semibold text-ink-muted border-b sm:border-b-0 sm:border-r border-border bg-surface/30 flex items-center justify-between sm:block">
                    <span>{hourLabel}</span>
                    <button
                      onClick={() => {
                        setQuickAddHour(`${hour.toString().padStart(2, '0')}:00`);
                        setIsQuickAddOpen(true);
                      }}
                      className="text-[10px] text-accent opacity-0 group-hover:opacity-100 sm:mt-1 block hover:underline"
                    >
                      + Add
                    </button>
                  </div>

                  {/* Right Slot Cards Container */}
                  <div className="flex-1 p-2 sm:p-3 flex flex-wrap gap-2 items-center">
                    {matchingBookings.length === 0 ? (
                      <span className="text-xs text-ink-muted/40 italic px-2">No bookings</span>
                    ) : (
                      matchingBookings.map((b) => {
                        const tz = b.business_timezone || 'Asia/Kolkata';
                        const startL = utcToLocal(b.start_at_utc, tz);
                        const endL = utcToLocal(b.end_at_utc, tz);

                        return (
                          <div
                            key={b.id}
                            onClick={() => setSelectedBookingId(b.id)}
                            className="bg-card border border-border hover:border-accent p-3 rounded-card shadow-subtle cursor-pointer transition-all hover:shadow-md flex-1 min-w-[240px] max-w-sm"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-bold text-accent">
                                {startL.time} – {endL.time}
                              </span>
                              <StatusBadge status={b.status} size="sm" />
                            </div>
                            <div className="mt-1">
                              <h4 className="font-semibold text-xs text-ink">{b.customer_name}</h4>
                              <p className="text-[11px] text-ink-muted truncate">
                                {b.service_name} • ₹{(b.price_minor / 100).toFixed(0)}
                              </p>
                            </div>
                            <div className="text-[10px] text-ink-muted/80 mt-1.5 flex items-center justify-between border-t border-border/40 pt-1">
                              <span>Ref: {b.reference}</span>
                              <span className="capitalize">{b.source}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
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
        onSuccess={() => fetchBookings(selectedDate)}
        initialDate={selectedDate}
        initialTime={quickAddHour}
      />

      {/* Booking Detail Drawer */}
      <BookingDetailDrawer
        bookingId={selectedBookingId}
        isOpen={Boolean(selectedBookingId)}
        onClose={() => setSelectedBookingId(null)}
        onStatusUpdated={() => fetchBookings(selectedDate)}
      />
    </div>
  );
};
