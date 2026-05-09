/**
 * Issue #48: pure helpers for resolving display templates and target collections
 * for relational fields when the user has not configured an override or a field
 * display in collection settings.
 */

const RELATIONAL_SPECIALS = ['m2o', 'o2m', 'm2m', 'm2a', 'files', 'translations'] as const;

export function isRelational(field: { meta?: { special?: string[] } } | null | undefined): boolean {
  if (!field?.meta?.special) return false;
  return field.meta.special.some((s) => (RELATIONAL_SPECIALS as readonly string[]).includes(s));
}

/**
 * Pull the field tokens out of a display template. Whitespace is stripped,
 * duplicates are removed, dotted paths are kept intact (callers decide whether
 * to flatten them).
 */
export function parseTemplateTokens(template: string): string[] {
  if (!template) return [];
  const matches = template.match(/\{\{\s*([^}]+?)\s*\}\}/g);
  if (!matches) return [];
  const fields = matches
    .map((m) => m.replace(/\{\{\s*|\s*\}\}/g, '').trim())
    .filter((f) => f.length > 0);
  return [...new Set(fields)];
}
