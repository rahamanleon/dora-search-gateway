import type { SearchResultItem } from '../types/index.js';

export interface SearXNGRawResult {
  title?: string;
  url?: string;
  content?: string;
  engine?: string;
  engines?: string[];
  publishedDate?: string;
  score?: number;
}

export interface SearXNGBaseResponse {
  query?: string;
  number_of_results?: number;
  results?: SearXNGRawResult[];
  unresponsive_engines?: Array<[string, string] | string>;
  suggestions?: string[];
  infoboxes?: unknown[];
}

/**
 * Strips HTML tags and unescapes basic HTML entities.
 */
export function stripHtmlTags(input: string): string {
  if (!input) return '';
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validates whether an object matches the expected SearXNG response shape.
 */
export function isValidSearXNGResponse(data: unknown): data is SearXNGBaseResponse {
  if (!data || typeof data !== 'object') return false;
  const obj = data as Record<string, unknown>;

  // Must have results as an array or at least results field defined
  if (!('results' in obj) || !Array.isArray(obj.results)) {
    return false;
  }

  return true;
}

/**
 * Normalizes raw SearXNG JSON data into clean SearchResultItem objects.
 */
export function normalizeSearXNGResponse(
  raw: SearXNGBaseResponse,
  providerName: string
): { results: SearchResultItem[]; sources: string[]; unresponsiveEngines: string[] } {
  const results: SearchResultItem[] = [];
  const sourcesSet = new Set<string>();
  const unresponsiveEngines: string[] = [];

  if (Array.isArray(raw.unresponsive_engines)) {
    for (const item of raw.unresponsive_engines) {
      if (Array.isArray(item) && typeof item[0] === 'string') {
        unresponsiveEngines.push(item[0]);
      } else if (typeof item === 'string') {
        unresponsiveEngines.push(item);
      }
    }
  }

  if (Array.isArray(raw.results)) {
    for (const item of raw.results) {
      if (!item.url || !item.title) continue;

      const title = stripHtmlTags(item.title);
      const snippet = stripHtmlTags(item.content ?? '');
      const engineName = item.engine || (item.engines && item.engines[0]) || 'web';

      sourcesSet.add(engineName);

      results.push({
        title,
        url: item.url.trim(),
        snippet,
        source: engineName,
        engine: engineName,
        publishedDate: item.publishedDate,
        score: typeof item.score === 'number' ? item.score : undefined,
      });
    }
  }

  // If no engines reported, attribute to the provider
  if (sourcesSet.size === 0 && results.length > 0) {
    sourcesSet.add(providerName);
  }

  return {
    results,
    sources: Array.from(sourcesSet),
    unresponsiveEngines,
  };
}

