// One parameterized mock backend, launched 4x (auth/user/order/notification)
// via different PORT/SERVICE_NAME env vars — see package.json's mock:*
// scripts and docker-compose.yml. Kept deliberately dumb: canned JSON plus
// a `/force-fail` toggle so Tier 3's circuit breaker and retry-policy tests
// can flip a real backend into a failing state without mocking at the
// gateway layer.
import Fastify from 'fastify';

const PORT = Number(process.env.PORT ?? 3001);
const SERVICE_NAME = process.env.SERVICE_NAME ?? 'mock-service';

const app = Fastify({ logger: true });

// Step 1: shared failure toggle, in-memory, per mock instance.
let failing = false;

app.post('/force-fail', async (request) => {
  const body = request.body as { enabled?: boolean } | undefined;
  failing = body?.enabled ?? true;
  return { service: SERVICE_NAME, failing };
});

// Step 2: health endpoint — this is what the gateway's readiness snapshot
// polls (see readiness-snapshot.ts).
app.get('/health', async (_request, reply) => {
  if (failing) {
    reply.status(503);
    return { status: 'down', service: SERVICE_NAME };
  }
  return { status: 'ok', service: SERVICE_NAME };
});

// Step 3: catch-all canned response for anything the gateway proxies here,
// echoing back method/path/headers so proxy tests can assert forwarding
// behavior (method, headers, query, body all reach the backend intact).
app.all('/*', async (request, reply) => {
  if (failing) {
    reply.status(503);
    return { success: false, service: SERVICE_NAME, error: 'forced failure' };
  }
  return {
    success: true,
    service: SERVICE_NAME,
    method: request.method,
    path: request.url,
    receivedHeaders: {
      'x-request-id': request.headers['x-request-id'],
      'x-correlation-id': request.headers['x-correlation-id'],
    },
    body: request.body ?? null,
  };
});

app.listen({ port: PORT, host: '0.0.0.0' }).then(() => {
  app.log.info(`${SERVICE_NAME} listening on ${PORT}`);
});
