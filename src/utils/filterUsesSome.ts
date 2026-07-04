/**
 * Returns true when a Directus filter node traverses a to-many relation via
 * `_some` — the case where `COUNT(*)` counts the join product instead of
 * distinct items.
 *
 * Walks the full filter tree (arrays, plain objects) and checks every key
 * against the literal string `_some`. Other operator names that start with
 * `_some` (there are none in the current Directus schema, but guard against
 * false positives) do NOT match because the check is an exact equality test.
 */
export function filterUsesSome(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(filterUsesSome);
  if (node && typeof node === 'object') {
    return Object.entries(node).some(([key, value]) => key === '_some' || filterUsesSome(value));
  }
  return false;
}
