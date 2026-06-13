/**
 * Convert an HTML fragment to plain text: all tags removed, `<script>`/`<style>`
 * contents dropped entirely, ALL entities decoded (named and numeric),
 * whitespace collapsed.
 *
 * M2A template cells interpolate resolved values as text, so a rich-text
 * translation field would otherwise show its literal markup — unlike normal
 * columns, which go through the native `formatted-value` display (DOMPurify
 * with `ALLOWED_TAGS: []` + html-entities decode). Neither of those packages
 * is importable from an extension and a hand-rolled regex/entity table misses
 * real WYSIWYG output (`&nbsp;`, numeric entities, `>` inside attributes), so
 * this uses the browser's own parser. DOMParser documents are inert — no
 * script execution, no resource loading — which makes this safe for
 * untrusted values.
 */
export function stripHtml(value: unknown): string {
  if (value == null) return '';
  const source = String(value);
  // Fast path: nothing to strip or decode — the dominant case (plain names,
  // numbers) skips the comparatively expensive document parse entirely.
  if (!/[<&]/.test(source)) return source.replace(/\s+/g, ' ').trim();
  // A space before every "<" keeps words from gluing together when the parser
  // drops the tags ("<p>a</p><p>b</p>" → "a b", not "ab"). In plain text a "<"
  // followed by whitespace is not markup, so values like "a < b" survive.
  const doc = new DOMParser().parseFromString(source.replace(/</g, ' <'), 'text/html');
  // The native display (DOMPurify) drops script/style CONTENT, not just the
  // tags — and browser vs happy-dom parsers disagree where such elements land,
  // so removing them explicitly also keeps both environments consistent.
  doc.body.querySelectorAll('script,style').forEach((el) => el.remove());
  const text = doc.body.textContent ?? '';
  return text.replace(/\s+/g, ' ').trim();
}
