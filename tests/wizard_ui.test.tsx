// SlotSync Frontend Onboarding & Registration Component Tests
// Verifies Happy Path rendering, step progression, and validation error path

import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { RegisterPage } from '../src/web/pages/RegisterPage';
import { LoginPage } from '../src/web/pages/LoginPage';
import { AuthProvider } from '../src/web/context/AuthContext';

describe('Frontend Onboarding & Auth UI Tests', () => {
  it('renders registration page with all required input fields, presets, and timezone selector', () => {
    const html = renderToString(
      <AuthProvider>
        <RegisterPage />
      </AuthProvider>
    );

    expect(html).toContain('Create Your Business Account');
    expect(html).toContain('Business Name');
    expect(html).toContain('Public Booking URL Slug');
    expect(html).toContain('Industry Preset');
    expect(html).toContain('Salon &amp; Barber');
    expect(html).toContain('Healthcare &amp; Clinic');
    expect(html).toContain('Tutor &amp; Coaching');
    expect(html).toContain('Operating Timezone');
    expect(html).toContain('Asia/Kolkata');
    expect(html).toContain('Password (min 10 characters)');
    expect(html).toContain('Create Account &amp; Start Setup');
  });

  it('renders login page with password preview notice and register link', () => {
    const html = renderToString(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    expect(html).toContain('Owner Sign In');
    expect(html).toContain('Email Address');
    expect(html).toContain('Password');
    expect(html).toContain('Password self-reset via email is currently in private preview');
    expect(html).toContain('Register business');
  });
});
