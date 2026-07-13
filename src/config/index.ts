// Loads and validates process.env once at import time, then exports a typed,
// frozen config object. Any other module that needs config imports `config`
// from here instead of touching `process.env` directly — keeps env access in
// one place and guarantees it's already been validated by the time it's used.
import 'dotenv/config';
import { envSchema } from './env.schema.js';

// Step 1: parse process.env against the schema.
const parsed = envSchema.safeParse(process.env);

// Step 2: fail fast with a readable message if validation fails — a gateway
// booting with bad config (e.g. a malformed JWT key) should never come up
// half-working, it should refuse to start.
if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

// Step 3: expose the validated, typed config as a frozen singleton.
export const config = Object.freeze(parsed.data);

export const isProduction = config.NODE_ENV === 'production';
export const isTest = config.NODE_ENV === 'test';

// Step 4: cross-field production safety checks that a per-field schema
// can't express. CORS_ORIGINS='*' makes @fastify/cors reflect any request's
// Origin header (origin: true) — combined with credentials:true in
// server.ts, that lets any origin make credentialed requests. Fine for
// local dev, never acceptable once real cookies/auth are in play.
if (isProduction && config.CORS_ORIGINS === '*') {
  // eslint-disable-next-line no-console
  console.error(
    'Invalid environment configuration:\n' +
      '  - CORS_ORIGINS: must be set to an explicit comma-separated allowlist in production, not "*"',
  );
  process.exit(1);
}
