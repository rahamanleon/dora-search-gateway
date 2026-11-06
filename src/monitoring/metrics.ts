import type { GatewayStats } from '../types/index.js';

export class MetricsCollector {
  private startTime: number = Date.now();
  private totalRequests: number = 0;
  private successfulRequests: number = 0;
  private failedRequests: number = 0;
  private totalLatencyMs: number = 0;
  private failedEngines: Map<string, number> = new Map();
  private readonly maxTrackedEngines = 50;

  public recordRequest(success: boolean, latencyMs: number): void {
    this.totalRequests++;
    this.totalLatencyMs += latencyMs;
    if (success) {
      this.successfulRequests++;
    } else {
      this.failedRequests++;
    }
  }

  public recordFailedEngine(engineName: string): void {
    const current = this.failedEngines.get(engineName) ?? 0;
    this.failedEngines.set(engineName, current + 1);

    // Limit map size
    if (this.failedEngines.size > this.maxTrackedEngines) {
      const oldest = this.failedEngines.keys().next().value;
      if (oldest !== undefined) {
        this.failedEngines.delete(oldest);
      }
    }
  }

  public getStats(): GatewayStats {
    const avgLatency =
      this.totalRequests > 0 ? Math.round(this.totalLatencyMs / this.totalRequests) : 0;

    const recentFailedEngines: Record<string, number> = {};
    for (const [engine, count] of this.failedEngines.entries()) {
      recentFailedEngines[engine] = count;
    }

    return {
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      averageLatencyMs: avgLatency,
      recentFailedEngines,
    };
  }

  public getUptimeSeconds(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  public reset(): void {
    this.startTime = Date.now();
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.totalLatencyMs = 0;
    this.failedEngines.clear();
  }
}

