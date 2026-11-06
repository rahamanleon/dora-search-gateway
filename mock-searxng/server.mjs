/**
 * Local SearXNG-compatible origin for end-to-end gateway testing.
 *
 * Serves the SearXNG JSON API contract on one or more ports:
 *   GET /search?q=...&format=json  -> { query, number_of_results, results[], unresponsive_engines[] }
 *   GET /healthz                   -> "OK"
 *
 * Results are REAL: scraped from DuckDuckGo's HTML endpoint, then shaped
 * into SearXNG-style JSON. Falls back to a small canned fixture if the
 * upstream scrape fails, so the gateway pipeline can always be exercised.
 *
 * Test hooks:
 *   - A query containing "failprimary" makes the instance on the FIRST port
 *     return HTTP 500, letting you observe gateway failover.
 *   - format other than "json" is rejected, mirroring real instances.
 *
 * Usage: node server.mjs  (env: PORTS="8080,8081,8082", DDG_TIMEOUT_MS=5000)
 */
import http from 'node:http';

const PORTS = (process.env.PORTS || '8080').split(',').map((p) => Number(p.trim()));
const DDG_TIMEOUT_MS = Number(process.env.DDG_TIMEOUT_MS || 5000);
const FIRST_PORT = PORTS[0];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// --- tiny TTL cache so we don't hammer DuckDuckGo -------------------------
const cache = new Map(); // key -> { at, results }
const CACHE_TTL_MS = 60_000;

function decodeEntities(s) {
  return s
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function stripTags(s) {
  return decodeEntities(String(s).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

function decodeDdgHref(href) {
  // href like //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com&rut=...
  try {
    const u = new URL(href, 'https://duckduckgo.com');
    const uddg = u.searchParams.get('uddg');
    return uddg ? uddg : href.startsWith('//') ? 'https:' + href : href;
  } catch {
    return href;
  }
}

/** Scrape real results from DuckDuckGo's HTML endpoint. */
async function searchDuckDuckGo(query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DDG_TIMEOUT_MS);
  try {
    const res = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('DDG HTTP ' + res.status);
    const html = await res.text();

    const results = [];
    // Result blocks: title link + optional snippet, in document order.
    const blockRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    const snippetRe = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;

    const titles = [];
    let m;
    while ((m = blockRe.exec(html)) !== null) {
      titles.push({ href: m[1], title: stripTags(m[2]) });
    }
    const snippets = [];
    while ((m = snippetRe.exec(html)) !== null) {
      snippets.push(stripTags(m[1]));
    }

    titles.forEach((t, i) => {
      const url = decodeDdgHref(t.href);
      if (!/^https?:\/\//.test(url)) return;
      if (results.some((r) => r.url === url)) return; // dedupe
      results.push({
        title: t.title,
        url,
        content: snippets[i] || '',
        engine: 'duckduckgo',
        engines: ['duckduckgo'],
        score: Math.max(0, 10 - i),
      });
    });
    return results;
  } finally {
    clearTimeout(timer);
  }
}

function fixtureResults(query) {
  const q = query.trim();
  return [
    {
      title: `Fixture result for "${q}" (1)`,
      url: `https://example.com/search?q=${encodeURIComponent(q)}&r=1`,
      content: `This is a local fixture result describing ${q}. Served by the mock SearXNG origin because the live scrape was unavailable.`,
      engine: 'fixture',
      engines: ['fixture'],
      score: 10,
    },
    {
      title: `Fixture result for "${q}" (2)`,
      url: `https://example.org/search?q=${encodeURIComponent(q)}&r=2`,
      content: `Second fixture result for ${q}, used for deterministic end-to-end gateway testing.`,
      engine: 'fixture',
      engines: ['fixture'],
      score: 9,
    },
  ];
}

async function handleSearch(query, isPrimaryPort) {
  // Test hook: simulated primary failure.
  if (isPrimaryPort && /failprimary/i.test(query)) {
    return { status: 500, body: { error: 'Simulated primary failure (test hook)' } };
  }

  const key = query.trim().toLowerCase();
  const hit = cache.get(key);
  let results;
  let note;
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    results = hit.results;
    note = hit.note;
  } else {
    try {
      results = await searchDuckDuckGo(query);
      note = 'live duckduckgo';
    } catch (err) {
      results = fixtureResults(query);
      note = 'fixture fallback (' + (err && err.message ? err.message : 'scrape failed') + ')';
    }
    if (results.length > 0) cache.set(key, { at: Date.now(), results, note });
  }

  return {
    status: 200,
    note,
    body: {
      query,
      number_of_results: results.length,
      results,
      unresponsive_engines: [],
      suggestions: [],
    },
  };
}

function makeServer(port) {
  const isPrimaryPort = port === FIRST_PORT;
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    try {
      if (url.pathname === '/healthz') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return;
      }
      if (url.pathname === '/search') {
        const format = url.searchParams.get('format');
        if (format !== 'json') {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'format must be json (mirrors real instances)' }));
          return;
        }
        const q = url.searchParams.get('q') || '';
        if (!q.trim()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'missing q' }));
          return;
        }
        const out = await handleSearch(q, isPrimaryPort);
        if (out.note) res.setHeader('X-Mock-Note', out.note);
        res.writeHead(out.status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(out.body));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err && err.message ? err.message : 'internal' }));
    }
  });
}

for (const port of PORTS) {
  makeServer(port).listen(port, '127.0.0.1', () => {
    console.log(`[mock-searxng] listening on http://127.0.0.1:${port} (primary=${port === FIRST_PORT})`);
  });
}
