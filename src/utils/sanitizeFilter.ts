type FilterValue = Record<string, unknown> | unknown[] | null;

export interface SanitizeResult {
  sanitized: FilterValue;
  removed: string[];
}

export interface SanitizeFilterOptions {
  /**
   * Map from a parent-field name to the collection it nests into.
   * When the walker traverses into the value of a field listed here,
   * inner field names will be checked against the nested collection's
   * permissions instead of the outer scope.
   *
   * Example: `{ translations: 'pages_translations' }`
   *  - Top-level `translations` is checked against the parent collection.
   *  - Sub-fields inside relation match operators (`_some`, `_none`, `_every`)
   *    are checked against `pages_translations`.
   */
  nestedScopes?: Record<string, string | undefined>;
}

const LOGICAL_KEYS = new Set(['_and', '_or']);
const RELATION_MATCH_OPS = new Set(['_some', '_none', '_every']);

/**
 * Walk a Directus filter tree and remove conditions that reference fields
 * the caller can't read. Logical operators (`_and`, `_or`) collapse if all
 * their branches are dropped. Relation match operators (`_some`, `_none`,
 * `_every`) recurse into a nested scope when configured via `nestedScopes`,
 * so e.g. `{ translations: { _some: { description: ... } } }` is checked
 * both at the parent level (translations field readable?) and at the
 * junction collection level (description field readable?).
 *
 * The `canRead` callback receives `(field, scope?)`. When `scope` is
 * undefined, the caller should check against the outer/parent collection.
 * When `scope` is set (matches a value from `nestedScopes`), the caller
 * should check against that collection.
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
