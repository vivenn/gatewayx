// Use case: given a raw API key from the X-Api-Key header, hash it (HMAC-
// SHA256 + server pepper — fast, constant-time, appropriate for a
// high-entropy secret verified on every request; bcrypt is deliberately
// avoided here, it's for low-entropy user passwords verified rarely) and
// look it up. Stubbed for this pass — real once PostgresApiKeyRepository
// lands in Tier 2.
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ApiKeyRepository } from '../domain/api-key.repository.js';
import { isApiKeyValid, type ApiKey } from '../domain/api-key.entity.js';
import { UnauthorizedError } from '../../../domain/errors/index.js';

export function hashApiKey(rawKey: string, pepper: string): string {
  return createHmac('sha256', pepper).update(rawKey).digest('hex');
}

export class ValidateApiKeyUseCase {
  constructor(
    private readonly repository: ApiKeyRepository,
    private readonly pepper: string,
  ) {}

  async execute(rawKey: string): Promise<ApiKey> {
    const hashed = hashApiKey(rawKey, this.pepper);
    const key = await this.repository.findByHash(hashed);

    if (!key || !constantTimeMatch(key.hashedKey, hashed) || !isApiKeyValid(key)) {
      throw new UnauthorizedError('Invalid or expired API key');
    }

    return key;
  }
}

// Guards against timing attacks on the hash comparison even though the
// lookup itself is already by-hash (defense in depth, cheap to add).
function constantTimeMatch(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
