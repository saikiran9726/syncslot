// SlotSync 4-Step Resumable Onboarding Wizard
// Guides the owner through Basics, Services, Working Hours, and Publish Gate

import React, { useState, useEffect } from 'react';
import { Button } from '../components/ui/Button';
import { TextField, TextArea, Select, Switch } from '../components/ui/FormField';
import { Card } from '../components/ui/Card';
import { InlineAlert, Skeleton } from '../components/ui/Feedback';
import { StatusBadge } from '../components/ui/StatusBadge';
import { apiClient } from '../lib/apiClient';
import { useAuth } from '../context/AuthContext';
import { getSupportedTimezones } from '../../shared/timezoneUtils';
import { validateSlug } from '../../shared/slugUtils';
import { Check, ArrowRight, ArrowLeft, Scissors, Clock, Sparkles } from 'lucide-react';

const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

interface ServiceItem {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  buffer_minutes: number;
  price_minor: number;
  is_active: number;
}

interface ScheduleItem {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: number;
}

export const OnboardingPage: React.FC = () => {
  const { business, refreshSession } = useAuth();
  const timezones = getSupportedTimezones();

  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Basics
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');

  // Step 2: Services
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceDuration, setNewServiceDuration] = useState(30);
  const [newServicePrice, setNewServicePrice] = useState(500); // in Rupees

  // Step 3: Working Hours
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [hoursError, setHoursError] = useState<string | null>(null);

  // Step 4: Publish Gate
  const [canPublish, setCanPublish] = useState(false);
  const [publishBlockers, setPublishBlockers] = useState<string[]>([]);
  const [isPublished, setIsPublished] = useState(false);

  // Load current business data & resume step
  useEffect(() => {
    async function loadData() {
      try {
        const [bizRes, servicesRes, hoursRes] = await Promise.all([
          apiClient.get<{ business: any; publish_readiness: any }>('/api/owner/business'),
          apiClient.get<{ services: ServiceItem[] }>('/api/owner/services?all=1'),
          apiClient.get<{ schedules: ScheduleItem[] }>('/api/owner/hours'),
        ]);

        if (bizRes.data) {
          const b = bizRes.data.business;
          setName(b.name || '');
          setSlug(b.slug || '');
          setTimezone(b.timezone || 'Asia/Kolkata');
          setPhone(b.contact_phone || '');
          setAddress(b.address || '');
          setDescription(b.description || '');
          setIsPublished(b.published === 1);
          setStep(b.onboarding_step || 1);

          setCanPublish(bizRes.data.publish_readiness.can_publish);
          setPublishBlockers(bizRes.data.publish_readiness.publish_blockers);
        }

        if (servicesRes.data) {
          setServices(servicesRes.data.services || []);
        }

        if (hoursRes.data && hoursRes.data.schedules.length > 0) {
          setSchedules(hoursRes.data.schedules);
        } else {
          // Default Monday-Saturday 09:00-18:00
          setSchedules(
            DAYS_OF_WEEK.map((_, day) => ({
              day_of_week: day,
              open_time: '09:00',
              close_time: '18:00',
              is_closed: day === 0 ? 1 : 0,
            }))
          );
        }
      } catch (err) {
        setError('Failed to load onboarding data.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const saveStepProgress = async (nextStep: number) => {
    try {
      await apiClient.patch('/api/owner/business', { onboarding_step: nextStep });
      setStep(nextStep);
    } catch {
      // Non-fatal if step persistence fails
      setStep(nextStep);
    }
  };

  // --- Step 1 Save ---
  const handleSaveStep1 = async () => {
    setError(null);
    const slugErr = validateSlug(slug);
    if (slugErr) {
      setError(slugErr);
      return;
    }

    setSaving(true);
    try {
      const res = await apiClient.patch('/api/owner/business', {
        name: name.trim(),
        slug: slug.trim(),
        timezone,
        contact_phone: phone.trim(),
        address: address.trim(),
        description: description.trim(),
        onboarding_step: 2,
      });

      if (res.error) {
        setError(res.error.message);
        return;
      }

      await saveStepProgress(2);
    } catch {
      setError('Failed to save business basics.');
    } finally {
      setSaving(false);
    }
  };

  // --- Step 2 Add Custom Service ---
  const handleAddService = async () => {
    if (!newServiceName.trim()) return;

    setSaving(true);
    try {
      const res = await apiClient.post<{ service: ServiceItem }>('/api/owner/services', {
        name: newServiceName.trim(),
        duration_minutes: Number(newServiceDuration),
        buffer_minutes: 10,
        price_minor: Math.round(Number(newServicePrice) * 100),
      });

      if (res.data?.service) {
        setServices((prev) => [...prev, res.data!.service]);
        setNewServiceName('');
        setNewServicePrice(500);
      }
    } catch {
      setError('Failed to add service.');
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveService = async (id: string) => {
    try {
      await apiClient.delete(`/api/owner/services/${id}`);
      setServices((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: 0 } : s)));
    } catch {
      setError('Failed to archive service.');
    }
  };

  // --- Step 3 Hours Controls ---
  const handleHoursChange = (dayIndex: number, field: keyof ScheduleItem, value: any) => {
    setHoursError(null);
    setSchedules((prev) =>
      prev.map((item) => (item.day_of_week === dayIndex ? { ...item, [field]: value } : item))
    );
  };

  const handleCopyToAllDays = (sourceDayIndex: number) => {
    const source = schedules.find((s) => s.day_of_week === sourceDayIndex);
    if (!source) return;

    setSchedules((prev) =>
      prev.map((item) =>
        item.day_of_week === 0 // keep Sunday closed by default if desired
          ? item
          : { ...item, open_time: source.open_time, close_time: source.close_time, is_closed: source.is_closed }
      )
    );
  };

  const handleSaveStep3 = async () => {
    setHoursError(null);
    // Validate end after start for open days
    for (const s of schedules) {
      if (s.is_closed === 0 && s.close_time <= s.open_time) {
        setHoursError(`On ${DAYS_OF_WEEK[s.day_of_week]}, close time must be after open time.`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await apiClient.put('/api/owner/hours', { schedules });
      if (res.error) {
        setHoursError(res.error.message);
        return;
      }

      // Check publish readiness for Step 4
      const bizRes = await apiClient.get<{ publish_readiness: any }>('/api/owner/business');
      if (bizRes.data) {
        setCanPublish(bizRes.data.publish_readiness.can_publish);
        setPublishBlockers(bizRes.data.publish_readiness.publish_blockers);
      }

      await saveStepProgress(4);
    } catch {
      setHoursError('Failed to save working hours.');
    } finally {
      setSaving(false);
    }
  };

  // --- Step 4 Publish Toggle ---
  const handlePublishToggle = async (publish: boolean) => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiClient.patch('/api/owner/business', {
        published: publish ? 1 : 0,
      });

      if (res.error) {
        setError(res.error.message);
        return;
      }

      setIsPublished(publish);
    } catch {
      setError('Failed to update publish state.');
    } finally {
      setSaving(false);
    }
  };

  const handleFinishOnboarding = async () => {
    await apiClient.patch('/api/owner/business', { onboarding_step: 5 });
    await refreshSession();
    window.location.href = '/app/settings';
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const activeServicesCount = services.filter((s) => s.is_active === 1).length;
  const openDaysCount = schedules.filter((s) => s.is_closed === 0).length;

  return (
    <div className="min-h-screen bg-surface py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        {/* Header & Steps Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-accent tracking-wider uppercase">Setup Wizard</span>
              <h1 className="font-serif text-2xl sm:text-3xl text-ink">Get Your Business Booking Ready</h1>
            </div>
            <StatusBadge status="demo" />
          </div>

          {/* Progress Bar */}
          <div className="mt-6">
            <div className="grid grid-cols-4 gap-2">
              {[
                { n: 1, label: 'Basics' },
                { n: 2, label: 'Services' },
                { n: 3, label: 'Hours' },
                { n: 4, label: 'Review & Publish' },
              ].map((s) => (
                <div key={s.n} className="flex flex-col">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      step >= s.n ? 'bg-accent' : 'bg-border'
                    }`}
                  />
                  <span
                    className={`mt-1.5 text-xs font-medium ${
                      step === s.n ? 'text-accent' : 'text-ink-muted'
                    }`}
                  >
                    {s.n}. {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6">
            <InlineAlert variant="danger" title="Error" message={error} />
          </div>
        )}

        {/* STEP 1: BUSINESS BASICS */}
        {step === 1 && (
          <Card className="p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-ink">Step 1: Business Basics & Timezone</h2>
              <p className="text-sm text-ink-muted">
                Configure your public brand and operating timezone.
              </p>
            </div>

            <TextField
              label="Business Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <div>
              <TextField
                label="Public Booking URL Slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                hint="Your customers will book appointments at syncslot.dev/b/your-slug"
                required
              />
              <p className="mt-1 text-xs text-teal font-mono">
                Booking link: /b/{slug}
              </p>
            </div>

            <Select
              label="Timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              options={timezones.map((tz) => ({ value: tz, label: tz }))}
              hint="Appointments and customer reminders operate in this timezone"
            />

            <TextField
              label="Contact Phone (Optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
            />

            <TextField
              label="Physical Address / Location"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Shop #12, Commercial Complex, Sector 4"
            />

            <TextArea
              label="Description / Welcome Message"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell your customers what makes your service exceptional..."
              rows={3}
            />

            <div className="pt-4 flex justify-end">
              <Button
                variant="primary"
                onClick={handleSaveStep1}
                loading={saving}
              >
                Continue to Services <ArrowRight className="w-4 h-4 ml-1.5 inline" />
              </Button>
            </div>
          </Card>
        )}

        {/* STEP 2: SERVICES CATALOG */}
        {step === 2 && (
          <Card className="p-6 sm:p-8 space-y-6">
            <div>
              <div className="flex items-center gap-2">
                <Scissors className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold text-ink">Step 2: Service Catalog</h2>
              </div>
              <p className="text-sm text-ink-muted mt-1">
                We pre-seeded starting services based on your preset. You can edit, archive, or add custom services.
              </p>
            </div>

            {/* Existing Services List */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                Current Services ({activeServicesCount} Active)
              </h3>
              {services.map((s) => (
                <div
                  key={s.id}
                  className={`p-3.5 rounded-card border flex items-center justify-between transition-colors ${
                    s.is_active === 1 ? 'border-border bg-card' : 'border-border/60 bg-surface/50 opacity-60'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-ink">{s.name}</p>
                      {s.is_active === 0 && (
                        <span className="text-[10px] bg-border px-1.5 py-0.5 rounded text-ink-muted">
                          Archived
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-ink-muted mt-0.5">
                      {s.duration_minutes} min duration • {s.buffer_minutes} min buffer
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-ink font-mono">
                      ₹{(s.price_minor / 100).toFixed(0)}
                    </span>
                    {s.is_active === 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleArchiveService(s.id)}
                        className="text-danger hover:text-danger hover:bg-danger-tint"
                      >
                        Archive
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Add Custom Service */}
            <div className="pt-4 border-t border-border">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted mb-3">
                Add Another Service
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div className="sm:col-span-2">
                  <TextField
                    label="Service Name"
                    placeholder="e.g. Express Beard Detailing"
                    value={newServiceName}
                    onChange={(e) => setNewServiceName(e.target.value)}
                  />
                </div>
                <div>
                  <TextField
                    label="Duration (min)"
                    type="number"
                    value={String(newServiceDuration)}
                    onChange={(e) => setNewServiceDuration(Number(e.target.value))}
                  />
                </div>
                <div>
                  <TextField
                    label="Price (₹)"
                    type="number"
                    value={String(newServicePrice)}
                    onChange={(e) => setNewServicePrice(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button variant="secondary" size="sm" onClick={handleAddService} loading={saving}>
                  + Add to Catalog
                </Button>
              </div>
            </div>

            <div className="pt-4 flex justify-between items-center border-t border-border">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="w-4 h-4 mr-1.5 inline" /> Back
              </Button>
              <Button
                variant="primary"
                onClick={() => saveStepProgress(3)}
                disabled={activeServicesCount === 0}
              >
                Continue to Hours <ArrowRight className="w-4 h-4 ml-1.5 inline" />
              </Button>
            </div>
          </Card>
        )}

        {/* STEP 3: WORKING HOURS */}
        {step === 3 && (
          <Card className="p-6 sm:p-8 space-y-6">
            <div>
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold text-ink">Step 3: Operating Hours</h2>
              </div>
              <p className="text-sm text-ink-muted mt-1">
                Set opening and closing times in your local timezone ({timezone}). 15-minute steps are enforced.
              </p>
            </div>

            {hoursError && (
              <InlineAlert variant="danger" title="Working Hours Error" message={hoursError} />
            )}

            <div className="space-y-3">
              {schedules.map((s) => (
                <div
                  key={s.day_of_week}
                  className={`p-3.5 rounded-card border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    s.is_closed === 1 ? 'border-border/60 bg-surface/50' : 'border-border bg-card'
                  }`}
                >
                  <div className="w-28 font-medium text-sm text-ink">
                    {DAYS_OF_WEEK[s.day_of_week]}
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-ink-muted cursor-pointer mr-3">
                      <input
                        type="checkbox"
                        checked={s.is_closed === 1}
                        onChange={(e) =>
                          handleHoursChange(s.day_of_week, 'is_closed', e.target.checked ? 1 : 0)
                        }
                        className="rounded border-border text-accent focus:ring-accent"
                      />
                      Closed
                    </label>

                    {s.is_closed === 0 ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="time"
                          step="900"
                          value={s.open_time}
                          onChange={(e) =>
                            handleHoursChange(s.day_of_week, 'open_time', e.target.value)
                          }
                          className="px-2.5 py-1.5 border border-border rounded-control text-xs font-mono bg-card text-ink"
                        />
                        <span className="text-xs text-ink-muted">to</span>
                        <input
                          type="time"
                          step="900"
                          value={s.close_time}
                          onChange={(e) =>
                            handleHoursChange(s.day_of_week, 'close_time', e.target.value)
                          }
                          className="px-2.5 py-1.5 border border-border rounded-control text-xs font-mono bg-card text-ink"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-ink-muted italic py-1">Closed for appointments</span>
                    )}
                  </div>

                  {s.day_of_week === 1 && s.is_closed === 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopyToAllDays(1)}
                      className="text-xs text-accent"
                    >
                      Copy Mon to all
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-4 flex justify-between items-center border-t border-border">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="w-4 h-4 mr-1.5 inline" /> Back
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveStep3}
                loading={saving}
                disabled={openDaysCount === 0}
              >
                Review & Publish <ArrowRight className="w-4 h-4 ml-1.5 inline" />
              </Button>
            </div>
          </Card>
        )}

        {/* STEP 4: REVIEW & PUBLISH GATE */}
        {step === 4 && (
          <Card className="p-6 sm:p-8 space-y-6">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-accent" />
                <h2 className="text-lg font-semibold text-ink">Step 4: Review & Publish Booking Page</h2>
              </div>
              <p className="text-sm text-ink-muted mt-1">
                Your business is fully configured. Enable booking acceptance or review your settings.
              </p>
            </div>

            {/* Summary Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-card border border-border bg-surface">
                <p className="text-xs text-ink-muted">Business Slug</p>
                <p className="text-sm font-semibold text-ink font-mono mt-1">/b/{slug}</p>
              </div>
              <div className="p-4 rounded-card border border-border bg-surface">
                <p className="text-xs text-ink-muted">Active Services</p>
                <p className="text-sm font-semibold text-ink mt-1">{activeServicesCount} Bookable Services</p>
              </div>
              <div className="p-4 rounded-card border border-border bg-surface">
                <p className="text-xs text-ink-muted">Working Schedule</p>
                <p className="text-sm font-semibold text-ink mt-1">{openDaysCount} Days Open / Week</p>
              </div>
            </div>

            {/* Publish Gate Box */}
            <div className="p-5 rounded-card border border-accent/20 bg-accent-tint/40">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-ink text-base">Accept Public Appointments</h3>
                  <p className="text-xs text-ink-muted mt-0.5">
                    {isPublished
                      ? 'Your public booking page is live and visible to customers.'
                      : 'Unpublished: customers visiting your link will see a neutral "not accepting bookings" message.'}
                  </p>
                </div>
                <Switch
                  checked={isPublished}
                  onChange={(checked) => handlePublishToggle(checked)}
                  disabled={!canPublish && !isPublished}
                />
              </div>

              {!canPublish && publishBlockers.length > 0 && (
                <div className="mt-3 pt-3 border-t border-accent/20 text-xs text-danger space-y-1">
                  <p className="font-semibold">Publish Gate Requirements:</p>
                  {publishBlockers.map((b, i) => (
                    <p key={i}>• {b}</p>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 flex justify-between items-center border-t border-border">
              <Button variant="outline" onClick={() => setStep(3)}>
                <ArrowLeft className="w-4 h-4 mr-1.5 inline" /> Back
              </Button>
              <div className="flex gap-3">
                <a
                  href={`/b/${slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center"
                >
                  <Button variant="secondary">View Public Page</Button>
                </a>
                <Button variant="primary" onClick={handleFinishOnboarding}>
                  <Check className="w-4 h-4 mr-1.5 inline" /> Go to Settings & Dashboard
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
};
