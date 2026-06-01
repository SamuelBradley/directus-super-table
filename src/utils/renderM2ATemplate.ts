import { get } from '@directus/utils';
import { parseM2AToken, isM2APrefix } from './displayHeuristics';

/** Conventional M2A token aliases accepted alongside the resolved field names. */
export const M2A_COLLECTION_TOKEN = 'collection';

/**
 * Render one M2A junction row against a related-values template.
 *
 * `{{collection}}` resolves from the discriminator; `{{item:col.path}}` resolves
 * only when the row points at `col`. Shares `parseM2AToken` with the query-side
 * expander so the two cannot drift.
 */
export function renderM2ATemplate(
  row: Record<string, any> | null | undefined,
  template: string,
  itemField: string,
  discriminator: string,
  fieldName: string
): string {
  if (!row || typeof row !== 'object') return '—';
  const rowCollection = row[discriminator];
  const item = row[itemField];

  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawToken: string) => {
    const token = String(rawToken).trim();
    if (token === discriminator || token === M2A_COLLECTION_TOKEN) {
      return rowCollection != null ? String(rowCollection) : '';
    }

    const parsed = parseM2AToken(token);
    if (parsed) {
      if (!isM2APrefix(parsed.prefix, fieldName, itemField)) return '';
      // Only the branch matching this row's collection contributes a value.
      if (parsed.collection !== rowCollection) return '';
      return scalarOrEmpty(getNestedValue(item, parsed.path));
    }

    return scalarOrEmpty(getNestedValue(item, token));
  });
}

/**
 * Resolve a dotted path, skipping Directus `$`-prefixed virtual segments
 * (e.g. `$thumbnail`) before delegating to the shared `get` helper.
 */
function getNestedValue(source: any, path: string): any {
  const cleaned = path
    .split('.')
    .filter((segment) => !segment.startsWith('$'))
    .join('.');
  return get(source, cleaned);
}

/** Tokens render scalars only; objects/arrays collapse to '' to avoid "[object Object]". */
function scalarOrEmpty(value: any): string {
  return value != null && typeof value !== 'object' ? String(value) : '';
}
