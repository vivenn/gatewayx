// Shared Postgres connection pool. Owns only api_keys / routes /
// rate_limit_overrides tables — the gateway is never the source of truth
// for user identity, only for its own operational config (see PRD review:
// user data belongs to the Auth Service, not the gateway).
import pg from 'pg';
import { config } from '../config/index.js';
import type { Logger } from 'pino';

export function createPostgresPool(logger: Logger): pg.Pool {
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    // Step 1: cap pool size per gateway instance — with N horizontally
    // scaled pods, this multiplies fast, so keep it small and rely on
    // PgBouncer in front of Postgres at real scale (see redesign notes).
    max: 10,
    idleTimeoutMillis: 30_000,
  });

  pool.on('error', (err) => logger.error({ err }, 'postgres pool error'));

  return pool;
}
