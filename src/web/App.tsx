// SlotSync Main Application Router & Shell

import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PublicLayout } from './components/layouts/PublicLayout';
import { OwnerLayout } from './components/layouts/OwnerLayout';
import { DevStyleguidePage } from './pages/DevStyleguidePage';
import { RegisterPage } from './pages/RegisterPage';
import { LoginPage } from './pages/LoginPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { SettingsPage } from './pages/SettingsPage';
import { PublicBookingPage } from './pages/PublicBookingPage';
import { EmptyState } from './components/ui/Feedback';

const RouterContent: React.FC = () => {
  const { user, business, isLoading } = useAuth();
  const [currentPath, setCurrentPath] = useState(
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Simple client-side routing
  if (currentPath === '/dev/styleguide') {
    return <DevStyleguidePage />;
  }

  if (currentPath === '/register') {
    return <RegisterPage />;
  }

  if (currentPath === '/login') {
    return <LoginPage />;
  }

  if (currentPath === '/onboarding') {
    return <OnboardingPage />;
  }

  // Public Booking Route: /b/:slug
  const publicBookingMatch = currentPath.match(/^\/b\/([a-z0-9-]+)/);
  if (publicBookingMatch) {
    const slug = publicBookingMatch[1];
    return <PublicBookingPage slug={slug} />;
  }

  // Owner App Routes: /app/*
  if (currentPath.startsWith('/app')) {
    if (currentPath === '/app/settings') {
      return (
        <OwnerLayout currentPath={currentPath}>
          <SettingsPage />
        </OwnerLayout>
      );
    }

    // Informative empty state for upcoming phases
    const tabName = currentPath.replace('/app/', '').replace('/', '');
    const phaseNames: Record<string, string> = {
      today: 'Phase 5: Owner Command Center & Today Panel',
      calendar: 'Phase 5: Visual Schedule & Quick Add Intake',
      customers: 'Phase 6: Customer Directory & History Timeline',
      notifications: 'Phase 7: Notification Job Status & Resend Delivery',
      analytics: 'Phase 8: Verified Analytics & Tenant CSV Export',
    };

    const targetPhase = phaseNames[tabName] || 'Subsequent Implementation Phase';

    return (
      <OwnerLayout currentPath={currentPath}>
        <div className="p-8 max-w-4xl mx-auto">
          <EmptyState
            title={`${tabName.charAt(0).toUpperCase() + tabName.slice(1)} Module`}
            description={`This dashboard operational surface is scheduled for ${targetPhase}.`}
            actionLabel="Go to Settings & Configuration"
            onAction={() => {
              window.history.pushState({}, '', '/app/settings');
              setCurrentPath('/app/settings');
            }}
          />
        </div>
      </OwnerLayout>
    );
  }

  // Root redirect
  if (currentPath === '/') {
    if (isLoading) {
      return (
        <div className="min-h-screen bg-surface flex items-center justify-center">
          <div className="text-center font-serif text-2xl text-ink animate-pulse">SlotSync</div>
        </div>
      );
    }
    if (user) {
      window.location.href = business && business.onboarding_step < 4 ? '/onboarding' : '/app/settings';
      return null;
    }
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center p-4 text-center">
      <h1 className="font-serif text-3xl text-ink">404 - Not Found</h1>
      <p className="text-sm text-ink-muted mt-2">The requested page does not exist.</p>
      <a href="/login" className="mt-4 text-sm text-accent hover:underline font-medium">
        Go to Login
      </a>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <RouterContent />
    </AuthProvider>
  );
};

export default App;
