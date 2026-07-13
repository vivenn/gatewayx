// Verifies the three health endpoints behave distinctly:
// /liveness never touches dependencies, /readiness reflects the cached
// snapshot (503 when something's down), /health is always 200 with the
// detailed status for humans/dashboards. Uses a fake ReadinessSnapshotService
// so the test never needs a real Redis/Postgres connection.
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { buildHealthRoutes } from '../src/modules/health/health.routes.js';
import type { ReadinessSnapshotService, ReadinessSnapshot } from '../src/modules/health/readiness-snapshot.js';

function fakeReadinessService(snapshot: ReadinessSnapshot): ReadinessSnapshotService {
  return { getSnapshot: () => snapshot } as unknown as ReadinessSnapshotService;
}

describe('health endpoints', () => {
  it('GET /liveness always returns 200 without checking dependencies', async () => {
    const app = Fastify();
    await app.register(buildHealthRoutes(fakeReadinessService({
      ready: false,
      checkedAt: new Date().toISOString(),
      dependencies: [{ name: 'redis', healthy: false, error: 'down' }],
    })));

    const res = await app.inject({ method: 'GET', url: '/liveness' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('GET /readiness returns 200 when all dependencies are healthy', async () => {
    const app = Fastify();
    await app.register(buildHealthRoutes(fakeReadinessService({
      ready: true,
      checkedAt: new Date().toISOString(),
      dependencies: [{ name: 'redis', healthy: true }, { name: 'postgres', healthy: true }],
    })));

    const res = await app.inject({ method: 'GET', url: '/readiness' });
    expect(res.statusCode).toBe(200);
    expect(res.json().ready).toBe(true);
  });

  it('GET /readiness returns 503 when a dependency is down', async () => {
    const app = Fastify();
    await app.register(buildHealthRoutes(fakeReadinessService({
      ready: false,
      checkedAt: new Date().toISOString(),
      dependencies: [{ name: 'redis', healthy: false, error: 'ECONNREFUSED' }],
    })));

    const res = await app.inject({ method: 'GET', url: '/readiness' });
    expect(res.statusCode).toBe(503);
    expect(res.json().dependencies[0]).toMatchObject({ name: 'redis', healthy: false });
  });

  it('GET /health is always 200 and includes the snapshot detail', async () => {
    const app = Fastify();
    await app.register(buildHealthRoutes(fakeReadinessService({
      ready: false,
      checkedAt: new Date().toISOString(),
      dependencies: [{ name: 'postgres', healthy: false, error: 'timeout' }],
    })));

    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().dependencies[0].name).toBe('postgres');
  });
});
