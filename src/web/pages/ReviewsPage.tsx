// SlotSync Customer Reviews Hub (Phase 8: Reviews)
// Manual review collection via Google review links and transparent wa.me triggers.
// Zero scraping, zero fake reviews, zero automated messaging.

import React, { useState, useEffect } from 'react';
import {
  Star,
  ExternalLink,
  Copy,
  Check,
  MessageSquare,
  ShieldCheck,
  Save,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../components/ui/Button';

interface ReviewsResponse {
  review_url: string;
  business_name: string;
  business_slug: string;
  average_rating: number;
  total_reviews: number;
  reviews: {
    id: string;
    rating: number;
    comment: string | null;
    owner_reply: string | null;
    created_at_utc: string;
    customer_name: string;
    service_name: string;
  }[];
}

export const ReviewsPage: React.FC = () => {
  const [data, setData] = useState<ReviewsResponse | null>(null);
  const [reviewUrlInput, setReviewUrlInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const fetchReviews = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/owner/reviews');
      if (!res.ok) throw new Error('Failed to load reviews');
      const json: ReviewsResponse = await res.json();
      setData(json);
      setReviewUrlInput(json.review_url || '');
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Error loading reviews' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const handleSaveUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/owner/business', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ review_url: reviewUrlInput.trim() }),
      });

      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as any;
        throw new Error(errJson?.error?.message || 'Failed to update review URL');
      }

      setStatusMessage({ type: 'success', text: 'Review URL updated successfully.' });
      fetchReviews();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to save review link' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyLink = () => {
    if (!data?.review_url) return;
    navigator.clipboard.writeText(data.review_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const getWhatsAppReviewUrl = () => {
    if (!data?.review_url) return '';
    const text = `Hi! Thank you for choosing ${data.business_name || 'our studio'}. If you enjoyed your experience, we would truly appreciate a quick review here: ${data.review_url}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-ink tracking-tight flex items-center gap-2">
            <Star className="w-6 h-6 text-warning" />
            Client Reviews & Feedback
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            Collect honest feedback by manually sharing your Google or custom review link.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchReviews}
          isLoading={isLoading}
          leftIcon={<RefreshCw className="w-4 h-4" />}
        >
          Refresh
        </Button>
      </div>

      {statusMessage && (
        <div
          className={`p-3.5 rounded-card text-xs font-medium flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-success-tint border border-success/20 text-success'
              : 'bg-danger-tint border border-danger/20 text-danger'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <Check className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Review Link Setup Card */}
      <div className="bg-card border border-border rounded-card p-6 shadow-subtle space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <ExternalLink className="w-4 h-4 text-primary" />
            External Review Destination
          </h2>
          <p className="text-xs text-ink-muted mt-0.5">
            Paste your Google Business review link or custom review portal URL.
          </p>
        </div>

        <form onSubmit={handleSaveUrl} className="flex flex-col sm:flex-row gap-3">
          <input
            type="url"
            value={reviewUrlInput}
            onChange={(e) => setReviewUrlInput(e.target.value)}
            placeholder="https://g.page/r/your-google-review-link"
            className="flex-1 text-xs p-2.5 rounded-control border border-border bg-surface text-ink focus-ring"
          />
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSaving}
            leftIcon={<Save className="w-4 h-4" />}
          >
            Save Link
          </Button>
        </form>

        {data?.review_url && (
          <div className="pt-3 border-t border-border flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              leftIcon={copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            >
              {copied ? 'Copied Link!' : 'Copy Review Link'}
            </Button>

            <a
              href={getWhatsAppReviewUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-control border border-success/30 bg-success-tint text-success text-xs font-semibold hover:bg-success-tint/80 focus-ring"
            >
              <MessageSquare className="w-4 h-4" />
              Share via WhatsApp
            </a>

            <a
              href={data.review_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-ink-muted hover:text-ink underline flex items-center gap-1"
            >
              Preview link
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}
      </div>

      {/* Honest Policy Notice */}
      <div className="p-4 rounded-card bg-surface border border-border flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <div className="text-xs text-ink-muted space-y-1">
          <div className="font-semibold text-ink">Strict Authenticity Standards</div>
          <p>
            SlotSync does not post automated review requests, scrape reviews from third parties, or generate synthetic ratings. Review links are shared manually at your discretion with confirmed clients.
          </p>
        </div>
      </div>

      {/* Verified Reviews Section */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold text-ink flex items-center gap-2">
          <span>Client Feedback</span>
          {data && data.total_reviews > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent-tint text-accent font-bold">
              ★ {data.average_rating} ({data.total_reviews})
            </span>
          )}
        </h2>

        {isLoading ? (
          <div className="space-y-3 animate-pulse">
            <div className="h-20 bg-card rounded-card border border-border" />
            <div className="h-20 bg-card rounded-card border border-border" />
          </div>
        ) : !data || data.reviews.length === 0 ? (
          <div className="bg-card border border-border rounded-card p-10 text-center space-y-2">
            <Star className="w-10 h-10 text-ink-muted mx-auto opacity-30" />
            <div className="text-sm font-semibold text-ink">No Reviews Recorded Yet</div>
            <p className="text-xs text-ink-muted max-w-sm mx-auto">
              Once you share your review link with clients, their verified post-service ratings will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.reviews.map((r) => (
              <div key={r.id} className="bg-card border border-border rounded-card p-4 space-y-2 shadow-subtle">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-ink">{r.customer_name}</span>
                    <span className="text-[11px] text-ink-muted">· {r.service_name}</span>
                  </div>
                  <div className="flex items-center gap-1 text-warning text-xs font-bold">
                    {'★'.repeat(r.rating)}
                    <span className="text-ink-muted font-normal text-[11px]">({r.rating}/5)</span>
                  </div>
                </div>
                {r.comment && <p className="text-xs text-ink italic">"{r.comment}"</p>}
                {r.owner_reply && (
                  <div className="p-2.5 rounded bg-surface border-l-2 border-primary text-xs text-ink-muted">
                    <span className="font-semibold text-ink">Owner Reply: </span>
                    {r.owner_reply}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
