// SlotSync Quick Add Appointment Modal
// Enables fast manual intake for walk-in, phone, and WhatsApp appointments.
// Implements client-side phone formatting preview and handles 409 slot_taken collisions.

import React, { useState, useEffect } from 'react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { TextField, TextArea, Select } from './ui/FormField';
import { Phone, MessageSquare, UserCheck, HelpCircle, AlertCircle } from 'lucide-react';
import { BookingSource } from '../../shared/statusEnums';
import { localToUtc } from '../../shared/availability';

export interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialDate?: string;
  initialTime?: string;
  businessTimezone?: string;
}

interface ServiceOption {
  id: string;
  name: string;
  duration_minutes: number;
  price_minor: number;
  currency: string;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialDate,
  initialTime = '10:00',
  businessTimezone = 'Asia/Kolkata',
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(initialDate || todayStr);
  const [time, setTime] = useState(initialTime);
  const [serviceId, setServiceId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [source, setSource] = useState<BookingSource>('phone');
  const [notes, setNotes] = useState('');

  const [services, setServices] = useState<ServiceOption[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync initial date if changed
  useEffect(() => {
    if (initialDate) setDate(initialDate);
    if (initialTime) setTime(initialTime);
  }, [initialDate, initialTime]);

  // Fetch active services on modal open
  useEffect(() => {
    if (!isOpen) {
      setErrorMessage(null);
      return;
    }

    const fetchServices = async () => {
      setIsLoadingServices(true);
      try {
        const res = await fetch('/api/owner/services');
        if (res.ok) {
          const data = (await res.json()) as any;
          const activeServices = (data.services || []).filter((s: any) => s.is_active === 1);
          setServices(activeServices);
          if (activeServices.length > 0 && !serviceId) {
            setServiceId(activeServices[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load services:', err);
      } finally {
        setIsLoadingServices(false);
      }
    };

    fetchServices();
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!customerName.trim()) {
      setErrorMessage('Please enter the customer name.');
      return;
    }

    if (!customerPhone.trim() || customerPhone.replace(/\D/g, '').length < 7) {
      setErrorMessage('Please enter a valid phone number (at least 7 digits).');
      return;
    }

    if (!serviceId) {
      setErrorMessage('Please select a service.');
      return;
    }

    // Convert local date and time to UTC ISO string using business timezone
    let startAtUtc: string;
    try {
      startAtUtc = localToUtc(date, time, businessTimezone);
    } catch {
      startAtUtc = new Date(`${date}T${time}:00Z`).toISOString();
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/owner/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: serviceId,
          start_at_utc: startAtUtc,
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          customer_email: customerEmail.trim() || undefined,
          source,
          notes: notes.trim() || undefined,
        }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        if (res.status === 409 || data.error?.code === 'slot_taken') {
          setErrorMessage('This time slot is already booked. Please pick another time.');
        } else {
          setErrorMessage(data.error?.message || 'Failed to create booking.');
        }
        return;
      }

      // Success
      setCustomerName('');
      setCustomerPhone('');
      setCustomerEmail('');
      setNotes('');
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error creating booking.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const sourceButtons: { key: BookingSource; label: string; icon: React.ReactNode }[] = [
    { key: 'phone', label: 'Phone Call', icon: <Phone className="w-3.5 h-3.5" /> },
    { key: 'whatsapp', label: 'WhatsApp', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { key: 'walkin', label: 'Walk-In', icon: <UserCheck className="w-3.5 h-3.5" /> },
    { key: 'other', label: 'Other', icon: <HelpCircle className="w-3.5 h-3.5" /> },
  ];

  // Helper for generating 15-minute slot times from 08:00 to 21:00
  const timeOptions: Array<{ value: string; label: string }> = [];
  for (let h = 8; h <= 21; h++) {
    for (const m of ['00', '15', '30', '45']) {
      const t = `${h.toString().padStart(2, '0')}:${m}`;
      timeOptions.push({ value: t, label: t });
    }
  }

  const serviceOptions = services.map((svc) => ({
    value: svc.id,
    label: `${svc.name} — ${svc.duration_minutes} min (₹${(svc.price_minor / 100).toFixed(0)})`,
  }));

  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="Quick Add Appointment" maxWidth="md">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {errorMessage && (
          <div className="flex items-center gap-2 p-3 bg-danger-tint text-danger rounded-control text-xs font-semibold">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Source selector pills */}
        <div>
          <label className="block text-xs font-bold text-ink-muted uppercase tracking-wider mb-1.5">
            Booking Source
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {sourceButtons.map((btn) => (
              <button
                key={btn.key}
                type="button"
                onClick={() => setSource(btn.key)}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-control text-xs font-semibold border transition-colors ${
                  source === btn.key
                    ? 'bg-accent text-card border-accent shadow-subtle'
                    : 'bg-card text-ink-muted border-border hover:bg-surface hover:text-ink'
                }`}
              >
                {btn.icon}
                <span>{btn.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Service Selector */}
        <div>
          <Select
            label="Service"
            value={serviceId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setServiceId(e.target.value)}
            disabled={isLoadingServices || services.length === 0}
            options={serviceOptions}
            required
          />
          {services.length === 0 && !isLoadingServices && (
            <p className="text-xs text-danger mt-1">No active services found. Please configure a service in Settings.</p>
          )}
        </div>

        {/* Date and Time row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            type="date"
            label="Date"
            value={date}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDate(e.target.value)}
            required
          />
          <Select
            label="Start Time"
            value={time}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTime(e.target.value)}
            options={timeOptions}
            required
          />
        </div>

        {/* Customer Name and Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TextField
            label="Customer Name"
            placeholder="e.g. Ramesh Patel"
            value={customerName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomerName(e.target.value)}
            required
          />
          <div>
            <TextField
              label="Phone Number"
              placeholder="e.g. 98765 43210"
              value={customerPhone}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomerPhone(e.target.value)}
              required
            />
            <p className="text-[11px] text-ink-muted/80 mt-1">Indian 10-digit mobile numbers will be normalized to +91.</p>
          </div>
        </div>

        {/* Customer Email & Notes */}
        <div className="grid grid-cols-1 gap-3">
          <TextField
            type="email"
            label="Customer Email (Optional)"
            placeholder="e.g. customer@example.com"
            value={customerEmail}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCustomerEmail(e.target.value)}
          />
          <TextArea
            label="Staff Notes (Optional)"
            placeholder="Special requests, haircut preferences, or intake details..."
            rows={2}
            value={notes}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
          />
        </div>

        {/* Form Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-border mt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" isLoading={isSubmitting}>
            Confirm Appointment
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
