// SlotSync Closed Error Codes
// As locked in Phase 1 specification

export const ERROR_CODES = {
  VALIDATION_FAILED: 'validation_failed',
  UNAUTHENTICATED: 'unauthenticated',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  SLOT_TAKEN: 'slot_taken',
  ILLEGAL_TRANSITION: 'illegal_transition',
  VERSION_CONFLICT: 'version_conflict',
  RATE_LIMITED: 'rate_limited',
  IDEMPOTENCY_KEY_REUSED: 'idempotency_key_reused',
  POLICY_VIOLATION: 'policy_violation',
  UNAVAILABLE: 'unavailable',
  INTERNAL: 'internal',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ApiErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    fields?: Record<string, string>;
  };
}
