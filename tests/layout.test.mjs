/**
 * Layout guard for narrow screens: no field has a fixed character width, and
 * the page caps field, select and media widths at their container width.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dirname, '..', 'src', 'index.html'), 'utf8');

test('no input has a fixed size attribute', () => {
  assert.doesNotMatch(html, /<input\b[^>]*\ssize="\d+"/s);
});

test('fields, selects and audio are capped at the container width', () => {
  const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || '';
  for (const sel of ['input', 'select', 'audio']) {
    const rule = new RegExp(`(^|[\\s,])${sel}\\b[^{]*\\{[^}]*max-width:\\s*100%`, 'm');
    assert.match(style, rule, `${sel} has no max-width: 100%`);
  }
});
