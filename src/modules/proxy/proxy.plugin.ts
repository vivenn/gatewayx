// Registers one @fastify/http-proxy instance per configured route. This
// plugin streams request/response bodies through undici under the hood —
// it never buffers a full payload into memory, which is what keeps the
// gateway's memory usage flat regardless of upload/download size (the NFR
// that a naive hand-rolled proxy would violate).
import fastifyHttpProxy from '@fastify/http-proxy';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { RouteEntry } from '../../config/routes.schema.js';
import { HEADERS } from '../../shared/constants/headers.js';

type PreHandler = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

export async function registerProxyRoutes(
  app: FastifyInstance,
  routes: RouteEntry[],
  jwtPreHandler: PreHandler,
): Promise<void> {
  for (const route of routes) {
    // Step 1: JWT-protected routes get the auth preHandler wired in before
    // the proxy ever forwards the request; public routes (auth: none) pass
    // straight through — this is what "Authorization middleware should run
    // before proxying" means concretely.
    const preHandler = route.auth === 'jwt' ? jwtPreHandler : undefined;

    await app.register(fastifyHttpProxy, {
      upstream: route.upstream,
      prefix: route.prefix,
      rewritePrefix: route.prefix,
      preHandler,
      // Step 2: forward the gateway's request/correlation IDs downstream so
      // a single request can be traced across service boundaries, and pass
      // through the backend's Content-Encoding unchanged (never
      // decompress/recompress a proxied body — only gateway-originated
      // responses get compressed, via @fastify/compress at the app level).
      replyOptions: {
        rewriteRequestHeaders: (originalReq, headers) => ({
          ...headers,
          [HEADERS.REQUEST_ID]: originalReq.id,
          [HEADERS.CORRELATION_ID]:
            (originalReq as FastifyRequest).correlationId ?? originalReq.id,
        }),
      },
    });
  }
}
