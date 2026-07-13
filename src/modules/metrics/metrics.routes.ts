// Placeholder /metrics endpoint in Prometheus exposition format. Tier 3
// wires in prom-client counters/histograms for requests, latency, errors,
// cache hits/misses, rate-limited requests, and proxy errors per the PRD's
// Observability section — this stub just proves the route and content type
// are correct so a Prometheus scrape config can be pointed at it today.
import type { FastifyPluginAsync } from 'fastify';

export const metricsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/metrics', async (_request, reply) => {
    reply.header('content-type', 'text/plain; version=0.0.4');
    return (
      '# HELP gatewayx_up Whether the gateway process is up\n' +
      '# TYPE gatewayx_up gauge\n' +
      'gatewayx_up 1\n'
    );
  });
};
