import type { SearchResultItem } from '../types/index.js';

// Common tracking parameters to strip for deduplication
const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'ref',
  'source',
]);

/**
 * Normalizes a URL for comparison and deduplication:
 * - Lowercases scheme and host
 * - Removes standard ports (80/443)
 * - Removes tracking query parameters
 * - Removes hash fragment
 * - Strips trailing slash on root or non-root path consistently
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());

    // Lowercase protocol and host
    parsed.protocol = parsed.protocol.toLowerCase();
    parsed.hostname = parsed.hostname.toLowerCase();

    // Remove standard ports
    if (
      (parsed.protocol === 'http:' && parsed.port === '80') ||
      (parsed.protocol === 'https:' && parsed.port === '443')
    ) {
      parsed.port = '';
    }

    // Strip tracking query params
    const keysToDelete: string[] = [];
    for (const [key] of parsed.searchParams.entries()) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
    }

    // Remove fragment
    parsed.hash = '';

    // Strip trailing slash except if path is just '/'
    let clean = parsed.toString();
    if (clean.endsWith('/') && parsed.pathname !== '/') {
      clean = clean.slice(0, -1);
    } else if (clean.endsWith('/') && parsed.pathname === '/' && parsed.search === '') {
      clean = clean.slice(0, -1);
    }

    return clean;
  } catch {
    // If not a valid URL, return trimmed lowercase version
    return rawUrl.trim().toLowerCase();
  }
}

/**
 * Deduplicates search results by normalized URL.
 * Preserves the first encountered result, but upgrades snippet if a subsequent one has a longer snippet.
 */
export function deduplicateResults(results: SearchResultItem[], limit?: number): SearchResultItem[] {
  const seen = new Map<string, SearchResultItem>();

  for (const item of results) {
    if (!item.url || !item.title) continue;

    const normalized = normalizeUrl(item.url);
    const existing = seen.get(normalized);

    if (!existing) {
      seen.set(normalized, { ...item });
    } else {
      // If the duplicate has a longer snippet or more metadata, augment the existing result
      if ((item.snippet?.length ?? 0) > (existing.snippet?.length ?? 0)) {
        existing.snippet = item.snippet;
      }
      if (!existing.publishedDate && item.publishedDate) {
        existing.publishedDate = item.publishedDate;
      }
      if (item.engine && existing.engine && !existing.engine.includes(item.engine)) {
        existing.engine = `${existing.engine}, ${item.engine}`;
      }
    }
  }

  const unique = Array.from(seen.values());
  return typeof limit === 'number' && limit > 0 ? unique.slice(0, limit) : unique;
}

