// SlotSync Share Booking Link Modal (Phase 8: Share Polish)
// Copy link, dynamic QR code generation, and manual prefilled wa.me share text.

import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Share2,
  Copy,
  Check,
  Download,
  MessageSquare,
  X,
  ExternalLink,
  QrCode,
} from 'lucide-react';
import { Button } from './ui/Button';

export interface ShareBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  businessSlug: string;
  businessName: string;
}

export const ShareBookingModal: React.FC<ShareBookingModalProps> = ({
  isOpen,
  onClose,
  businessSlug,
  businessName,
}) => {
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const publicUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/b/${businessSlug}`
    : `https://slotsync.dev/b/${businessSlug}`;

  useEffect(() => {
    if (isOpen && businessSlug) {
      QRCode.toDataURL(publicUrl, {
        width: 280,
        margin: 2,
        color: {
          dark: '#1e293b',
          light: '#ffffff',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch(() => {});
    }
  }, [isOpen, businessSlug, publicUrl]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const getWhatsAppShareUrl = () => {
    const text = `Book your appointment with ${businessName || 'us'} online: ${publicUrl}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-card border border-border rounded-modal max-w-md w-full p-6 shadow-card space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-ink font-display font-bold text-lg">
            <Share2 className="w-5 h-5 text-primary" />
            Share Booking Link
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-ink-muted hover:text-ink hover:bg-surface focus-ring"
            aria-label="Close share dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* QR Code Card */}
        <div className="flex flex-col items-center justify-center p-6 bg-surface rounded-card border border-border/60 space-y-3">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt={`QR Code for ${businessName} booking page`}
              className="w-44 h-44 rounded-md shadow-xs bg-card p-1 border border-border"
            />
          ) : (
            <div className="w-44 h-44 flex items-center justify-center bg-card rounded border border-border text-ink-muted animate-pulse">
              <QrCode className="w-10 h-10 opacity-30" />
            </div>
          )}
          <span className="text-[11px] font-medium text-ink-muted text-center">
            Scan to book instantly on any smartphone
          </span>
          {qrDataUrl && (
            <a
              href={qrDataUrl}
              download={`${businessSlug}-booking-qr.png`}
              className="inline-flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline"
            >
              <Download className="w-3.5 h-3.5" />
              Download QR Code (PNG)
            </a>
          )}
        </div>

        {/* Link Field */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-ink">Public Booking URL</label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={publicUrl}
              className="flex-1 text-xs font-mono p-2.5 rounded-control border border-border bg-surface text-ink select-all focus-ring"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              leftIcon={copied ? <Check className="w-4 h-4 text-success" /> : <Copy className="w-4 h-4" />}
            >
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>

        {/* Actions */}
        <div className="pt-2 flex items-center gap-3">
          <a
            href={getWhatsAppShareUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-2 p-2.5 rounded-control border border-success/30 bg-success-tint text-success text-xs font-semibold hover:bg-success-tint/80 focus-ring"
          >
            <MessageSquare className="w-4 h-4" />
            Share via WhatsApp
          </a>

          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-control border border-border text-xs font-medium text-ink hover:bg-surface focus-ring"
          >
            Visit Page
            <ExternalLink className="w-3.5 h-3.5 text-ink-muted" />
          </a>
        </div>
      </div>
    </div>
  );
};
