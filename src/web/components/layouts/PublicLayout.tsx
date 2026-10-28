import React from 'react';
import { OfflineBanner } from '../ui/Feedback';

export interface PublicLayoutProps {
  children: React.ReactNode;
  businessName?: string;
  businessAddress?: string;
}

export const PublicLayout: React.FC<PublicLayoutProps> = ({
  children,
  businessName = 'SlotSync Booking',
  businessAddress,
}) => {
  return (
    <div className="min-h-screen bg-surface flex flex-col items-center">
      <OfflineBanner />

      {/* Subtle Brand Wash Gradient Header */}
      <div className="w-full bg-gradient-to-b from-accent-tint/50 via-surface to-surface border-b border-border/60 py-6 px-4">
        <div className="max-w-[640px] mx-auto flex flex-col items-center text-center">
          <span className="text-xs uppercase font-bold tracking-widest text-accent mb-1">
            Official Booking
          </span>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold text-ink">
            {businessName}
          </h1>
          {businessAddress && (
            <p className="text-xs text-ink-muted mt-1 max-w-sm">{businessAddress}</p>
          )}
        </div>
      </div>

      {/* Main Content Area (Mobile-First, max width 640px) */}
      <main className="w-full max-w-[640px] px-4 py-6 flex-1 flex flex-col">{children}</main>

      {/* Safe Area Footer */}
      <footer className="w-full py-6 text-center text-xs text-ink-muted/80 safe-bottom">
        <p>Powered by <span className="font-semibold text-ink">SlotSync</span> · Simple, Direct Appointments</p>
      </footer>
    </div>
  );
};
