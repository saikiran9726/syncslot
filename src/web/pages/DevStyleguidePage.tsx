import React, { useState } from 'react';
import { Button, IconButton } from '../components/ui/Button';
import {
  FormField,
  TextField,
  TextArea,
  Select,
  PhoneField,
  Checkbox,
  Switch,
} from '../components/ui/FormField';
import { Card, MetricCard } from '../components/ui/Card';
import { StatusBadge, DemoBadge } from '../components/ui/StatusBadge';
import { Dialog, ConfirmDialog, Drawer } from '../components/ui/Dialog';
import {
  InlineAlert,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonCard,
  SkeletonList,
  Toast,
  ToastMessage,
} from '../components/ui/Feedback';
import { PageHeader, Tabs, Table, Avatar } from '../components/ui/LayoutPrimitives';
import { Calendar, Clock, Sparkles, Plus, Trash2, ArrowRight } from 'lucide-react';

export const DevStyleguidePage: React.FC = () => {
  // Dialog & Drawer state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Form states
  const [switchState, setSwitchState] = useState(true);
  const [activeTab, setActiveTab] = useState('all');

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = (type: 'info' | 'success' | 'warning' | 'danger', message: string) => {
    setToasts((prev) => [...prev, { id: Math.random().toString(), type, message }]);
  };

  // Sample data for table collapse test
  const sampleTableData = [
    { id: '1', client: 'Priya Sharma', service: 'Deluxe Haircut', time: '10:00 AM', status: 'confirmed' as const },
    { id: '2', client: 'Amit Patel', service: 'Beard Trim', time: '11:15 AM', status: 'pending' as const },
    { id: '3', client: 'Sneha Rao', service: 'Coloring & Spa', time: '02:00 PM', status: 'completed' as const },
  ];

  return (
    <div className="min-h-screen bg-surface p-4 sm:p-8 max-w-6xl mx-auto flex flex-col gap-12 pb-24">
      {/* Toast Render Anchor */}
      <Toast toasts={toasts} onDismiss={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />

      {/* Header */}
      <PageHeader
        title="SlotSync Design System & Component Styleguide"
        subtitle="Calm, warm, premium SaaS design tokens, interactive controls, and accessible shells."
        badge={<DemoBadge preset="Styleguide" />}
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => addToast('info', 'Sample notification dispatched')}
            >
              Trigger Toast
            </Button>
            <Button size="sm" onClick={() => setDialogOpen(true)} leftIcon={<Plus className="w-4 h-4" />}>
              Open Dialog
            </Button>
          </div>
        }
      />

      {/* 1. Typography & Colors */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold text-ink">1. Typography & Tokens</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 text-xs font-semibold">
          <div className="p-3 bg-surface border border-border rounded-control text-ink">Surface #FAF8F5</div>
          <div className="p-3 bg-card border border-border rounded-control text-ink shadow-subtle">Card #FFFFFF</div>
          <div className="p-3 bg-ink text-white rounded-control">Ink #14212B</div>
          <div className="p-3 bg-accent text-white rounded-control">Accent #0F766E</div>
          <div className="p-3 bg-accent-tint text-accent rounded-control">Accent Tint #E6F3F1</div>
          <div className="p-3 bg-success-tint text-success rounded-control">Success #15803D</div>
          <div className="p-3 bg-warning-tint text-warning rounded-control">Warning #B45309</div>
          <div className="p-3 bg-danger-tint text-danger rounded-control">Danger #B42318</div>
        </div>
      </section>

      {/* 2. Buttons & Actions */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold text-ink">2. Buttons & IconButtons</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary Button</Button>
          <Button variant="secondary">Secondary Button</Button>
          <Button variant="ghost">Ghost Button</Button>
          <Button variant="danger" leftIcon={<Trash2 className="w-4 h-4" />}>
            Danger Action
          </Button>
          <Button variant="primary" isLoading>
            Loading
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <IconButton icon={<Sparkles className="w-5 h-5 text-accent" />} aria-label="Quick Action" />
          <IconButton icon={<Trash2 className="w-5 h-5" />} variant="danger" aria-label="Delete" />
        </div>
      </section>

      {/* 3. Form Controls */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold text-ink">3. Form Controls & Validation</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
          <FormField label="Full Name" hint="Client display name">
            <TextField placeholder="e.g. Rahul Sharma" />
          </FormField>

          <FormField label="Email Address" error="Please enter a valid business email">
            <TextField type="email" defaultValue="invalid-email@" hasError />
          </FormField>

          <FormField label="Phone Number" hint="E.164 normalized">
            <PhoneField defaultValue="9876543210" />
          </FormField>

          <FormField label="Service Selection">
            <Select
              options={[
                { value: 'haircut', label: 'Classic Haircut (30m)' },
                { value: 'beard', label: 'Beard Grooming (15m)' },
                { value: 'combo', label: 'Full Styling Package (45m)' },
              ]}
            />
          </FormField>

          <div className="flex flex-col gap-3 justify-center">
            <Checkbox label="Send automated SMS/Email reminders" defaultChecked />
            <Switch
              checked={switchState}
              onChange={setSwitchState}
              label="Instant Confirmation Mode"
            />
          </div>
        </div>
      </section>

      {/* 4. Badges & Metric Cards */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold text-ink">4. Status Badges & Metrics</h2>
        <div className="flex flex-wrap gap-2.5 items-center">
          <StatusBadge status="confirmed" />
          <StatusBadge status="pending" />
          <StatusBadge status="completed" />
          <StatusBadge status="cancelled" />
          <StatusBadge status="no_show" />
          <StatusBadge status="simulated" />
          <StatusBadge status="failed" />
          <StatusBadge status="queued" />
          <StatusBadge status="sending" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-2">
          <MetricCard
            label="Today's Appointments"
            value="14"
            change="+2 vs yesterday"
            changeType="positive"
            icon={<Calendar className="w-5 h-5" />}
          />
          <MetricCard
            label="Schedule Utilization"
            value="82%"
            subtitle="Based on 8 working hours"
            icon={<Clock className="w-5 h-5" />}
          />
          <MetricCard
            label="Cancellations"
            value="1"
            change="1.2% rate"
            changeType="neutral"
          />
        </div>
      </section>

      {/* 5. Feedback & Feedback States */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold text-ink">5. Alerts & State Coverage</h2>
        <div className="flex flex-col gap-3">
          <InlineAlert variant="info" title="Reminder Engine Active">
            Scheduled jobs are automatically processed by Cloudflare Cron Trigger every 5 minutes.
          </InlineAlert>
          <InlineAlert variant="warning" title="Quiet Hours Enforced">
            Notifications scheduled between 22:00 and 08:00 are shifted to 08:00 next morning.
          </InlineAlert>
          <InlineAlert variant="danger" title="Delivery Failure">
            Failed to send email via Resend API (rate limit exceeded). Safe manual WhatsApp fallback ready.
          </InlineAlert>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-2">
          <EmptyState
            title="No Bookings Today"
            reason="Your schedule is completely open. Share your booking link to accept clients."
            action={{ label: 'Copy Booking Link', onClick: () => addToast('success', 'Link copied!') }}
          />
          <ErrorState
            reason="Failed to load live availability from server. Network timeout occurred."
            onRetry={() => addToast('info', 'Retrying request...')}
          />
        </div>
      </section>

      {/* 6. Tabs & Collapsible Table */}
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold text-ink">
          6. Responsive Table (Collapses to Cards on Mobile &lt; 640px)
        </h2>
        <Tabs
          tabs={[
            { id: 'all', label: 'All Bookings', count: 3 },
            { id: 'pending', label: 'Pending', count: 1 },
            { id: 'confirmed', label: 'Confirmed', count: 2 },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
        <Table
          columns={[
            {
              key: 'client',
              header: 'Customer',
              render: (row) => (
                <div className="flex items-center gap-2.5">
                  <Avatar name={row.client} size="sm" />
                  <span className="font-semibold text-ink">{row.client}</span>
                </div>
              ),
            },
            { key: 'service', header: 'Service' },
            { key: 'time', header: 'Scheduled Time' },
            {
              key: 'status',
              header: 'Status',
              render: (row) => <StatusBadge status={row.status} size="sm" />,
            },
          ]}
          data={sampleTableData}
          keyExtractor={(item) => item.id}
        />
      </section>

      {/* Modals & Dialogs */}
      <Dialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Schedule Quick Appointment"
        description="Add a walk-in or phone booking to your calendar schedule."
      >
        <div className="flex flex-col gap-4">
          <FormField label="Client Name">
            <TextField placeholder="Customer Name" />
          </FormField>
          <FormField label="Phone">
            <PhoneField placeholder="Phone number" />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setDialogOpen(false);
                addToast('success', 'Booking saved successfully');
              }}
            >
              Save Booking
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
