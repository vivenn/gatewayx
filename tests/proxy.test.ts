// Verifies the reverse proxy forwards method/headers/body/query and relays
// the upstream's status code and body back unchanged — the core "Reverse
// Proxy" requirement from the PRD. Spins up a real upstream Fastify server
// on an ephemeral port (http-proxy makes a real outbound HTTP call, so a
// fake/injected upstream won't do) and drives the gateway via `.inject()`.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerProxyRoutes } from '../src/modules/proxy/proxy.plugin.js';
import { registerErrorHandler } from '../src/shared/middleware/error-handler.js';
import { requestContextPlugin } from '../src/shared/middleware/request-context.js';

let upstream: FastifyInstance;
let upstreamUrl: string;

beforeAll(async () => {
  upstream = Fastify();
  // The gateway preserves the full incoming path when it proxies (prefix is
  // not stripped — rewritePrefix equals prefix in proxy.plugin.ts, since
  // real backends like the ones in routes.yaml expect to see /api/auth/...
  // themselves, not a stripped path), so the upstream here matches on the
  // same /api/test/... paths the gateway is mounted under.
  upstream.all('/api/test/echo/*', async (request) => ({
    method: request.method,
    query: request.query,
    body: request.body ?? null,
    requestId: request.headers['x-request-id'],
    correlationId: request.headers['x-correlation-id'],
  }));
  upstream.get('/api/test/fail', async (_req, reply) => {
    reply.status(503).send({ error: 'upstream down' });
  });

  const address = await upstream.listen({ port: 0, host: '127.0.0.1' });
  upstreamUrl = address;
});

afterAll(async () => {
  await upstream.close();
});

async function buildGatewayApp() {
  const app = Fastify();
  await app.register(requestContextPlugin);
  registerErrorHandler(app);
  await registerProxyRoutes(
    app,
    [{ prefix: '/api/test', upstream: upstreamUrl, auth: 'none' }],
    async () => {},
  );
  return app;
}

describe('reverse proxy', () => {
  it('forwards method, query params, and body to the upstream', async () => {
    const app = await buildGatewayApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/test/echo/orders?status=open',
      payload: { item: 'widget' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.method).toBe('POST');
    expect(body.query).toEqual({ status: 'open' });
    expect(body.body).toEqual({ item: 'widget' });
  });

  it('forwards the gateway-generated request ID and correlation ID downstream', async () => {
    const app = await buildGatewayApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/test/echo/orders',
      headers: { 'x-correlation-id': 'client-flow-123' },
    });

    const body = res.json();
    expect(body.correlationId).toBe('client-flow-123');
    expect(body.requestId).toBeTruthy();
  });

  it('relays the upstream status code unchanged', async () => {
    const app = await buildGatewayApp();
    const res = await app.inject({ method: 'GET', url: '/api/test/fail' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ error: 'upstream down' });
  });

  it('returns the standard 404 envelope for an unconfigured path', async () => {
    const app = await buildGatewayApp();
    const res = await app.inject({ method: 'GET', url: '/not-a-route' });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});
