// Domain entity for an API key. Deliberately framework-free — no pg/Fastify
// imports here, per Clean Architecture (domain layer has zero infra deps).
export interface ApiKey {
  id: string;
  hashedKey: string; // HMAC-SHA256(key, pepper) — never bcrypt, see PRD review
  clientName: string;
  scopes: string[];
  enabled: boolean;
  expiresAt: Date | null;
  rateLimitPerMinute: number;
  createdAt: Date;
}

export function isApiKeyValid(key: ApiKey, now: Date = new Date()): boolean {
  if (!key.enabled) return false;
  if (key.expiresAt && key.expiresAt.getTime() < now.getTime()) return false;
  return true;
}
