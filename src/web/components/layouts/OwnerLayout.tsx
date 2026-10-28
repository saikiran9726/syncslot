import React, { useState } from 'react';
import {
  CalendarDays,
  Clock,
  Users,
  Scissors,
  Star,
  Bell,
  Settings,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
} from 'lucide-react';
import { DemoBadge } from '../ui/StatusBadge';
import { OfflineBanner } from '../ui/Feedback';

export interface OwnerLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  currentPath?: string;
  onNavigate?: (path: string) => void;
  businessName?: string;
  isDemo?: boolean;
}

export const OWNER_NAV_ITEMS = [
  { path: '/app/today', label: 'Today', icon: LayoutDashboard },
  { path: '/app/calendar', label: 'Calendar', icon: CalendarDays },
  { path: '/app/bookings', label: 'Bookings', icon: Clock },
  { path: '/app/customers', label: 'Customers', icon: Users },
  { path: '/app/services', label: 'Services', icon: Scissors },
  { path: '/app/reviews', label: 'Reviews', icon: Star },
  { path: '/app/notifications', label: 'Notifications', icon: Bell },
  { path: '/app/settings', label: 'Settings', icon: Settings },
];

export const OwnerLayout: React.FC<OwnerLayoutProps> = ({
  children,
  activePath = '/app/today',
  currentPath,
  onNavigate = (path) => (window.location.hash = path),
  businessName = 'My Business',
  isDemo = false,
}) => {
  const effectivePath = currentPath || activePath;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <OfflineBanner />

      {/* Top Header Bar */}
      <header className="h-16 bg-card border-b border-border px-4 sm:px-6 flex items-center justify-between sticky top-0 z-40 shadow-subtle">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 -ml-2 rounded-control text-ink hover:bg-surface focus-ring"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-accent" />
            <span className="font-display font-semibold text-lg text-ink tracking-tight">
              SlotSync
            </span>
            <span className="text-xs text-ink-muted hidden sm:inline">/</span>
            <span className="text-sm font-semibold text-ink-muted truncate max-w-[180px] hidden sm:inline">
              {businessName}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isDemo && <DemoBadge preset="Salon Demo" />}
          <button
            onClick={() => onNavigate('/login')}
            className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted hover:text-danger p-2 rounded-control focus-ring transition-colors"
            title="Log out"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Log Out</span>
          </button>
        </div>
      </header>

      {/* Main Body Shell */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar (>= 1024px) */}
        <aside className="hidden lg:flex flex-col w-64 bg-card border-r border-border p-4 gap-1.5 shrink-0">
          <div className="px-3 py-2 text-xs font-bold text-ink-muted/70 uppercase tracking-wider">
            Command Center
          </div>
          {OWNER_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = effectivePath.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => onNavigate(item.path)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-control text-sm font-semibold transition-colors duration-150 focus-ring cursor-pointer text-left ${
                  isActive
                    ? 'bg-accent-tint text-accent'
                    : 'text-ink-muted hover:text-ink hover:bg-surface'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-accent' : 'text-ink-muted'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Mobile Flyout Menu (< 1024px) */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-ink/40 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative w-64 bg-card h-full p-4 flex flex-col gap-1.5 shadow-overlay border-r border-border">
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-border">
                <span className="font-display font-semibold text-ink text-sm">Navigation</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded-control text-ink-muted hover:text-ink focus-ring"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {OWNER_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = effectivePath.startsWith(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      onNavigate(item.path);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-control text-sm font-semibold transition-colors focus-ring cursor-pointer text-left ${
                      isActive
                        ? 'bg-accent-tint text-accent'
                        : 'text-ink-muted hover:text-ink hover:bg-surface'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Page Content Container */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full pb-20 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (< 1024px) with safe area inset padding */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-card border-t border-border flex items-center justify-around px-2 z-40 safe-bottom shadow-md"
      >
        {OWNER_NAV_ITEMS.slice(0, 5).map((item) => {
          const Icon = item.icon;
          const isActive = effectivePath.startsWith(item.path);
          return (
            <button
              key={item.path}
              onClick={() => onNavigate(item.path)}
              className={`flex flex-col items-center justify-center flex-1 py-1 gap-1 min-h-[44px] focus-ring ${
                isActive ? 'text-accent' : 'text-ink-muted hover:text-ink'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span className="text-[10px] font-semibold tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
