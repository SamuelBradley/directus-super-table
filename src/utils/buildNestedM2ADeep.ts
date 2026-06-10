import { splitPathSegments, type DescribeHop } from './resolveRelationalPath';

/** Hop kinds whose value is an array the server pages with its default limit. */
const TO_MANY_KINDS = new Set(['o2m', 'm2m', 'm2a', 'files', 'translations']);

/**
 * Derive nested `deep` entries for expanded M2A item paths.
 *
 * `deep[<field>][_limit]=-1` only unbounds the junction rows; a to-many
 * relation *inside* the polymorphic item (e.g.
 * `treatment.item:service.translations.label`) stays capped at the server's
 * default page size unless it gets its own limit. For every to-many hop
 * crossed by such a path this returns the matching nested structure, e.g.
 * `{ treatment: { 'item:service': { translations: { _limit: -1 } } } }`,
 * ready to merge into the layout's deep object.
 *
 * The `item:<collection>` scope key is matched literally by the API's deep
 * parser (api/src/database/get-ast-from-query/lib/parse-fields.ts, unchanged
 * v9 → main) and recurses — verified live on 11.11.0 at depth 2. It is
 * undocumented upstream, so re-verify on major Directus upgrades. Emit
 * `_limit` ONLY here: nested deep with dynamic-variable filters is unreliable
 * on 11.x (unawaited sanitizeDeep recursion, directus/directus#27676,
 * fixed in v12).
 */
export function buildNestedM2ADeep(
  expandedFields: readonly string[],
  describeHop: DescribeHop
): Record<string, Record<string, any>> {
  const result: Record<string, Record<string, any>> = {};

  for (const fullPath of expandedFields) {
    const match = /^([^.:]+)\.([^.:]+):([^.:]+)\.(.+)$/.exec(fullPath);
    if (!match) continue;
    const fieldKey = match[1]!;
    const itemScope = `${match[2]!}:${match[3]!}`;
    const segments = splitPathSegments(match[4]!);

    let collection: string | null = match[3]!;
    for (let i = 0; i < segments.length && collection; i++) {
      const segment = segments[i]!;
      const hop = describeHop(collection, segment);
      if (TO_MANY_KINDS.has(hop.kind)) {
        const fieldEntry = (result[fieldKey] ??= {});
        let node: Record<string, any> = (fieldEntry[itemScope] ??= {});
        for (let j = 0; j < i; j++) node = node[segments[j]!] ??= {};
        node[segment] = { ...(node[segment] ?? {}), _limit: -1 };
      }
      collection = hop.relatedCollection ?? null;
    }
  }

  return result;
}
