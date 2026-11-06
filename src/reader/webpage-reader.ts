import { validateUrlForSSRF } from '../security/ssrf.js';
import type { ExtractedWebpage, ReaderOptions } from '../types/index.js';

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const DEFAULT_TIMEOUT_MS = 6000;
const MAX_REDIRECTS = 5;

const ALLOWED_CONTENT_TYPES = [
  'text/html',
  'application/xhtml+xml',
  'text/plain',
];

export class ReaderError extends Error {
  constructor(message: string, public readonly code: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'ReaderError';
  }
}

/**
 * Extracts title, meta description, and clean article text from raw HTML without executing JavaScript.
 */
export function extractTextFromHtml(html: string): { title: string; text: string; excerpt?: string } {
  // 1. Extract title
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let title = titleMatch && titleMatch[1] ? titleMatch[1] : '';
  title = cleanText(title);

  // 2. Extract meta description for excerpt
  const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const excerpt = metaDescMatch && metaDescMatch[1] ? cleanText(metaDescMatch[1]) : undefined;

  // 3. Strip non-content blocks (scripts, styles, templates, svgs, navigation, footers, forms)
  let cleanHtml = html
    .replace(/<!--[\s\S]*?-->/g, '') // HTML comments
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '');

  // 4. Transform block tags into newlines for natural formatting
  cleanHtml = cleanHtml
    .replace(/<(?:h[1-6]|p|div|section|article|blockquote|table|tr)[^>]*>/gi, '\n\n')
    .replace(/<(?:li|dd|dt)[^>]*>/gi, '\n* ')
    .replace(/<br\s*\/?>/gi, '\n');

  // 5. Strip all remaining tags
  cleanHtml = cleanHtml.replace(/<[^>]+>/g, ' ');

  // 6. Decode entities and normalize whitespace
  const text = cleanText(cleanHtml);

  return {
    title: title || 'Untitled Document',
    text,
    excerpt,
  };
}

function cleanText(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

/**
 * WebpageReader: Secure, SSRF-protected, streaming webpage reader.
 */
export class WebpageReader {
  private maxBytes: number;
  private timeoutMs: number;
  private userAgent: string;

  constructor(options: ReaderOptions = {}) {
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.userAgent = options.userAgent ?? 'DoraBot/1.0 (+https://github.com/dora-ai/dora-search)';
  }

  /**
   * Fetches and extracts content from a URL safely.
   */
  public async read(targetUrl: string): Promise<ExtractedWebpage> {
    let currentUrl = targetUrl;
    let redirectCount = 0;
    let lastResponse: Response | null = null;

    while (redirectCount <= MAX_REDIRECTS) {
      // Step 1: SSRF Validation of target / redirect URL
      const ssrfCheck = await validateUrlForSSRF(currentUrl);
      if (!ssrfCheck.isValid) {
        throw new ReaderError(`SSRF blocked: ${ssrfCheck.error}`, 'SSRF_BLOCKED');
      }

      // Step 2: Timeout signal
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        // Step 3: Fetch with manual redirect handling to re-validate SSRF at each hop
        const response = await fetch(currentUrl, {
          method: 'GET',
          redirect: 'manual',
          signal: controller.signal,
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
          },
        });

        clearTimeout(timeoutId);
        lastResponse = response;

        // Step 4: Handle redirects
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (!location) {
            throw new ReaderError('Redirect location header missing', 'INVALID_REDIRECT', response.status);
          }

          // Resolve relative redirect URL against current URL
          const resolvedRedirect = new URL(location, currentUrl).toString();
          currentUrl = resolvedRedirect;
          redirectCount++;
          continue;
        }

        // Step 5: Check HTTP status
        if (!response.ok) {
          throw new ReaderError(
            `HTTP ${response.status}: ${response.statusText}`,
            'HTTP_ERROR',
            response.status
          );
        }

        // Step 6: Validate Content-Type
        const rawContentType = response.headers.get('content-type') || '';
        const contentType = rawContentType.split(';')[0]?.toLowerCase().trim() || '';

        const isAllowedType = ALLOWED_CONTENT_TYPES.some((allowed) =>
          contentType.includes(allowed)
        );

        if (!isAllowedType) {
          throw new ReaderError(
            `Unsupported Content-Type: '${rawContentType}'. Only HTML and plain text are allowed.`,
            'INVALID_CONTENT_TYPE',
            response.status
          );
        }

        // Step 7: Stream body with byte limit
        const bodyText = await this.readBodyWithLimit(response);

        // Step 8: Extract text
        if (contentType.includes('text/plain')) {
          const clean = bodyText.trim();
          return {
            url: currentUrl,
            originalUrl: targetUrl,
            title: targetUrl,
            content: clean,
            length: clean.length,
            contentType: rawContentType,
            status: response.status,
          };
        }

        const { title, text, excerpt } = extractTextFromHtml(bodyText);

        return {
          url: currentUrl,
          originalUrl: targetUrl,
          title,
          content: text,
          excerpt,
          length: text.length,
          contentType: rawContentType,
          status: response.status,
        };
      } catch (err: unknown) {
        clearTimeout(timeoutId);

        if (err instanceof ReaderError) {
          throw err;
        }

        const msg = err instanceof Error ? err.message : String(err);
        if (err instanceof Error && err.name === 'AbortError') {
          throw new ReaderError(`Request timed out after ${this.timeoutMs}ms`, 'TIMEOUT');
        }

        throw new ReaderError(`Fetch failed: ${msg}`, 'FETCH_FAILED', lastResponse?.status);
      }
    }

    throw new ReaderError(`Exceeded maximum redirect limit of ${MAX_REDIRECTS}`, 'TOO_MANY_REDIRECTS');
  }

  /**
   * Reads the response stream up to maxBytes to prevent memory exhaustion (DoS).
   */
  private async readBodyWithLimit(response: Response): Promise<string> {
    // Check Content-Length header if available
    const contentLengthHeader = response.headers.get('content-length');
    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (!Number.isNaN(contentLength) && contentLength > this.maxBytes) {
        throw new ReaderError(
          `Response payload (${contentLength} bytes) exceeds limit of ${this.maxBytes} bytes`,
          'PAYLOAD_TOO_LARGE',
          413
        );
      }
    }

    if (!response.body) {
      return '';
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          receivedBytes += value.length;
          if (receivedBytes > this.maxBytes) {
            reader.cancel();
            throw new ReaderError(
              `Response exceeded maximum size limit of ${this.maxBytes} bytes`,
              'PAYLOAD_TOO_LARGE',
              413
            );
          }
          chunks.push(value);
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Concatenate chunks and decode as UTF-8
    const totalBuffer = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) {
      totalBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    const decoder = new TextDecoder('utf-8', { fatal: false, ignoreBOM: true });
    return decoder.decode(totalBuffer);
  }
}

