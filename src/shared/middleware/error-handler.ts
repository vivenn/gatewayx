// Centralized error handler. Every error thrown anywhere in the app —
// domain errors, Zod validation errors, Fastify's own 404s, or an unexpected
// bug — funnels through here and comes out as the one standard envelope:
//   { success: false, error: { code, message, requestId } }
// This is what the PRD's "Error Handling" section asks for: callers never
// have to guess the shape of an error response.
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { DomainError } from '../../domain/errors/index.js';

interface ErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

function buildEnvelope(
  code: string,
  message: string,
  requestId: string,
  details?: unknown,
): ErrorEnvelope {
  return {
    success: false,
    error: {
      code,
      message,
      requestId,
      ...(details !== undefined ? { details } : {}),
    },
  };
}

export function registerErrorHandler(app: FastifyInstance): void {
  // Step 1: handle known domain errors by their declared statusCode/code.
  // Step 2: handle Zod validation errors (thrown by schema-typed routes)
  // with a flattened, readable field-level breakdown instead of Zod's raw
  // issue array.
  // Step 3: anything else is unexpected — log it at error level with the
  // stack trace, but never leak internals to the client; return a generic
  // 500 envelope instead.
  app.setErrorHandler((error: Error, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.id;

    if (error instanceof DomainError) {
      if (error.statusCode >= 500) {
        request.log.error({ err: error }, 'domain error (5xx)');
      } else {
        request.log.warn({ err: error }, 'domain error (4xx)');
      }
      const details = 'details' in error ? error.details : undefined;
      reply.status(error.statusCode).send(
        buildEnvelope(error.code, error.message, requestId, details),
      );
      return;
    }

    if (error instanceof ZodError) {
      const fieldErrors = error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      request.log.warn({ err: error }, 'validation error');
      reply
        .status(400)
        .send(
          buildEnvelope('VALIDATION_ERROR', 'Request validation failed', requestId, {
            fields: fieldErrors,
          }),
        );
      return;
    }

    // Fastify attaches statusCode to some of its own errors (e.g. 404 route
    // not found, malformed JSON body) — respect it when present.
    const statusCode =
      'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'unhandled error');
    } else {
      request.log.warn({ err: error }, 'client error');
    }

    const code = statusCode === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR';
    const message =
      statusCode >= 500 ? 'An unexpected error occurred' : error.message;

    reply.status(statusCode).send(buildEnvelope(code, message, requestId));
  });

  // Step 4: routes that don't match any registered handler also get the
  // standard envelope instead of Fastify's default plain-text 404.
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    reply
      .status(404)
      .send(buildEnvelope('NOT_FOUND', `Route ${request.method} ${request.url} not found`, request.id));
  });
}
