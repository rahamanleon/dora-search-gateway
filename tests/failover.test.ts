import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FailoverManager } from '../src/failover/failover-manager.js';
import type { ProviderConfig } from '../src/types/index.js';

describe('Failover Manager (Scenarios 1-6 & 10)', () => {
  const mockProviders: ProviderConfig[] = [
    {
      id: 'oracle',
      name: 'Oracle Primary',
      baseUrl: 'http://oracle.internal',
      timeoutMs: 500,
      priority: 1,
      enabled: true,
    },
    {
      id: 'cloud-run',
      name: 'Cloud Run Backup 1',
      baseUrl: 'http://cloudrun.internal',
      timeoutMs: 500,
      priority: 2,
      enabled: true,
    },
    {
      id: 'render',
      name: 'Render Backup 2',
      baseUrl: 'http://render.internal',
      timeoutMs: 500,
      priority: 3,
      enabled: true,
    },
  ];

  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // Scenario 1: Successful primary search
  it('Scenario 1: Successful primary search returns primary results without fallback', async () => {
    const manager = new FailoverManager(mockProviders);

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.includes('oracle.internal')) {
        return new Response(
          JSON.stringify({
            query: 'nodejs',
            results: [
              {
                title: 'Node.js',
                url: 'https://nodejs.org/',
                content: 'Node.js JavaScript runtime',
                engine: 'duckduckgo',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error('Should not call backup');
    });

    const response = await manager.search('nodejs');

    expect(response.success).toBe(true);
    expect(response.provider).toBe('oracle');
    expect(response.fallbackUsed).toBe(false);
    expect(response.results).toHaveLength(1);
    expect(response.results[0]?.title).toBe('Node.js');
    expect(response.failedProviders).toHaveLength(0);
  });

  // Scenario 2: Primary timeout followed by backup success
  it('Scenario 2: Primary timeout triggers fallback to Cloud Run backup', async () => {
    const manager = new FailoverManager(mockProviders, { maxRetriesPerOrigin: 0 });

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.includes('oracle.internal')) {
        // Simulate AbortError timeout
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      if (urlStr.includes('cloudrun.internal')) {
        return new Response(
          JSON.stringify({
            query: 'test',
            results: [
              {
                title: 'Cloud Run Result',
                url: 'https://example.com/backup1',
                content: 'Found via Cloud Run',
                engine: 'brave',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error('Should not call tertiary');
    });

    const response = await manager.search('test');

    expect(response.success).toBe(true);
    expect(response.provider).toBe('cloud-run');
    expect(response.fallbackUsed).toBe(true);
    expect(response.results[0]?.title).toBe('Cloud Run Result');
    expect(response.failedProviders).toHaveLength(1);
    expect(response.failedProviders[0]?.provider).toBe('oracle');
    expect(response.failedProviders[0]?.error).toContain('timed out');
  });

  // Scenario 3: Primary invalid JSON followed by backup
  it('Scenario 3: Primary returning invalid JSON triggers fallback to backup', async () => {
    const manager = new FailoverManager(mockProviders, { maxRetriesPerOrigin: 0 });

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.includes('oracle.internal')) {
        // Return 200 but corrupted HTML / invalid JSON
        return new Response('<html><head><title>Bad Gateway Error</title></head><body>502</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'application/json' }, // Server sent bad payload
        });
      }
      if (urlStr.includes('cloudrun.internal')) {
        return new Response(
          JSON.stringify({
            query: 'query',
            results: [
              {
                title: 'Recovered Result',
                url: 'https://example.com/recovered',
                content: 'Parsed properly',
                engine: 'qwant',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error('Should not reach render');
    });

    const response = await manager.search('query');

    expect(response.success).toBe(true);
    expect(response.provider).toBe('cloud-run');
    expect(response.fallbackUsed).toBe(true);
    expect(response.results[0]?.title).toBe('Recovered Result');
    expect(response.failedProviders[0]?.provider).toBe('oracle');
    expect(response.failedProviders[0]?.error).toContain('JSON');
  });

  // Scenario 4: Primary and secondary failure followed by tertiary success
  it('Scenario 4: Primary and secondary failure cascades to Render (tertiary)', async () => {
    const manager = new FailoverManager(mockProviders, { maxRetriesPerOrigin: 0 });

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.includes('oracle.internal')) {
        return new Response('Internal Server Error', { status: 500 });
      }
      if (urlStr.includes('cloudrun.internal')) {
        return new Response('Service Unavailable', { status: 503 });
      }
      if (urlStr.includes('render.internal')) {
        return new Response(
          JSON.stringify({
            query: 'cascading',
            results: [
              {
                title: 'Render Result',
                url: 'https://render.example.com',
                content: 'Tertiary fallback',
                engine: 'duckduckgo',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error('Unknown host');
    });

    const response = await manager.search('cascading');

    expect(response.success).toBe(true);
    expect(response.provider).toBe('render');
    expect(response.fallbackUsed).toBe(true);
    expect(response.results[0]?.title).toBe('Render Result');
    expect(response.failedProviders).toHaveLength(2);
    expect(response.failedProviders[0]?.provider).toBe('oracle');
    expect(response.failedProviders[1]?.provider).toBe('cloud-run');
  });

  // Scenario 5: All providers unavailable
  it('Scenario 5: All providers unavailable returns clear failure response', async () => {
    const manager = new FailoverManager(mockProviders, { maxRetriesPerOrigin: 0 });

    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response('Fatal Crash', { status: 500 });
    });

    const response = await manager.search('test all dead');

    expect(response.success).toBe(false);
    expect(response.provider).toBe('none');
    expect(response.fallbackUsed).toBe(true);
    expect(response.results).toEqual([]);
    expect(response.failedProviders).toHaveLength(3);
    expect(response.error).toBe('All search providers failed or returned empty results.');
  });

  // Scenario 6: Empty search results
  it('Scenario 6: Primary returning 0 results triggers fallback to backup', async () => {
    const manager = new FailoverManager(mockProviders, {
      treatEmptyAsFailure: true,
      maxRetriesPerOrigin: 0,
    });

    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.includes('oracle.internal')) {
        // Primary returns 0 results
        return new Response(
          JSON.stringify({ query: 'obscure', results: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('cloudrun.internal')) {
        // Backup returns actual results
        return new Response(
          JSON.stringify({
            query: 'obscure',
            results: [
              {
                title: 'Found on backup',
                url: 'https://example.com/found',
                content: 'Found after primary returned empty',
                engine: 'startpage',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error('Should not reach render');
    });

    const response = await manager.search('obscure');

    expect(response.success).toBe(true);
    expect(response.provider).toBe('cloud-run');
    expect(response.results[0]?.title).toBe('Found on backup');
    expect(response.failedProviders[0]?.error).toContain('EMPTY_RESULTS');
  });

  // Scenario 10: Health-check recovery and circuit breaker transitions
  it('Scenario 10: Circuit breaker transitions to OPEN after repeated failures and recovers to CLOSED', async () => {
    const manager = new FailoverManager(mockProviders, {
      circuitBreakerThreshold: 2,
      circuitBreakerCooldownMs: 50,
      maxRetriesPerOrigin: 0,
    });

    // Make oracle fail twice
    globalThis.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const urlStr = input.toString();
      if (urlStr.includes('oracle.internal')) {
        return new Response('Error', { status: 500 });
      }
      return new Response(
        JSON.stringify({ query: 'cb', results: [{ title: 'OK', url: 'https://ok.com', content: 'ok' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    await manager.search('cb-1');
    await manager.search('cb-2');

    const statusesBefore = manager.getStatuses();
    const oracleStatus = statusesBefore.find((s) => s.id === 'oracle')!;
    expect(oracleStatus.circuitState).toBe('OPEN');
    expect(oracleStatus.isHealthy).toBe(false);

    // Wait for cooldown to expire (> 50ms)
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Next check should see HALF_OPEN or probe
    const statusesCooldown = manager.getStatuses();
    const oracleCooldown = statusesCooldown.find((s) => s.id === 'oracle')!;
    expect(oracleCooldown.circuitState).toBe('HALF_OPEN');

    // Now let oracle health check succeed
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      return new Response('OK', { status: 200 });
    });

    await manager.checkHealth();

    const statusesAfter = manager.getStatuses();
    const oracleRecovered = statusesAfter.find((s) => s.id === 'oracle')!;
    expect(oracleRecovered.circuitState).toBe('CLOSED');
    expect(oracleRecovered.isHealthy).toBe(true);
    expect(oracleRecovered.consecutiveFailures).toBe(0);
  });
});

