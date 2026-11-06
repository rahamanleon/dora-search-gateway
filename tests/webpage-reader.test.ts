import { describe, it, expect } from 'vitest';
import { extractTextFromHtml } from '../src/reader/webpage-reader.js';

describe('Webpage Reader & HTML-to-Text', () => {
  it('extracts title, meta description, and clean article body without JS', () => {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Understanding TypeScript &amp; Node.js</title>
          <meta name="description" content="A comprehensive guide to TypeScript in Node.js runtime." />
          <script>
            alert("This malicious script should be stripped!");
          </script>
          <style>
            body { color: red; }
          </style>
        </head>
        <body>
          <nav><a href="/">Home</a><a href="/about">About</a></nav>
          <h1>TypeScript Overview</h1>
          <p>TypeScript extends JavaScript by adding types to the language.</p>
          <p>It speeds up your development experience by catching errors early.</p>
          <footer>Copyright 2026 Dora AI</footer>
        </body>
      </html>
    `;

    const { title, text, excerpt } = extractTextFromHtml(html);

    expect(title).toBe('Understanding TypeScript & Node.js');
    expect(excerpt).toBe('A comprehensive guide to TypeScript in Node.js runtime.');
    expect(text).toContain('TypeScript Overview');
    expect(text).toContain('TypeScript extends JavaScript by adding types to the language.');
    expect(text).not.toContain('malicious script');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('color: red');
    expect(text).not.toContain('Copyright 2026');
    expect(text).not.toContain('<p>');
  });

  it('handles HTML without title gracefully', () => {
    const html = '<div>Just some content</div>';
    const { title, text } = extractTextFromHtml(html);
    expect(title).toBe('Untitled Document');
    expect(text).toBe('Just some content');
  });
});

