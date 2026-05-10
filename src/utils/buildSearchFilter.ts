import type { Field, Filter } from '@directus/types';
import { resolveTranslationsCollection } from './resolveTranslationsCollection';

/**
 * Minimal subset of the Directus fields store that this helper depends on.
 * Mirrors the pattern used in `src/utils/displayHeuristics.ts` so consumers
 * can be unit-tested without pulling in the full Pinia store.
 */
interface FieldsStoreLike {
  getField: (collection: string | null, field: string) => Field | null | undefined;
  /** Optional — used to enumerate searchable columns of a translations collection. */
  getFieldsForCollection?: (collection: string) => Field[] | null | undefined;
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
        meta?: {
          one_collection?: string | null;
          many_collection?: string | null;
          one_field?: string | null;
        } | null;
      }>
    | null
    | undefined;
}

export interface BuildSearchFilterArgs {
  /** The user's raw search input. Empty/whitespace returns null. */
  query: string;
  /** Currently configured (visible) field keys, may include language suffixes (`field:de-DE`) and dot-notation (`translations.name`). */
  visibleFields: string[];
  /** All fields of the collection, used as a fallback search scope when no visible field produces a clause. */
  fieldsInCollection: Field[];
  /** Parent collection name. */
  collection: string;
  fieldsStore: FieldsStoreLike;
  /** Optional — required for top-level translations alias search to work. */
  relationsStore?: RelationsStoreLike;
}

const SEARCHABLE_TEXT_TYPES = ['string', 'text'] as const;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

function isValidInteger(value: string): boolean {
  return /^\d+$/.test(value);
}

/**
 * Build a Directus filter for the user's search input.
 *
 * Replaces Directus' native `?search=` parameter with an explicit `_or` filter
 * because the native parameter cannot reach across translations and other
 * relational targets that this layout commonly exposes.
 *
 * Behavior overview:
 *
 *   1. Visible-field pass (per layout configuration)
 *      - `translations.<sub>`  → `{ translations: { _some: { <sub>: { _icontains } } } }`
 *      - other dot-notation    → `{ <fieldKey>: { _icontains } }`
 *      - top-level translations alias (issue #24 Sub-Bug B fix):
 *          One outer-_or clause per searchable column:
 *          `{ <aliasField>: { _some: { <col1>: { _icontains } } } }`,
 *          `{ <aliasField>: { _some: { <col2>: { _icontains } } } }`, …
 *          (We deliberately do NOT wrap them in a single `_some._or` because
 *          Directus' query parser does not evaluate `_or` inside `_some`
 *          correctly — it returns all rows.)
 *          Detected via `field.meta.special.includes('translations')`, so it
 *          works for any alias name (e.g. `translations`, `i18n`, `localizations`).
 *      - direct string/text    → `{ <fieldKey>: { _icontains } }`
 *      - direct uuid + valid UUID input → `{ <fieldKey>: { _eq } }`
 *      - direct integer + numeric input → `{ <fieldKey>: { _eq } }`
 *
 *   2. Hidden-field pass — cumulative (issue #24 Sub-Bug A fix)
 *      Runs ALWAYS in addition to the visible pass, not only when the visible
 *      pass yielded nothing. Fields already covered by the visible pass are
 *      skipped via `processedFields` so duplicates do not occur. This makes
 *      the layout's search match the broad coverage of Directus' native
 *      `?search=` parameter, which scans all string/text columns regardless
 *      of which are visible in the layout.
 *      - All string/text fields with `meta.hidden !== true`
 *      - UUID fields when input is a valid UUID
 *      - Integer fields when input is numeric
 *
 * @returns a filter `{ _or: [...] }` or `null` if no clauses were produced
 */
export function buildSearchFilter(args: BuildSearchFilterArgs): Filter | null {
  const { query, visibleFields, fieldsInCollection, collection, fieldsStore, relationsStore } =
    args;

  if (!query || query.trim() === '') return null;

  const searchValue = query.trim();
  const conditions: Filter[] = [];
  const processedFields = new Set<string>();

  const searchIsUUID = isValidUUID(searchValue);
  const searchIsInteger = isValidInteger(searchValue);
  const searchAsInteger = searchIsInteger ? parseInt(searchValue, 10) : null;

  // Visible-field pass
  visibleFields.forEach((fieldKey: string) => {
    // Strip language suffix (e.g. `translations.description:de-DE` → `translations.description`)
    const actualFieldKey = fieldKey.includes(':') ? fieldKey.split(':')[0]! : fieldKey;

    // Avoid duplicate clauses across multi-language configurations
    if (processedFields.has(actualFieldKey)) return;
    processedFields.add(actualFieldKey);

    if (actualFieldKey.includes('.')) {
      const parts = actualFieldKey.split('.');
      const rootField = parts[0]!;
      const nestedField = parts.slice(1).join('.');

      if (rootField === 'translations') {
        // Search across ALL languages so users can find content regardless of the
        // currently displayed language column.
        conditions.push({
          translations: {
            _some: {
              [nestedField]: { _icontains: searchValue },
            },
          },
        });
      } else {
        conditions.push({
          [actualFieldKey]: { _icontains: searchValue },
        });
      }
      return;
    }

    const field = fieldsStore.getField(collection, actualFieldKey);
    if (!field) return;

    // Top-level translations alias — issue #24 Sub-Bug B fix.
    // Detect via `meta.special` so renamed aliases (e.g. `i18n`, `localizations`)
    // work too, not only the literal field name `translations`.
    if (isTranslationsAlias(field) && relationsStore) {
      const translationsClauses = buildTranslationsClauses(
        collection,
        actualFieldKey,
        searchValue,
        fieldsStore,
        relationsStore
      );
      conditions.push(...translationsClauses);
      return;
    }

    if (SEARCHABLE_TEXT_TYPES.includes(field.type as (typeof SEARCHABLE_TEXT_TYPES)[number])) {
      conditions.push({ [actualFieldKey]: { _icontains: searchValue } });
    } else if (field.type === 'uuid' && searchIsUUID) {
      conditions.push({ [actualFieldKey]: { _eq: searchValue } });
    } else if (field.type === 'integer' && searchIsInteger) {
      conditions.push({ [actualFieldKey]: { _eq: searchAsInteger } });
    }
    // UUID/integer fields with mismatched input formats are skipped because
    // they only support _eq comparisons in Directus, not _icontains.
  });

  // Cumulative hidden-field pass — also covers columns the user has not added
  // to the layout. Fields already handled in the visible pass are skipped via
  // `processedFields`, so we never emit duplicate clauses.
  fieldsInCollection.forEach((field: Field) => {
    if (processedFields.has(field.field)) return;
    if (field.meta?.hidden === true) return;

    if (SEARCHABLE_TEXT_TYPES.includes(field.type as (typeof SEARCHABLE_TEXT_TYPES)[number])) {
      conditions.push({ [field.field]: { _icontains: searchValue } });
      processedFields.add(field.field);
    } else if (field.type === 'uuid' && searchIsUUID) {
      conditions.push({ [field.field]: { _eq: searchValue } });
      processedFields.add(field.field);
    } else if (field.type === 'integer' && searchIsInteger) {
      conditions.push({ [field.field]: { _eq: searchAsInteger } });
      processedFields.add(field.field);
    }
  });

  return conditions.length > 0 ? ({ _or: conditions } as Filter) : null;
}

function isTranslationsAlias(field: Field): boolean {
  const special = field.meta?.special;
  return Array.isArray(special) && special.includes('translations');
}

/**
 * A field of the translations collection is searchable when it carries text
 * content the user actually authors. We exclude:
 *   - non-text types (integer/uuid PKs, dates, booleans, etc.)
 *   - hidden fields (per `meta.hidden`)
 *   - M2O relation fields (e.g. `<parent>_id`, `languages_code`)
 *   - schema-level foreign keys, in case `meta.special` is missing
 */
function isSearchableTranslationField(field: Field): boolean {
  if (!SEARCHABLE_TEXT_TYPES.includes(field.type as (typeof SEARCHABLE_TEXT_TYPES)[number])) {
    return false;
  }
  if (field.meta?.hidden === true) return false;

  const special = field.meta?.special;
  if (Array.isArray(special) && special.includes('m2o')) return false;

  // Defensive: even when `special` is missing, the schema can tell us a column is a FK.
  if (field.schema && (field.schema as { foreign_key_table?: string | null }).foreign_key_table) {
    return false;
  }

  return true;
}

/**
 * Build one outer-`_or` clause per searchable text field of the translations
 * collection — each clause is a self-contained `{ <alias>: { _some: { <col>: ... } } }`.
 *
 * IMPORTANT: We deliberately do NOT consolidate into a single
 * `{ <alias>: { _some: { _or: [...] } } }` because Directus' query parser
 * does not evaluate `_or` correctly inside `_some` — it ends up matching
 * every row. The top-level-OR construction is verified to work both
 * for "find any" semantics and as a SQL EXISTS join.
 *
 * Returns an empty array when:
 *   - getFieldsForCollection is not available (incomplete store mock)
 *   - the translations collection cannot be resolved (schema not loaded)
 *   - the translations collection has no searchable text columns
 */
function buildTranslationsClauses(
  parentCollection: string,
  aliasFieldKey: string,
  searchValue: string,
  fieldsStore: FieldsStoreLike,
  relationsStore: RelationsStoreLike
): Filter[] {
  if (!fieldsStore.getFieldsForCollection) return [];

  const translationsCollection = resolveTranslationsCollection(
    parentCollection,
    aliasFieldKey,
    relationsStore
  );
  if (!translationsCollection) return [];

  const translationFields = fieldsStore.getFieldsForCollection(translationsCollection) ?? [];
  const clauses: Filter[] = [];
  for (const field of translationFields) {
    if (!isSearchableTranslationField(field)) continue;
    clauses.push({
      [aliasFieldKey]: { _some: { [field.field]: { _icontains: searchValue } } },
    } as Filter);
  }
  return clauses;
}
