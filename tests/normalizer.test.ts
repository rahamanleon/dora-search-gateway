import { describe, it, expect } from 'vitest';
import {
  stripHtmlTags,
  isValidSearXNGResponse,
  normalizeSearXNGResponse,
} from '../src/search/normalizer.js';

describe('Search Normalizer', () => {
  it('strips HTML tags and decodes entities cleanly', () => {
    const raw = '<b>Node.js</b> is an <i>open-source</i> runtime &amp; platform &lt;v20&gt; &#39;fast&#39;';
    const cleaned = stripHtmlTags(raw);
    expect(cleaned).toBe("Node.js is an open-source runtime & platform <v20> 'fast'");
  });

  it('validates SearXNG response schema correctly', () => {
    expect(isValidSearXNGResponse(null)).toBe(false);
    expect(isValidSearXNGResponse({})).toBe(false);
    expect(isValidSearXNGResponse({ results: 'not an array' })).toBe(false);
    expect(isValidSearXNGResponse({ results: [] })).toBe(true);
    expect(isValidSearXNGResponse({ results: [{ title: 'test', url: 'https://example.com' }] })).toBe(true);
  });

  it('normalizes SearXNG results into SearchResultItem with sources and unresponsive engines', () => {
    const mockSearXNG = {
      query: 'typescript docs',
      results: [
        {
          title: 'TypeScript <b>Documentation</b>',
          url: 'https://www.typescriptlang.org/docs/',
          content: 'The official TypeScript &amp; JavaScript documentation.',
          engine: 'duckduckgo',
          publishedDate: '2024-02-15',
          score: 2.5,
        },
        {
          title: 'Wikipedia: TypeScript',
          url: 'https://en.wikipedia.org/wiki/TypeScript',
          content: 'TypeScript is a free and open-source high-level programming language.',
          engines: ['wikipedia'],
        },
      ],
      unresponsive_engines: [['brave', 'timeout'], 'startpage'],
    };

    const normalized = normalizeSearXNGResponse(mockSearXNG, 'Oracle Primary');

    expect(normalized.results).toHaveLength(2);
    expect(normalized.results[0]?.title).toBe('TypeScript Documentation');
    expect(normalized.results[0]?.snippet).toBe('The official TypeScript & JavaScript documentation.');
    expect(normalized.results[0]?.source).toBe('duckduckgo');
    expect(normalized.results[0]?.publishedDate).toBe('2024-02-15');

    expect(normalized.sources).toContain('duckduckgo');
    expect(normalized.sources).toContain('wikipedia');
    expect(normalized.unresponsiveEngines).toContain('brave');
    expect(normalized.unresponsiveEngines).toContain('startpage');
  });
});

