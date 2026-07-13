// Builds the Redis key for a cacheable GET response. This is implemented
// (not stubbed) even though the Redis cache backend itself isn't yet,
// because getting the key *wrong* is the actual security bug from the PRD
// review: a key of just `method+path` would serve one user's cached
// response to a different user. The identity component below is what
// prevents that.
export interface CacheKeyInput {
  method: string;
  path: string;
  query: Record<string, unknown>;
  // The requester's identity for this request — API key id, JWT subject, or
  // the literal string "public" for genuinely anonymous, cacheable-for-all
  // responses. Never omit this in favor of just method+path.
  identity: string;
}

export function buildCacheKey(input: CacheKeyInput): string {
  const sortedQuery = Object.keys(input.query)
    .sort()
    .map((key) => `${key}=${String(input.query[key])}`)
    .join('&');

  return `cache:${input.identity}:${input.method}:${input.path}${
    sortedQuery ? `?${sortedQuery}` : ''
  }`;
}
