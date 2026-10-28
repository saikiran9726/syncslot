// SlotSync Bookings List Page (C3)
// Filterable bookings directory with live search, status pills, date filter,
// and slide-over detail inspection.

import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Calendar,
  Plus,
  RefreshCw,
  Clock,
  User,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  X,
  Download,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { StatusBadge } from '../components/ui/StatusBadge';
import { QuickAddModal } from '../components/QuickAddModal';
import { BookingDetailDrawer } from '../components/BookingDetailDrawer';
import { BookingStatus } from '../../shared/statusEnums';
import { utcToLocal } from '../../shared/availability';

interface BookingRow {
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
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
  service_id: string;
  service_name: string;
  duration_minutes: number;
}

export const BookingsListPage: React.FC = () => {
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('');
  const [offset, setOffset] = useState<number>(0);
  const limit = 25;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const fetchBookings = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.append('q', searchTerm.trim());
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (dateFilter) params.append('date', dateFilter);
      params.append('limit', String(limit));
      params.append('offset', String(offset));

      const res = await fetch(`/api/owner/bookings?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to fetch bookings list.');
      }
      const data = (await res.json()) as any;
      setBookings(data.bookings || []);
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setIsLoading(false);
    }
  };

  // Re-fetch on filter or pagination changes
  useEffect(() => {
    fetchBookings();
  }, [searchTerm, statusFilter, dateFilter, offset]);

  const statusPills: { key: string; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'pending', label: 'Pending' },
    { key: 'completed', label: 'Completed' },
    { key: 'cancelled', label: 'Cancelled' },
    { key: 'no_show', label: 'No Show' },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-ink">Bookings Directory</h1>
          <p className="text-xs text-ink-muted mt-0.5">Search, inspect and manage appointments</p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              window.location.href = '/api/owner/bookings/export';
            }}
            title="Download CSV of bookings"
          >
            <Download className="w-4 h-4 mr-1.5" />
            Export CSV
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={fetchBookings}
            isLoading={isLoading}
            title="Refresh List"
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

      {/* Filter and Search Bar */}
      <div className="bg-card border border-border rounded-card p-4 shadow-subtle space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              type="text"
              placeholder="Search by customer name, phone, or reference code (SS-...)"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setOffset(0);
              }}
              className="w-full text-xs pl-9 pr-3 py-2 rounded-control border border-border bg-surface text-ink focus-ring"
            />
          </div>

          {/* Date Filter */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="relative flex items-center">
              <Calendar className="w-4 h-4 absolute left-2.5 text-ink-muted pointer-events-none" />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value);
                  setOffset(0);
                }}
                className="text-xs pl-8 pr-2 py-2 rounded-control border border-border bg-surface text-ink focus-ring"
              />
            </div>
            {dateFilter && (
              <button
                onClick={() => setDateFilter('')}
                className="p-2 text-ink-muted hover:text-ink rounded-control hover:bg-surface focus-ring"
                title="Clear date filter"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {statusPills.map((pill) => (
            <button
              key={pill.key}
              onClick={() => {
                setStatusFilter(pill.key);
                setOffset(0);
              }}
              className={`px-3 py-1.5 rounded-control text-xs font-semibold whitespace-nowrap transition-colors focus-ring ${
                statusFilter === pill.key
                  ? 'bg-accent text-card'
                  : 'bg-surface text-ink-muted hover:text-ink hover:bg-border/60'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bookings List Table (C3) */}
      <div className="bg-card border border-border rounded-card shadow-subtle overflow-hidden">
        {isLoading ? (
          <div className="p-8 space-y-3">
            <div className="h-10 bg-surface rounded animate-pulse" />
            <div className="h-10 bg-surface rounded animate-pulse" />
            <div className="h-10 bg-surface rounded animate-pulse" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="p-12 text-center">
            <Clock className="w-10 h-10 text-ink-muted/40 mx-auto mb-3" />
            <h3 className="font-semibold text-ink text-sm">No Bookings Found</h3>
            <p className="text-xs text-ink-muted mt-1 max-w-sm mx-auto">
              {searchTerm || statusFilter !== 'all' || dateFilter
                ? 'No appointments match the current search or filter criteria. Try clearing filters.'
                : 'No appointments have been booked yet. Use Quick Add to schedule your first appointment.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {bookings.map((b) => {
              const tz = b.business_timezone || 'Asia/Kolkata';
              const startL = utcToLocal(b.start_at_utc, tz);
              const endL = utcToLocal(b.end_at_utc, tz);

              return (
                <div
                  key={b.id}
                  onClick={() => setSelectedBookingId(b.id)}
                  className="p-4 sm:px-5 hover:bg-surface transition-colors cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3 group"
                >
                  {/* Left: Customer + Ref */}
                  <div className="flex items-start gap-3 min-w-[220px]">
                    <div className="w-9 h-9 rounded-full bg-surface border border-border flex items-center justify-center text-ink-muted shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-ink group-hover:text-accent transition-colors">
                          {b.customer_name}
                        </span>
                        {b.possible_match === 1 && (
                          <span className="text-[10px] bg-warning-tint text-warning px-1.5 py-0.2 rounded font-bold">
                            Match?
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-ink-muted mt-0.5">
                        <span>{b.customer_phone}</span>
                        <span>•</span>
                        <span className="font-mono">{b.reference}</span>
                      </div>
                    </div>
                  </div>

                  {/* Center: Service & Price */}
                  <div className="md:text-center min-w-[160px]">
                    <span className="text-xs font-semibold text-ink block">{b.service_name}</span>
                    <span className="text-[11px] text-ink-muted">
                      ₹{(b.price_minor / 100).toFixed(0)} • {b.duration_minutes} min
                    </span>
                  </div>

                  {/* Right: Date, Time & Status */}
                  <div className="flex items-center justify-between md:justify-end gap-4 min-w-[200px]">
                    <div className="text-left md:text-right">
                      <span className="text-xs font-bold text-ink block">{startL.date}</span>
                      <span className="text-[11px] font-mono text-ink-muted">
                        {startL.time} – {endL.time}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={b.status} size="sm" />
                      <span className="text-xs text-accent opacity-0 group-hover:opacity-100 transition-opacity hidden md:inline">
                        View →
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {bookings.length > 0 && (
          <div className="p-3 border-t border-border bg-surface flex items-center justify-between">
            <span className="text-xs text-ink-muted">
              Showing page {Math.floor(offset / limit) + 1}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setOffset(offset + limit)}
                disabled={bookings.length < limit}
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Add Modal */}
      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onSuccess={() => fetchBookings()}
      />

      {/* Booking Detail Drawer */}
      <BookingDetailDrawer
        bookingId={selectedBookingId}
        isOpen={Boolean(selectedBookingId)}
        onClose={() => setSelectedBookingId(null)}
        onStatusUpdated={() => fetchBookings()}
      />
    </div>
  );
};
