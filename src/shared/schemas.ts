// SlotSync Shared Zod Schemas
// Imported by both Backend Worker and Frontend React SPA

import { z } from 'zod';
import { BOOKING_SOURCES, BOOKING_STATUSES, USER_ROLES } from './statusEnums';
import { validateSlug } from './slugUtils';
import { isValidTimezone } from './timezoneUtils';

// --- AUTH SCHEMAS ---

export const RegisterInputSchema = z.object({
  email: z.string().trim().email('Invalid email address').max(255),
  password: z.string().min(10, 'Password must be at least 10 characters').max(128),
  businessName: z.string().trim().min(2, 'Business name must be at least 2 characters').max(100),
  slug: z
    .string()
    .trim()
    .superRefine((val, ctx) => {
      const err = validateSlug(val);
      if (err) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: err });
      }
    }),
  timezone: z
    .string()
    .default('Asia/Kolkata')
    .refine((val) => isValidTimezone(val), { message: 'Invalid IANA timezone identifier' }),
  industryPreset: z.string().optional().default('salon'),
});

export type RegisterInput = z.infer<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof LoginInputSchema>;

// --- SERVICE SCHEMAS ---

export const CreateServiceSchema = z.object({
  name: z.string().trim().min(1, 'Service name is required').max(100),
  description: z.string().trim().max(500).optional().default(''),
  duration_minutes: z.number().int().min(5, 'Duration must be at least 5 minutes').max(720),
  buffer_minutes: z.number().int().min(0, 'Buffer cannot be negative').max(180).default(0),
  price_minor: z.number().int().min(0, 'Price cannot be negative').default(0),
  currency: z.string().max(5).default('INR'),
  is_active: z.number().int().min(0).max(1).default(1),
});

export type CreateServiceInput = z.infer<typeof CreateServiceSchema>;

export const UpdateServiceSchema = CreateServiceSchema.partial();
export type UpdateServiceInput = z.infer<typeof UpdateServiceSchema>;

// --- WORKING HOURS, BREAKS, HOLIDAYS & BLOCKED PERIODS ---

export const DayScheduleSchema = z
  .object({
    day_of_week: z.number().int().min(0).max(6),
    open_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:MM format'),
    close_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:MM format'),
    is_closed: z.number().int().min(0).max(1).default(0),
  })
  .refine((data) => data.is_closed === 1 || data.close_time > data.open_time, {
    message: 'Close time must be after open time',
    path: ['close_time'],
  });

export const BulkWorkingHoursSchema = z.object({
  schedules: z.array(DayScheduleSchema).min(1).max(14),
});

export type DaySchedule = z.infer<typeof DayScheduleSchema>;
export type BulkWorkingHoursInput = z.infer<typeof BulkWorkingHoursSchema>;

export const CreateBreakSchema = z
  .object({
    day_of_week: z.number().int().min(0).max(6),
    start_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:MM format'),
    end_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time must be in HH:MM format'),
  })
  .refine((data) => data.end_time > data.start_time, {
    message: 'Break end time must be after start time',
    path: ['end_time'],
  });

export type CreateBreakInput = z.infer<typeof CreateBreakSchema>;

export const CreateHolidaySchema = z.object({
  holiday_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format'),
  name: z.string().trim().min(1, 'Holiday name is required').max(100),
});

export type CreateHolidayInput = z.infer<typeof CreateHolidaySchema>;

export const CreateBlockedPeriodSchema = z
  .object({
    start_at_utc: z.string().datetime({ message: 'start_at_utc must be a valid UTC ISO string' }),
    end_at_utc: z.string().datetime({ message: 'end_at_utc must be a valid UTC ISO string' }),
    reason: z.string().trim().max(300).optional().default(''),
  })
  .refine((data) => data.end_at_utc > data.start_at_utc, {
    message: 'End time must be after start time',
    path: ['end_at_utc'],
  });

export type CreateBlockedPeriodInput = z.infer<typeof CreateBlockedPeriodSchema>;

// --- BOOKING SCHEMAS ---

export const PublicCreateBookingSchema = z.object({
  service_id: z.string().uuid('Invalid service ID'),
  resource_id: z.string().uuid('Invalid resource ID').optional(),
  start_at_utc: z.string().datetime({ message: 'start_at_utc must be a valid UTC ISO string' }),
  customer_name: z.string().trim().min(1, 'Customer name is required').max(100),
  customer_phone: z.string().trim().min(7, 'Phone number is too short').max(20),
  customer_email: z.string().trim().email('Invalid email format').optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().default(''),
  source: z.enum(BOOKING_SOURCES).default('direct'),
  consent_email_reminders: z.boolean().default(true),
  consent_whatsapp_reminders: z.boolean().default(true),
});

export type PublicCreateBookingInput = z.infer<typeof PublicCreateBookingSchema>;

export const OwnerCreateBookingSchema = z.object({
  customer_id: z.string().uuid().optional(),
  customer_name: z.string().trim().min(1, 'Customer name is required').max(100),
  customer_phone: z.string().trim().min(7, 'Phone number is too short').max(20),
  customer_email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  service_id: z.string().uuid('Invalid service ID'),
  resource_id: z.string().uuid().optional(),
  start_at_utc: z.string().datetime({ message: 'start_at_utc must be a valid UTC ISO string' }),
  source: z.enum(BOOKING_SOURCES).default('phone'),
  notes: z.string().trim().max(500).optional().default(''),
});

export type OwnerCreateBookingInput = z.infer<typeof OwnerCreateBookingSchema>;

export const RescheduleBookingSchema = z.object({
  new_start_at_utc: z.string().datetime({ message: 'new_start_at_utc must be a valid UTC ISO string' }),
});

export type RescheduleBookingInput = z.infer<typeof RescheduleBookingSchema>;

export const CancelBookingSchema = z.object({
  reason: z.string().trim().max(300).optional().default(''),
});

export type CancelBookingInput = z.infer<typeof CancelBookingSchema>;

export const StatusTransitionSchema = z.object({
  status: z.enum(BOOKING_STATUSES),
  reason: z.string().trim().max(300).optional(),
});

export type StatusTransitionInput = z.infer<typeof StatusTransitionSchema>;

// --- CUSTOMER NOTE & MERGE SCHEMAS ---

export const CreateCustomerNoteSchema = z.object({
  note_text: z.string().trim().min(1, 'Note cannot be empty').max(1000),
  is_private: z.boolean().default(false),
});

export type CreateCustomerNoteInput = z.infer<typeof CreateCustomerNoteSchema>;

export const MergeCustomerSchema = z.object({
  old_customer_id: z.string().uuid(),
  new_customer_id: z.string().uuid(),
});

export type MergeCustomerInput = z.infer<typeof MergeCustomerSchema>;

// --- REVIEW SCHEMAS ---

export const CreateReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).optional().default(''),
});

export type CreateReviewInput = z.infer<typeof CreateReviewSchema>;

export const OwnerReplyReviewSchema = z.object({
  owner_reply: z.string().trim().min(1, 'Reply cannot be empty').max(1000),
});

export type OwnerReplyReviewInput = z.infer<typeof OwnerReplyReviewSchema>;

// --- SETTINGS SCHEMAS ---

export const UpdateBusinessSettingsSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100).optional(),
  slug: z
    .string()
    .trim()
    .superRefine((val, ctx) => {
      const err = validateSlug(val);
      if (err) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: err });
      }
    })
    .optional(),
  timezone: z
    .string()
    .refine((val) => isValidTimezone(val), { message: 'Invalid IANA timezone identifier' })
    .optional(),
  contact_phone: z.string().trim().max(20).optional().or(z.literal('')),
  contact_email: z.string().trim().email('Invalid email').optional().or(z.literal('')),
  description: z.string().trim().max(1000).optional().or(z.literal('')),
  address: z.string().trim().max(300).optional().or(z.literal('')),
  accessibility_info: z.string().trim().max(500).optional().or(z.literal('')),
  min_notice_hours: z.number().int().min(0).max(72).optional(),
  max_days_ahead: z.number().int().min(1).max(365).optional(),
  cancel_cutoff_hours: z.number().int().min(0).max(72).optional(),
  cancellation_policy_text: z.string().trim().max(1000).optional().or(z.literal('')),
  booking_mode: z.enum(['instant', 'approval']).optional(),
  requires_approval: z.number().int().min(0).max(1).optional(),
  published: z.number().int().min(0).max(1).optional(),
  onboarding_step: z.number().int().min(1).max(5).optional(),
});

export type UpdateBusinessSettingsInput = z.infer<typeof UpdateBusinessSettingsSchema>;
