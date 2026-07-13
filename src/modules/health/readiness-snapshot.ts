// Readiness state is computed on a background interval and read from memory
// on every probe — this is the fix from the PRD review: without it, a
// Kubernetes readiness probe hitting this endpoint every ~2s would fan out
// to Redis + Postgres + every configured backend service on every single
// probe, across every pod, which is a self-inflicted load spike on your own
// dependencies exactly when they're already struggling.
import type { Redis } from 'ioredis';
import type { Pool } from 'pg';
import type { Logger } from 'pino';
import type { RouteEntry } from '../../config/routes.schema.js';

export interface DependencyStatus {
  name: string;
  healthy: boolean;
  error?: string;
}

export interface ReadinessSnapshot {
  ready: boolean;
  checkedAt: string;
  dependencies: DependencyStatus[];
}

const UPSTREAM_CHECK_TIMEOUT_MS = 1500;

export class ReadinessSnapshotService {
  private snapshot: ReadinessSnapshot = {
    ready: false,
    checkedAt: new Date(0).toISOString(),
    dependencies: [],
  };
  private timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly redis: Redis,
    private readonly pgPool: Pool,
    private readonly routes: RouteEntry[],
    private readonly logger: Logger,
    private readonly refreshIntervalMs: number,
  ) {}

  // Step 1: called once at boot — run an initial check immediately so
  // /readiness isn't "not ready" for the first refresh interval, then start
  // the recurring background refresh.
  async start(): Promise<void> {
    await this.refresh();
    this.timer = setInterval(() => {
      this.refresh().catch((err) => this.logger.error({ err }, 'readiness refresh failed'));
    }, this.refreshIntervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // Step 2: synchronous, no I/O — this is what the /readiness route calls.
  getSnapshot(): ReadinessSnapshot {
    return this.snapshot;
  }

  // Step 3: the actual dependency checks, run only by the background timer.
  private async refresh(): Promise<void> {
    const dependencies = await Promise.all([
      this.checkRedis(),
      this.checkPostgres(),
      ...this.routes.map((route) => this.checkUpstream(route)),
    ]);

    this.snapshot = {
      ready: dependencies.every((dep) => dep.healthy),
      checkedAt: new Date().toISOString(),
      dependencies,
    };
  }

  private async checkRedis(): Promise<DependencyStatus> {
    try {
      await this.redis.ping();
      return { name: 'redis', healthy: true };
    } catch (err) {
      return { name: 'redis', healthy: false, error: (err as Error).message };
    }
  }

  private async checkPostgres(): Promise<DependencyStatus> {
    try {
      await this.pgPool.query('SELECT 1');
      return { name: 'postgres', healthy: true };
    } catch (err) {
      return { name: 'postgres', healthy: false, error: (err as Error).message };
    }
  }

  private async checkUpstream(route: RouteEntry): Promise<DependencyStatus> {
    const name = `upstream:${route.prefix}`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), UPSTREAM_CHECK_TIMEOUT_MS);
      try {
        const res = await fetch(`${route.upstream}/health`, {
          signal: controller.signal,
        });
        return { name, healthy: res.ok };
      } finally {
        clearTimeout(timeout);
      }
    } catch (err) {
      return { name, healthy: false, error: (err as Error).message };
    }
  }
}
