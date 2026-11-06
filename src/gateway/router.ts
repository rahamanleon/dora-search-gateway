import type {
  GatewayHealthResponse,
  ProviderConfig,
  SearchOptions,
} from '../types/index.js';
import { FailoverManager } from '../failover/failover-manager.js';
import { SlidingWindowRateLimiter } from '../security/rate-limiter.js';
import { validateAuthToken, extractTokenFromHeaders } from '../security/auth.js';
import { MemoryCache } from '../cache/memory-cache.js';
import { MetricsCollector } from '../monitoring/metrics.js';
import { renderDashboardHtml } from '../monitoring/dashboard.js';
import { WebpageReader, ReaderError } from '../reader/webpage-reader.js';

export interface GatewayEnv {
  DORA_API_SECRET?: string;
  ORACLE_ORIGIN_URL?: string;
  CLOUD_RUN_ORIGIN_URL?: string;
  RENDER_ORIGIN_URL?: string;
  UPSTREAM_SECRET_TOKEN?: string;
  RATE_LIMIT_MAX?: string | number;
  RATE_LIMIT_WINDOW_MS?: string | number;
  CACHE_TTL_MS?: string | number;
}

export class GatewayRouter {
  private failover: FailoverManager;
  private rateLimiter: SlidingWindowRateLimiter;
  private cache: MemoryCache<any>;
  private metrics: MetricsCollector;
  private reader: WebpageReader;
  private apiSecret?: string;
  private version = '1.0.0';

  constructor(env: GatewayEnv = {}) {
    this.apiSecret = env.DORA_API_SECRET || process.env.DORA_API_SECRET || 'dora_dev_secret_token_12345';

    const providers: ProviderConfig[] = [
      {
        id: 'oracle',
        name: 'Oracle Cloud Always Free (Primary)',
        baseUrl: env.ORACLE_ORIGIN_URL || process.env.ORACLE_ORIGIN_URL || 'http://127.0.0.1:8080',
        timeoutMs: 3500,
        priority: 1,
        enabled: true,
        secretToken: env.UPSTREAM_SECRET_TOKEN || process.env.UPSTREAM_SECRET_TOKEN,
      },
      {
        id: 'cloud-run',
        name: 'Google Cloud Run (Backup 1)',
        baseUrl: env.CLOUD_RUN_ORIGIN_URL || process.env.CLOUD_RUN_ORIGIN_URL || 'http://127.0.0.1:8081',
        timeoutMs: 4000,
        priority: 2,
        enabled: true,
        secretToken: env.UPSTREAM_SECRET_TOKEN || process.env.UPSTREAM_SECRET_TOKEN,
      },
      {
        id: 'render',
        name: 'Render Free (Backup 2 Fallback)',
        baseUrl: env.RENDER_ORIGIN_URL || process.env.RENDER_ORIGIN_URL || 'http://127.0.0.1:8082',
        timeoutMs: 5000,
        priority: 3,
        enabled: true,
        secretToken: env.UPSTREAM_SECRET_TOKEN || process.env.UPSTREAM_SECRET_TOKEN,
      },
    ];

    this.failover = new FailoverManager(providers);
    const windowMs = Number(env.RATE_LIMIT_WINDOW_MS || 60_000);
    const maxReqs = Number(env.RATE_LIMIT_MAX || 60);
    this.rateLimiter = new SlidingWindowRateLimiter({ windowMs, maxRequests: maxReqs });

    const cacheTtlMs = Number(env.CACHE_TTL_MS || 300_000);
    this.cache = new MemoryCache({ defaultTtlMs: cacheTtlMs, maxEntries: 1000 });
    this.metrics = new MetricsCollector();
    this.reader = new WebpageReader({ timeoutMs: 6000, maxBytes: 2 * 1024 * 1024 });
  }

  /**
   * Main request handler compatible with Web Standard Request/Response.
   */
  public async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const clientIp = this.getClientIp(request);

    // 1. CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: this.corsHeaders(),
      });
    }

    // 2. Dashboard UI (public status page)
    if (url.pathname === '/' || url.pathname === '/dashboard') {
      const healthData = this.buildHealthResponse();
      const html = renderDashboardHtml(healthData);
      return new Response(html, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          ...this.corsHeaders(),
        },
      });
    }

    // 3. API Health check (public / monitoring)
    if (url.pathname === '/api/health') {
      const healthData = this.buildHealthResponse();
      const httpStatus = healthData.status === 'error' ? 503 : 200;
      return this.jsonResponse(healthData, httpStatus);
    }

    // 4. API Provider Health check (internal health probe)
    if (url.pathname === '/api/health/providers') {
      // Authenticate admin/dora access
      if (!this.authenticate(request)) {
        return this.jsonResponse({ error: 'Unauthorized: Invalid or missing authentication token' }, 401);
      }
      const providers = await this.failover.checkHealth();
      return this.jsonResponse({ providers }, 200);
    }

    // 5. Webpage Reader API
    if (url.pathname === '/api/read') {
      if (!this.authenticate(request)) {
        return this.jsonResponse({ error: 'Unauthorized: Invalid or missing authentication token' }, 401);
      }

      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) {
        return this.jsonResponse({ error: "Missing required query parameter 'url'" }, 400);
      }

      try {
        const extracted = await this.reader.read(targetUrl);
        return this.jsonResponse({ success: true, ...extracted }, 200);
      } catch (err: unknown) {
        // SSRF-blocked requests are client errors: the requested target is forbidden
        if (err instanceof ReaderError && err.code === 'SSRF_BLOCKED') {
          return this.jsonResponse({ success: false, error: err.message }, 400);
        }
        const msg = err instanceof Error ? err.message : String(err);
        const statusCode = (err as any)?.statusCode || 500;
        return this.jsonResponse({ success: false, error: msg }, statusCode);
      }
    }

    // 6. Search API
    if (url.pathname === '/api/search') {
      // Authentication check
      if (!this.authenticate(request)) {
        return this.jsonResponse({ error: 'Unauthorized: Invalid or missing authentication token' }, 401);
      }

      // Rate limit check
      const rateLimit = this.rateLimiter.check(clientIp);
      if (!rateLimit.allowed) {
        return this.jsonResponse(
          {
            error: 'Too Many Requests: Rate limit exceeded. Try again in ' + Math.ceil(rateLimit.resetMs / 1000) + 's',
          },
          429,
          {
            'Retry-After': String(Math.ceil(rateLimit.resetMs / 1000)),
          }
        );
      }

      const q = url.searchParams.get('q');
      if (!q || q.trim() === '') {
        return this.jsonResponse({ error: "Missing required search parameter 'q'" }, 400);
      }

      const limit = Number.parseInt(url.searchParams.get('limit') || '10', 10);
      const language = url.searchParams.get('language') || undefined;
      const safesearch = url.searchParams.has('safesearch')
        ? Number(url.searchParams.get('safesearch'))
        : undefined;

      const cacheKey = `search:${q.trim().toLowerCase()}:l=${limit}:lang=${language || 'auto'}`;
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return this.jsonResponse(
          {
            ...cached,
            cached: true,
          },
          200,
          {
            'X-Cache': 'HIT',
          }
        );
      }

      const options: SearchOptions = {
        limit: Number.isNaN(limit) ? 10 : Math.min(limit, 50),
        language,
        safesearch,
      };

      const startTime = Date.now();
      const result = await this.failover.search(q, options);
      const latencyMs = Date.now() - startTime;

      this.metrics.recordRequest(result.success, latencyMs);

      // Record any failed upstream engines reported in metadata
      for (const failed of result.failedProviders) {
        if (failed.error.includes('unresponsive')) {
          this.metrics.recordFailedEngine(failed.provider);
        }
      }

      if (result.success && result.results.length > 0) {
        this.cache.set(cacheKey, result);
      }

      const httpStatus = result.success ? 200 : 502;
      return this.jsonResponse(result, httpStatus, {
        'X-Cache': 'MISS',
      });
    }

    // 404 Not Found
    return this.jsonResponse({ error: 'Endpoint not found' }, 404);
  }

  private authenticate(request: Request): boolean {
    const token = extractTokenFromHeaders(request.headers);
    return validateAuthToken(token, this.apiSecret);
  }

  private getClientIp(request: Request): string {
    return (
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1'
    );
  }

  private buildHealthResponse(): GatewayHealthResponse {
    const statuses = this.failover.getStatuses();
    const stats = this.metrics.getStats();
    const hasHealthyProvider = statuses.some((p) => p.isHealthy && p.circuitState === 'CLOSED');
    const hasTestingProvider = statuses.some((p) => p.circuitState === 'HALF_OPEN');

    let overallStatus: 'ok' | 'degraded' | 'error' = 'ok';
    if (!hasHealthyProvider && !hasTestingProvider) {
      overallStatus = 'error';
    } else if (!hasHealthyProvider && hasTestingProvider) {
      overallStatus = 'degraded';
    } else if (statuses.some((p) => !p.isHealthy)) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      gateway: {
        uptimeSeconds: this.metrics.getUptimeSeconds(),
        version: this.version,
        timestamp: new Date().toISOString(),
      },
      providers: statuses,
      activeProvider: this.failover.getPrimaryProviderId(),
      stats,
    };
  }

  private jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data, null, 2), {
      status,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...this.corsHeaders(),
        ...extraHeaders,
      },
    });
  }

  private corsHeaders(): Record<string, string> {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, x-api-key',
    };
  }

  public getFailoverManager(): FailoverManager {
    return this.failover;
  }

  public getRateLimiter(): SlidingWindowRateLimiter {
    return this.rateLimiter;
  }

  public getCache(): MemoryCache<any> {
    return this.cache;
  }

  public getMetrics(): MetricsCollector {
    return this.metrics;
  }
}
