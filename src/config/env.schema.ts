// Zod schema for every environment variable the gateway reads.
// Step 1: declare the shape and constraints (types, defaults, enums).
// Step 2: config/index.ts parses `process.env` against this schema at startup
// and crashes the process immediately with a readable error if anything is
// missing or malformed — this is the PRD's "validate configuration at startup".
import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),

  // JWT verification — gateway only ever verifies, so only a public key is needed.
  JWT_PUBLIC_KEY: z.string().min(1, 'JWT_PUBLIC_KEY is required to verify tokens'),
  JWT_ISSUER: z.string().min(1).default('gatewayx-auth'),

  // Redis — cache, rate limiting, circuit breaker (future tiers).
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // Postgres — owns only api_keys / routes / rate_limit_overrides (never users).
  DATABASE_URL: z
    .string()
    .url()
    .default('postgres://postgres:postgres@localhost:5432/gatewayx'),

  // Path to the static route table, validated separately by routes.schema.ts.
  ROUTES_CONFIG_PATH: z.string().default('src/config/routes.yaml'),

  // Readiness snapshot refresh interval (ms) — background refresh, not per-probe
  // fan-out, per the review's fix for cascading health-check load.
  READINESS_REFRESH_INTERVAL_MS: z.coerce.number().int().positive().default(5000),

  // Graceful shutdown drain window (ms) before forcing close.
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  CORS_ORIGINS: z.string().default('*'),

  // Pepper for HMAC-SHA256 API key hashing (Tier 2). No default — a
  // gateway must never fall back to a guessable pepper in any environment.
  API_KEY_PEPPER: z.string().min(1, 'API_KEY_PEPPER is required'),
});

export type Env = z.infer<typeof envSchema>;
