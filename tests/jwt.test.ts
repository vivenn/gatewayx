// Verifies RS256 verification end-to-end: a token signed with the matching
// private key is accepted and decoded onto request.user; anything else
// (wrong key, expired, malformed) is rejected with UnauthorizedError, which
// the error handler turns into a 401 envelope.
import { describe, expect, it, beforeAll } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { createSigner } from 'fast-jwt';
import Fastify from 'fastify';
import { VerifyTokenUseCase } from '../src/modules/auth-jwt/verify-token.usecase.js';
import { buildJwtPreHandler } from '../src/modules/auth-jwt/jwt.plugin.js';
import { registerErrorHandler } from '../src/shared/middleware/error-handler.js';

let publicKey: string;
let privateKey: string;
let otherPrivateKey: string;

beforeAll(() => {
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  publicKey = pair.publicKey;
  privateKey = pair.privateKey;

  const otherPair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  otherPrivateKey = otherPair.privateKey;
});

function buildProtectedApp() {
  const app = Fastify();
  registerErrorHandler(app);
  const verifyToken = new VerifyTokenUseCase(publicKey, 'gatewayx-auth');
  const preHandler = buildJwtPreHandler(verifyToken);

  app.get('/protected', { preHandler }, async (request) => ({
    userId: request.user?.sub,
  }));

  return app;
}

describe('VerifyTokenUseCase', () => {
  it('accepts a token signed with the matching private key', async () => {
    const sign = createSigner({ key: privateKey, algorithm: 'RS256', iss: 'gatewayx-auth' });
    const token = await sign({ sub: 'user-1', roles: ['user'] });

    const useCase = new VerifyTokenUseCase(publicKey, 'gatewayx-auth');
    const user = await useCase.execute(token);

    expect(user.sub).toBe('user-1');
    expect(user.roles).toEqual(['user']);
  });

  it('rejects a token signed with a different private key', async () => {
    const sign = createSigner({
      key: otherPrivateKey,
      algorithm: 'RS256',
      iss: 'gatewayx-auth',
    });
    const token = await sign({ sub: 'user-1' });

    const useCase = new VerifyTokenUseCase(publicKey, 'gatewayx-auth');
    await expect(useCase.execute(token)).rejects.toThrow('Invalid or expired token');
  });

  it('rejects an expired token', async () => {
    // fast-jwt's `expiresIn` must be a positive duration, so sign with a
    // 1ms expiry and wait for it to lapse rather than backdating it.
    const sign = createSigner({
      key: privateKey,
      algorithm: 'RS256',
      iss: 'gatewayx-auth',
      expiresIn: 1,
    });
    const token = await sign({ sub: 'user-1' });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const useCase = new VerifyTokenUseCase(publicKey, 'gatewayx-auth');
    await expect(useCase.execute(token)).rejects.toThrow('Invalid or expired token');
  });
});

describe('jwt preHandler on a protected route', () => {
  it('returns 401 with no Authorization header', async () => {
    const app = buildProtectedApp();
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('returns 200 and the decoded user for a valid Bearer token', async () => {
    const app = buildProtectedApp();
    const sign = createSigner({ key: privateKey, algorithm: 'RS256', iss: 'gatewayx-auth' });
    const token = await sign({ sub: 'user-42' });

    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: 'user-42' });
  });
});
