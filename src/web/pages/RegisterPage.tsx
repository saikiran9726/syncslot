// SlotSync Business Owner Registration Page

import React, { useState } from 'react';
import { Button } from '../components/ui/Button';
import { TextField, Select } from '../components/ui/FormField';
import { Card } from '../components/ui/Card';
import { InlineAlert } from '../components/ui/Feedback';
import { validateSlug, generateSlugFromName } from '../../shared/slugUtils';
import { getSupportedTimezones } from '../../shared/timezoneUtils';
import { INDUSTRY_PRESETS } from '../../shared/presets';
import { apiClient } from '../lib/apiClient';
import { useAuth } from '../context/AuthContext';

export const RegisterPage: React.FC = () => {
  const { refreshSession } = useAuth();
  const timezones = getSupportedTimezones();

  const [businessName, setBusinessName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [industryPreset, setIndustryPreset] = useState('salon');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleBusinessNameChange = (name: string) => {
    setBusinessName(name);
    if (!slugEdited) {
      setSlug(generateSlugFromName(name));
    }
  };

  const handleSlugChange = (raw: string) => {
    setSlugEdited(true);
    const sanitized = raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSlug(sanitized);
    const slugErr = validateSlug(sanitized);
    setErrors((prev) => ({ ...prev, slug: slugErr || '' }));
  };

  const validate = (): boolean => {
    const nextErrors: Record<string, string> = {};

    if (!businessName.trim() || businessName.trim().length < 2) {
      nextErrors.businessName = 'Business name must be at least 2 characters';
    }

    const slugErr = validateSlug(slug);
    if (slugErr) {
      nextErrors.slug = slugErr;
    }

    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      nextErrors.email = 'Valid email address is required';
    }

    if (!password || password.length < 10) {
      nextErrors.password = 'Password must be at least 10 characters';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const res = await apiClient.post<{ user: any; business: any }>('/api/auth/register', {
        businessName: businessName.trim(),
        slug: slug.trim(),
        email: email.trim(),
        password,
        timezone,
        industryPreset,
      });

      if (res.error) {
        if (res.error.fields) {
          setErrors(res.error.fields);
        } else {
          setServerError(res.error.message);
        }
        return;
      }

      await refreshSession();
      window.location.href = '/onboarding';
    } catch {
      setServerError('An unexpected network error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <h1 className="font-serif text-3xl sm:text-4xl text-ink tracking-tight">SlotSync</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Launch your local business booking page in minutes
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-lg">
        <Card className="p-6 sm:p-8 shadow-card">
          <h2 className="text-xl font-semibold text-ink mb-6">Create Your Business Account</h2>

          {serverError && (
            <div className="mb-6">
              <InlineAlert variant="danger" title="Registration Failed" message={serverError} />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <TextField
              label="Business Name"
              placeholder="e.g. Luxe Hair Salon & Spa"
              value={businessName}
              onChange={(e) => handleBusinessNameChange(e.target.value)}
              error={errors.businessName}
              required
            />

            <div>
              <TextField
                label="Public Booking URL Slug"
                placeholder="luxe-salon"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                error={errors.slug}
                hint="Your customers will visit syncslot.dev/b/your-slug"
                required
              />
              {slug && !errors.slug && (
                <p className="mt-1 text-xs text-teal font-mono">
                  Preview: /b/{slug}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-ink mb-1.5">
                Industry Preset
              </label>
              <div className="grid grid-cols-3 gap-2">
                {Object.values(INDUSTRY_PRESETS).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setIndustryPreset(p.id)}
                    className={`p-3 text-left rounded-control border text-xs transition-colors ${
                      industryPreset === p.id
                        ? 'border-accent bg-accent-tint text-accent font-semibold'
                        : 'border-border bg-card text-ink hover:bg-surface'
                    }`}
                  >
                    <p className="font-medium text-sm">{p.name}</p>
                    <p className="text-[11px] text-ink-muted mt-0.5 line-clamp-1">{p.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <Select
              label="Operating Timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              options={timezones.map((tz) => ({ value: tz, label: tz }))}
              hint="Appointments and schedules are calculated in this local timezone"
            />

            <TextField
              label="Owner Email Address"
              type="email"
              placeholder="owner@yourbusiness.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={errors.email}
              autoComplete="email"
              required
            />

            <TextField
              label="Password (min 10 characters)"
              type="password"
              placeholder="••••••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              hint={`${password.length}/10 characters minimum`}
              autoComplete="new-password"
              required
            />

            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={isSubmitting}
              className="mt-6"
            >
              Create Account & Start Setup
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border text-center">
            <p className="text-sm text-ink-muted">
              Already have an account?{' '}
              <a href="/login" className="text-accent hover:underline font-medium">
                Log in
              </a>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};
