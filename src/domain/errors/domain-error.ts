// Base class for every error the gateway raises intentionally (as opposed to
// unexpected bugs). Each subclass carries an HTTP status and a stable
// machine-readable `code` so the centralized error handler can turn any of
// them into the standard { success:false, error:{ code, message, requestId } }
// envelope without a big switch statement.
export abstract class DomainError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends DomainError {
  readonly statusCode = 400;
  readonly code = 'VALIDATION_ERROR';
  readonly details?: unknown;

  constructor(message: string, details?: unknown) {
    super(message);
    this.details = details;
  }
}

export class UnauthorizedError extends DomainError {
  readonly statusCode = 401;
  readonly code = 'UNAUTHORIZED';
}

export class ForbiddenError extends DomainError {
  readonly statusCode = 403;
  readonly code = 'FORBIDDEN';
}

export class NotFoundError extends DomainError {
  readonly statusCode = 404;
  readonly code = 'NOT_FOUND';
}

export class RateLimitedError extends DomainError {
  readonly statusCode = 429;
  readonly code = 'RATE_LIMITED';
  readonly retryAfterSeconds: number;

  constructor(message: string, retryAfterSeconds: number) {
    super(message);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class GatewayTimeoutError extends DomainError {
  readonly statusCode = 504;
  readonly code = 'GATEWAY_TIMEOUT';
}

export class ServiceUnavailableError extends DomainError {
  readonly statusCode = 503;
  readonly code = 'SERVICE_UNAVAILABLE';
}

// Thrown by stub use cases in tiers not yet implemented (api-keys, rbac,
// rate-limit, cache, circuit-breaker). Keeps the module boot-able and its
// interface visible without pretending the feature works.
export class NotImplementedError extends DomainError {
  readonly statusCode = 501;
  readonly code = 'NOT_IMPLEMENTED';

  constructor(feature: string) {
    super(`${feature} is not implemented yet`);
  }
}
