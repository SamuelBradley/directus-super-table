import { describe, it, expect } from 'vitest';
import { stripHtml } from '@/utils/stripHtml';
// NOTE: happy-dom's tokenizer mishandles an unspaced "<" before a digit ("i<3u");
// only assert on inputs that behave identically in browsers and happy-dom.

describe('stripHtml', () => {
  it('strips simple paragraph tags', () => {
    expect(stripHtml('<p>Hello</p>')).toBe('Hello');
  });

  it('strips nested tags and attributes', () => {
    expect(stripHtml('<div><span style="color: red;">Nested</span></div>')).toBe('Nested');
    expect(stripHtml('<p data-start="258" data-end="403">Seamless connection</p>')).toBe(
      'Seamless connection'
    );
  });

  it('survives a ">" inside a quoted attribute (regex strippers break here)', () => {
    expect(stripHtml('<a title="a>b">link</a>')).toBe('link');
  });

  it('keeps a word boundary where tags are dropped', () => {
    expect(stripHtml('Line 1<br/>Line 2')).toBe('Line 1 Line 2');
    expect(stripHtml('<p>First</p><p>Second</p>')).toBe('First Second');
  });

  it('decodes the basic entities', () => {
    expect(stripHtml('Cats &amp; Dogs')).toBe('Cats & Dogs');
    expect(stripHtml('1 &lt; 2 &gt; 0')).toBe('1 < 2 > 0');
    expect(stripHtml('Say &quot;Hi&quot;')).toBe('Say "Hi"');
    expect(stripHtml('It&#39;s working')).toBe("It's working");
  });

  it('decodes entities beyond the basic five (real WYSIWYG output)', () => {
    expect(stripHtml('a&nbsp;b')).toBe('a b');
    expect(stripHtml('it&#8217;s')).toBe('it’s');
  });

  it('does not double-decode (&amp;lt; stays a literal &lt;)', () => {
    expect(stripHtml('&amp;lt;')).toBe('&lt;');
  });

  it('collapses whitespace and trims', () => {
    expect(stripHtml('  Hello\n\n  World\t!  ')).toBe('Hello World !');
  });

  it('returns empty string for null/undefined/empty', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml(undefined)).toBe('');
    expect(stripHtml('')).toBe('');
  });

  it('leaves plain text, numbers and a lone "<" untouched', () => {
    expect(stripHtml('Installation (DE)')).toBe('Installation (DE)');
    expect(stripHtml('123.45')).toBe('123.45');
    expect(stripHtml('a < b')).toBe('a < b');
  });

  it('drops script/style content entirely, like the native display', () => {
    expect(stripHtml('Total <script>track()</script> 42')).toBe('Total 42');
    expect(stripHtml('A<style>.x { color: red; }</style>B')).toBe('A B');
  });

  it('stringifies non-string scalars', () => {
    expect(stripHtml(42)).toBe('42');
    expect(stripHtml(true)).toBe('true');
  });
});
