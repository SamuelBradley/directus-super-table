type FilterValue = Record<string, unknown> | unknown[] | null;

export interface SanitizeResult {
  sanitized: FilterValue;
  removed: string[];
}

export interface SanitizeFilterOptions {
  /**
   * Maps a parent-field name (e.g. `translations`) to the collection its
   * sub-fields live in (e.g. `pages_translations`). When the walker descends
   * into a `_some`/`_none`/`_every` value under that field, sub-fields are
   * checked against the nested collection instead of the outer scope.
   */
  nestedScopes?: Record<string, string | undefined>;
}

const LOGICAL_KEYS = new Set(['_and', '_or']);
const RELATION_MATCH_OPS = new Set(['_some', '_none', '_every']);

/**
 * Walk a Directus filter tree and remove conditions on fields the caller
 * cannot read. `_and`/`_or` branches collapse when emptied. Relation match
 * operators (`_some`/`_none`/`_every`) descend into the configured nested
 * scope so e.g. `{ translations: { _some: { description: ... } } }` is
 * checked at both the parent level (`translations` readable?) and the
 * junction-collection level (`description` readable?). The `canRead`
 * callback receives the current `scope` (undefined = parent collection).
 */
export function sanitizeFilter(
  filter: FilterValue,
  canRead: (field: string, scope?: string) => boolean,
  options: SanitizeFilterOptions = {}
): SanitizeResult {
  const removed: string[] = [];
  const nestedScopes = options.nestedScopes ?? {};

  function isEmpty(node: FilterValue): boolean {
    if (node === null || node === undefined) return true;
    if (Array.isArray(node)) return node.length === 0;
    if (typeof node === 'object') return Object.keys(node).length === 0;
    return false;
  }

  function walk(node: FilterValue, scope?: string): FilterValue {
    if (node === null || node === undefined || typeof node !== 'object') return node;

    if (Array.isArray(node)) {
      return node
        .map((entry) => walk(entry as FilterValue, scope))
        .filter((entry) => !isEmpty(entry as FilterValue));
    }

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      // Logical: `_and` / `_or` — recurse into the array, same scope.
      if (LOGICAL_KEYS.has(key)) {
        const cleaned = walk(value as FilterValue, scope);
        if (Array.isArray(cleaned) && cleaned.length > 0) out[key] = cleaned;
        continue;
      }

      // Relation match: `_some` / `_none` / `_every` — recurse into the
      // single inner filter object, same scope (we are already inside the
      // relation; the parent established the scope before calling us).
      if (RELATION_MATCH_OPS.has(key)) {
        const cleaned = walk(value as FilterValue, scope);
        if (!isEmpty(cleaned)) out[key] = cleaned;
        continue;
      }

      // Other operators (`_eq`, `_icontains`, etc.) — leaf, passthrough.
      if (key.startsWith('_')) {
        out[key] = value;
        continue;
      }

      // Field name — check permission at the current scope.
      const rootField = key.split('.')[0];
      if (!canRead(rootField, scope)) {
        removed.push(key);
        continue;
      }

      // Field is allowed at this scope. Does traversing into its value
      // open a nested scope (e.g. translations → pages_translations)?
      const nestedScope = nestedScopes[rootField];
      if (nestedScope && value && typeof value === 'object' && !Array.isArray(value)) {
        const cleanedInner = walk(value as FilterValue, nestedScope);
        if (!isEmpty(cleanedInner)) {
          out[key] = cleanedInner;
        }
        // If the inner walk dropped everything, the parent's clause is
        // implicitly removed too. We do NOT push the parent to `removed[]`
        // because the parent itself was permitted — the user-visible
        // "removed fields" list contains the actual sub-fields that lost
        // access (already pushed by the inner walk).
        continue;
      }

      out[key] = value;
    }

    return Object.keys(out).length === 0 ? null : out;
  }

  return { sanitized: walk(filter), removed };
}
