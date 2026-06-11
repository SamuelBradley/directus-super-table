/**
 * Pure helpers for syncing the native layout `search` prop with the internal
 * search-query ref. Extracted from super-table.vue so the (otherwise
 * component-bound) normalization rules are unit-testable.
 */

/**
 * Normalize the native `search` prop into the internal searchQuery model.
 * Directus core represents "no search" as null; the v-input model wants ''.
 */
export function normalizeIncomingSearch(value: string | null | undefined): string {
  return value ?? '';
}

/**
 * Normalize the internal searchQuery for the `update:search` emit: an
 * empty/whitespace-only query collapses to null, matching native search
 * semantics ("" is not a search).
 */
export function normalizeOutgoingSearch(value: string): string | null {
  return value.trim() === '' ? null : value;
}
