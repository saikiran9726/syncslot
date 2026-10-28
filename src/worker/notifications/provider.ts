// SlotSync Notification Provider Layer
// Integrates Resend REST API with Idempotency-Key support, honest dry-run fallback,
// sandbox recipient gating, and sanitized error reporting.

import { AppBindings } from '../middleware';
import { NotificationJobStatus } from '../../shared/statusEnums';

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendResult {
  success: boolean;
  status: NotificationJobStatus;
  messageId?: string;
  error?: string;
}

/**
 * Sanitizes error messages to ensure zero credentials, keys, or internal tokens leak into DB or logs.
 */
function sanitizeErrorMessage(rawError: string): string {
  return rawError
    .replace(/re_[a-zA-Z0-9_-]+/g, '[REDACTED_API_KEY]')
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]')
    .replace(/[a-zA-Z0-9_-]{32,}/g, '[REDACTED_TOKEN]')
    .slice(0, 255);
}

/**
 * Dispatches an email notification through Resend or the honest dry-run simulator.
 */
export async function dispatchEmail(
  env: AppBindings,
  jobId: string,
  idempotencyKey: string,
  payload: EmailPayload,
  sandboxRecipient?: string | null
): Promise<SendResult> {
  const apiKey = env.RESEND_API_KEY?.trim();

  // 1. Sandbox Gating Check
  if (sandboxRecipient && sandboxRecipient.trim()) {
    const allowed = sandboxRecipient.toLowerCase().trim();
    if (payload.to.toLowerCase().trim() !== allowed) {
      return {
        success: true,
        status: 'skipped_sandbox',
        error: `Recipient ${payload.to} not in sandbox whitelist (${allowed})`,
      };
    }
  }

  // 2. Honest Dry-Run Fallback
  // If no Resend key is configured or set to dry-run, record honest simulated status
  if (!apiKey || apiKey === 'dry-run' || apiKey === 'test') {
    return {
      success: true,
      status: 'simulated',
      messageId: `dryrun_${jobId.slice(0, 8)}`,
    };
  }

  // 3. Real Resend API Dispatch
  try {
    const fromAddress = env.EMAIL_FROM || 'SlotSync <appointments@slotsync.dev>';

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    });

    const body: any = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = body?.message || `HTTP ${res.status} ${res.statusText}`;
      return {
        success: false,
        status: 'failed',
        error: sanitizeErrorMessage(errMsg),
      };
    }

    // Standing Rule: Provider acceptance is NEVER "delivered". We set "accepted" only.
    const messageId = body?.id || `resend_${jobId.slice(0, 8)}`;
    return {
      success: true,
      status: 'accepted',
      messageId,
    };
  } catch (err: any) {
    return {
      success: false,
      status: 'failed',
      error: sanitizeErrorMessage(err?.message || 'Network error communicating with Resend'),
    };
  }
}
