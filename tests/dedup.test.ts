import { describe, it, expect } from 'vitest';
import { normalizeUrl, deduplicateResults } from '../src/search/dedup.js';
import type { SearchResultItem } from '../src/types/index.js';

describe('URL Normalization and Deduplication', () => {
  it('normalizes URLs by lowercasing host, removing ports, tracking params, and fragments', () => {
    const raw = 'HTTPS://NodeJS.org:443/en/docs/?utm_source=twitter&utm_medium=social&ref=partner#installation';
    const normalized = normalizeUrl(raw);
    expect(normalized).toBe('https://nodejs.org/en/docs');
  });

  it('removes duplicate URLs and upgrades snippet from richer duplicate (Scenario 7)', () => {
    const items: SearchResultItem[] = [
      {
        title: 'Node.js',
        url: 'https://nodejs.org/',
        snippet: 'Short snippet.',
        source: 'duckduckgo',
        engine: 'duckduckgo',
      },
      {
        title: 'Node.js Org',
        url: 'https://nodejs.org/?utm_source=google',
        snippet: 'A much longer and comprehensive explanation of Node.js JavaScript runtime.',
        source: 'brave',
        engine: 'brave',
        publishedDate: '2024-01-01',
      },
      {
        title: 'MDN Web Docs',
        url: 'https://developer.mozilla.org/en-US/',
        snippet: 'Resources for developers.',
        source: 'duckduckgo',
      },
      {
        title: 'MDN Web Docs Clone',
        url: 'https://developer.mozilla.org:443/en-US/#intro',
        snippet: 'Resources for developers.',
        source: 'qwant',
      },
    ];

    const deduped = deduplicateResults(items);

    expect(deduped).toHaveLength(2);
    expect(deduped[0]?.url).toBe('https://nodejs.org/');
    // Upgraded snippet from the duplicate item
    expect(deduped[0]?.snippet).toBe(
      'A much longer and comprehensive explanation of Node.js JavaScript runtime.'
    );
    expect(deduped[0]?.publishedDate).toBe('2024-01-01');
    expect(deduped[0]?.engine).toBe('duckduckgo, brave');

    expect(deduped[1]?.url).toBe('https://developer.mozilla.org/en-US/');
  });

  it('respects the limit parameter when deduplicating', () => {
    const items: SearchResultItem[] = [
      { title: 'A', url: 'https://a.com', snippet: '', source: 'ddg' },
      { title: 'B', url: 'https://b.com', snippet: '', source: 'ddg' },
      { title: 'C', url: 'https://c.com', snippet: '', source: 'ddg' },
    ];
    const limited = deduplicateResults(items, 2);
    expect(limited).toHaveLength(2);
  });
});
