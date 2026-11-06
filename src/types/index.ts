/**
 * Dora Search Type Definitions
 */

export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
  source: string;
  engine?: string;
  publishedDate?: string;
  score?: number;
}

export interface FailedProviderInfo {
  provider: string;
  error: string;
  durationMs: number;
  statusCode?: number;
}

export interface SearchApiResponse {
  success: boolean;
  query: string;
  provider: string;
  fallbackUsed: boolean;
  results: SearchResultItem[];
  sources: string[];
  failedProviders: FailedProviderInfo[];
  error?: string;
  executionTimeMs?: number;
}

export interface SearchOptions {
  limit?: number;
  language?: string;
  categories?: string[];
  engines?: string[];
  safesearch?: number;
  timeRange?: string;
}

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  authHeader?: string;
  timeoutMs: number;
  priority: number;
  enabled: boolean;
  secretToken?: string;
}

export interface ProviderHealthStatus {
  id: string;
  name: string;
  isHealthy: boolean;
  consecutiveFailures: number;
  circuitState: CircuitBreakerState;
  lastCheckedAt: string | null;
  lastError?: string;
  latencyMs?: number;
  cooldownUntil?: number;
}

export interface GatewayStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  recentFailedEngines: Record<string, number>;
}

export interface GatewayHealthResponse {
  status: 'ok' | 'degraded' | 'error';
  gateway: {
    uptimeSeconds: number;
    version: string;
    timestamp: string;
  };
  providers: ProviderHealthStatus[];
  activeProvider: string;
  stats: GatewayStats;
}

export interface ExtractedWebpage {
  url: string;
  originalUrl: string;
  title: string;
  content: string;
  excerpt?: string;
  length: number;
  contentType: string;
  status: number;
}

export interface ReaderOptions {
  maxBytes?: number;
  timeoutMs?: number;
  allowedProtocols?: string[];
  userAgent?: string;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

