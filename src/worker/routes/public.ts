// SlotSync Public Endpoints
// Serves customer-facing business profile and bookable services

import { Hono } from 'hono';
import { AppBindings, AuthContext } from '../middleware';
import { ERROR_CODES, ApiErrorResponse } from '../../shared/errorCodes';

export const publicRouter = new Hono<{ Bindings: AppBindings; Variables: AuthContext }>();

// Get public business profile & active bookable services
publicRouter.get('/business/:slug', async (c) => {
  const slug = c.req.param('slug').toLowerCase().trim();

  const business = await c.env.DB.prepare(
    `SELECT id, name, slug, timezone, description, address, accessibility_info,
            contact_phone, contact_email, published, booking_mode, min_notice_hours,
            max_days_ahead, cancellation_policy_text
     FROM businesses
     WHERE slug = ?`
  )
    .bind(slug)
    .first<{
      id: string;
      name: string;
      slug: string;
      timezone: string;
      description: string | null;
      address: string | null;
      accessibility_info: string | null;
      contact_phone: string | null;
      contact_email: string | null;
      published: number;
      booking_mode: string;
      min_notice_hours: number;
      max_days_ahead: number;
      cancellation_policy_text: string | null;
    }>();

  if (!business) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'Booking page not found',
        },
      },
      404
    );
  }

  // If business is not published, return neutral unavailable status
  if (business.published === 0) {
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.NOT_FOUND,
          message: 'This booking page is currently not accepting appointments',
        },
      },
      404
    );
  }

  // Fetch active bookable services
  const { results: services } = await c.env.DB.prepare(
    `SELECT id, name, description, duration_minutes, buffer_minutes, price_minor, currency
     FROM services
     WHERE business_id = ? AND is_active = 1
     ORDER BY name ASC`
  )
    .bind(business.id)
    .all();

  return c.json({
    business: {
      id: business.id,
      name: business.name,
      slug: business.slug,
      timezone: business.timezone,
      description: business.description,
      address: business.address,
      accessibility_info: business.accessibility_info,
      contact_phone: business.contact_phone,
      contact_email: business.contact_email,
      booking_mode: business.booking_mode,
      min_notice_hours: business.min_notice_hours,
      max_days_ahead: business.max_days_ahead,
      cancellation_policy_text: business.cancellation_policy_text,
    },
    services: services || [],
  });
});
