// SlotSync Business Owner Login Page

import React, { useState } from 'react';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/FormField';
import { Card } from '../components/ui/Card';
import { InlineAlert } from '../components/ui/Feedback';
import { apiClient } from '../lib/apiClient';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { refreshSession } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Email and password are required');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.post<{ user: any; business: any }>('/api/auth/login', {
        email: email.trim(),
        password,
      });

      if (res.error) {
        setError(res.error.message || 'Invalid email or password');
        return;
      }

      await refreshSession();
      if (res.data?.business?.onboarding_step && res.data.business.onboarding_step < 4) {
        window.location.href = '/onboarding';
      } else {
        window.location.href = '/app/settings';
      }
    } catch {
      setError('Unable to connect to server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <h1 className="font-serif text-3xl sm:text-4xl text-ink tracking-tight">SlotSync</h1>
        <p className="mt-2 text-sm text-ink-muted">Sign in to manage your bookings and business</p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <Card className="p-6 sm:p-8 shadow-card">
          <h2 className="text-xl font-semibold text-ink mb-6">Owner Sign In</h2>

          {error && (
            <div className="mb-6">
              <InlineAlert variant="danger" title="Sign In Error" message={error} />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <TextField
              label="Email Address"
              type="email"
              placeholder="owner@yourbusiness.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />

            <div>
              <TextField
                label="Password"
                type="password"
                placeholder="••••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <p className="mt-1.5 text-xs text-ink-muted">
                Note: Password self-reset via email is currently in private preview. Contact system admin if locked out.
              </p>
            </div>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              loading={isSubmitting}
              className="mt-6"
            >
              Sign In
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border text-center">
            <p className="text-sm text-ink-muted">
              Don&apos;t have an account?{' '}
              <a href="/register" className="text-accent hover:underline font-medium">
                Register business
              </a>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
};
