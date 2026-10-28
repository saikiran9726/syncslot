// SlotSync Public Business Profile & Booking Page Shell

import React, { useState, useEffect } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Feedback';
import { StatusBadge } from '../components/ui/StatusBadge';
import { apiClient } from '../lib/apiClient';
import { Clock, MapPin, Phone, Mail, Info, Calendar, Sparkles } from 'lucide-react';

interface PublicBusinessData {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  description: string | null;
  address: string | null;
  accessibility_info: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  booking_mode: string;
  min_notice_hours: number;
  max_days_ahead: number;
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

export const PublicBookingPage: React.FC<{ slug: string }> = ({ slug }) => {
  const [business, setBusiness] = useState<PublicBusinessData | null>(null);
  const [services, setServices] = useState<PublicService[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);

  useEffect(() => {
    async function loadPublicData() {
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
    loadPublicData();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface py-12 px-4 max-w-lg mx-auto space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  // Unpublished or not found state
  if (notFound || !business) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center py-16 px-4 text-center">
        <div className="max-w-md w-full bg-card p-8 rounded-sheet border border-border shadow-card">
          <div className="w-12 h-12 rounded-full bg-surface border border-border flex items-center justify-center mx-auto mb-4 text-ink-muted">
            <Info className="w-6 h-6" />
          </div>
          <h1 className="font-serif text-2xl text-ink">Page Unavailable</h1>
          <p className="text-sm text-ink-muted mt-2">
            This booking page is currently not accepting appointments or does not exist.
          </p>
          <div className="mt-6 pt-6 border-t border-border">
            <a href="/" className="text-sm text-accent hover:underline font-medium">
              Return to SlotSync Home
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface pb-16">
      {/* Brand Header Banner with subtle gradient wash */}
      <div className="bg-gradient-to-b from-accent-tint/60 to-surface pt-10 pb-6 px-4 border-b border-border/50">
        <div className="max-w-2xl mx-auto text-center space-y-2">
          <span className="text-[11px] font-semibold tracking-wider uppercase text-accent">
            Book Online with
          </span>
          <h1 className="font-serif text-3xl sm:text-4xl text-ink tracking-tight">
            {business.name}
          </h1>

          {business.description && (
            <p className="text-sm text-ink-muted max-w-lg mx-auto pt-1">
              {business.description}
            </p>
          )}

          {/* Quick info pills */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-3 text-xs text-ink-muted">
            {business.address && (
              <span className="inline-flex items-center gap-1 bg-card px-2.5 py-1 rounded-control border border-border">
                <MapPin className="w-3.5 h-3.5 text-accent" /> {business.address}
              </span>
            )}
            {business.contact_phone && (
              <span className="inline-flex items-center gap-1 bg-card px-2.5 py-1 rounded-control border border-border">
                <Phone className="w-3.5 h-3.5 text-accent" /> {business.contact_phone}
              </span>
            )}
            <span className="inline-flex items-center gap-1 bg-card px-2.5 py-1 rounded-control border border-border">
              <Clock className="w-3.5 h-3.5 text-accent" /> {business.timezone}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 mt-8 space-y-6">
        {/* Service Selection Card */}
        <Card className="p-6 sm:p-8 space-y-5 shadow-card">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <h2 className="text-lg font-semibold text-ink">Select a Service</h2>
              <p className="text-xs text-ink-muted">Choose your appointment offering to view live availability</p>
            </div>
            <span className="text-xs font-mono text-accent bg-accent-tint px-2 py-0.5 rounded">
              {services.length} Available
            </span>
          </div>

          <div className="space-y-3">
            {services.map((service) => {
              const isSelected = selectedServiceId === service.id;
              return (
                <div
                  key={service.id}
                  onClick={() => setSelectedServiceId(service.id)}
                  className={`p-4 rounded-card border cursor-pointer transition-all flex items-center justify-between gap-4 ${
                    isSelected
                      ? 'border-accent bg-accent-tint/40 shadow-sm'
                      : 'border-border bg-card hover:border-accent/40'
                  }`}
                >
                  <div>
                    <h3 className="font-medium text-ink text-sm sm:text-base">{service.name}</h3>
                    {service.description && (
                      <p className="text-xs text-ink-muted mt-0.5">{service.description}</p>
                    )}
                    <p className="text-xs text-ink-muted mt-1 font-mono">
                      {service.duration_minutes} min
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-ink font-mono text-base">
                      ₹{(service.price_minor / 100).toFixed(0)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Slot availability placeholder preview */}
          {selectedServiceId && (
            <div className="mt-6 p-4 rounded-card border border-accent/20 bg-accent-tint/30 text-center space-y-2">
              <Calendar className="w-5 h-5 text-accent mx-auto" />
              <p className="text-sm font-medium text-ink">Slot Picker Ready</p>
              <p className="text-xs text-ink-muted max-w-sm mx-auto">
                Real-time appointment slot calculation and instant reservation engine activates in Phase 4.
              </p>
            </div>
          )}
        </Card>

        {/* Business Policies & Accessibility */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {business.accessibility_info && (
            <Card className="p-4 space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-accent">
                Accessibility & Parking
              </h3>
              <p className="text-xs text-ink-muted">{business.accessibility_info}</p>
            </Card>
          )}

          {business.cancellation_policy_text && (
            <Card className="p-4 space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-accent">
                Cancellation Policy
              </h3>
              <p className="text-xs text-ink-muted">{business.cancellation_policy_text}</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
