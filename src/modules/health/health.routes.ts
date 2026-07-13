// Three distinct endpoints per the PRD, deliberately not collapsed into one:
//   /liveness  — is the process itself alive? No dependency I/O, always fast.
//                Kubernetes uses this to decide whether to restart the pod.
//   /readiness — is the process ready to receive traffic? Reads the cached
//                snapshot (see readiness-snapshot.ts); 503 if any dependency
//                is down. Kubernetes uses this to decide whether to route
//                traffic to the pod.
//   /health    — human/dashboard-facing detailed status, always 200, same
//                data as /readiness but not used for orchestration decisions.
import type { FastifyPluginAsync } from 'fastify';
import type { ReadinessSnapshotService } from './readiness-snapshot.js';

export function buildHealthRoutes(
  readinessService: ReadinessSnapshotService,
): FastifyPluginAsync {
  return async (app) => {
    app.get('/liveness', async () => ({ status: 'ok' }));

    app.get('/readiness', async (_request, reply) => {
      const snapshot = readinessService.getSnapshot();
      reply.status(snapshot.ready ? 200 : 503);
      return snapshot;
    });

    app.get('/health', async () => {
      const snapshot = readinessService.getSnapshot();
      return { status: 'ok', ...snapshot };
    });
  };
}
