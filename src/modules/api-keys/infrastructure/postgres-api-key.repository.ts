// Postgres adapter for ApiKeyRepository. Schema (see db/schema.sql, tier 2):
//   api_keys(id uuid, hashed_key text unique, client_name text, scopes text[],
//             enabled boolean, expires_at timestamptz, rate_limit_per_minute int,
//             created_at timestamptz)
// Left as a stub for this pass — the interface and wiring are real so the
// rest of the app (JWT/API-key precedence, container registration) can be
// built against it now; the actual SQL lands in Tier 2.
import type { Pool } from 'pg';
import type { ApiKey } from '../domain/api-key.entity.js';
import type { ApiKeyRepository } from '../domain/api-key.repository.js';
import { NotImplementedError } from '../../../domain/errors/index.js';

export class PostgresApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly pool: Pool) {}

  async findByHash(_hashedKey: string): Promise<ApiKey | null> {
    void this.pool;
    throw new NotImplementedError('API key lookup');
  }

  async create(_key: Omit<ApiKey, 'id' | 'createdAt'>): Promise<ApiKey> {
    throw new NotImplementedError('API key creation');
  }

  async setEnabled(_id: string, _enabled: boolean): Promise<void> {
    throw new NotImplementedError('API key enable/disable');
  }
}
