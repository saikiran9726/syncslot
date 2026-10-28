// SlotSync Merge Customer Modal (D5)
// Enables controlled duplicate customer merge, reassigning bookings and creating aliases.

import React, { useState, useEffect } from 'react';
import { Dialog } from './ui/Dialog';
import { Button } from './ui/Button';
import { TextField } from './ui/FormField';
import { GitMerge, AlertTriangle, Search, CheckCircle } from 'lucide-react';

export interface MergeCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  sourceCustomerId: string | null;
}

interface CustomerOption {
  id: string;
  name: string;
  display_phone: string;
  normalized_phone: string;
  email: string | null;
}

export const MergeCustomerModal: React.FC<MergeCustomerModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  sourceCustomerId,
}) => {
  const [sourceCustomer, setSourceCustomer] = useState<CustomerOption | null>(null);
  const [targetCustomerId, setTargetCustomerId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [candidates, setCandidates] = useState<CustomerOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !sourceCustomerId) {
      setSourceCustomer(null);
      setTargetCustomerId('');
      setSearchQuery('');
      setCandidates([]);
      setErrorMessage(null);
      return;
    }

    // Fetch source customer details
    const fetchSource = async () => {
      try {
        const res = await fetch(`/api/owner/customers/${sourceCustomerId}`);
        if (res.ok) {
          const data = (await res.json()) as any;
          setSourceCustomer(data.customer);
        }
      } catch (err) {
        console.error('Failed to load source customer:', err);
      }
    };

    fetchSource();
  }, [isOpen, sourceCustomerId]);

  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    if (!query.trim() || query.trim().length < 2) {
      setCandidates([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(`/api/owner/customers?q=${encodeURIComponent(query.trim())}&limit=10`);
      if (res.ok) {
        const data = (await res.json()) as any;
        // Filter out source customer
        const filtered = (data.customers || []).filter((c: CustomerOption) => c.id !== sourceCustomerId);
        setCandidates(filtered);
      }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleMergeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceCustomerId || !targetCustomerId) {
      setErrorMessage('Please select a target customer to merge into.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/owner/customers/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_customer_id: sourceCustomerId,
          new_customer_id: targetCustomerId,
        }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) {
        setErrorMessage(data.error?.message || 'Failed to merge customers.');
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setErrorMessage('Network error occurred during customer merge.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const selectedTarget = candidates.find((c) => c.id === targetCustomerId);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="Merge Duplicate Customer"
      description="Consolidate duplicate customer profiles into a single primary record."
      maxWidth="md"
    >
      <form onSubmit={handleMergeSubmit} className="space-y-4">
        {errorMessage && (
          <div className="p-3 rounded-control bg-danger-light text-danger text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Source Customer Pill */}
        <div className="p-3 rounded-control bg-surface border border-border">
          <span className="text-xs text-ink-muted block mb-1 font-semibold">
            Source Customer (Will be merged and removed):
          </span>
          <div className="text-sm font-semibold text-ink">
            {sourceCustomer?.name || 'Loading...'}
          </div>
          <div className="text-xs text-ink-muted">
            {sourceCustomer?.display_phone || sourceCustomer?.normalized_phone}
            {sourceCustomer?.email ? ` • ${sourceCustomer.email}` : ''}
          </div>
        </div>

        {/* Target Customer Selector */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-ink">
            Search Target Customer to merge into:
          </label>
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by name, phone or email..."
              className="w-full text-xs p-2.5 pl-8 rounded-control border border-border bg-card text-ink focus-ring"
            />
            <Search className="w-4 h-4 text-ink-muted absolute left-2.5 top-2.5" />
          </div>

          {/* Search Candidates */}
          {candidates.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-control border border-border divide-y divide-border bg-card">
              {candidates.map((cand) => (
                <button
                  type="button"
                  key={cand.id}
                  onClick={() => setTargetCustomerId(cand.id)}
                  className={`w-full text-left p-2.5 text-xs flex items-center justify-between hover:bg-surface transition-colors ${
                    targetCustomerId === cand.id ? 'bg-primary-light/50 font-semibold text-primary' : 'text-ink'
                  }`}
                >
                  <div>
                    <div>{cand.name}</div>
                    <div className="text-[11px] text-ink-muted">
                      {cand.display_phone || cand.normalized_phone} {cand.email ? `• ${cand.email}` : ''}
                    </div>
                  </div>
                  {targetCustomerId === cand.id && (
                    <CheckCircle className="w-4 h-4 text-primary shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}

          {isSearching && (
            <div className="text-xs text-ink-muted py-2 text-center">Searching...</div>
          )}

          {selectedTarget && (
            <div className="p-2.5 rounded-control bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
              <span className="font-semibold">Selected Primary Customer: </span>
              {selectedTarget.name} ({selectedTarget.display_phone || selectedTarget.normalized_phone})
            </div>
          )}
        </div>

        {/* Caution Notice */}
        <div className="p-3 rounded-control bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-1">
          <div className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            What happens after merge:
          </div>
          <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-amber-700">
            <li>All appointment records are reassigned to the primary customer.</li>
            <li>All relationship notes are transferred.</li>
            <li>A permanent alias tombstone is saved.</li>
            <li>The source customer profile is deleted from the active directory.</li>
          </ul>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            disabled={!targetCustomerId}
            leftIcon={<GitMerge className="w-3.5 h-3.5" />}
          >
            Confirm & Merge
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
