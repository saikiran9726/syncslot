// SlotSync Cloudflare Worker Entrypoint
// Serves React SPA via static assets, handles /api/* REST routes, and executes Cron Triggers.

import { Hono } from 'hono';
import { AppBindings, AuthContext, securityHeaders, verifyOrigin, handleIdempotency } from './middleware';
import { ERROR_CODES, ApiErrorResponse } from '../shared/errorCodes';
import { authRouter } from './routes/auth';
import { ownerRouter } from './routes/owner';
import { publicRouter } from './routes/public';
import { processNotificationQueue } from './notifications/jobProcessor';

const app = new Hono<{ Bindings: AppBindings; Variables: AuthContext }>();

// Global Middleware
// SEC-05: Enforce RATE_LIMIT_SALT requirement in production
app.use('*', async (c, next) => {
  if (c.env.ENVIRONMENT === 'production' && !c.env.RATE_LIMIT_SALT) {
    console.error('[FATAL] RATE_LIMIT_SALT is required in production environment.');
    return c.json<ApiErrorResponse>(
      {
        error: {
          code: ERROR_CODES.INTERNAL,
          message: 'Server configuration error: RATE_LIMIT_SALT required in production',
        },
      },
      500
    );
  }
  await next();
});
app.use('*', securityHeaders);
app.use('*', verifyOrigin);

// Global Error Handler
app.onError((err, c) => {
  console.error('[Worker Error]:', err.message);
  return c.json<ApiErrorResponse>(
    {
      error: {
        code: ERROR_CODES.INTERNAL,
        message: 'An internal server error occurred',
      },
    },
    500
  );
});

// --- API SUB-ROUTER ---
const api = new Hono<{ Bindings: AppBindings; Variables: AuthContext }>();

// Apply Idempotency to mutating API operations
api.use('*', handleIdempotency);

// Health check
api.get('/health', async (c) => {
  return c.json({
    status: 'ok',
    service: 'syncslot-api',
    environment: c.env.ENVIRONMENT || 'development',
    timestamp: new Date().toISOString(),
  });
});

// Mount Sub-routers
api.route('/auth', authRouter);
api.route('/owner', ownerRouter);
api.route('/public', publicRouter);

// API 404 handler
api.all('*', (c) => {
  return c.json<ApiErrorResponse>(
    {
      error: {
        code: ERROR_CODES.NOT_FOUND,
        message: 'Endpoint not found',
      },
    },
    404
  );
});

// Mount /api
app.route('/api', api);

// SPA Static Assets Fallback
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    try {
      const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
      if (assetResponse.status !== 404) {
        return assetResponse;
      }
    } catch {
      // Fallback
    }
  }

  return c.html(
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SlotSync - Local Service Booking</title>
  </head>
  <body>
    <div id="root">
      <h1>SlotSync Worker Online</h1>
      <p>Frontend assets will be served here upon build.</p>
    </div>
  </body>
</html>`
  );
});

export { app };

export default {
  fetch: app.fetch,

  /**
   * Cloudflare Cron Trigger Handler
   * Executes scheduled background tasks (appointment reminders)
   */
  async scheduled(event: ScheduledEvent, env: AppBindings, ctx: ExecutionContext): Promise<void> {
    console.log(`[Cron Trigger] Executing at ${new Date(event.scheduledTime).toISOString()}`);
    try {
      const stats = await processNotificationQueue(env, 10);
      console.log(
        `[Cron Trigger Complete] Processed: ${stats.processed}, Accepted: ${stats.accepted}, Simulated: ${stats.simulated}, Skipped: ${stats.skipped}, Failed: ${stats.failed}`
      );
    } catch (err: any) {
      console.error('[Cron Trigger Processing Error]:', err?.message || err);
    }
  },
};
