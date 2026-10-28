// SlotSync Owner Insights Analytics (Phase 8: H1)
// Read-only metrics calculated strictly from stored database records. No synthetic numbers.

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Clock,
  Calendar,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Scissors,
  RefreshCw,
  IndianRupee,
} from 'lucide-react';
import { Button } from '../components/ui/Button';

interface InsightsData {
  summary: {
    total_bookings: number;
    completed_bookings: number;
    confirmed_bookings: number;
    cancelled_bookings: number;
    no_show_bookings: number;
    cancellation_rate_percent: number;
    total_revenue_minor: number;
    currency: string;
  };
  top_services: {
    id: string;
    name: string;
    total_bookings: number;
    completed_count: number;
    total_revenue_minor: number;
  }[];
  busiest_hours: {
    hour: number;
    time_label: string;
    count: number;
  }[];
  is_empty: boolean;
}

export const InsightsPage: React.FC = () => {
  const [data, setData] = useState<InsightsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/owner/insights');
      if (!res.ok) throw new Error('Failed to load business insights');
      const json = (await res.json()) as InsightsData;
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Error fetching analytics');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, []);

  const formatRevenue = (minor: number) => {
    return (minor / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-ink tracking-tight flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-primary" />
            Performance Insights
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            Real data from database records. Zero invented or synthetic projections.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchInsights}
          isLoading={isLoading}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          Refresh Data
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-danger-tint border border-danger/20 rounded-card text-danger text-xs font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {isLoading && !data ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
          <div className="h-28 bg-card rounded-card border border-border" />
          <div className="h-28 bg-card rounded-card border border-border" />
          <div className="h-28 bg-card rounded-card border border-border" />
          <div className="h-28 bg-card rounded-card border border-border" />
        </div>
      ) : data?.is_empty ? (
        <div className="bg-card border border-border rounded-card p-12 text-center space-y-4">
          <Calendar className="w-12 h-12 text-ink-muted mx-auto opacity-40" />
          <h2 className="text-lg font-semibold text-ink">No Appointments Recorded Yet</h2>
          <p className="text-xs text-ink-muted max-w-md mx-auto">
            Insights are computed dynamically from confirmed, completed, and cancelled bookings. Once clients start booking appointments, your utilization metrics will appear here.
          </p>
        </div>
      ) : data ? (
        <>
          {/* Key Metric Tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-card p-4 shadow-subtle">
              <div className="text-xs font-medium text-ink-muted flex items-center justify-between">
                <span>Total Bookings</span>
                <Calendar className="w-4 h-4 text-primary" />
              </div>
              <div className="text-2xl font-display font-bold text-ink mt-2">
                {data.summary.total_bookings}
              </div>
              <div className="text-[11px] text-ink-muted mt-1">
                {data.summary.completed_bookings} completed
              </div>
            </div>

            <div className="bg-card border border-border rounded-card p-4 shadow-subtle">
              <div className="text-xs font-medium text-ink-muted flex items-center justify-between">
                <span>Completed Revenue</span>
                <IndianRupee className="w-4 h-4 text-success" />
              </div>
              <div className="text-2xl font-display font-bold text-ink mt-2">
                ₹{formatRevenue(data.summary.total_revenue_minor)}
              </div>
              <div className="text-[11px] text-ink-muted mt-1">From completed visits</div>
            </div>

            <div className="bg-card border border-border rounded-card p-4 shadow-subtle">
              <div className="text-xs font-medium text-ink-muted flex items-center justify-between">
                <span>Cancellation Rate</span>
                <XCircle className="w-4 h-4 text-danger" />
              </div>
              <div className="text-2xl font-display font-bold text-ink mt-2">
                {data.summary.cancellation_rate_percent}%
              </div>
              <div className="text-[11px] text-ink-muted mt-1">
                {data.summary.cancelled_bookings} cancelled
              </div>
            </div>

            <div className="bg-card border border-border rounded-card p-4 shadow-subtle">
              <div className="text-xs font-medium text-ink-muted flex items-center justify-between">
                <span>Active Confirmed</span>
                <CheckCircle2 className="w-4 h-4 text-accent" />
              </div>
              <div className="text-2xl font-display font-bold text-ink mt-2">
                {data.summary.confirmed_bookings}
              </div>
              <div className="text-[11px] text-ink-muted mt-1">Upcoming on schedule</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Top Services by Demand */}
            <div className="bg-card border border-border rounded-card p-5 shadow-subtle space-y-4">
              <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
                <Scissors className="w-4 h-4 text-primary" />
                Top Services by Demand
              </h2>

              {data.top_services.length === 0 ? (
                <div className="text-xs text-ink-muted py-6 text-center">No service data recorded</div>
              ) : (
                <div className="space-y-3">
                  {data.top_services.map((svc) => (
                    <div
                      key={svc.id}
                      className="flex items-center justify-between p-3 rounded-control bg-surface border border-border/60"
                    >
                      <div>
                        <div className="text-xs font-semibold text-ink">{svc.name}</div>
                        <div className="text-[11px] text-ink-muted mt-0.5">
                          {svc.total_bookings} bookings ({svc.completed_count} completed)
                        </div>
                      </div>
                      <div className="text-xs font-bold text-ink">
                        ₹{formatRevenue(svc.total_revenue_minor)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Busiest Appointment Hours */}
            <div className="bg-card border border-border rounded-card p-5 shadow-subtle space-y-4">
              <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Hourly Demand Distribution
              </h2>

              <div className="space-y-2">
                {data.busiest_hours.map((h) => {
                  const maxCount = Math.max(...data.busiest_hours.map((b) => b.count), 1);
                  const widthPercent = (h.count / maxCount) * 100;

                  return (
                    <div key={h.hour} className="flex items-center gap-3 text-xs">
                      <span className="w-12 font-mono text-[11px] text-ink-muted shrink-0">
                        {h.time_label}
                      </span>
                      <div className="flex-1 bg-surface h-5 rounded overflow-hidden relative border border-border/40">
                        <div
                          className="bg-primary/80 h-full rounded transition-all duration-300"
                          style={{ width: `${Math.max(widthPercent, 0)}%` }}
                        />
                      </div>
                      <span className="w-6 text-right font-medium text-ink shrink-0">{h.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
