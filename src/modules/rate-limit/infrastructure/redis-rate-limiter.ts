// Redis-backed token-bucket rate limiter. Tier 3 implements this as a single
// atomic Lua script (one round trip instead of GET+INCR+EXPIRE as three) —
// stubbed here so the interface, DI wiring, and call sites (proxy plugin
// preHandler) are all in place ahead of that.
import type { Redis } from 'ioredis';
import type { RateLimiter, RateLimitResult } from '../domain/rate-limiter.interface.js';
import { NotImplementedError } from '../../../domain/errors/index.js';

export class RedisRateLimiter implements RateLimiter {
  constructor(private readonly redis: Redis) {}

  async consume(_identity: string, _limitPerMinute: number): Promise<RateLimitResult> {
    void this.redis;
    throw new NotImplementedError('Rate limiting');
  }
}
