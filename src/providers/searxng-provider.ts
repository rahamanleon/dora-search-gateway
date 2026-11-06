import type { ProviderConfig, SearchOptions, SearchResultItem } from '../types/index.js';
import { isValidSearXNGResponse, normalizeSearXNGResponse } from '../search/normalizer.js';

export interface ProviderSearchResult {
  results: SearchResultItem[];
  sources: string[];
  unresponsiveEngines: string[];
  durationMs: number;
  rawCount: number;
}

export class SearXNGProvider {
  public readonly config: ProviderConfig;
  private readonly maxResponseSizeBytes = 2 * 1024 * 1024; // 2MB max response

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  public get id(): string {
    return this.config.id;
  }

  public get name(): string {
    return this.config.name;
  }

  /**
   * Executes a search query against this SearXNG origin.
   */
  public async search(query: string, options: SearchOptions = {}): Promise<ProviderSearchResult> {
    const startTime = Date.now();
    const url = new URL('/search', this.config.baseUrl);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');

    if (options.language) {
      url.searchParams.set('language', options.language);
    }
    if (options.safesearch !== undefined) {
      url.searchParams.set('safesearch', String(options.safesearch));
    }
    if (options.timeRange) {
      url.searchParams.set('time_range', options.timeRange);
    }
    if (options.categories && options.categories.length > 0) {
      url.searchParams.set('categories', options.categories.join(','));
    }
    if (options.engines && options.engines.length > 0) {
      url.searchParams.set('engines', options.engines.join(','));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'User-Agent': 'Dora-Gateway/1.0',
    };

    if (this.config.secretToken) {
      headers['Authorization'] = `Bearer ${this.config.secretToken}`;
    } else if (this.config.authHeader) {
      headers['Authorization'] = this.config.authHeader;
    }

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`Origin returned HTTP ${response.status}: ${response.statusText}`);
      }

      // Check content-type
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Invalid content-type from SearXNG: expected JSON, got '${contentType}'`);
      }

      // Enforce response size guard
      const rawText = await response.text();
      if (rawText.length > this.maxResponseSizeBytes) {
        throw new Error(`Response size (${rawText.length} bytes) exceeds limit of ${this.maxResponseSizeBytes}`);
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawText);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to parse JSON response: ${msg}`);
      }

      if (!isValidSearXNGResponse(parsed)) {
        throw new Error('Response JSON does not match SearXNG schema (missing results array)');
      }

      const normalized = normalizeSearXNGResponse(parsed, this.config.name);

      return {
        results: normalized.results,
        sources: normalized.sources,
        unresponsiveEngines: normalized.unresponsiveEngines,
        durationMs,
        rawCount: normalized.results.length,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;

      if (err instanceof Error && err.name === 'AbortError') {
        const timeoutErr = new Error(`Search request timed out after ${this.config.timeoutMs}ms`);
        (timeoutErr as any).durationMs = durationMs;
        (timeoutErr as any).isTimeout = true;
        throw timeoutErr;
      }

      const msg = err instanceof Error ? err.message : String(err);
      const wrappedErr = new Error(`Provider [${this.config.id}] search failed: ${msg}`);
      (wrappedErr as any).durationMs = durationMs;
      throw wrappedErr;
    }
  }

  /**
   * Health check against provider endpoint (/healthz or root).
   */
  public async checkHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.min(this.config.timeoutMs, 4000));

    const headers: Record<string, string> = {
      'User-Agent': 'Dora-HealthCheck/1.0',
    };

    if (this.config.secretToken) {
      headers['Authorization'] = `Bearer ${this.config.secretToken}`;
    } else if (this.config.authHeader) {
      headers['Authorization'] = this.config.authHeader;
    }

    try {
      // Try /healthz first
      const healthUrl = new URL('/healthz', this.config.baseUrl);
      const response = await fetch(healthUrl.toString(), {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        return { ok: true, latencyMs };
      }

      // If /healthz returns 404, fallback check to base URL
      if (response.status === 404) {
        const rootResponse = await fetch(this.config.baseUrl, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
        if (rootResponse.ok) {
          return { ok: true, latencyMs: Date.now() - startTime };
        }
      }

      return {
        ok: false,
        latencyMs,
        error: `HTTP ${response.status}: ${response.statusText}`,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        latencyMs,
        error: msg,
      };
    }
  }
}

