/**
 * Minimal subset of the Directus relations store needed by this helper.
 * Mirrors the pattern used in `src/utils/resolveTranslationsCollection.ts` so
 * consumers can be unit-tested without pulling in the full Pinia store.
 */
interface RelationsStoreLike {
  getRelationsForField: (
    collection: string,
    field: string
  ) =>
    | Array<{
        collection?: string;
        field?: string;
        meta?: {
          one_field?: string | null;
          one_collection_field?: string | null;
          one_allowed_collections?: string[] | null;
          junction_field?: string | null;
        } | null;
      }>
    | null
    | undefined;
}

interface FieldsStoreLike {
  getField: (
    collection: string,
    field: string
  ) =>
    | { meta?: { options?: { allowedCollections?: string[] | null } | null } | null }
    | null
    | undefined;
}

export interface M2ARelation {
  /** Junction FK column holding the polymorphic target (e.g. `item`). */
  itemField: string;
  /** Column naming each row's target collection (e.g. `collection`). */
  discriminator: string;
  /** Collections the relation may point at; empty when unconstrained. */
  allowedCollections: string[];
  /** The junction collection itself (e.g. `orders_treatment`), or null if unknown. */
  junctionCollection: string | null;
}

/** Default discriminator column name used by Directus M2A junctions. */
const DEFAULT_DISCRIMINATOR = 'collection';

/**
 * Resolve the M2A junction shape for a parent collection's M2A alias field.
 *
 * An M2A relation is stored on the junction with a `collection` discriminator
 * column and a type-erased `item` FK. The relation carrying
 * `meta.one_collection_field` is the polymorphic side; the sibling relation
 * (pointing back at the parent) carries `meta.junction_field` naming that same
 * FK column.
 *
 * When the user lacks read permission on a target collection, Directus drops
 * the polymorphic relation from the store, leaving only the parent relation.
 * In that case we reconstruct the shape from the parent relation's
 * `junction_field` plus the field's own `options.allowedCollections`, so a
 * restricted user still sees the collections they *can* read instead of an
 * empty column. `fieldsStore` is optional to preserve the original signature.
 *
 * @returns the junction shape, or `null` if it cannot be resolved
 */
export function resolveM2ARelation(
  parentCollection: string,
  fieldKey: string,
  relationsStore: RelationsStoreLike,
  fieldsStore?: FieldsStoreLike
): M2ARelation | null {
  let relations: ReturnType<RelationsStoreLike['getRelationsForField']>;
  try {
    relations = relationsStore.getRelationsForField(parentCollection, fieldKey);
  } catch {
    // The store can throw during unloaded states (e.g. early app boot).
    return null;
  }

  if (!relations || relations.length === 0) return null;

  // Preferred: the polymorphic relation carries the discriminator directly.
  const itemRel = relations.find((r) => r?.meta?.one_collection_field);
  if (itemRel?.field && itemRel.meta?.one_collection_field) {
    return {
      itemField: itemRel.field,
      discriminator: itemRel.meta.one_collection_field,
      allowedCollections: itemRel.meta.one_allowed_collections ?? [],
      junctionCollection: itemRel.collection ?? null,
    };
  }

  // Fallback: the polymorphic relation was permission-filtered out. The parent
  // relation still names the junction FK column via `junction_field`; the
  // allowed collections come from the field's interface options.
  const parentRel = relations.find((r) => r?.meta?.junction_field);
  const itemField = parentRel?.meta?.junction_field;
  if (!itemField) return null;

  const allowedCollections = readAllowedCollections(parentCollection, fieldKey, fieldsStore);
  return {
    itemField,
    discriminator: DEFAULT_DISCRIMINATOR,
    allowedCollections,
    junctionCollection: parentRel?.collection ?? null,
  };
}

function readAllowedCollections(
  parentCollection: string,
  fieldKey: string,
  fieldsStore?: FieldsStoreLike
): string[] {
  if (!fieldsStore) return [];
  try {
    const rootField = fieldKey.includes('.') ? (fieldKey.split('.')[0] as string) : fieldKey;
    const field = fieldsStore.getField(parentCollection, rootField);
    return field?.meta?.options?.allowedCollections ?? [];
  } catch {
    return [];
  }
}
