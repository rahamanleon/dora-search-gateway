import type {
  FailedProviderInfo,
  ProviderConfig,
  ProviderHealthStatus,
  SearchApiResponse,
  SearchOptions,
  SearchResultItem,
} from '../types/index.js';
import { SearXNGProvider } from '../providers/searxng-provider.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { deduplicateResults } from '../search/dedup.js';

export interface FailoverManagerOptions {
  treatEmptyAsFailure?: boolean; // If true, 0 results from primary triggers fallback
  maxRetriesPerOrigin?: number;  // Max retries on network error before moving to next origin (default: 1)
  circuitBreakerThreshold?: number;
  circuitBreakerCooldownMs?: number;
}

export class FailoverManager {
  private providers: Map<string, SearXNGProvider> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private priorityOrder: string[] = [];
  private options: Required<FailoverManagerOptions>;

  constructor(configs: ProviderConfig[], options: FailoverManagerOptions = {}) {
    this.options = {
      treatEmptyAsFailure: options.treatEmptyAsFailure ?? true,
      maxRetriesPerOrigin: options.maxRetriesPerOrigin ?? 1,
      circuitBreakerThreshold: options.circuitBreakerThreshold ?? 3,
      circuitBreakerCooldownMs: options.circuitBreakerCooldownMs ?? 30_000,
    };

    // Sort providers by priority ascending (1 = highest priority)
    const sortedConfigs = [...configs]
      .filter((c) => c.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const config of sortedConfigs) {
      this.providers.set(config.id, new SearXNGProvider(config));
      this.circuitBreakers.set(
        config.id,
        new CircuitBreaker(config.id, config.name, {
          failureThreshold: this.options.circuitBreakerThreshold,
          cooldownMs: this.options.circuitBreakerCooldownMs,
        })
      );
      this.priorityOrder.push(config.id);
    }
  }

  /**
   * Executes search with sequential failover across configured origins.
   */
  public async search(query: string, options: SearchOptions = {}): Promise<SearchApiResponse> {
    const startTime = Date.now();
    const failedProviders: FailedProviderInfo[] = [];
    const collectedSources = new Set<string>();
    let primaryId = this.priorityOrder[0] || 'unknown';
    let successfulProviderId: string | null = null;
    let accumulatedResults: SearchResultItem[] = [];

    const cleanQuery = query.trim();
    if (!cleanQuery) {
      return {
        success: true,
        query: '',
        provider: 'none',
        fallbackUsed: false,
        results: [],
        sources: [],
        failedProviders: [],
        executionTimeMs: 0,
      };
    }

    // Iterate through origins sequentially in priority order
    for (let i = 0; i < this.priorityOrder.length; i++) {
      const providerId = this.priorityOrder[i]!;
      const provider = this.providers.get(providerId);
      const breaker = this.circuitBreakers.get(providerId);

      if (!provider || !breaker) continue;

      // Circuit breaker check
      if (!breaker.canExecute()) {
        failedProviders.push({
          provider: providerId,
          error: `Circuit breaker is OPEN (cooldown active until ${breaker.getStatus().cooldownUntil})`,
          durationMs: 0,
        });
        continue;
      }

      let attempt = 0;

      while (attempt <= this.options.maxRetriesPerOrigin) {
        attempt++;
        const attemptStartTime = Date.now();

        try {
          const res = await provider.search(cleanQuery, options);
          const attemptDurationMs = Date.now() - attemptStartTime;

          // Check for empty result detection
          if (res.results.length === 0 && this.options.treatEmptyAsFailure && i < this.priorityOrder.length - 1) {
            // Treat empty result as a trigger to check backup, but keep circuit intact
            breaker.recordSuccess(attemptDurationMs);
            failedProviders.push({
              provider: providerId,
              error: 'EMPTY_RESULTS (Triggering fallback)',
              durationMs: attemptDurationMs,
            });
            break; // Break retry loop, fall through to next provider
          }

          // Search succeeded with results or empty on last provider
          breaker.recordSuccess(attemptDurationMs);
          successfulProviderId = providerId;

          for (const s of res.sources) {
            collectedSources.add(s);
          }

          accumulatedResults = res.results;
          break; // Break retry loop
        } catch (err: unknown) {
          const attemptDurationMs = Date.now() - attemptStartTime;
          const msg = err instanceof Error ? err.message : String(err);

          // If last attempt failed, record failure in circuit breaker
          if (attempt > this.options.maxRetriesPerOrigin) {
            breaker.recordFailure(msg, attemptDurationMs);
            failedProviders.push({
              provider: providerId,
              error: msg,
              durationMs: (err as any)?.durationMs ?? attemptDurationMs,
            });
          }
        }
      }

      if (successfulProviderId) {
        // Success found!
        break;
      }
    }

    const totalExecutionTimeMs = Date.now() - startTime;
    const finalResults = deduplicateResults(accumulatedResults, options.limit);

    if (successfulProviderId) {
      return {
        success: true,
        query: cleanQuery,
        provider: successfulProviderId,
        fallbackUsed: successfulProviderId !== primaryId,
        results: finalResults,
        sources: Array.from(collectedSources),
        failedProviders,
        executionTimeMs: totalExecutionTimeMs,
      };
    }

    // All providers failed
    return {
      success: false,
      query: cleanQuery,
      provider: 'none',
      fallbackUsed: true,
      results: [],
      sources: [],
      failedProviders,
      error: 'All search providers failed or returned empty results.',
      executionTimeMs: totalExecutionTimeMs,
    };
  }

  /**
   * Probes all providers and returns full health status.
   */
  public async checkHealth(): Promise<ProviderHealthStatus[]> {
    const statuses: ProviderHealthStatus[] = [];

    for (const id of this.priorityOrder) {
      const provider = this.providers.get(id);
      const breaker = this.circuitBreakers.get(id);

      if (!provider || !breaker) continue;

      const health = await provider.checkHealth();
      if (health.ok) {
        breaker.recordSuccess(health.latencyMs);
      } else {
        breaker.recordFailure(health.error ?? 'Health check failed', health.latencyMs);
      }

      statuses.push(breaker.getStatus());
    }

    return statuses;
  }

  /**
   * Returns current health status from memory without triggering network probes.
   */
  public getStatuses(): ProviderHealthStatus[] {
    return this.priorityOrder.map((id) => this.circuitBreakers.get(id)!.getStatus());
  }

  public getPrimaryProviderId(): string {
    return this.priorityOrder[0] || 'unknown';
  }

  public resetCircuitBreakers(): void {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }
  }
}
