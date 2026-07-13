// Header names used across the gateway, centralized so proxy/logging/auth
// modules all agree on the same casing and don't hardcode strings.
export const HEADERS = {
  REQUEST_ID: 'x-request-id',
  CORRELATION_ID: 'x-correlation-id',
  API_KEY: 'x-api-key',
  AUTHORIZATION: 'authorization',
} as const;
