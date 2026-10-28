// SlotSync Customer Booking Flow (Vertical Slice)
// 4-step mobile-first wizard: Service -> Date -> Time -> Contact Intake -> Confirmation
// Race-safe with 409 conflict handling & alternative slots sheet, +91 phone normalization, and .ics export.

import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { FormField } from '../components/ui/FormField';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Skeleton } from '../components/ui/Feedback';
import { apiClient } from '../lib/apiClient';
import { normalizePhone } from '../../shared/phone';
import { downloadIcsFile } from '../../shared/ics';
import {
  Clock,
  MapPin,
  Phone,
  Mail,
  Calendar as CalendarIcon,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  Share2,
  Sparkles,
  ArrowRight,
} from 'lucide-react';

interface PublicBusinessData {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  description: string | null;
  address: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  min_notice_hours: number;
  max_days_ahead: number;
  cancel_cutoff_hours: number;
  cancellation_policy_text: string | null;
}

interface PublicService {
  id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  buffer_minutes: number;
  price_minor: number;
  currency: string;
}

interface AvailableSlot {
  start_at_utc: string;
  end_at_utc: string;
  buffer_end_at_utc: string;
  local_date: string;
  local_time: string;
  display_time: string;
  period: 'morning' | 'afternoon' | 'evening';
}

interface ConfirmedBooking {
  id: string;
  reference: string;
  manage_token: string;
  manage_url: string;
  status: string;
  start_at_utc: string;
  end_at_utc: string;
  service_name: string;
  price_minor: number;
}

export const PublicBookingPage: React.FC<{ slug: string }> = ({ slug }) => {
  const [business, setBusiness] = useState<PublicBusinessData | null>(null);
  const [services, setServices] = useState<PublicService[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Wizard state: 1 = Service, 2 = Date & Time, 3 = Details, 4 = Confirmed
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [selectedService, setSelectedService] = useState<PublicService | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [timezoneLabel, setTimezoneLabel] = useState<string>('');

  // Customer contact form
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('+91 ');
  const [customerEmail, setCustomerEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [consentEmail, setConsentEmail] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictAlternatives, setConflictAlternatives] = useState<AvailableSlot[]>([]);
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);

  // Marketing attribution tag from ?src=
  const sourceTag = useMemo(() => {
    if (typeof window === 'undefined') return 'direct';
    const params = new URLSearchParams(window.location.search);
    return params.get('src') || 'direct';
  }, []);

  // Phone normalization preview
  const phoneValidation = useMemo(() => {
    return normalizePhone(customerPhone, 'IN');
  }, [customerPhone]);

  // Load business & services
  useEffect(() => {
    async function loadBusiness() {
      try {
        const res = await apiClient.get<{ business: PublicBusinessData; services: PublicService[] }>(
          `/api/public/business/${slug}`
        );
        if (res.data) {
          setBusiness(res.data.business);
          setServices(res.data.services || []);
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    loadBusiness();
  }, [slug]);

  // Date strip generation: Next 14 days
  const dateOptions = useMemo(() => {
    const list: { dateStr: string; dayName: string; dayNum: number; monthName: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const monthName = d.toLocaleDateString('en-US', { month: 'short' });
      list.push({ dateStr, dayName, dayNum: d.getDate(), monthName });
    }
    return list;
  }, []);

  // Set default selected date once options exist
  useEffect(() => {
    if (dateOptions.length > 0 && !selectedDate) {
      setSelectedDate(dateOptions[0].dateStr);
    }
  }, [dateOptions, selectedDate]);

  // Fetch slots whenever service or selectedDate changes
  useEffect(() => {
    if (!selectedService || !selectedDate || !business) return;

    async function fetchSlots() {
      setSlotsLoading(true);
      try {
        const res = await apiClient.get<{
          available_slots?: AvailableSlot[];
          slots?: AvailableSlot[];
          timezone_label?: string;
        }>(`/api/public/${slug}/availability?service_id=${selectedService?.id}&date=${selectedDate}`);

        if (res.data) {
          const slots = res.data.slots || res.data.available_slots || [];
          setAvailableSlots(slots);
          if (res.data.timezone_label) {
            setTimezoneLabel(res.data.timezone_label);
          }
        }
      } catch {
        setAvailableSlots([]);
      } finally {
        setSlotsLoading(false);
      }
    }

    fetchSlots();
  }, [selectedService, selectedDate, business, slug]);

  // Group available slots by period (Morning, Afternoon, Evening)
  const groupedSlots = useMemo(() => {
    const morning = availableSlots.filter((s) => s.period === 'morning');
    const afternoon = availableSlots.filter((s) => s.period === 'afternoon');
    const evening = availableSlots.filter((s) => s.period === 'evening');
    return { morning, afternoon, evening };
  }, [availableSlots]);

  // Handle final booking submission
  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedService || !selectedSlot) return;

    if (!customerName.trim()) {
      setErrorMessage('Please enter your name');
      return;
    }

    if (!phoneValidation.valid) {
      setErrorMessage('Please enter a valid mobile number');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    setConflictAlternatives([]);

    try {
      const res = await apiClient.post<{
        booking: ConfirmedBooking;
        error?: { code: string; message: string; details?: { alternative_slots?: AvailableSlot[] } };
        alternative_slots?: AvailableSlot[];
      }>(`/api/public/${slug}/bookings`, {
        service_id: selectedService.id,
        start_at_utc: selectedSlot.start_at_utc,
        customer_name: customerName.trim(),
        customer_phone: phoneValidation.e164,
        customer_email: customerEmail.trim() || undefined,
        notes: notes.trim() || undefined,
        source_tag: sourceTag,
        consent_email_reminders: consentEmail,
      });

      if (res.data && res.data.booking) {
        setConfirmedBooking(res.data.booking);
        setStep(4);
      }
    } catch (err: any) {
      const errorData = err.response?.data?.error;
      const alternatives =
        err.response?.data?.alternative_slots ||
        err.response?.data?.error?.details?.alternative_slots ||
        [];

      if (errorData?.code === 'slot_taken' || err.response?.status === 409) {
        setErrorMessage('This time slot was just booked by someone else.');
        setConflictAlternatives(alternatives);
      } else {
        setErrorMessage(errorData?.message || 'Unable to complete your booking. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Download .ics calendar invite
  const handleDownloadIcs = () => {
    if (!confirmedBooking || !selectedSlot || !business || !selectedService) return;
    downloadIcsFile({
      reference: confirmedBooking.reference,
      businessName: business.name,
      serviceName: selectedService.name,
      startAtUtc: confirmedBooking.start_at_utc,
      endAtUtc: confirmedBooking.end_at_utc,
      description: `Appointment for ${selectedService.name} at ${business.name}. Manage: ${confirmedBooking.manage_url}`,
      location: business.address || undefined,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface py-12 px-4 max-w-lg mx-auto space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (notFound || !business) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="max-w-md w-full bg-card p-8 rounded-sheet border border-border shadow-card">
          <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center mx-auto mb-4 text-ink-muted">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h1 className="font-serif text-2xl text-ink">Page Unavailable</h1>
          <p className="text-sm text-ink-muted mt-2">
            This booking page is currently not accepting appointments or does not exist.
          </p>
        </div>
      </div>
    );
  }

  // --- STEP 4: CONFIRMATION SCREEN ---
  if (step === 4 && confirmedBooking) {
    return (
      <div className="min-h-screen bg-surface py-8 px-4 max-w-lg mx-auto">
        <div className="bg-card rounded-sheet border border-border shadow-card p-6 md:p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-success-light/20 text-success rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-9 h-9" />
            </div>
            <h1 className="font-serif text-2xl text-ink font-semibold">Appointment Confirmed!</h1>
            <p className="text-sm text-ink-muted">
              We look forward to welcoming you at {business.name}.
            </p>
          </div>

          {/* Reference Pill */}
          <div className="bg-surface border border-border/80 rounded-card p-4 text-center">
            <div className="text-xs uppercase tracking-wider text-ink-muted font-medium">Booking Reference</div>
            <div className="font-mono text-xl font-bold text-accent mt-1 tracking-widest">
              {confirmedBooking.reference}
            </div>
            <p className="text-xs text-ink-muted mt-1">Please quote this reference upon arrival</p>
          </div>

          {/* Appointment Details */}
          <div className="space-y-3 text-sm border-t border-border pt-4">
            <div className="flex justify-between py-1">
              <span className="text-ink-muted">Service</span>
              <span className="font-medium text-ink">{selectedService?.name}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-ink-muted">Date & Time</span>
              <span className="font-medium text-ink tabular-nums">
                {selectedSlot?.local_date} at {selectedSlot?.display_time}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-ink-muted">Duration</span>
              <span className="font-medium text-ink tabular-nums">{selectedService?.duration_minutes} mins</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-ink-muted">Total Price</span>
              <span className="font-medium text-ink tabular-nums font-mono">
                ₹{((confirmedBooking.price_minor || 0) / 100).toFixed(0)}
              </span>
            </div>
            {business.address && (
              <div className="flex justify-between py-1 items-start">
                <span className="text-ink-muted">Location</span>
                <span className="font-medium text-ink text-right max-w-[200px]">{business.address}</span>
              </div>
            )}
          </div>

          {/* Actions: Add to Calendar & Self-service Manage */}
          <div className="space-y-3 pt-2">
            <Button variant="secondary" className="w-full justify-center" onClick={handleDownloadIcs}>
              <Download className="w-4 h-4 mr-2" /> Add to Calendar (.ics)
            </Button>
            <a
              href={`/b/${slug}/manage/${confirmedBooking.manage_token}`}
              className="inline-flex items-center justify-center w-full px-4 py-2.5 rounded-card border border-border bg-surface text-ink text-sm font-medium hover:bg-card hover:border-accent transition-colors"
            >
              Manage / Reschedule Appointment
            </a>
          </div>

          {/* Reminder Notice */}
          <p className="text-xs text-center text-ink-muted pt-2 border-t border-border">
            Reminders: automated reminders depend on business settings. Keep your reference safe.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface pb-28">
      {/* Brand Header */}
      <div className="bg-gradient-to-b from-card to-surface border-b border-border py-6 px-4">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold tracking-wider text-accent uppercase">Book Appointment</span>
              <h1 className="font-serif text-2xl font-bold text-ink mt-0.5">{business.name}</h1>
            </div>
            <StatusBadge status="confirmed" label="Open for Booking" />
          </div>
          {business.description && (
            <p className="text-xs text-ink-muted mt-2 line-clamp-2">{business.description}</p>
          )}
          {business.address && (
            <div className="flex items-center text-xs text-ink-muted mt-2">
              <MapPin className="w-3.5 h-3.5 mr-1 text-ink-muted/80 flex-shrink-0" />
              <span className="truncate">{business.address}</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress Indicators */}
      <div className="max-w-lg mx-auto px-4 py-4">
        <div className="flex items-center justify-between text-xs font-medium text-ink-muted mb-2">
          <span className={step >= 1 ? 'text-accent font-semibold' : ''}>1. Service</span>
          <ChevronRight className="w-3.5 h-3.5 text-border" />
          <span className={step >= 2 ? 'text-accent font-semibold' : ''}>2. Time</span>
          <ChevronRight className="w-3.5 h-3.5 text-border" />
          <span className={step >= 3 ? 'text-accent font-semibold' : ''}>3. Your Details</span>
        </div>
        <div className="w-full bg-border/60 h-1 rounded-full overflow-hidden">
          <div
            className="bg-accent h-full transition-all duration-300"
            style={{ width: step === 1 ? '33%' : step === 2 ? '66%' : '100%' }}
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-lg mx-auto px-4 space-y-4">
        {/* STEP 1: SERVICE SELECTION */}
        {step === 1 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">Select a Service</h2>
            <div className="space-y-2">
              {services.map((svc) => {
                const isSelected = selectedService?.id === svc.id;
                return (
                  <button
                    key={svc.id}
                    type="button"
                    onClick={() => setSelectedService(svc)}
                    className={`w-full text-left p-4 rounded-card border transition-all ${
                      isSelected
                        ? 'border-accent bg-accent/5 ring-1 ring-accent shadow-sm'
                        : 'border-border bg-card hover:border-ink-muted/30'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-ink text-base">{svc.name}</div>
                        {svc.description && (
                          <p className="text-xs text-ink-muted mt-1 line-clamp-2">{svc.description}</p>
                        )}
                        <div className="flex items-center text-xs text-ink-muted mt-2 space-x-3">
                          <span className="flex items-center">
                            <Clock className="w-3.5 h-3.5 mr-1 text-ink-muted" />
                            {svc.duration_minutes} mins
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-mono font-semibold text-ink text-base">
                          ₹{(svc.price_minor / 100).toFixed(0)}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 2: DATE & TIME SELECTION */}
        {step === 2 && selectedService && (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">Choose Date</h2>
                <span className="text-xs text-ink-muted">Next 14 days</span>
              </div>

              {/* Horizontal Date Strip */}
              <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-none -mx-4 px-4">
                {dateOptions.map((opt) => {
                  const isSelected = selectedDate === opt.dateStr;
                  return (
                    <button
                      key={opt.dateStr}
                      type="button"
                      onClick={() => {
                        setSelectedDate(opt.dateStr);
                        setSelectedSlot(null);
                      }}
                      className={`flex-shrink-0 w-16 py-3 px-2 rounded-card text-center border transition-all ${
                        isSelected
                          ? 'border-accent bg-accent text-white shadow-sm'
                          : 'border-border bg-card text-ink hover:border-accent/40'
                      }`}
                    >
                      <div className={`text-[10px] uppercase font-semibold ${isSelected ? 'text-white/90' : 'text-ink-muted'}`}>
                        {opt.dayName}
                      </div>
                      <div className="text-lg font-bold font-mono mt-0.5">{opt.dayNum}</div>
                      <div className={`text-[10px] ${isSelected ? 'text-white/80' : 'text-ink-muted'}`}>
                        {opt.monthName}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time Slots Area */}
            <div className="space-y-3 pt-2">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">Available Time</h2>
                {timezoneLabel && <span className="text-[11px] text-ink-muted">{timezoneLabel}</span>}
              </div>

              {slotsLoading ? (
                <div className="grid grid-cols-3 gap-2 py-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : availableSlots.length === 0 ? (
                <div className="p-8 text-center bg-card rounded-card border border-border">
                  <CalendarIcon className="w-8 h-8 text-ink-muted/50 mx-auto mb-2" />
                  <p className="text-sm font-medium text-ink">No slots available on this date</p>
                  <p className="text-xs text-ink-muted mt-1">
                    Please pick another date from the strip above.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Morning Slots */}
                  {groupedSlots.morning.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium text-ink-muted">Morning</div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {groupedSlots.morning.map((slot) => {
                          const isSelected = selectedSlot?.start_at_utc === slot.start_at_utc;
                          return (
                            <button
                              key={slot.start_at_utc}
                              type="button"
                              onClick={() => setSelectedSlot(slot)}
                              className={`py-2 px-3 text-xs font-medium font-mono rounded-card border transition-all ${
                                isSelected
                                  ? 'border-accent bg-accent text-white shadow-sm'
                                  : 'border-border bg-card text-ink hover:border-accent/40'
                              }`}
                            >
                              {slot.display_time}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Afternoon Slots */}
                  {groupedSlots.afternoon.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium text-ink-muted">Afternoon</div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {groupedSlots.afternoon.map((slot) => {
                          const isSelected = selectedSlot?.start_at_utc === slot.start_at_utc;
                          return (
                            <button
                              key={slot.start_at_utc}
                              type="button"
                              onClick={() => setSelectedSlot(slot)}
                              className={`py-2 px-3 text-xs font-medium font-mono rounded-card border transition-all ${
                                isSelected
                                  ? 'border-accent bg-accent text-white shadow-sm'
                                  : 'border-border bg-card text-ink hover:border-accent/40'
                              }`}
                            >
                              {slot.display_time}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Evening Slots */}
                  {groupedSlots.evening.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium text-ink-muted">Evening</div>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {groupedSlots.evening.map((slot) => {
                          const isSelected = selectedSlot?.start_at_utc === slot.start_at_utc;
                          return (
                            <button
                              key={slot.start_at_utc}
                              type="button"
                              onClick={() => setSelectedSlot(slot)}
                              className={`py-2 px-3 text-xs font-medium font-mono rounded-card border transition-all ${
                                isSelected
                                  ? 'border-accent bg-accent text-white shadow-sm'
                                  : 'border-border bg-card text-ink hover:border-accent/40'
                              }`}
                            >
                              {slot.display_time}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 3: CONTACT INTAKE FORM */}
        {step === 3 && selectedService && selectedSlot && (
          <form onSubmit={handleBookingSubmit} className="space-y-4">
            <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">Your Details</h2>

            <div className="bg-card p-5 rounded-sheet border border-border shadow-card space-y-4">
              <FormField label="Full Name" required>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-card text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </FormField>

              <FormField
                label="Mobile Phone"
                required
                hint={phoneValidation.valid ? `Normalized: ${phoneValidation.display}` : 'Enter 10-digit mobile number'}
              >
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className={`w-full px-3 py-2 text-sm bg-surface border rounded-card text-ink focus:outline-none focus:ring-1 ${
                    customerPhone.length > 5 && !phoneValidation.valid
                      ? 'border-danger focus:ring-danger'
                      : 'border-border focus:ring-accent'
                  }`}
                />
              </FormField>

              <FormField label="Email Address (Optional)" hint="For appointment confirmation & calendar invite">
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="rahul@example.com"
                  className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-card text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </FormField>

              {customerEmail.trim().length > 0 && (
                <label className="flex items-start space-x-2.5 text-xs text-ink cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={consentEmail}
                    onChange={(e) => setConsentEmail(e.target.checked)}
                    className="mt-0.5 rounded border-border text-accent focus:ring-accent"
                  />
                  <span>Send me email reminders before my appointment</span>
                </label>
              )}

              <FormField label="Visit Notes (Optional)">
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any preferences or specific requirements..."
                  className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-card text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </FormField>
            </div>

            {/* Cancellation Policy Banner */}
            <div className="bg-surface border border-border rounded-card p-3.5 text-xs text-ink-muted flex items-start space-x-2">
              <Clock className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
              <span>
                {business.cancellation_policy_text ||
                  `Free cancellation and rescheduling up to ${business.cancel_cutoff_hours || 2} hours before your appointment.`}
              </span>
            </div>

            {/* Error Message & Conflict Alternative Slots */}
            {errorMessage && (
              <div className="bg-danger/10 border border-danger/30 text-danger p-4 rounded-card space-y-2">
                <div className="flex items-center text-xs font-medium">
                  <AlertCircle className="w-4 h-4 mr-1.5 flex-shrink-0" />
                  {errorMessage}
                </div>

                {conflictAlternatives.length > 0 && (
                  <div className="pt-2 border-t border-danger/20">
                    <p className="text-xs font-semibold text-ink mb-1.5">
                      Available nearby alternatives:
                    </p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {conflictAlternatives.map((alt) => (
                        <button
                          key={alt.start_at_utc}
                          type="button"
                          onClick={() => {
                            setSelectedSlot(alt);
                            setErrorMessage(null);
                            setConflictAlternatives([]);
                          }}
                          className="py-1.5 px-2 bg-card border border-border rounded text-[11px] font-mono text-ink hover:border-accent"
                        >
                          {alt.display_time}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </form>
        )}
      </div>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 inset-x-0 bg-card border-t border-border shadow-lg p-3 z-30">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            {step > 1 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setStep((s) => (s - 1) as any)}
                disabled={submitting}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
            )}
            <div>
              {selectedService ? (
                <div>
                  <div className="text-xs font-semibold text-ink truncate max-w-[150px]">
                    {selectedService.name}
                  </div>
                  <div className="text-xs text-ink-muted tabular-nums">
                    ₹{(selectedService.price_minor / 100).toFixed(0)} • {selectedService.duration_minutes}m
                  </div>
                </div>
              ) : (
                <div className="text-xs text-ink-muted">Select a service to begin</div>
              )}
            </div>
          </div>

          <div>
            {step === 1 && (
              <Button
                variant="primary"
                disabled={!selectedService}
                onClick={() => setStep(2)}
              >
                Choose Time <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}

            {step === 2 && (
              <Button
                variant="primary"
                disabled={!selectedSlot}
                onClick={() => setStep(3)}
              >
                Continue <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}

            {step === 3 && (
              <Button
                variant="primary"
                loading={submitting}
                disabled={!customerName.trim() || !phoneValidation.valid || submitting}
                onClick={handleBookingSubmit}
              >
                Confirm Booking <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
