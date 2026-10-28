// SlotSync Customer Profile & Timeline Drawer (D2, D4, D6, D7)
// Slide-over drawer with customer metrics, appointment history, relationship notes, and Book Again.

import React, { useState, useEffect } from 'react';
import {
  X,
  Phone,
  Mail,
  Calendar,
  Clock,
  RotateCcw,
  Plus,
  Trash2,
  Lock,
  MessageCircle,
  AlertTriangle,
  GitMerge,
  UserCheck,
  ShieldAlert,
} from 'lucide-react';
import { StatusBadge } from './ui/StatusBadge';
import { Button } from './ui/Button';
import { utcToLocal } from '../../shared/availability';
import { useAuth } from '../context/AuthContext';

export interface CustomerProfileDrawerProps {
  customerId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onBookAgain?: (customer: {
    id: string;
    name: string;
    phone: string;
    email: string;
    serviceId?: string;
  }) => void;
  onOpenMerge?: (customerId: string) => void;
  onCustomerUpdated?: () => void;
  businessTimezone?: string;
}

interface CustomerData {
  id: string;
  name: string;
  display_phone: string;
  normalized_phone: string;
  email: string | null;
  pending_deletion: number;
  pending_deletion_at_utc: string | null;
  opted_out_at_utc: string | null;
  opt_out_reason: string | null;
  is_merged_alias?: boolean;
}

interface SummaryData {
  total_bookings: number;
  completed_bookings: number;
  cancelled_bookings: number;
  no_show_bookings: number;
  confirmed_bookings: number;
  total_spend_minor: number;
  last_visit_at_utc: string | null;
  next_booking: {
    id: string;
    reference: string;
    start_at_utc: string;
    service_name: string;
    status: string;
  } | null;
}

interface BookingRecord {
  id: string;
  reference: string;
  start_at_utc: string;
  end_at_utc: string;
  status: string;
  price_minor: number;
  currency: string;
  notes?: string;
  possible_match: number;
  cancelled_reason?: string;
  created_at_utc: string;
  service_id: string;
  service_name: string;
  duration_minutes: number;
}

interface NoteRecord {
  id: string;
  note_text: string;
  is_private: number;
  author_name: string;
  author_role: string;
  created_at_utc: string;
}

export const CustomerProfileDrawer: React.FC<CustomerProfileDrawerProps> = ({
  customerId,
  isOpen,
  onClose,
  onBookAgain,
  onOpenMerge,
  onCustomerUpdated,
  businessTimezone = 'Asia/Kolkata',
}) => {
  const { user, role } = useAuth();
  const isOwner = role === 'owner';

  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [notes, setNotes] = useState<NoteRecord[]>([]);

  const [activeTab, setActiveTab] = useState<'timeline' | 'notes'>('timeline');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New Note state
  const [noteText, setNoteText] = useState('');
  const [isPrivateNote, setIsPrivateNote] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isTogglingDeletion, setIsTogglingDeletion] = useState(false);

  useEffect(() => {
    if (!isOpen || !customerId) {
      setCustomer(null);
      setSummary(null);
      setBookings([]);
      setNotes([]);
      setErrorMessage(null);
      return;
    }

    const fetchCustomer = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetch(`/api/owner/customers/${customerId}`);
        if (!res.ok) {
          throw new Error('Customer not found or access denied');
        }
        const data = (await res.json()) as any;
        setCustomer(data.customer);
        setSummary(data.summary);
        setBookings(data.bookings || []);
        setNotes(data.notes || []);
      } catch (err: any) {
        setErrorMessage(err.message || 'Failed to load customer profile');
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomer();
  }, [isOpen, customerId]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim() || !customerId) return;

    setIsSavingNote(true);
    try {
      const res = await fetch(`/api/owner/customers/${customerId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note_text: noteText.trim(),
          is_private: isPrivateNote,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        setNotes([data.note, ...notes]);
        setNoteText('');
        setIsPrivateNote(false);
      } else {
        const err = (await res.json()) as any;
        alert(err.error?.message || 'Failed to save note');
      }
    } catch {
      alert('Network error while saving note');
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!confirm('Are you sure you want to delete this note?') || !customerId) return;

    try {
      const res = await fetch(`/api/owner/customers/${customerId}/notes/${noteId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setNotes(notes.filter((n) => n.id !== noteId));
      }
    } catch {
      alert('Failed to delete note');
    }
  };

  const handleTogglePendingDeletion = async () => {
    if (!customer) return;
    const willMark = customer.pending_deletion !== 1;
    const confirmMsg = willMark
      ? 'Mark this customer for deletion? They will be excluded from reminder notifications and new bookings.'
      : 'Restore this customer record from pending deletion?';

    if (!confirm(confirmMsg)) return;

    setIsTogglingDeletion(true);
    try {
      const res = await fetch(`/api/owner/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pending_deletion: willMark,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        setCustomer(data.customer);
        if (onCustomerUpdated) onCustomerUpdated();
      }
    } catch {
      alert('Failed to update customer status');
    } finally {
      setIsTogglingDeletion(false);
    }
  };

  if (!isOpen) return null;

  // Build honest WhatsApp prefilled link
  const rawCleanPhone = customer?.normalized_phone?.replace(/\D/g, '') || '';
  const waUrl = rawCleanPhone
    ? `https://wa.me/${rawCleanPhone}?text=${encodeURIComponent(`Hello ${customer?.name || 'there'}, greeting from our team!`)}`
    : null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-ink/40 backdrop-blur-xs flex justify-end animate-fade-in">
      <div
        className="w-full max-w-xl bg-card border-l border-border h-full flex flex-col shadow-card animate-slide-left"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-drawer-title"
      >
        {/* Drawer Header */}
        <div className="p-5 border-b border-border flex items-start justify-between bg-surface/50">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="customer-drawer-title" className="text-xl font-display font-semibold text-ink">
                {customer?.name || 'Customer Profile'}
              </h2>
              {customer?.pending_deletion === 1 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-danger-light text-danger">
                  <ShieldAlert className="w-3.5 h-3.5" />
                  Pending Deletion
                </span>
              )}
              {customer?.is_merged_alias && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-light text-primary">
                  <GitMerge className="w-3.5 h-3.5" />
                  Merged Alias
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-ink-muted">
              {customer?.display_phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5" />
                  {customer.display_phone}
                </span>
              )}
              {customer?.email && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  {customer.email}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 -mr-2 text-ink-muted hover:text-ink rounded-control hover:bg-surface focus-ring"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Bar */}
        <div className="px-5 py-3 border-b border-border bg-card flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {waUrl && (
              <a
                href={waUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-control text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                title="Opens WhatsApp Web/App in a new tab"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                WhatsApp
              </a>
            )}

            {isOwner && onOpenMerge && customer && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenMerge(customer.id)}
                leftIcon={<GitMerge className="w-3.5 h-3.5 text-ink-muted" />}
              >
                Merge Duplicate
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleTogglePendingDeletion}
              isLoading={isTogglingDeletion}
              className={customer?.pending_deletion === 1 ? 'text-primary' : 'text-danger hover:bg-danger-light'}
            >
              {customer?.pending_deletion === 1 ? 'Restore Record' : 'Request Deletion'}
            </Button>
          </div>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {isLoading ? (
            <div className="space-y-4 py-8 animate-pulse">
              <div className="h-20 bg-surface rounded-card" />
              <div className="h-40 bg-surface rounded-card" />
            </div>
          ) : errorMessage ? (
            <div className="p-4 rounded-card bg-danger-light text-danger text-sm flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          ) : (
            <>
              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-control bg-surface border border-border">
                  <span className="text-xs text-ink-muted block">Total Visits</span>
                  <span className="text-lg font-bold text-ink">{summary?.total_bookings ?? 0}</span>
                </div>
                <div className="p-3 rounded-control bg-surface border border-border">
                  <span className="text-xs text-ink-muted block">Completed</span>
                  <span className="text-lg font-bold text-emerald-600">
                    {summary?.completed_bookings ?? 0}
                  </span>
                </div>
                <div className="p-3 rounded-control bg-surface border border-border">
                  <span className="text-xs text-ink-muted block">No-Shows</span>
                  <span className="text-lg font-bold text-danger">
                    {summary?.no_show_bookings ?? 0}
                  </span>
                </div>
                <div className="p-3 rounded-control bg-surface border border-border">
                  <span className="text-xs text-ink-muted block">Total Spent</span>
                  <span className="text-lg font-bold text-ink">
                    ₹{((summary?.total_spend_minor ?? 0) / 100).toFixed(0)}
                  </span>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="border-b border-border flex gap-4">
                <button
                  onClick={() => setActiveTab('timeline')}
                  className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors ${
                    activeTab === 'timeline'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-ink-muted hover:text-ink'
                  }`}
                >
                  Appointment History ({bookings.length})
                </button>
                <button
                  onClick={() => setActiveTab('notes')}
                  className={`pb-2.5 text-sm font-semibold border-b-2 transition-colors ${
                    activeTab === 'notes'
                      ? 'border-primary text-primary'
                      : 'border-transparent text-ink-muted hover:text-ink'
                  }`}
                >
                  Relationship Notes ({notes.length})
                </button>
              </div>

              {/* TAB 1: APPOINTMENT TIMELINE */}
              {activeTab === 'timeline' && (
                <div className="space-y-3">
                  {bookings.length === 0 ? (
                    <div className="text-center py-8 text-ink-muted text-sm bg-surface/50 rounded-card p-6 border border-border">
                      <Calendar className="w-8 h-8 mx-auto mb-2 text-ink-muted/50" />
                      No appointment records found for this customer.
                    </div>
                  ) : (
                    bookings.map((b) => {
                      let localDate = b.start_at_utc.slice(0, 10);
                      let localTime = b.start_at_utc.slice(11, 16);
                      try {
                        const local = utcToLocal(b.start_at_utc, businessTimezone);
                        localDate = local.date;
                        localTime = local.time;
                      } catch {}

                      return (
                        <div
                          key={b.id}
                          className="p-4 rounded-card border border-border bg-card hover:border-ink/20 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-subtle"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-ink text-sm">{b.service_name}</span>
                              <StatusBadge status={b.status as any} />
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5" />
                                {localDate}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {localTime} ({b.duration_minutes} min)
                              </span>
                              <span className="font-mono text-ink/70">
                                Ref: {b.reference}
                              </span>
                              <span className="font-semibold text-ink">
                                ₹{(b.price_minor / 100).toFixed(0)}
                              </span>
                            </div>

                            {b.possible_match === 1 && (
                              <div className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 mt-1">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>Phone match with different customer name on this booking</span>
                              </div>
                            )}
                          </div>

                          {/* D4: Book Again Action */}
                          {customer?.pending_deletion !== 1 && onBookAgain && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                onBookAgain({
                                  id: customer!.id,
                                  name: customer!.name,
                                  phone: customer!.display_phone || customer!.normalized_phone,
                                  email: customer!.email || '',
                                  serviceId: b.service_id,
                                })
                              }
                              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                              className="shrink-0 self-start sm:self-auto"
                            >
                              Book Again
                            </Button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* TAB 2: RELATIONSHIP NOTES (D2, D6, D7) */}
              {activeTab === 'notes' && (
                <div className="space-y-5">
                  {/* D7: Privacy Notice & Add Note Form */}
                  <form onSubmit={handleAddNote} className="p-4 rounded-card bg-surface border border-border space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-ink mb-1">
                        Add Customer Note
                      </label>
                      <textarea
                        rows={3}
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        placeholder="Operational notes only (e.g. styling preferences, preferred beverage, allergy to wool). Do not record sensitive medical, legal, or financial information."
                        maxLength={1000}
                        required
                        className="w-full text-xs p-2.5 rounded-control border border-border bg-card text-ink focus-ring resize-none placeholder:text-ink-muted/60"
                      />
                      <span className="text-[10px] text-ink-muted block text-right mt-0.5">
                        {noteText.length} / 1000 characters
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-xs text-ink cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={isPrivateNote}
                          onChange={(e) => setIsPrivateNote(e.target.checked)}
                          className="rounded border-border text-primary focus-ring"
                        />
                        <span className="flex items-center gap-1 font-medium">
                          <Lock className="w-3 h-3 text-ink-muted" />
                          Private note (Owner only)
                        </span>
                      </label>

                      <Button
                        type="submit"
                        size="sm"
                        isLoading={isSavingNote}
                        disabled={!noteText.trim()}
                        leftIcon={<Plus className="w-3.5 h-3.5" />}
                      >
                        Save Note
                      </Button>
                    </div>
                  </form>

                  {/* Notes List */}
                  <div className="space-y-3">
                    {notes.length === 0 ? (
                      <div className="text-center py-6 text-ink-muted text-xs bg-surface/30 rounded-card border border-border p-4">
                        No private notes recorded for this customer yet.
                      </div>
                    ) : (
                      notes.map((n) => (
                        <div
                          key={n.id}
                          className="p-3.5 rounded-card border border-border bg-card space-y-2 shadow-subtle"
                        >
                          <div className="flex items-center justify-between text-xs text-ink-muted">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-ink">{n.author_name}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface border border-border">
                                {n.author_role}
                              </span>
                              {n.is_private === 1 && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                  <Lock className="w-2.5 h-2.5" />
                                  Private
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span>{new Date(n.created_at_utc).toLocaleDateString()}</span>
                              {isOwner && (
                                <button
                                  onClick={() => handleDeleteNote(n.id)}
                                  className="text-ink-muted hover:text-danger p-1 rounded hover:bg-surface focus-ring"
                                  title="Delete note"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-ink whitespace-pre-wrap leading-relaxed">
                            {n.note_text}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
