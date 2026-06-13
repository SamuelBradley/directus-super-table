import { pickTranslationRow } from './resolveRelationalPath';

/**
 * Pick the field to display for a BARE `translations` column (one with no
 * sub-field configured). Used after the active-language row has been selected:
 * prefers common human-readable fields, then falls back to the first non-id,
 * non-relational scalar on the row. The language-code field and primary key are
 * skipped. Returns null when the row has nothing sensible to show (caller then
 * renders an em dash instead of raw JSON).
 */
const PREFERRED_FIELDS = [
  'description',
  'title',
  'label',
  'name',
  'headline',
  'text',
  'content',
  'value',
] as const;

export function defaultBareTranslationField(
  row: Record<string, unknown> | null | undefined,
  languageCodeField: string
): string | null {
  if (!row) return null;
  for (const f of PREFERRED_FIELDS) {
    if (f in row && row[f] != null && typeof row[f] !== 'object') return f;
  }
  const skip = new Set(['id', languageCodeField]);
  return (
    Object.keys(row).find(
      (k) => !skip.has(k) && !k.endsWith('_id') && row[k] != null && typeof row[k] !== 'object'
    ) ?? null
  );
}

/**
 * Render a BARE `translations` column: pick the active-language row (falling back
 * to the first), then render it through the configured column template, else a
 * heuristic `{{field}}` template. `render` interpolates + strips HTML — injected
 * so this stays pure/testable. Returns an em dash when there is no row or nothing
 * displayable; never the raw array.
 */
export function renderBareTranslation(
  rows: unknown,
  language: string | null,
  languageCodeField: string,
  configuredTemplate: string | null | undefined,
  render: (row: Record<string, unknown>, template: string) => string
): string {
  const row = pickTranslationRow(rows, language, languageCodeField);
  if (!row) return '—';
  const fallback = defaultBareTranslationField(row, languageCodeField);
  const template = configuredTemplate || (fallback ? `{{${fallback}}}` : null);
  return template ? render(row, template) : '—';
}
