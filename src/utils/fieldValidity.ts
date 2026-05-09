/**
 *
 * Layouts persist field references in `layoutQuery.fields` and `layoutQuery.sort`.
 * When a referenced field is deleted from the collection, the saved reference is
 * stale and the API rejects the query (HTTP 403). These helpers identify stale
 * references so the layout can drop them at read-time without mutating the saved
 * preset — if the field is recreated later, the column/sort comes back.
 */

interface FieldsStoreLike {
  getField: (collection: string | null, field: string) => unknown;
}

/**
 * Strip layout-specific decorations from a field key to get the field path
 * Directus knows about:
 *   "translations.description:de-DE"  → "translations.description"
 *   "-translations.description:de-DE" → "translations.description"  (sort desc prefix)
 *   "title"                           → "title"
 *
 * @param key Raw field reference as stored in layoutQuery
 * @param stripSortPrefix Whether a leading "-" should be stripped (sort entries)
 */
function normalizeFieldKey(key: string, stripSortPrefix: boolean): string {
  let normalized = key;
  if (stripSortPrefix && normalized.startsWith('-')) {
    normalized = normalized.substring(1);
  }
  if (normalized.includes(':')) {
    normalized = normalized.split(':')[0] ?? '';
  }
  return normalized;
}

/**
 * Returns true when the field reference can still be resolved against the
 * current collection schema. Dotted notation (relations, translations) is
 * accepted as long as the root field exists on the parent collection.
 */
export function isFieldValid(
  fieldKey: string | null | undefined,
  collection: string | null,
  fieldsStore: FieldsStoreLike
): boolean {
  if (!fieldKey || typeof fieldKey !== 'string' || !collection) return false;

  const normalized = normalizeFieldKey(fieldKey, false);
  const rootField = normalized.split('.')[0];
  if (!rootField) return false;

  return !!fieldsStore.getField(collection, rootField);
}

/**
 * Same as isFieldValid, but accepts the leading "-" used in sort entries to
 * indicate descending order.
 */
export function isSortFieldValid(
  sortEntry: string | null | undefined,
  collection: string | null,
  fieldsStore: FieldsStoreLike
): boolean {
  if (!sortEntry || typeof sortEntry !== 'string' || !collection) return false;

  const normalized = normalizeFieldKey(sortEntry, true);
  const rootField = normalized.split('.')[0];
  if (!rootField) return false;

  return !!fieldsStore.getField(collection, rootField);
}

/**
 * Returns the input array with stale field references removed. Returns an empty
 * array (never null/undefined) so callers can safely fall back to defaults when
 * everything was filtered out.
 */
export function filterValidFields(
  fields: readonly string[] | null | undefined,
  collection: string | null,
  fieldsStore: FieldsStoreLike
): string[] {
  if (!fields || fields.length === 0) return [];
  return fields.filter((f) => isFieldValid(f, collection, fieldsStore));
}

/**
 * Same as filterValidFields, but for sort entries (handles "-" desc prefix).
 */
export function filterValidSort(
  sortEntries: readonly string[] | null | undefined,
  collection: string | null,
  fieldsStore: FieldsStoreLike
): string[] {
  if (!sortEntries || sortEntries.length === 0) return [];
  return sortEntries.filter((s) => isSortFieldValid(s, collection, fieldsStore));
}

/**
 * Issue #48: drop columnDisplays entries pointing at fields that have been
 * deleted from the collection. Mirrors filterValidFields / filterValidSort.
 */
export function filterValidColumnDisplays<T>(
  columnDisplays: Record<string, T> | null | undefined,
  collection: string | null,
  fieldsStore: FieldsStoreLike
): Record<string, T> {
  if (!columnDisplays || !collection) return {};
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(columnDisplays)) {
    if (isFieldValid(key, collection, fieldsStore)) {
      result[key] = value;
    }
  }
  return result;
}
