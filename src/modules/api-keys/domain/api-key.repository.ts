// Repository interface (port). The application layer depends on this
// abstraction, not on Postgres directly — infrastructure/postgres-api-key
// .repository.ts is the one concrete adapter for it today, but a test double
// or a different store could implement the same interface.
import type { ApiKey } from './api-key.entity.js';

export interface ApiKeyRepository {
  findByHash(hashedKey: string): Promise<ApiKey | null>;
  create(key: Omit<ApiKey, 'id' | 'createdAt'>): Promise<ApiKey>;
  setEnabled(id: string, enabled: boolean): Promise<void>;
}
