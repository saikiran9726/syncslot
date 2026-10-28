import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { Button, IconButton } from '../src/web/components/ui/Button';
import { FormField, TextField, TextArea, Select, PhoneField, Checkbox, Switch } from '../src/web/components/ui/FormField';
import { Dialog, ConfirmDialog, Drawer } from '../src/web/components/ui/Dialog';
import { StatusBadge, DemoBadge } from '../src/web/components/ui/StatusBadge';
import { Table, PageHeader, Tabs, Avatar } from '../src/web/components/ui/LayoutPrimitives';
import { InlineAlert, EmptyState, ErrorState, Skeleton, SkeletonCard, SkeletonList, Toast } from '../src/web/components/ui/Feedback';
import { Card, MetricCard } from '../src/web/components/ui/Card';
import { Plus, Trash2, Calendar, Clock } from 'lucide-react';

describe('Design System UI Components (Static & Structural Rendering)', () => {
  it('renders Button with variants, loading spinners, and disabled states', () => {
    // Primary Button
    const primaryHtml = renderToString(<Button variant="primary">Confirm Slot</Button>);
    expect(primaryHtml).toContain('Confirm Slot');
    expect(primaryHtml).toContain('bg-accent');
    expect(primaryHtml).toContain('min-h-[44px]'); // Mobile hit target >= 44px

    // Secondary & Ghost
    const secondaryHtml = renderToString(<Button variant="secondary">Cancel</Button>);
    expect(secondaryHtml).toContain('bg-card');
    expect(secondaryHtml).toContain('border-border');

    const ghostHtml = renderToString(<Button variant="ghost">Dismiss</Button>);
    expect(ghostHtml).toContain('bg-transparent');

    // Danger Button with Left Icon
    const dangerHtml = renderToString(
      <Button variant="danger" leftIcon={<Trash2 className="w-4 h-4" />}>
        Delete Service
      </Button>
    );
    expect(dangerHtml).toContain('Delete Service');
    expect(dangerHtml).toContain('bg-danger');

    // Loading & Disabled State
    const loadingHtml = renderToString(<Button isLoading>Processing</Button>);
    expect(loadingHtml).toContain('disabled=""');
    expect(loadingHtml).toContain('animate-spin');

    const disabledHtml = renderToString(<Button disabled>Unavailable</Button>);
    expect(disabledHtml).toContain('disabled=""');
  });

  it('renders IconButton with required aria-label and accessible touch target', () => {
    const html = renderToString(
      <IconButton icon={<Plus className="w-5 h-5" />} aria-label="Add New Service" variant="primary" />
    );
    expect(html).toContain('aria-label="Add New Service"');
    expect(html).toContain('min-w-[44px]');
    expect(html).toContain('min-h-[44px]');
  });

  it('renders FormField with accessible label, hint, and error announced via aria-live', () => {
    const html = renderToString(
      <FormField
        label="Phone Number"
        hint="E.164 normalized with country code"
        error="Invalid mobile number format"
        required
      >
        <PhoneField defaultValue="9876543210" hasError />
      </FormField>
    );

    expect(html).toContain('Phone Number');
    expect(html).toContain('*'); // Required asterisk
    expect(html).toContain('E.164 normalized with country code');
    expect(html).toContain('Invalid mobile number format');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('+91'); // PhoneField country prefix
  });

  it('renders StatusBadge for all domain statuses with high-contrast WCAG classes', () => {
    // Booking statuses
    const confirmedHtml = renderToString(<StatusBadge status="confirmed" />);
    expect(confirmedHtml).toContain('Confirmed');
    expect(confirmedHtml).toContain('bg-accent-tint');
    expect(confirmedHtml).toContain('text-accent');

    const pendingHtml = renderToString(<StatusBadge status="pending" />);
    expect(pendingHtml).toContain('Pending Approval');
    expect(pendingHtml).toContain('bg-warning-tint');
    expect(pendingHtml).toContain('text-warning');

    const completedHtml = renderToString(<StatusBadge status="completed" />);
    expect(completedHtml).toContain('Completed');
    expect(completedHtml).toContain('bg-success-tint');
    expect(completedHtml).toContain('text-success');

    const cancelledHtml = renderToString(<StatusBadge status="cancelled" />);
    expect(cancelledHtml).toContain('Cancelled');
    expect(cancelledHtml).toContain('bg-danger-tint');
    expect(cancelledHtml).toContain('text-danger');

    // Notification statuses
    const simHtml = renderToString(<StatusBadge status="simulated" />);
    expect(simHtml).toContain('Simulated Sandbox');

    const failHtml = renderToString(<StatusBadge status="failed" />);
    expect(failHtml).toContain('Failed');

    const queuedHtml = renderToString(<StatusBadge status="queued" />);
    expect(queuedHtml).toContain('Queued');
  });

  it('renders DemoBadge with warning tint and prominent label', () => {
    const html = renderToString(<DemoBadge preset="Salon Preset" />);
    expect(html).toContain('DEMO MODE');
    expect(html).toContain('SALON PRESET');
    expect(html).toContain('role="status"');
  });

  it('renders Dialog and ConfirmDialog with accessible dialog role and aria attributes', () => {
    const dialogHtml = renderToString(
      <Dialog
        isOpen={true}
        onClose={() => {}}
        title="Schedule Walk-in Booking"
        description="Select client and appointment time"
      >
        <p>Dialog Content</p>
      </Dialog>
    );

    expect(dialogHtml).toContain('role="dialog"');
    expect(dialogHtml).toContain('aria-modal="true"');
    expect(dialogHtml).toContain('Schedule Walk-in Booking');
    expect(dialogHtml).toContain('Select client and appointment time');
    expect(dialogHtml).toContain('aria-labelledby="dialog-title"');

    // ConfirmDialog with destructive action
    const confirmHtml = renderToString(
      <ConfirmDialog
        isOpen={true}
        onClose={() => {}}
        onConfirm={() => {}}
        title="Cancel Appointment"
        message="This action will free all reserved slot cells immediately."
        confirmLabel="Yes, Cancel Booking"
        isDestructive={true}
      />
    );

    expect(confirmHtml).toContain('Cancel Appointment');
    expect(confirmHtml).toContain('Yes, Cancel Booking');
    expect(confirmHtml).toContain('bg-danger'); // Destructive variant
  });

  it('renders Drawer / BottomSheet with responsive slide layout', () => {
    const html = renderToString(
      <Drawer isOpen={true} onClose={() => {}} title="Customer Details Drawer">
        <p>Drawer Body Content</p>
      </Drawer>
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('Customer Details Drawer');
    expect(html).toContain('safe-bottom');
  });

  it('renders Toast with role="status" for info and role="alert" for errors', () => {
    const html = renderToString(
      <Toast
        toasts={[
          { id: '1', type: 'info', message: 'Appointment reminder queued for tomorrow 10:00 AM' },
          { id: '2', type: 'danger', message: 'Network request failed: timeout' },
        ]}
        onDismiss={() => {}}
      />
    );

    expect(html).toContain('role="status"');
    expect(html).toContain('Appointment reminder queued for tomorrow 10:00 AM');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Network request failed: timeout');
  });

  it('renders Table and collapses to mobile cards below 640px', () => {
    const sampleBookings = [
      { id: 'b1', client: 'Aarav Kumar', service: 'Haircut', time: '10:00 AM', status: 'confirmed' as const },
      { id: 'b2', client: 'Pooja Hegde', service: 'Spa Package', time: '11:30 AM', status: 'completed' as const },
    ];

    const html = renderToString(
      <Table
        columns={[
          { key: 'client', header: 'Client' },
          { key: 'service', header: 'Service' },
          { key: 'time', header: 'Time' },
          { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
        ]}
        data={sampleBookings}
        keyExtractor={(item) => item.id}
      />
    );

    // Desktop table container (hidden sm:block)
    expect(html).toContain('hidden sm:block');
    expect(html).toContain('<table');
    expect(html).toContain('Aarav Kumar');

    // Mobile card list (< 640px)
    expect(html).toContain('block sm:hidden');
    expect(html).toContain('Pooja Hegde');
  });

  it('renders MetricCard with tabular numerals, labels, and change indicators', () => {
    const html = renderToString(
      <MetricCard
        label="Total Revenue"
        value="₹45,200"
        change="+12% this week"
        changeType="positive"
        icon={<Clock className="w-5 h-5" />}
        subtitle="Gross completed appointments"
      />
    );

    expect(html).toContain('Total Revenue');
    expect(html).toContain('₹45,200');
    expect(html).toContain('tabular-nums');
    expect(html).toContain('+12% this week');
    expect(html).toContain('text-success');
    expect(html).toContain('Gross completed appointments');
  });

  it('renders EmptyState and ErrorState with required action buttons and reasons', () => {
    const emptyHtml = renderToString(
      <EmptyState
        title="No Appointments Today"
        reason="Your schedule is completely clear for the day."
        action={{ label: 'Add Booking', onClick: () => {} }}
      />
    );

    expect(emptyHtml).toContain('No Appointments Today');
    expect(emptyHtml).toContain('Your schedule is completely clear for the day.');
    expect(emptyHtml).toContain('Add Booking');

    const errorHtml = renderToString(
      <ErrorState
        title="Failed to Load Bookings"
        reason="Server was unreachable. Please verify your connection."
        onRetry={() => {}}
      />
    );

    expect(errorHtml).toContain('Failed to Load Bookings');
    expect(errorHtml).toContain('Server was unreachable. Please verify your connection.');
    expect(errorHtml).toContain('Try Again');
    expect(errorHtml).toContain('role="alert"');
  });
});
