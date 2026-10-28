import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll } from 'vitest';

beforeAll(async () => {
  // Enforce foreign keys in SQLite test environment
  await (env as any).DB.exec('PRAGMA foreign_keys = ON;');
  await applyD1Migrations((env as any).DB, (env as any).TEST_MIGRATIONS);
  await (env as any).DB.exec('PRAGMA foreign_keys = ON;');
});
