// Redis-backed response cache. Only ever called with keys produced by
// buildCacheKey() (domain/cache-key.strategy.ts), which already folds in
// requester identity — this class itself stays a dumb get/set/invalidate
// over Redis and doesn't need to know about auth. Stubbed for Tier 2.
import type { Redis } from 'ioredis';
import { NotImplementedError } from '../../../domain/errors/index.js';

export interface CachedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export class RedisCache {
  constructor(private readonly redis: Redis) {}

  async get(_key: string): Promise<CachedResponse | null> {
    void this.redis;
    throw new NotImplementedError('Response caching');
  }

  async set(_key: string, _value: CachedResponse, _ttlSeconds: number): Promise<void> {
    throw new NotImplementedError('Response caching');
  }

  async invalidate(_keyPattern: string): Promise<void> {
    throw new NotImplementedError('Cache invalidation');
  }
}
