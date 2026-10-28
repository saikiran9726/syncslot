// SlotSync Customers Directory Page (D1 - D6)
// Tenant-scoped customer directory with search, visit metrics, profile drawer, and quick rebooking.

import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  Plus,
  RefreshCw,
  Phone,
  Mail,
  Calendar,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  UserCheck,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { CustomerProfileDrawer } from '../components/CustomerProfileDrawer';
import { QuickAddModal } from '../components/QuickAddModal';
import { MergeCustomerModal } from '../components/MergeCustomerModal';
import { useAuth } from '../context/AuthContext';

export interface CustomerDirectoryRow {
  id: string;
  name: string;
  display_phone: string;
  normalized_phone: string;
  email: string | null;
  pending_deletion: number;
  pending_deletion_at_utc: string | null;
  opted_out_at_utc: string | null;
  created_at_utc: string;
  total_visits: number;
  last_visit_at_utc: string | null;
  total_spend_minor: number;
}

export const CustomersPage: React.FC = () => {
  const { business } = useAuth();
  const [customers, setCustomers] = useState<CustomerDirectoryRow[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [pendingDeletionFilter, setPendingDeletionFilter] = useState<string>('all');
  const [totalCount, setTotalCount] = useState<number>(0);
  const [offset, setOffset] = useState<number>(0);
  const limit = 25;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Profile Drawer
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Quick Add (Book Again)
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddInitial, setQuickAddInitial] = useState<{
    customerId: string;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    serviceId?: string;
  } | null>(null);

  // Merge Customer Modal
  const [isMergeOpen, setIsMergeOpen] = useState(false);
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);

  const fetchCustomers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (searchTerm.trim()) params.set('q', searchTerm.trim());
      if (pendingDeletionFilter === 'active') params.set('pending_deletion', '0');
      if (pendingDeletionFilter === 'pending') params.set('pending_deletion', '1');
      params.set('limit', String(limit));
      params.set('offset', String(offset));

      const res = await fetch(`/api/owner/customers?${params.toString()}`);
      if (!res.ok) {
        throw new Error('Failed to load customers');
      }

      const data = (await res.json()) as any;
      setCustomers(data.customers || []);
      setTotalCount(data.total || 0);
    } catch (err: any) {
      setError(err.message || 'Error fetching customer directory');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [searchTerm, pendingDeletionFilter, offset]);

  const handleOpenProfile = (id: string) => {
    setSelectedCustomerId(id);
    setIsDrawerOpen(true);
  };

  const handleBookAgain = (customer: {
    id: string;
    name: string;
    phone: string;
    email: string;
    serviceId?: string;
  }) => {
    setQuickAddInitial({
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      serviceId: customer.serviceId,
    });
    setIsDrawerOpen(false);
    setIsQuickAddOpen(true);
  };

  const handleOpenMerge = (sourceId: string) => {
    setMergeSourceId(sourceId);
    setIsMergeOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-ink tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Customers
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Directory of clients, booking histories, relationship notes, and repeat bookings.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchCustomers}
            isLoading={isLoading}
            leftIcon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setQuickAddInitial(null);
              setIsQuickAddOpen(true);
            }}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            New Appointment
          </Button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-card bg-card border border-border shadow-subtle flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="relative w-full md:w-96">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setOffset(0);
            }}
            placeholder="Search by name, phone, or email..."
            className="w-full text-xs p-2.5 pl-9 rounded-control border border-border bg-surface text-ink focus-ring"
          />
          <Search className="w-4 h-4 text-ink-muted absolute left-3 top-2.5" />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-2.5 text-ink-muted hover:text-ink"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <span className="text-xs text-ink-muted flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            Status:
          </span>
          <div className="flex rounded-control border border-border bg-surface p-0.5">
            <button
              onClick={() => {
                setPendingDeletionFilter('all');
                setOffset(0);
              }}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                pendingDeletionFilter === 'all'
                  ? 'bg-card text-ink shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              All ({totalCount})
            </button>
            <button
              onClick={() => {
                setPendingDeletionFilter('active');
                setOffset(0);
              }}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                pendingDeletionFilter === 'active'
                  ? 'bg-card text-ink shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => {
                setPendingDeletionFilter('pending');
                setOffset(0);
              }}
              className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                pendingDeletionFilter === 'pending'
                  ? 'bg-card text-danger font-semibold shadow-xs'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              Pending Deletion
            </button>
          </div>
        </div>
      </div>

      {/* Directory Table / Cards */}
      <div className="rounded-card border border-border bg-card shadow-subtle overflow-hidden">
        {isLoading && customers.length === 0 ? (
          <div className="p-8 space-y-4 animate-pulse">
            <div className="h-8 bg-surface rounded" />
            <div className="h-8 bg-surface rounded" />
            <div className="h-8 bg-surface rounded" />
          </div>
        ) : error ? (
          <div className="p-8 text-center text-danger text-sm">{error}</div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Users className="w-10 h-10 mx-auto text-ink-muted/50" />
            <div className="text-base font-semibold text-ink">
              {searchTerm ? 'No matching customers found' : 'No customers recorded yet'}
            </div>
            <p className="text-xs text-ink-muted max-w-sm mx-auto">
              {searchTerm
                ? `No customer matches "${searchTerm}". Try another search term or clear the filter.`
                : 'Customer records are automatically created and updated as appointments are booked.'}
            </p>
            {searchTerm && (
              <Button variant="outline" size="sm" onClick={() => setSearchTerm('')}>
                Clear Search
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface/50 border-b border-border text-ink-muted font-semibold">
                  <th className="p-3.5 pl-5">Customer</th>
                  <th className="p-3.5">Contact</th>
                  <th className="p-3.5 text-center">Total Visits</th>
                  <th className="p-3.5">Last Visit</th>
                  <th className="p-3.5 text-right">Total Spent</th>
                  <th className="p-3.5 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customers.map((c) => {
                  const lastVisit = c.last_visit_at_utc ? c.last_visit_at_utc.slice(0, 10) : 'Never';

                  return (
                    <tr
                      key={c.id}
                      onClick={() => handleOpenProfile(c.id)}
                      className="hover:bg-surface/50 transition-colors cursor-pointer group"
                    >
                      <td className="p-3.5 pl-5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink text-sm group-hover:text-primary transition-colors">
                            {c.name}
                          </span>
                          {c.pending_deletion === 1 && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-danger-light text-danger">
                              <ShieldAlert className="w-3 h-3" />
                              Deletion Pending
                            </span>
                          )}
                          {c.opted_out_at_utc && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-surface border border-border text-ink-muted">
                              Opted Out
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-ink-muted mt-0.5">
                          Added {new Date(c.created_at_utc).toLocaleDateString()}
                        </div>
                      </td>

                      <td className="p-3.5">
                        <div className="text-ink font-mono">{c.display_phone || c.normalized_phone}</div>
                        {c.email && <div className="text-ink-muted text-[11px] truncate max-w-[160px]">{c.email}</div>}
                      </td>

                      <td className="p-3.5 text-center font-bold text-ink">
                        {c.total_visits}
                      </td>

                      <td className="p-3.5 text-ink-muted">
                        {lastVisit}
                      </td>

                      <td className="p-3.5 text-right font-semibold text-ink">
                        ₹{((c.total_spend_minor || 0) / 100).toFixed(0)}
                      </td>

                      <td className="p-3.5 pr-5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenProfile(c.id)}
                          >
                            View
                          </Button>
                          {c.pending_deletion !== 1 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleBookAgain({
                                  id: c.id,
                                  name: c.name,
                                  phone: c.display_phone || c.normalized_phone,
                                  email: c.email || '',
                                })
                              }
                            >
                              Book
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalCount > limit && (
          <div className="p-3.5 border-t border-border bg-surface/30 flex items-center justify-between text-xs text-ink-muted">
            <div>
              Showing {offset + 1}–{Math.min(offset + limit, totalCount)} of {totalCount} customers
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
                leftIcon={<ChevronLeft className="w-3.5 h-3.5" />}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + limit >= totalCount}
                onClick={() => setOffset(offset + limit)}
                leftIcon={<ChevronRight className="w-3.5 h-3.5" />}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Customer Profile Drawer (D2, D4, D6, D7) */}
      <CustomerProfileDrawer
        customerId={selectedCustomerId}
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onBookAgain={handleBookAgain}
        onOpenMerge={handleOpenMerge}
        onCustomerUpdated={fetchCustomers}
        businessTimezone={business?.timezone || 'Asia/Kolkata'}
      />

      {/* Quick Add Modal (Prefilled for Book Again, D4) */}
      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => {
          setIsQuickAddOpen(false);
          setQuickAddInitial(null);
        }}
        onSuccess={() => {
          setIsQuickAddOpen(false);
          setQuickAddInitial(null);
          fetchCustomers();
        }}
        businessTimezone={business?.timezone || 'Asia/Kolkata'}
        initialCustomerId={quickAddInitial?.customerId}
        initialCustomerName={quickAddInitial?.customerName}
        initialCustomerPhone={quickAddInitial?.customerPhone}
        initialCustomerEmail={quickAddInitial?.customerEmail}
        initialServiceId={quickAddInitial?.serviceId}
      />

      {/* Merge Duplicate Customer Modal (D5) */}
      <MergeCustomerModal
        isOpen={isMergeOpen}
        onClose={() => {
          setIsMergeOpen(false);
          setMergeSourceId(null);
        }}
        onSuccess={() => {
          setIsMergeOpen(false);
          setMergeSourceId(null);
          setIsDrawerOpen(false);
          fetchCustomers();
        }}
        sourceCustomerId={mergeSourceId}
      />
    </div>
  );
};
