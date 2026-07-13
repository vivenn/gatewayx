// Circuit breaker state is deliberately kept in-process, per pod, not
// Redis-shared (see PRD review: shared state would cost a Redis round trip
// on every proxied request just to save a few seconds of extra failed
// requests during a state transition — the eventual-consistency tradeoff
// is worth it for the latency win).
export enum CircuitState {
  Closed = 'closed',
  Open = 'open',
  HalfOpen = 'half-open',
}

export interface CircuitBreaker {
  getState(upstream: string): CircuitState;
  execute<T>(upstream: string, fn: () => Promise<T>): Promise<T>;
}
