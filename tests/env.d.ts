import { type D1Migration } from '@cloudflare/vitest-pool-workers';

declare module 'cloudflare:test' {
  interface ProvidedEnv {
    DB: D1Database;
    TEST_MIGRATIONS: D1Migration[];
    ENVIRONMENT: string;
    APP_BASE_URL: string;
    COOKIE_NAME: string;
    EMAIL_FROM: string;
    RATE_LIMIT_SALT: string;
    SESSION_SECRET: string;
    RESEND_API_KEY?: string;
  }
}
