import React, { useState, useEffect } from 'react';
import { PublicLayout } from './components/layouts/PublicLayout';
import { OwnerLayout } from './components/layouts/OwnerLayout';
import { EmptyState } from './components/ui/Feedback';
import { DevStyleguidePage } from './pages/DevStyleguidePage';
import { Calendar, Users, Scissors, Star, Bell, Settings, LayoutDashboard, Clock } from 'lucide-react';

export const App: React.FC = () => {
  const [currentPath, setCurrentPath] = useState(
    typeof window !== 'undefined' ? window.location.pathname || '/' : '/'
  );

  useEffect(() => {
    const handlePopState = () => setCurrentPath(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
    window.scrollTo(0, 0);
  };

  // 1. Dev Styleguide Route (Excluded in prod, enabled for development)
  if (currentPath === '/dev/styleguide' || currentPath === '/') {
    return <DevStyleguidePage />;
  }

  // 2. Public Booking Route (/b/:slug or /b/:slug/manage/:token)
  if (currentPath.startsWith('/b/')) {
    const isManage = currentPath.includes('/manage/');
    return (
      <PublicLayout businessName="Luxe Salon & Spa" businessAddress="MG Road, Bangalore · +91 98765 43210">
        <EmptyState
          title={isManage ? 'Customer Self-Service Manage' : 'Mobile Booking Experience'}
          reason={
            isManage
              ? 'Self-service rescheduling and cancellation with secure tokens is scheduled for Phase 4.'
              : 'The 4-step mobile-first customer booking journey will be implemented in Phase 4.'
          }
          icon={<Clock className="w-8 h-8" />}
          action={{
            label: 'View Component Styleguide',
            onClick: () => navigate('/dev/styleguide'),
          }}
        />
      </PublicLayout>
    );
  }

  // 3. Owner Dashboard Shell (/app/*)
  if (currentPath.startsWith('/app') || currentPath === '/login' || currentPath === '/register') {
    const screenMap: Record<string, { title: string; phase: string; icon: React.ReactNode }> = {
      '/app/today': { title: 'Today Command Center & Needs Attention', phase: 'Phase 5', icon: <LayoutDashboard className="w-8 h-8" /> },
      '/app/calendar': { title: 'Interactive Calendar (Day / Week / Agenda)', phase: 'Phase 5', icon: <Calendar className="w-8 h-8" /> },
      '/app/bookings': { title: 'Appointment Master List & Quick Add', phase: 'Phase 5', icon: <Clock className="w-8 h-8" /> },
      '/app/customers': { title: 'Customer Directory & Chronological Timeline', phase: 'Phase 6', icon: <Users className="w-8 h-8" /> },
      '/app/services': { title: 'Services Catalog & Minor Units Pricing', phase: 'Phase 3', icon: <Scissors className="w-8 h-8" /> },
      '/app/reviews': { title: 'Verified Customer Reviews & Replies', phase: 'Phase 8', icon: <Star className="w-8 h-8" /> },
      '/app/notifications': { title: 'Reminder Health Panel & Outbox', phase: 'Phase 7', icon: <Bell className="w-8 h-8" /> },
      '/app/settings': { title: 'Business Profile & Policy Configuration', phase: 'Phase 3', icon: <Settings className="w-8 h-8" /> },
    };

    const currentScreen = screenMap[currentPath] || {
      title: 'Owner Command Center',
      phase: 'Phase 5',
      icon: <LayoutDashboard className="w-8 h-8" />,
    };

    return (
      <OwnerLayout
        activePath={currentPath}
        onNavigate={navigate}
        businessName="Luxe Salon & Spa"
        isDemo={true}
      >
        <EmptyState
          title={currentScreen.title}
          reason={`This operational view will be fully connected in ${currentScreen.phase}. Design system and shell layout verified.`}
          icon={currentScreen.icon}
          action={{
            label: 'Return to Styleguide',
            onClick: () => navigate('/dev/styleguide'),
          }}
        />
      </OwnerLayout>
    );
  }

  return (
    <div className="p-8 text-center">
      <h1 className="font-display text-2xl">Page Not Found</h1>
      <button onClick={() => navigate('/dev/styleguide')} className="mt-4 text-accent underline">
        Go to Styleguide
      </button>
    </div>
  );
};
