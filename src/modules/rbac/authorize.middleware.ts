// Authorization preHandler — runs after JWT auth, before the proxy forwards
// the request, per the PRD ("Authorization middleware should run before
// proxying"). Stubbed for this pass: JWT auth (Tier 1) already attaches
// `request.user`, but role/permission enforcement lands in Tier 2 alongside
// the api-keys/RBAC Postgres tables. For now this is a pass-through so
// routes that don't require a specific permission keep working; routes that
// declare `requiredPermission` will fail closed with NOT_IMPLEMENTED rather
// than silently allowing access.
import type { FastifyRequest, FastifyReply } from 'fastify';
import { NotImplementedError } from '../../domain/errors/index.js';
import type { Permission } from './domain/role.js';

export function requirePermission(permission: Permission) {
  return async function authorize(_request: FastifyRequest, _reply: FastifyReply) {
    throw new NotImplementedError(`RBAC enforcement for "${permission}"`);
  };
}
