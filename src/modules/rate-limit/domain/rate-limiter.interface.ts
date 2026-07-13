// Port for rate limiting. `identity` precedence is decided by the caller,
// not the limiter itself: API key > authenticated user > IP (see PRD
// review — limits are resolved to a single identity per request, not
// stacked across all three, to avoid extra Redis round trips for no
// behavioral benefit).
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(identity: string, limitPerMinute: number): Promise<RateLimitResult>;
}
