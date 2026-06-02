import type { DescribeHop, HopInfo } from './resolveRelationalPath';

/**
 * Builds the schema-aware `describeHop` callback that `resolveRelationalPath`
 * uses to interpret each path segment. Kept as a factory over store-like
 * dependencies so the pure resolver stays testable and this glue stays thin.
 */

interface FieldsStoreLike {
  getField: (
    collection: string,
    field: string
  ) => { meta?: { special?: string[] | null } | null } | null;
}

interface RelationLike {
  collection?: string;
  field?: string;
  related_collection?: string | null;
  meta?: { one_field?: string | null; junction_field?: string | null } | null;
}

interface RelationsStoreLike {
  getRelationsForField: (collection: string, field: string) => RelationLike[] | null | undefined;
}

export function createDescribeHop(
  fieldsStore: FieldsStoreLike,
  relationsStore: RelationsStoreLike
): DescribeHop {
  return (collection: string, field: string): HopInfo => {
    let special: string[];
    let relations: RelationLike[];
    try {
      special = fieldsStore.getField(collection, field)?.meta?.special ?? [];
      relations = relationsStore.getRelationsForField(collection, field) ?? [];
    } catch {
      // Stores can throw during unloaded states (early app boot).
      return { kind: 'scalar' };
    }

    // Translations: the parent→junction relation carries `one_field === field`
    // and its `junction_field` is the language column (e.g. `languages_code`).
    if (special.includes('translations')) {
      const rel = relations.find((r) => r?.meta?.one_field === field) ?? relations[0];
      return {
        kind: 'translations',
        relatedCollection: rel?.collection ?? null,
        languageField: rel?.meta?.junction_field ?? null,
      };
    }

    if (special.includes('m2a')) return { kind: 'm2a', relatedCollection: null };
    if (special.includes('files')) return { kind: 'files', relatedCollection: 'directus_files' };

    // M2O / single file: this collection owns the FK pointing at the related one.
    const owned = relations.find(
      (r) => r?.collection === collection && r?.field === field && r?.related_collection
    );
    if (
      special.includes('m2o') ||
      (owned && !special.includes('o2m') && !special.includes('m2m'))
    ) {
      const kind = special.includes('file') ? 'file' : 'm2o';
      return { kind, relatedCollection: owned?.related_collection ?? null };
    }
    if (special.includes('file')) return { kind: 'file', relatedCollection: 'directus_files' };

    // To-many: O2M / M2M. The related collection is the junction's own collection
    // (the array elements); deeper traversal past the first element is best-effort.
    if (special.includes('m2m') || special.includes('o2m')) {
      const rel = relations[0];
      return {
        kind: special.includes('m2m') ? 'm2m' : 'o2m',
        relatedCollection: rel?.collection ?? null,
      };
    }

    return { kind: 'scalar' };
  };
}
