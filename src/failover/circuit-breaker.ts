import type { CircuitBreakerState, ProviderHealthStatus } from '../types/index.js';

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Consecutive failures before opening circuit (default: 3)
  cooldownMs?: number;       // Cooldown before entering HALF_OPEN (default: 30_000ms)
}

export class CircuitBreaker {
  public readonly id: string;
  public readonly name: string;
  private state: CircuitBreakerState = 'CLOSED';
  private consecutiveFailures = 0;
  private failureThreshold: number;
  private cooldownMs: number;
  private lastFailureTime = 0;
  private lastSuccessTime = 0;
  private lastError?: string;
  private lastLatencyMs?: number;

  constructor(id: string, name: string, options: CircuitBreakerOptions = {}) {
    this.id = id;
    this.name = name;
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 30_000;
  }

  public getState(): CircuitBreakerState {
    if (this.state === 'OPEN') {
      const now = Date.now();
      if (now - this.lastFailureTime > this.cooldownMs) {
        this.state = 'HALF_OPEN';
      }
    }
    return this.state;
  }

  /**
   * Determines if a request should be attempted through this provider.
   */
  public canExecute(): boolean {
    const currentState = this.getState();
    return currentState === 'CLOSED' || currentState === 'HALF_OPEN';
  }

  /**
   * Records a successful execution through this provider.
   */
  public recordSuccess(latencyMs: number): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.lastSuccessTime = Date.now();
    this.lastLatencyMs = latencyMs;
    this.lastError = undefined;
  }

  /**
   * Records a failed execution through this provider.
   */
  public recordFailure(error: string, latencyMs?: number): void {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();
    this.lastError = error;
    if (latencyMs !== undefined) {
      this.lastLatencyMs = latencyMs;
    }

    if (this.state === 'HALF_OPEN' || this.consecutiveFailures >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }

  public getStatus(): ProviderHealthStatus {
    const currentState = this.getState();
    const cooldownUntil =
      currentState === 'OPEN'
        ? this.lastFailureTime + this.cooldownMs
        : undefined;

    return {
      id: this.id,
      name: this.name,
      isHealthy: currentState === 'CLOSED',
      consecutiveFailures: this.consecutiveFailures,
      circuitState: currentState,
      lastCheckedAt: this.lastSuccessTime > 0 ? new Date(this.lastSuccessTime).toISOString() : null,
      lastError: this.lastError,
      latencyMs: this.lastLatencyMs,
      cooldownUntil,
    };
  }

  public reset(): void {
    this.state = 'CLOSED';
    this.consecutiveFailures = 0;
    this.lastFailureTime = 0;
    this.lastError = undefined;
  }
}

