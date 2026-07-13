// In-memory circuit breaker, one instance per upstream, scoped to this pod's
// process. Stubbed for Tier 3 — real implementation will track a rolling
// failure count per upstream and flip Closed -> Open -> HalfOpen -> Closed,
// exposing getState() for a /metrics gauge per the PRD's "Expose breaker
// status" requirement.
import { CircuitState, type CircuitBreaker } from '../domain/circuit-breaker.interface.js';
import { NotImplementedError } from '../../../domain/errors/index.js';

export class InProcessCircuitBreaker implements CircuitBreaker {
  private readonly states = new Map<string, CircuitState>();

  getState(upstream: string): CircuitState {
    return this.states.get(upstream) ?? CircuitState.Closed;
  }

  async execute<T>(_upstream: string, _fn: () => Promise<T>): Promise<T> {
    throw new NotImplementedError('Circuit breaker');
  }
}
