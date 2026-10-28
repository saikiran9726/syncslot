// SlotSync Owner Settings Page
// Multi-tab Configuration: Profile, Services, Hours, Policies, and Sharing Panel with QR Generator

import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Button } from '../components/ui/Button';
import { TextField, TextArea, Select, Switch } from '../components/ui/FormField';
import { Card } from '../components/ui/Card';
import { Tabs } from '../components/ui/LayoutPrimitives';
import { Dialog } from '../components/ui/Dialog';
import { InlineAlert, Skeleton } from '../components/ui/Feedback';
import { StatusBadge } from '../components/ui/StatusBadge';
import { apiClient } from '../lib/apiClient';
import { useAuth } from '../context/AuthContext';
import { getSupportedTimezones } from '../../shared/timezoneUtils';
import { validateSlug, buildShareUrl } from '../../shared/slugUtils';
import { Copy, Download, Check, Plus, Trash2, Edit2, Share2, Clock, Shield, Briefcase, User, ExternalLink } from 'lucide-react';

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
  currency: string;
  is_active: number;
}

interface ScheduleItem {
  day_of_week: number;
  open_time: string;
  close_time: string;
  is_closed: number;
}

interface BreakItem {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

interface HolidayItem {
  id: string;
  holiday_date: string;
  name: string;
}

export const SettingsPage: React.FC = () => {
  const { business, refreshSession, updateBusinessLocally } = useAuth();
  const timezones = getSupportedTimezones();

  const [activeTab, setActiveTab] = useState('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Tab 1: Profile
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [address, setAddress] = useState('');
  const [accessibilityInfo, setAccessibilityInfo] = useState('');
  const [description, setDescription] = useState('');

  // Tab 2: Services
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [serviceName, setServiceName] = useState('');
  const [serviceDesc, setServiceDesc] = useState('');
  const [serviceDuration, setServiceDuration] = useState(30);
  const [serviceBuffer, setServiceBuffer] = useState(10);
  const [servicePriceRupees, setServicePriceRupees] = useState(500);

  // Tab 3: Working Hours & Exceptions
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [breaks, setBreaks] = useState<BreakItem[]>([]);
  const [holidays, setHolidays] = useState<HolidayItem[]>([]);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');

  // Tab 4: Policies
  const [bookingMode, setBookingMode] = useState<'instant' | 'approval'>('instant');
  const [minNoticeHours, setMinNoticeHours] = useState(2);
  const [maxDaysAhead, setMaxDaysAhead] = useState(60);
  const [cancelCutoffHours, setCancelCutoffHours] = useState(2);
  const [cancellationPolicyText, setCancellationPolicyText] = useState('');

  // Tab: Notifications & Reminders
  const [quietHoursStart, setQuietHoursStart] = useState('22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState('08:00');
  const [reminder24hEnabled, setReminder24hEnabled] = useState(true);
  const [reminder2hEnabled, setReminder2hEnabled] = useState(true);
  const [consentCopyText, setConsentCopyText] = useState('I agree to receive booking confirmations and reminder updates via email and messaging.');
  const [sandboxRecipientEmail, setSandboxRecipientEmail] = useState('');

  // Tab 5: Sharing & QR
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [qrSvgString, setQrSvgString] = useState<string>('');

  // Publish Gate
  const [published, setPublished] = useState(false);
  const [canPublish, setCanPublish] = useState(false);
  const [publishBlockers, setPublishBlockers] = useState<string[]>([]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Fetch all business settings on mount
  useEffect(() => {
    async function loadSettings() {
      try {
        const [bizRes, sRes, hRes, bRes, holRes] = await Promise.all([
          apiClient.get<{ business: any; publish_readiness: any }>('/api/owner/business'),
          apiClient.get<{ services: ServiceItem[] }>('/api/owner/services?all=1'),
          apiClient.get<{ schedules: ScheduleItem[] }>('/api/owner/hours'),
          apiClient.get<{ breaks: BreakItem[] }>('/api/owner/breaks'),
          apiClient.get<{ holidays: HolidayItem[] }>('/api/owner/holidays'),
        ]);

        if (bizRes.data) {
          const b = bizRes.data.business;
          setName(b.name || '');
          setSlug(b.slug || '');
          setTimezone(b.timezone || 'Asia/Kolkata');
          setContactPhone(b.contact_phone || '');
          setContactEmail(b.contact_email || '');
          setAddress(b.address || '');
          setAccessibilityInfo(b.accessibility_info || '');
          setDescription(b.description || '');
          setPublished(b.published === 1);
          setBookingMode(b.booking_mode || 'instant');
          setMinNoticeHours(b.min_notice_hours ?? 2);
          setMaxDaysAhead(b.max_days_ahead ?? 60);
          setCancelCutoffHours(b.cancel_cutoff_hours ?? 2);
          setCancellationPolicyText(b.cancellation_policy_text || '');

          setCanPublish(bizRes.data.publish_readiness.can_publish);
          setPublishBlockers(bizRes.data.publish_readiness.publish_blockers);
        }

        if (sRes.data) setServices(sRes.data.services || []);
        if (hRes.data) setSchedules(hRes.data.schedules || []);
        if (bRes.data) setBreaks(bRes.data.breaks || []);
        if (holRes.data) setHolidays(holRes.data.holidays || []);

        try {
          const notifRes = await apiClient.get<any>('/api/owner/notifications/preferences');
          if (notifRes.data) {
            const pref = notifRes.data.preferences || {};
            const qh = notifRes.data.quiet_hours || {};
            const rules = notifRes.data.reminder_rules || [];
            if (qh.start) setQuietHoursStart(qh.start);
            if (qh.end) setQuietHoursEnd(qh.end);
            if (pref.consent_copy_text) setConsentCopyText(pref.consent_copy_text);
            if (pref.sandbox_recipient_email) setSandboxRecipientEmail(pref.sandbox_recipient_email);
            const r24 = rules.find((r: any) => r.offset_minutes === 1440);
            if (r24) setReminder24hEnabled(r24.enabled === 1);
            const r2 = rules.find((r: any) => r.offset_minutes === 120);
            if (r2) setReminder2hEnabled(r2.enabled === 1);
          }
        } catch {
          // Defaults preserved
        }
      } catch (err) {
        setServerError('Failed to load business settings');
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  // Generate QR Code when slug or tab changes
  useEffect(() => {
    if (!slug) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://syncslot.dev';
    const qrUrl = buildShareUrl(origin, slug, 'qr');

    if (qrCanvasRef.current) {
      QRCode.toCanvas(qrCanvasRef.current, qrUrl, {
        width: 220,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#14212B', light: '#FFFFFF' },
      });
    }

    QRCode.toString(qrUrl, {
      type: 'svg',
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#14212B', light: '#FFFFFF' },
    }).then(setQrSvgString);
  }, [slug, activeTab]);

  // --- SAVE PROFILE ---
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    const slugErr = validateSlug(slug);
    if (slugErr) {
      setServerError(slugErr);
      return;
    }

    setSaving(true);
    try {
      const res = await apiClient.patch('/api/owner/business', {
        name: name.trim(),
        slug: slug.trim(),
        timezone,
        contact_phone: contactPhone.trim(),
        contact_email: contactEmail.trim(),
        address: address.trim(),
        accessibility_info: accessibilityInfo.trim(),
        description: description.trim(),
      });

      if (res.error) {
        setServerError(res.error.message);
        return;
      }

      updateBusinessLocally({ name, slug, timezone });
      showToast('Profile updated successfully');
    } catch {
      setServerError('An unexpected error occurred while saving profile.');
    } finally {
      setSaving(false);
    }
  };

  // --- SERVICE ACTIONS ---
  const handleOpenAddService = () => {
    setEditingServiceId(null);
    setServiceName('');
    setServiceDesc('');
    setServiceDuration(30);
    setServiceBuffer(10);
    setServicePriceRupees(500);
    setServiceModalOpen(true);
  };

  const handleOpenEditService = (s: ServiceItem) => {
    setEditingServiceId(s.id);
    setServiceName(s.name);
    setServiceDesc(s.description || '');
    setServiceDuration(s.duration_minutes);
    setServiceBuffer(s.buffer_minutes);
    setServicePriceRupees(Math.round(s.price_minor / 100));
    setServiceModalOpen(true);
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingServiceId) {
        const res = await apiClient.patch<{ service: ServiceItem }>(`/api/owner/services/${editingServiceId}`, {
          name: serviceName.trim(),
          description: serviceDesc.trim(),
          duration_minutes: Number(serviceDuration),
          buffer_minutes: Number(serviceBuffer),
          price_minor: Math.round(Number(servicePriceRupees) * 100),
        });

        if (res.data?.service) {
          const updatedService = res.data.service;
          setServices((prev) => prev.map((s) => (s.id === editingServiceId ? updatedService : s)));
          setServiceModalOpen(false);
          showToast('Service updated');
        }
      } else {
        const res = await apiClient.post<{ service: ServiceItem }>('/api/owner/services', {
          name: serviceName.trim(),
          description: serviceDesc.trim(),
          duration_minutes: Number(serviceDuration),
          buffer_minutes: Number(serviceBuffer),
          price_minor: Math.round(Number(servicePriceRupees) * 100),
        });

        if (res.data?.service) {
          setServices((prev) => [...prev, res.data!.service]);
          setServiceModalOpen(false);
          showToast('Service added to catalog');
        }
      }
    } catch {
      showToast('Failed to save service');
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveService = async (id: string) => {
    try {
      const res = await apiClient.delete<{ message: string }>(`/api/owner/services/${id}`);
      setServices((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: 0 } : s)));
      showToast(res.data?.message || 'Service archived');
    } catch {
      showToast('Failed to archive service');
    }
  };

  // --- WORKING HOURS ACTIONS ---
  const handleScheduleChange = (dayIndex: number, field: keyof ScheduleItem, val: any) => {
    setSchedules((prev) =>
      prev.map((item) => (item.day_of_week === dayIndex ? { ...item, [field]: val } : item))
    );
  };

  const handleSaveHours = async () => {
    setSaving(true);
    setServerError(null);
    try {
      const res = await apiClient.put('/api/owner/hours', { schedules });
      if (res.error) {
        setServerError(res.error.message);
        return;
      }
      showToast('Working hours saved');
    } catch {
      setServerError('Failed to save working hours');
    } finally {
      setSaving(false);
    }
  };

  const handleAddHoliday = async () => {
    if (!newHolidayDate || !newHolidayName.trim()) return;
    try {
      const res = await apiClient.post<{ holiday: HolidayItem }>('/api/owner/holidays', {
        holiday_date: newHolidayDate,
        name: newHolidayName.trim(),
      });
      if (res.data?.holiday) {
        setHolidays((prev) => [...prev, res.data!.holiday]);
        setNewHolidayDate('');
        setNewHolidayName('');
        showToast('Holiday added');
      }
    } catch {
      showToast('Failed to add holiday');
    }
  };

  const handleDeleteHoliday = async (id: string) => {
    try {
      await apiClient.delete(`/api/owner/holidays/${id}`);
      setHolidays((prev) => prev.filter((h) => h.id !== id));
      showToast('Holiday removed');
    } catch {
      showToast('Failed to remove holiday');
    }
  };

  // --- SAVE POLICIES ---
  const handleSavePolicies = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setServerError(null);
    try {
      const res = await apiClient.patch('/api/owner/business', {
        booking_mode: bookingMode,
        min_notice_hours: Number(minNoticeHours),
        max_days_ahead: Number(maxDaysAhead),
        cancel_cutoff_hours: Number(cancelCutoffHours),
        cancellation_policy_text: cancellationPolicyText.trim(),
      });
      if (res.error) {
        setServerError(res.error.message);
        return;
      }
      showToast('Policies updated successfully');
    } catch {
      setServerError('Failed to save policies');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setServerError(null);
    try {
      await Promise.all([
        apiClient.patch('/api/owner/notifications/preferences', {
          quiet_hours_start: quietHoursStart,
          quiet_hours_end: quietHoursEnd,
          consent_copy_text: consentCopyText.trim(),
          sandbox_recipient_email: sandboxRecipientEmail.trim() || null,
        }),
        fetch('/api/owner/reminder-rules', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rules: [
              { offset_minutes: 1440, enabled: reminder24hEnabled },
              { offset_minutes: 120, enabled: reminder2hEnabled },
            ],
          }),
        }),
      ]);
      showToast('Notification settings and reminder rules saved');
    } catch {
      setServerError('Failed to save notification settings');
    } finally {
      setSaving(false);
    }
  };

  // --- PUBLISH TOGGLE ---
  const handleTogglePublish = async (nextState: boolean) => {
    setServerError(null);
    try {
      const res = await apiClient.patch('/api/owner/business', { published: nextState ? 1 : 0 });
      if (res.error) {
        setServerError(res.error.message);
        return;
      }
      setPublished(nextState);
      updateBusinessLocally({ published: nextState ? 1 : 0 });
      showToast(nextState ? 'Business published! Appointments are now open.' : 'Business unpublished.');
    } catch {
      setServerError('Failed to update published status');
    }
  };

  // --- DOWNLOAD QR HANDLERS ---
  const handleDownloadPng = () => {
    if (!qrCanvasRef.current) return;
    const url = qrCanvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-slotsync-qr.png`;
    a.click();
  };

  const handleDownloadSvg = () => {
    if (!qrSvgString) return;
    const blob = new Blob([qrSvgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slug}-slotsync-qr.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`Copied ${label} to clipboard!`);
  };

  if (loading) {
    return (
      <div className="p-8 space-y-4 max-w-4xl">
        <Skeleton className="h-8 w-60" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://syncslot.dev';
  const publicShareUrl = buildShareUrl(origin, slug, 'link');
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(
    `Book your appointment with ${name} online: ${buildShareUrl(origin, slug, 'whatsapp')}`
  )}`;
  const instagramBioText = `Book appointments: ${buildShareUrl(origin, slug, 'instagram')}`;
  const websiteSnippet = `<a href="${buildShareUrl(origin, slug, 'website')}" target="_blank" style="display:inline-block;padding:10px 20px;background:#0F766E;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Book Appointment</a>`;

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header with Title and Publish Gate Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-2xl sm:text-3xl text-ink">Business Settings</h1>
            <StatusBadge status="demo" />
          </div>
          <p className="text-sm text-ink-muted mt-1">
            Configure profile, bookable services, hours, policies, and sharing links
          </p>
        </div>

        {/* Header Publish Gate */}
        <div className="flex items-center gap-3 p-3 bg-card rounded-card border border-border shadow-sm">
          <div>
            <div className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${published ? 'bg-success' : 'bg-warning'}`} />
              <span className="text-xs font-semibold text-ink">
                {published ? 'Accepting Bookings' : 'Unpublished (Offline)'}
              </span>
            </div>
            <p className="text-[11px] text-ink-muted">
              {published ? 'Public page is live' : 'Neutral placeholder shown'}
            </p>
          </div>
          <Switch
            checked={published}
            onChange={handleTogglePublish}
            disabled={!canPublish && !published}
          />
        </div>
      </div>

      {serverError && (
        <InlineAlert variant="danger" title="Notice" message={serverError} />
      )}

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-ink text-surface px-4 py-2.5 rounded-control shadow-overlay text-sm flex items-center gap-2 animate-bounce">
          <Check className="w-4 h-4 text-teal" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        tabs={[
          { id: 'profile', label: 'Profile' },
          { id: 'services', label: `Services (${services.filter((s) => s.is_active === 1).length})` },
          { id: 'hours', label: 'Hours & Calendar' },
          { id: 'policies', label: 'Policies' },
          { id: 'notifications', label: 'Notifications & Reminders' },
          { id: 'sharing', label: 'Share & QR Code' },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      {/* TAB 1: PROFILE */}
      {activeTab === 'profile' && (
        <Card className="p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-ink">Business Profile & Contact</h2>
            <p className="text-xs text-ink-muted">Public brand info shown to customers on your booking page</p>
          </div>

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField
                label="Business Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
              <TextField
                label="Public Booking Slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                hint="Used in your share URL: /b/slug"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Timezone"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                options={timezones.map((tz) => ({ value: tz, label: tz }))}
              />
              <TextField
                label="Contact Phone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>

            <TextField
              label="Contact Email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="hello@yourbusiness.com"
            />

            <TextField
              label="Physical Address & Directions"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Shop #12, Ground Floor, High Street Mall"
            />

            <TextArea
              label="Accessibility & Parking Info"
              value={accessibilityInfo}
              onChange={(e) => setAccessibilityInfo(e.target.value)}
              placeholder="Wheelchair accessible via front ramp. Free parking available at basement level."
              rows={2}
            />

            <TextArea
              label="Description & Welcome Message"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />

            <div className="pt-4 flex justify-end">
              <Button type="submit" variant="primary" loading={saving}>
                Save Profile Settings
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* TAB 2: SERVICES */}
      {activeTab === 'services' && (
        <Card className="p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-ink">Service Catalog</h2>
              <p className="text-xs text-ink-muted">Manage bookable offerings, duration, buffers, and prices in INR (₹)</p>
            </div>
            <Button variant="primary" size="sm" onClick={handleOpenAddService}>
              <Plus className="w-4 h-4 mr-1 inline" /> Add Service
            </Button>
          </div>

          <div className="space-y-3">
            {services.map((s) => (
              <div
                key={s.id}
                className={`p-4 rounded-card border flex items-center justify-between gap-4 transition-all ${
                  s.is_active === 1 ? 'border-border bg-card' : 'border-border/60 bg-surface/50 opacity-60'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-ink text-sm sm:text-base">{s.name}</h3>
                    {s.is_active === 0 && (
                      <span className="text-[10px] bg-border px-1.5 py-0.5 rounded text-ink-muted">
                        Archived
                      </span>
                    )}
                  </div>
                  {s.description && (
                    <p className="text-xs text-ink-muted mt-0.5 line-clamp-1">{s.description}</p>
                  )}
                  <p className="text-xs text-ink-muted mt-1 font-mono">
                    {s.duration_minutes}m duration • {s.buffer_minutes}m buffer
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className="font-semibold text-ink font-mono text-sm sm:text-base">
                    ₹{(s.price_minor / 100).toFixed(0)}
                  </span>
                  {s.is_active === 1 && (
                    <>
                      <Button size="sm" variant="outline" onClick={() => handleOpenEditService(s)}>
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleArchiveService(s.id)}
                        className="text-danger hover:bg-danger-tint"
                      >
                        Archive
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add/Edit Service Modal */}
          <Dialog
            isOpen={serviceModalOpen}
            onClose={() => setServiceModalOpen(false)}
            title={editingServiceId ? 'Edit Bookable Service' : 'Add New Bookable Service'}
          >
            <form onSubmit={handleSaveService} className="space-y-4 pt-2">
              <TextField
                label="Service Name"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                required
              />
              <TextArea
                label="Description"
                value={serviceDesc}
                onChange={(e) => setServiceDesc(e.target.value)}
                rows={2}
              />
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Duration (Minutes)"
                  type="number"
                  value={String(serviceDuration)}
                  onChange={(e) => setServiceDuration(Number(e.target.value))}
                  required
                />
                <TextField
                  label="Buffer Time (Minutes)"
                  type="number"
                  value={String(serviceBuffer)}
                  onChange={(e) => setServiceBuffer(Number(e.target.value))}
                  hint="Rest or cleaning between slots"
                />
              </div>
              <TextField
                label="Price (in INR ₹)"
                type="number"
                value={String(servicePriceRupees)}
                onChange={(e) => setServicePriceRupees(Number(e.target.value))}
                hint="Stored precisely in integer paise"
                required
              />
              <div className="pt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setServiceModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" loading={saving}>
                  Save Service
                </Button>
              </div>
            </form>
          </Dialog>
        </Card>
      )}

      {/* TAB 3: WORKING HOURS & EXCEPTIONS */}
      {activeTab === 'hours' && (
        <div className="space-y-6">
          <Card className="p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-ink">Weekly Operating Hours</h2>
                <p className="text-xs text-ink-muted">Times are aligned to 15-minute intervals in {timezone}</p>
              </div>
              <Button variant="primary" size="sm" onClick={handleSaveHours} loading={saving}>
                Save Hours
              </Button>
            </div>

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

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-ink-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={s.is_closed === 1}
                        onChange={(e) =>
                          handleScheduleChange(s.day_of_week, 'is_closed', e.target.checked ? 1 : 0)
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
                            handleScheduleChange(s.day_of_week, 'open_time', e.target.value)
                          }
                          className="px-2 py-1 border border-border rounded-control text-xs font-mono bg-card text-ink"
                        />
                        <span className="text-xs text-ink-muted">to</span>
                        <input
                          type="time"
                          step="900"
                          value={s.close_time}
                          onChange={(e) =>
                            handleScheduleChange(s.day_of_week, 'close_time', e.target.value)
                          }
                          className="px-2 py-1 border border-border rounded-control text-xs font-mono bg-card text-ink"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-ink-muted italic py-1">Closed for bookings</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Holidays & Date Exceptions */}
          <Card className="p-6 sm:p-8 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-ink">Calendar Holidays & Closure Dates</h2>
              <p className="text-xs text-ink-muted">Full day closures where no appointments can be scheduled</p>
            </div>

            <div className="flex gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Date</label>
                <input
                  type="date"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  className="px-3 py-2 border border-border rounded-control text-xs bg-card text-ink"
                />
              </div>
              <div className="flex-1">
                <TextField
                  label="Holiday Name / Reason"
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  placeholder="e.g. Diwali Closure"
                />
              </div>
              <Button size="sm" variant="secondary" onClick={handleAddHoliday}>
                + Add Holiday
              </Button>
            </div>

            {holidays.length > 0 && (
              <div className="pt-3 divide-y divide-border">
                {holidays.map((h) => (
                  <div key={h.id} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-medium text-ink">{h.name}</span>
                      <span className="ml-2 font-mono text-ink-muted">({h.holiday_date})</span>
                    </div>
                    <button
                      onClick={() => handleDeleteHoliday(h.id)}
                      className="text-danger hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 4: POLICIES */}
      {activeTab === 'policies' && (
        <Card className="p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-ink">Booking & Cancellation Policies</h2>
            <p className="text-xs text-ink-muted">Configure confirmation rules, booking horizons, and cancellation limits</p>
          </div>

          <form onSubmit={handleSavePolicies} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">Confirmation Mode</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  onClick={() => setBookingMode('instant')}
                  className={`p-3.5 rounded-card border cursor-pointer transition-colors ${
                    bookingMode === 'instant'
                      ? 'border-accent bg-accent-tint/50'
                      : 'border-border bg-card'
                  }`}
                >
                  <p className="text-sm font-semibold text-ink">Instant Confirmation (Default)</p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Customers choose a slot and receive immediate confirmation code.
                  </p>
                </div>
                <div
                  onClick={() => setBookingMode('approval')}
                  className={`p-3.5 rounded-card border cursor-pointer transition-colors ${
                    bookingMode === 'approval'
                      ? 'border-accent bg-accent-tint/50'
                      : 'border-border bg-card'
                  }`}
                >
                  <p className="text-sm font-semibold text-ink">Owner Approval Mode</p>
                  <p className="text-xs text-ink-muted mt-0.5">
                    Bookings remain pending until you manually confirm or decline.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <TextField
                label="Minimum Notice (Hours)"
                type="number"
                value={String(minNoticeHours)}
                onChange={(e) => setMinNoticeHours(Number(e.target.value))}
                hint="Lead time required before appointment"
              />
              <TextField
                label="Max Horizon (Days)"
                type="number"
                value={String(maxDaysAhead)}
                onChange={(e) => setMaxDaysAhead(Number(e.target.value))}
                hint="How far in advance customers can book"
              />
              <TextField
                label="Cancel Cutoff (Hours)"
                type="number"
                value={String(cancelCutoffHours)}
                onChange={(e) => setCancelCutoffHours(Number(e.target.value))}
                hint="Self-service cancellation window"
              />
            </div>

            <TextArea
              label="Cancellation Policy Text (Customer Notice)"
              value={cancellationPolicyText}
              onChange={(e) => setCancellationPolicyText(e.target.value)}
              placeholder="e.g. Free cancellation up to 2 hours before your appointment. Late cancellations may be subject to a fee."
              rows={3}
            />

            <div className="pt-4 flex justify-end">
              <Button type="submit" variant="primary" loading={saving}>
                Save Policy Settings
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* TAB: NOTIFICATIONS & REMINDERS (E2, E7) */}
      {activeTab === 'notifications' && (
        <Card className="p-6 sm:p-8 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-ink">Notifications & Reminders Settings</h2>
            <p className="text-xs text-ink-muted">
              Configure automated customer reminders, quiet hours, consent wording, and sandbox testing.
            </p>
          </div>

          <form onSubmit={handleSaveNotifications} className="space-y-6">
            <div className="space-y-3 pb-4 border-b border-border">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Scheduled Reminder Rules
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center justify-between p-3.5 bg-surface rounded-card border border-border">
                  <div>
                    <span className="font-semibold text-xs text-ink block">24 Hours Before</span>
                    <span className="text-[11px] text-ink-muted">Send automated email reminder 1 day prior</span>
                  </div>
                  <Switch
                    checked={reminder24hEnabled}
                    onChange={(checked) => setReminder24hEnabled(checked)}
                  />
                </div>

                <div className="flex items-center justify-between p-3.5 bg-surface rounded-card border border-border">
                  <div>
                    <span className="font-semibold text-xs text-ink block">2 Hours Before</span>
                    <span className="text-[11px] text-ink-muted">Send urgent email reminder 2 hours prior</span>
                  </div>
                  <Switch
                    checked={reminder2hEnabled}
                    onChange={(checked) => setReminder2hEnabled(checked)}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3 pb-4 border-b border-border">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                  Quiet Hours Protection
                </h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  Reminders falling in quiet hours are automatically shifted to the next morning (08:00).
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <TextField
                  label="Quiet Hours Start"
                  type="time"
                  value={quietHoursStart}
                  onChange={(e) => setQuietHoursStart(e.target.value)}
                  hint="Beginning of quiet night interval (default 22:00)"
                />
                <TextField
                  label="Quiet Hours End"
                  type="time"
                  value={quietHoursEnd}
                  onChange={(e) => setQuietHoursEnd(e.target.value)}
                  hint="End of quiet night interval (default 08:00)"
                />
              </div>
            </div>

            <div className="space-y-3 pb-4 border-b border-border">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Customer Consent Disclosure
              </h3>
              <TextArea
                label="Public Consent Copy Wording"
                value={consentCopyText}
                onChange={(e) => setConsentCopyText(e.target.value)}
                hint="Displayed alongside reminder checkboxes during online booking"
                rows={2}
              />
            </div>

            <div className="space-y-3 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-muted">
                Developer Sandbox Testing
              </h3>
              <TextField
                label="Sandbox Allowed Recipient Email (Optional)"
                placeholder="e.g. owner@example.com"
                value={sandboxRecipientEmail}
                onChange={(e) => setSandboxRecipientEmail(e.target.value)}
                hint="When set, emails will ONLY be delivered to this address; all other recipients will be skipped in sandbox mode."
              />
            </div>

            <div className="pt-2 flex justify-end">
              <Button type="submit" variant="primary" loading={saving}>
                Save Notification Settings
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* TAB 5: SHARING & QR CODE */}
      {activeTab === 'sharing' && (
        <div className="space-y-6">
          {/* Main Booking Link & QR Box */}
          <Card className="p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-ink">Public Booking Link & QR Code</h2>
              <p className="text-xs text-ink-muted">
                Share this link or download the scan-tested QR code for your store counter and business cards.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
              {/* QR Code Canvas */}
              <div className="flex flex-col items-center justify-center p-6 bg-surface rounded-card border border-border">
                <canvas ref={qrCanvasRef} className="rounded-control shadow-sm" />
                <p className="text-[11px] text-ink-muted font-mono mt-2">Source tag: ?src=qr</p>
                <div className="flex gap-2 mt-4">
                  <Button size="sm" variant="secondary" onClick={handleDownloadPng}>
                    <Download className="w-3.5 h-3.5 mr-1 inline" /> PNG
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDownloadSvg}>
                    <Download className="w-3.5 h-3.5 mr-1 inline" /> SVG
                  </Button>
                </div>
              </div>

              {/* Direct Link Information */}
              <div className="md:col-span-2 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-ink mb-1.5">Direct Booking URL</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={publicShareUrl}
                      className="flex-1 px-3 py-2 border border-border rounded-control text-xs font-mono bg-surface text-ink select-all"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => copyToClipboard(publicShareUrl, 'Booking Link')}
                    >
                      <Copy className="w-4 h-4 mr-1 inline" /> Copy
                    </Button>
                    <a href={publicShareUrl} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </a>
                  </div>
                </div>

                <div className="p-4 rounded-card bg-accent-tint/30 border border-accent/20">
                  <h4 className="text-xs font-semibold text-accent uppercase tracking-wider mb-1">
                    Automatic Marketing Attribution
                  </h4>
                  <p className="text-xs text-ink-muted">
                    Each share channel includes a dedicated tracking tag (<code className="text-accent font-mono">?src=whatsapp</code>, <code className="text-accent font-mono">?src=qr</code>, etc.) to report booking conversion channels with zero third-party trackers.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          {/* Social Distribution Templates */}
          <Card className="p-6 sm:p-8 space-y-4">
            <div>
              <h2 className="text-base font-semibold text-ink">Social Media & Distribution Snippets</h2>
              <p className="text-xs text-ink-muted">Ready-to-use snippets with prefilled source tracking</p>
            </div>

            <div className="space-y-4">
              {/* WhatsApp */}
              <div className="p-4 rounded-card border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">WhatsApp Blast / Status Message</p>
                  <p className="text-xs text-ink-muted font-mono mt-0.5">
                    Includes source tag: ?src=whatsapp
                  </p>
                </div>
                <div className="flex gap-2">
                  <a href={whatsappUrl} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="secondary">
                      Open WhatsApp
                    </Button>
                  </a>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(whatsappUrl, 'WhatsApp Link')}
                  >
                    Copy Link
                  </Button>
                </div>
              </div>

              {/* Instagram */}
              <div className="p-4 rounded-card border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Instagram Bio One-Liner</p>
                  <p className="text-xs text-ink-muted mt-0.5 font-mono">{instagramBioText}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(instagramBioText, 'Instagram Bio line')}
                >
                  <Copy className="w-3.5 h-3.5 mr-1 inline" /> Copy Bio
                </Button>
              </div>

              {/* Website Embed Button */}
              <div className="p-4 rounded-card border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Website &quot;Book Now&quot; Button Snippet</p>
                  <p className="text-xs text-ink-muted mt-0.5">HTML button embed for your existing website</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(websiteSnippet, 'Website Button HTML')}
                >
                  <Copy className="w-3.5 h-3.5 mr-1 inline" /> Copy HTML
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};
