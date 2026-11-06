import type { RateLimitConfig } from '../types/index.js';

interface ClientRecord {
  timestamps: number[];
}

export class SlidingWindowRateLimiter {
  private records = new Map<string, ClientRecord>();
  private config: RateLimitConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: RateLimitConfig = { windowMs: 60_000, maxRequests: 60 }) {
    this.config = config;

    // Periodically prune stale IPs every minute
    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => this.cleanup(), this.config.windowMs);
      if (this.cleanupInterval.unref) {
        this.cleanupInterval.unref();
      }
    }
  }

  public check(key: string): { allowed: boolean; remaining: number; resetMs: number } {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    let record = this.records.get(key);
    if (!record) {
      record = { timestamps: [] };
      this.records.set(key, record);
    }

    // Filter out timestamps outside the sliding window
    record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

    if (record.timestamps.length >= this.config.maxRequests) {
      const oldest = record.timestamps[0] || windowStart;
      const resetMs = Math.max(0, oldest + this.config.windowMs - now);
      return {
        allowed: false,
        remaining: 0,
        resetMs,
      };
    }

    // Record this request
    record.timestamps.push(now);
    const remaining = this.config.maxRequests - record.timestamps.length;

    return {
      allowed: true,
      remaining,
      resetMs: this.config.windowMs,
    };
  }

  public cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;

    for (const [key, record] of this.records.entries()) {
      record.timestamps = record.timestamps.filter((ts) => ts > windowStart);
      if (record.timestamps.length === 0) {
        this.records.delete(key);
      }
    }
  }

  public reset(): void {
    this.records.clear();
  }

  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.records.clear();
  }
}

