import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GatewayRouter } from '../src/gateway/router.js';

describe('Gateway Router (Scenarios 9, 11, 12 & API Contract)', () => {
  const SECRET = 'test_dora_secret_token_12345';
  let router: GatewayRouter;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    router = new GatewayRouter({
      DORA_API_SECRET: SECRET,
      RATE_LIMIT_MAX: 3,
      RATE_LIMIT_WINDOW_MS: 1000,
      CACHE_TTL_MS: 5000,
      ORACLE_ORIGIN_URL: 'http://oracle.test',
      CLOUD_RUN_ORIGIN_URL: 'http://cloudrun.test',
      RENDER_ORIGIN_URL: 'http://render.test',
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // Scenario 11: Authentication failures
  it('Scenario 11: Rejects unauthenticated requests with 401', async () => {
    // Missing header
    const req1 = new Request('http://localhost/api/search?q=test');
    const res1 = await router.handleRequest(req1);
    expect(res1.status).toBe(401);
    const body1 = await res1.json();
    expect(body1.error).toContain('Unauthorized');

    // Wrong token
    const req2 = new Request('http://localhost/api/search?q=test', {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    const res2 = await router.handleRequest(req2);
    expect(res2.status).toBe(401);

    // Correct token succeeds
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({ query: 'test', results: [{ title: 'OK', url: 'https://ok.com', content: 'ok' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const req3 = new Request('http://localhost/api/search?q=test', {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    const res3 = await router.handleRequest(req3);
    expect(res3.status).toBe(200);
  });

  // Scenario 9: Rate limiting
  it('Scenario 9: Enforces rate limits with HTTP 429 when threshold exceeded', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({ query: 'q', results: [{ title: 'OK', url: 'https://ok.com', content: 'ok' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const makeReq = () =>
      new Request('http://localhost/api/search?q=unique_' + Math.random(), {
        headers: {
          Authorization: `Bearer ${SECRET}`,
          'cf-connecting-ip': '203.0.113.195',
        },
      });

    // We set RATE_LIMIT_MAX = 3
    const r1 = await router.handleRequest(makeReq());
    expect(r1.status).toBe(200);

    const r2 = await router.handleRequest(makeReq());
    expect(r2.status).toBe(200);

    const r3 = await router.handleRequest(makeReq());
    expect(r3.status).toBe(200);

    // 4th request should be rate limited
    const r4 = await router.handleRequest(makeReq());
    expect(r4.status).toBe(429);
    const body4 = await r4.json();
    expect(body4.error).toContain('Rate limit exceeded');
    expect(r4.headers.get('Retry-After')).toBeTruthy();
  });

  // Scenario 12: Cache behavior
  it('Scenario 12: Serves cached search responses with X-Cache: HIT', async () => {
    let fetchCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchCount++;
      return new Response(
        JSON.stringify({
          query: 'cached-query',
          results: [{ title: 'Cached Title', url: 'https://cached.org', content: 'Cached Snippet' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const req1 = new Request('http://localhost/api/search?q=cached-query', {
      headers: { Authorization: `Bearer ${SECRET}` },
    });

    // First request -> Cache MISS
    const res1 = await router.handleRequest(req1);
    expect(res1.status).toBe(200);
    expect(res1.headers.get('X-Cache')).toBe('MISS');
    expect(fetchCount).toBe(1);

    // Second request with same query -> Cache HIT
    const req2 = new Request('http://localhost/api/search?q=cached-query', {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    const res2 = await router.handleRequest(req2);
    expect(res2.status).toBe(200);
    expect(res2.headers.get('X-Cache')).toBe('HIT');
    const body2 = await res2.json();
    expect(body2.cached).toBe(true);
    expect(body2.results[0]?.title).toBe('Cached Title');
    // fetch was not called again!
    expect(fetchCount).toBe(1);
  });

  // API Contract compliance (Section E)
  it('Matches the exact required Section E API Contract structure', async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () =>
      new Response(
        JSON.stringify({
          query: 'Node.js documentation',
          results: [
            {
              title: 'Node.js',
              url: 'https://nodejs.org/',
              content: 'Node.js documentation',
              engine: 'search engine',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const req = new Request('http://localhost/api/search?q=Node.js+documentation&limit=10', {
      headers: { Authorization: `Bearer ${SECRET}` },
    });
    const res = await router.handleRequest(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toMatchObject({
      success: true,
      query: 'Node.js documentation',
      provider: 'oracle',
      fallbackUsed: false,
      results: [
        {
          title: 'Node.js',
          url: 'https://nodejs.org/',
          snippet: 'Node.js documentation',
          source: 'search engine',
        },
      ],
      sources: expect.any(Array),
      failedProviders: expect.any(Array),
    });
  });

  // Health and Dashboard Endpoints
  it('Serves HTML dashboard at / and /dashboard', async () => {
    const req = new Request('http://localhost/dashboard');
    const res = await router.handleRequest(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();
    expect(html).toContain('Dora Search Infrastructure Status');
    expect(html).toContain('Oracle Cloud Always Free');
  });

  it('Serves JSON health at /api/health', async () => {
    const req = new Request('http://localhost/api/health');
    const res = await router.handleRequest(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBeDefined();
    expect(body.gateway).toBeDefined();
    expect(body.providers).toBeDefined();
    expect(body.stats).toBeDefined();
  });
});
