import { splitPathSegments, type DescribeHop, type HopKind } from './resolveRelationalPath';
import { createDescribeHop } from './describeHop';
import { stripLanguageSuffix } from './displayHeuristics';

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
 * parser: api/src/database/get-ast-from-query/lib/parse-fields.ts looks the
 * scoped subtree up by `${fieldKey}:${relatedCollection}` (v11.11.0 lines
 * 222 + 228) and feeds it back into the recursive parser — unchanged v9 →
 * main, verified live on 11.11.0 at depth 2. It is undocumented upstream, so
 * re-verify on major Directus upgrades. Emit `_limit` ONLY here: nested deep
 * with dynamic-variable filters is unreliable on 11.x (unawaited
 * sanitizeDeep recursion, directus/directus#27676, fixed in v12).
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

/**
 * Merge nested M2A deep entries (from `buildNestedM2ADeep`) into an existing
 * `deep` object: preserves each field's existing `_fields`/`_limit` and adds
 * the `item:<collection>` scope keys. A field absent from `deepFields` gets a
 * sensible M2A default (`{ _fields: ['*'], _limit: -1 }`). Mutates and returns
 * `deepFields`.
 */
export function mergeNestedM2ADeep(
  deepFields: Record<string, any>,
  nested: Record<string, Record<string, any>>
): Record<string, any> {
  for (const [fieldKey, scopes] of Object.entries(nested)) {
    deepFields[fieldKey] = {
      ...(deepFields[fieldKey] ?? { _fields: ['*'], _limit: -1 }),
      ...scopes,
    };
  }
  return deepFields;
}

/**
 * Store shapes buildDeep needs — only what `createDescribeHop` (and the
 * first-level `getField`) consume; mirrors describeHop.ts's private interfaces.
 */
interface FieldsStoreLike {
  getField: (
    collection: string | null,
    field: string
  ) => { meta?: { special?: string[] | null } | null } | null;
}
interface RelationsStoreLike {
  getRelationsForField: (
    collection: string,
    field: string
  ) =>
    | Array<{
        collection?: string;
        field?: string;
        related_collection?: string | null;
        meta?: { one_field?: string | null; junction_field?: string | null } | null;
      }>
    | null
    | undefined;
}

/**
 * Map a hop kind to its `deep` entry. A first-level to-many column renders ALL
 * its rows joined (EditableCellRelational), so it is fetched unbounded
 * (`_limit:-1`) — capping would silently truncate the displayed list; the same
 * policy the nested builder applies via `TO_MANY_KINDS`. Trade-off: a column on
 * a very large o2m/m2m relation fetches every row. To-one fetches all fields;
 * scalar/unknown (incl. an unhydrated-store throw, self-heals on recompute)
 * gets no entry.
 */
function deepEntryForKind(kind: HopKind): Record<string, any> | null {
  if (TO_MANY_KINDS.has(kind)) return { _fields: ['*'], _limit: -1 };
  if (kind === 'm2o' || kind === 'file') return { _fields: ['*'] };
  return null;
}

/**
 * Build the full `deep` parameter for the items request from ONE schema-driven
 * classifier. First-level entries (one per visible relational field, keyed by
 * its root segment) and the nested M2A entries are both derived via
 * `describeHop`, so there is a single source of truth for how a field maps to
 * its `deep` shape. `fields` are the raw visible columns; `expandedFields` are
 * the display-expanded set that carries the M2A `item:collection.path` tokens.
 * Returns undefined when no relational field needs a deep entry.
 */
export function buildDeep(
  fields: readonly string[],
  expandedFields: readonly string[],
  collection: string | null,
  fieldsStore: FieldsStoreLike,
  relationsStore: RelationsStoreLike
): Record<string, any> | undefined {
  const describeHop = createDescribeHop(fieldsStore, relationsStore);
  const deepFields: Record<string, any> = {};

  for (const field of fields) {
    const actualField = stripLanguageSuffix(field);
    // Key on the root segment: `translations.label` and `translations.title`
    // share one `translations` deep entry.
    const rootField = actualField.includes('.') ? actualField.split('.')[0]! : actualField;
    if (!rootField || !collection || deepFields[rootField]) continue;
    const entry = deepEntryForKind(describeHop(collection, rootField).kind);
    if (entry) deepFields[rootField] = entry;
  }

  mergeNestedM2ADeep(deepFields, buildNestedM2ADeep(expandedFields, describeHop));

  return Object.keys(deepFields).length > 0 ? deepFields : undefined;
}
