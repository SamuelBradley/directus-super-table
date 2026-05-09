import type { Field } from '@directus/types';

/**
 * Minimal subset of the Directus relations store needed by this helper.
 * Mirrors the pattern used in `src/utils/displayHeuristics.ts` so consumers
 * can be unit-tested without pulling in the full Pinia store.
 */
interface RelationsStoreLike {
  getRelationsForField: (
    collection: string,
    field: string
  ) =>
    | Array<{
        collection?: string;
        field?: string;
        related_collection?: string | null;
        meta?: {
          one_collection?: string | null;
          many_collection?: string | null;
          one_field?: string | null;
        } | null;
      }>
    | null
    | undefined;
}

interface FieldsStoreLike {
  getField: (collection: string | null, field: string) => Field | null | undefined;
}

/**
 * Resolve the translations collection name for a parent collection's
 * translations alias field.
 *
 * Why this is non-trivial:
 *
 * Directus stores the M2O relation from the *child* (translations) collection
 * to the *parent*. When we call
 *
 *     relationsStore.getRelationsForField(parent, 'translations')
 *
 * the returned relation object has:
 *
 *     relation.collection             = translations collection  (the "many" side)
 *     relation.related_collection     = parent collection         (the "one" side)
 *     relation.meta.many_collection   = translations collection  (canonical)
 *     relation.meta.one_collection    = parent collection
 *
 * We treat `meta.many_collection` as the canonical source: it is always the
 * side that *holds* the translation rows, independent of query direction.
 * `relation.collection` is a defensive fallback when meta is incomplete.
 *
 * Earlier versions of this codebase used `relation.related_collection ||
 * relation.collection`, which returned the parent collection. That bug was
 * masked by a hardcoded `commonTranslationFields` fallback in the call sites.
 * Both the buggy resolver and the hardcoded fallback are removed in favor of
 * this schema-authoritative implementation.
 *
 * @returns the translations collection name, or `null` if it cannot be resolved
 */
export function resolveTranslationsCollection(
  parentCollection: string,
  translationsFieldKey: string,
  relationsStore: RelationsStoreLike
): string | null {
  let relations: ReturnType<RelationsStoreLike['getRelationsForField']>;
  try {
    relations = relationsStore.getRelationsForField(parentCollection, translationsFieldKey);
  } catch {
    // The store can throw during unloaded states (e.g. early app boot).
    // Treat that as "not resolvable" rather than crashing the layout.
    return null;
  }

  if (!relations || relations.length === 0) return null;

  const relation = relations[0];
  return relation?.meta?.many_collection || relation?.collection || null;
}

/**
 * Resolve a translation sub-field's metadata from the actual schema.
 *
 * Replaces the previous inline implementations in `super-table.vue` and
 * `useTableFields.ts` that used a hardcoded `commonTranslationFields`
 * fallback (`name`, `title`, `description`, `content`, `subtitle`). The
 * fallback was a workaround for the wrong property-path described above —
 * with the corrected resolver, the schema can serve as the single source
 * of truth and edge cases like custom translation field names (`body`,
 * `slug`, `summary`, etc.) work correctly.
 *
 * @param fieldKey  e.g. `'translations.name'`, or `'i18n.title'` for renamed aliases
 * @returns the schema Field, or `null` if not resolvable / not a translation key
 */
export function getTranslationFieldMetadata(
  parentCollection: string,
  fieldKey: string,
  fieldsStore: FieldsStoreLike,
  relationsStore: RelationsStoreLike
): Field | null {
  if (!fieldKey.includes('.')) return null;

  const [translationsFieldKey, ...rest] = fieldKey.split('.');
  const subFieldName = rest.join('.');
  if (!translationsFieldKey || !subFieldName) return null;

  const translationsCollection = resolveTranslationsCollection(
    parentCollection,
    translationsFieldKey,
    relationsStore
  );
  if (!translationsCollection) return null;

  return fieldsStore.getField(translationsCollection, subFieldName) ?? null;
}
