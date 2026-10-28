// SlotSync Status and Domain Enums

export const BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'no_show',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_SOURCES = [
  'direct',
  'phone',
  'whatsapp',
  'walkin',
  'instagram',
  'website',
  'other',
] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

export const NOTIFICATION_JOB_STATUSES = [
  'queued',
  'sending',
  'accepted',
  'delivered',
  'simulated',
  'retry_scheduled',
  'failed',
  'permanently_failed',
  'skipped_late',
  'skipped_quiet_hours',
  'skipped_no_channel',
  'skipped_consent',
  'skipped_sandbox',
  'superseded',
  'cancelled',
  'handled_manually',
] as const;
export type NotificationJobStatus = (typeof NOTIFICATION_JOB_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ['email', 'sms', 'whatsapp'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const USER_ROLES = ['owner', 'staff'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ACTOR_TYPES = ['owner', 'staff', 'customer', 'system'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const BOOKING_MODES = ['instant', 'approval'] as const;
export type BookingMode = (typeof BOOKING_MODES)[number];
