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
import { TodayPage } from './pages/TodayPage';
import { CalendarDayPage } from './pages/CalendarDayPage';
import { BookingsListPage } from './pages/BookingsListPage';
import { CustomersPage } from './pages/CustomersPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { InsightsPage } from './pages/InsightsPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { PublicBookingPage } from './pages/PublicBookingPage';
import { PublicManagePage } from './pages/PublicManagePage';
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

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

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

  // Public Manage Route: /b/:slug/manage/:token
  const manageMatch = currentPath.match(/^\/b\/([a-z0-9-]+)\/manage\/([A-Za-z0-9_-]+)/);
  if (manageMatch) {
    const [, slug, token] = manageMatch;
    return <PublicManagePage slug={slug} token={token} />;
  }

  // Public Booking Route: /b/:slug
  const publicBookingMatch = currentPath.match(/^\/b\/([a-z0-9-]+)/);
  if (publicBookingMatch) {
    const slug = publicBookingMatch[1];
    return <PublicBookingPage slug={slug} />;
  }

  // Owner App Routes: /app/*
  if (currentPath.startsWith('/app')) {
    let pageContent: React.ReactNode;

    if (currentPath === '/app/today') {
      pageContent = <TodayPage />;
    } else if (currentPath === '/app/calendar') {
      pageContent = <CalendarDayPage />;
    } else if (currentPath === '/app/bookings') {
      pageContent = <BookingsListPage />;
    } else if (currentPath === '/app/customers') {
      pageContent = <CustomersPage />;
    } else if (currentPath === '/app/insights' || currentPath === '/app/analytics') {
      pageContent = <InsightsPage />;
    } else if (currentPath === '/app/reviews') {
      pageContent = <ReviewsPage />;
    } else if (currentPath === '/app/notifications') {
      pageContent = <NotificationsPage />;
    } else if (currentPath === '/app/settings') {
      pageContent = <SettingsPage />;
    } else {
      // Informative empty state for upcoming phases
      const tabName = currentPath.replace('/app/', '').replace('/', '');
      const phaseNames: Record<string, string> = {
        customers: 'Phase 6: Customer Directory & History Timeline',
        services: 'Phase 2: Service Configuration in Settings',
        reviews: 'Phase 8: Customer Review Collection & Gate',
        notifications: 'Phase 7: Notification Job Status & Resend Delivery',
        analytics: 'Phase 8: Verified Analytics & Tenant CSV Export',
      };

      const targetPhase = phaseNames[tabName] || 'Subsequent Implementation Phase';

      pageContent = (
        <div className="p-8 max-w-4xl mx-auto">
          <EmptyState
            title={`${tabName.charAt(0).toUpperCase() + tabName.slice(1)} Module`}
            description={`This operational surface is scheduled for ${targetPhase}.`}
            actionLabel="Go to Today Command Center"
            onAction={() => navigate('/app/today')}
          />
        </div>
      );
    }

    return (
      <OwnerLayout
        currentPath={currentPath}
        onNavigate={navigate}
        businessName={business?.name}
        businessSlug={business?.slug}
        isDemo={Boolean(business?.is_demo)}
      >
        {pageContent}
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
      window.location.href = business && business.onboarding_step < 4 ? '/onboarding' : '/app/today';
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
