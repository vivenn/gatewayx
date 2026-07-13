// Verifies a JWT signed by the Auth Service. The gateway only ever holds
// the RS256 *public* key (JWT_PUBLIC_KEY) — it can check a signature but
// can never mint a valid token itself, which is the whole point of using
// asymmetric signing here instead of a shared HMAC secret (see PRD review:
// this also sidesteps distributing a symmetric secret to every service that
// needs to verify tokens).
import { createVerifier } from 'fast-jwt';
import { UnauthorizedError } from '../../domain/errors/index.js';
import type { AuthenticatedUser } from './domain/authenticated-user.js';

export class VerifyTokenUseCase {
  private readonly verify: (token: string) => Promise<AuthenticatedUser>;

  constructor(publicKey: string, issuer: string) {
    // Step 1: build the verifier once at construction time (fast-jwt caches
    // the parsed key internally), not per request.
    this.verify = createVerifier({
      key: async () => publicKey,
      algorithms: ['RS256'],
      allowedIss: issuer,
    });
  }

  async execute(token: string): Promise<AuthenticatedUser> {
    // Step 2: verify signature, expiry, and issuer in one call; fast-jwt
    // throws on any failure (expired, bad signature, wrong issuer).
    try {
      return await this.verify(token);
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }
  }
}
