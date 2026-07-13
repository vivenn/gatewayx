// Fastify preHandler that extracts a Bearer token, verifies it, and stashes
// the decoded user on `request.user`. Registered per-route by the proxy
// plugin only for routes whose config declares `auth: jwt` — public routes
// never run this at all.
import type { FastifyRequest, FastifyReply } from 'fastify';
import { UnauthorizedError } from '../../domain/errors/index.js';
import { HEADERS } from '../../shared/constants/headers.js';
import type { VerifyTokenUseCase } from './verify-token.usecase.js';
import type { AuthenticatedUser } from './domain/authenticated-user.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

export function buildJwtPreHandler(verifyToken: VerifyTokenUseCase) {
  return async function jwtPreHandler(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    // Step 1: extract "Bearer <token>" from the Authorization header.
    const header = request.headers[HEADERS.AUTHORIZATION];
    const value = Array.isArray(header) ? header[0] : header;

    if (!value?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }
    const token = value.slice('Bearer '.length).trim();

    // Step 2: verify the token and attach the resulting user to the
    // request context — downstream handlers (and, in later tiers, RBAC)
    // read this instead of re-parsing the token.
    request.user = await verifyToken.execute(token);
  };
}
