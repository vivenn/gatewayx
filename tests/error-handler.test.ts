// Verifies every error path collapses to the standard envelope:
// { success:false, error:{ code, message, requestId, ... } } — this is the
// contract callers of the gateway are meant to rely on.
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { z, ZodError } from 'zod';
import { registerErrorHandler } from '../src/shared/middleware/error-handler.js';
import { ValidationError, UnauthorizedError } from '../src/domain/errors/index.js';

function buildTestApp() {
  const app = Fastify();
  registerErrorHandler(app);

  app.get('/domain-error', async () => {
    throw new UnauthorizedError('nope');
  });

  app.get('/validation-error', async () => {
    throw new ValidationError('bad input', { field: 'email' });
  });

  app.get('/zod-error', async () => {
    z.object({ email: z.string().email() }).parse({ email: 'not-an-email' });
  });

  app.get('/unexpected-error', async () => {
    throw new Error('boom');
  });

  return app;
}

describe('centralized error handler', () => {
  it('formats a DomainError with its declared status code', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/domain-error' });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'nope' },
    });
    expect(body.error.requestId).toBeTruthy();
  });

  it('includes details on a ValidationError', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/validation-error' });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.details).toEqual({ field: 'email' });
  });

  it('flattens a ZodError into readable field errors', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/zod-error' });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.fields[0]).toMatchObject({ path: 'email' });
  });

  it('never leaks internals for an unexpected error', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/unexpected-error' });

    expect(res.statusCode).toBe(500);
    const body = res.json();
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('An unexpected error occurred');
    expect(body.error.message).not.toContain('boom');
  });

  it('returns the standard envelope for an unmatched route', async () => {
    const app = buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/does-not-exist' });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});

// Sanity check that ZodError is the actual class thrown by z.parse, since
// the error handler branches on `instanceof ZodError`.
describe('zod sanity check', () => {
  it('z.parse throws a ZodError instance', () => {
    expect(() => z.string().parse(123)).toThrowError(ZodError);
  });
});
