// CORE CHANGES - Following original Directus approach
import { useStores, useCollection } from '@directus/extensions-sdk';
import type { ColumnDisplay } from '../composables/useColumnDisplays';
import { parseTemplateTokens, isRelational, pickHeuristic } from './displayHeuristics';

/**
 * Helper function to get the related collection for a field
 */
function getRelatedCollection(
  parentCollection: string,
  fieldName: string,
  relationsStore: any
): string | null {
  try {
    const relations = relationsStore.getRelationsForField(parentCollection, fieldName);
    if (relations?.[0]) {
      return relations[0].related_collection || relations[0].collection;
    }
  } catch {
    // Relations not available
  }
  return null;
}

/**
 * Check if a field exists in a collection
 */
function fieldExists(collection: string, fieldName: string, fieldsStore: any): boolean {
  try {
    return !!fieldsStore.getField(collection, fieldName);
  } catch {
    return false;
  }
}

/**
 * Check if a collection is a native Directus system collection
 */
function isNativeDirectusCollection(collectionName: string | null): boolean {
  return collectionName?.startsWith('directus_') ?? false;
}

/**
 * Get the primary key field name for a collection
 * Falls back to 'id' if collection is not found or primary key cannot be determined
 */
function getPrimaryKeyForCollection(collectionName: string | null): string {
  if (!collectionName) {
    return 'id';
  }

  try {
    const { primaryKeyField } = useCollection(collectionName);
    if (primaryKeyField?.value?.field) {
      return primaryKeyField.value.field;
    }
  } catch {
    // useCollection failed, use fallback
  }

  // Fallback to 'id' for unknown collections
  return 'id';
}

/**
 * Get display fields for file-based displays (image, file)
 * Validates title field existence in directus_files before adding
 */
function getFileDisplayFields(
  fieldKey: string,
  additionalFields: string[],
  fieldsStore: any
): string[] {
  // directus_files always uses 'id' as primary key (system collection)
  const pkField = getPrimaryKeyForCollection('directus_files');
  const baseFields = [pkField, 'type'];
  const titleField = fieldExists('directus_files', 'title', fieldsStore) ? ['title'] : [];
  const allFields = [...baseFields, ...titleField, ...additionalFields];
  return allFields.map((f) => `${fieldKey}.${f}`);
}

/**
 * Get display fields for relational fields (m2o, o2m, m2m, etc.)
 * Implements three-tier validation strategy:
 * 1. Translations: Return null (handled by deep parameter)
 * 2. Native Directus collections: Validate each standard field
 * 3. Custom collections: Only request safe id field
 */
function getDisplayFieldsForRelation(
  field: any,
  fieldKey: string,
  parentCollection: string,
  fieldsStore: any,
  relationsStore: any
): string[] | null {
  // Special case: translations - schemas vary widely, use deep parameter
  if (field?.meta?.special?.includes('translations')) {
    return null; // Let deep parameter with _fields: ['*'] handle it
  }

  const fieldName = (field.field || field.key)?.split('.')[0];
  const relatedCollection = getRelatedCollection(parentCollection, fieldName, relationsStore);

  if (!relatedCollection) {
    return null; // Can't determine collection - return field as-is
  }

  // Get the primary key field for the related collection
  const pkField = getPrimaryKeyForCollection(relatedCollection);

  // Native Directus collections: Try standard fields with validation
  if (isNativeDirectusCollection(relatedCollection)) {
    const standardFields = [pkField, 'status', 'title', 'name'];
    const existingFields = standardFields
      .filter((f) => fieldExists(relatedCollection, f, fieldsStore))
      .map((f) => `${fieldKey}.${f}`);

    // Fallback to primary key if no standard fields exist
    return existingFields.length > 0 ? existingFields : [`${fieldKey}.${pkField}`];
  }

  // Custom collections: Conservative approach - only request primary key
  return [`${fieldKey}.${pkField}`];
}

/**
 * Issue #55: Single source of truth for expanding template tokens into API
 * field paths. Handles three relation classes:
 *
 *   M2M           → fieldKey.<junction_field>.<token>   (e.g. product_tags.tag_id.name)
 *   M2O / O2M     → fieldKey.<token>                     (e.g. author.first_name)
 *   translations  → fieldKey.<token>                     (deep parameter handles depth)
 *
 * Tokens that do not resolve to a real field on the actual *target* collection
 * are dropped, so we never enqueue `${junction}.name` for a junction without
 * a `name` column. Translations skip validation because schemas vary and the
 * existing client-side render path resolves missing fields gracefully.
 *
 * For dotted tokens (e.g. "category.name") only the first segment is validated;
 * the rest is forwarded verbatim. If the user's M2M template already starts
 * with the junction_field (e.g. {{tag_id.name}}), the junction prefix is NOT
 * duplicated.
 */
export function expandTokensThroughRelation(
  field: { meta?: { special?: string[] } } | null,
  fieldKey: string,
  parentCollection: string,
  tokens: string[],
  fieldsStore: { getField: (collection: string, fieldName: string) => any },
  relationsStore: { getRelationsForField: (collection: string, fieldName: string) => any[] }
): string[] {
  if (!tokens.length) return [];
  const isM2M = field?.meta?.special?.includes('m2m') === true;
  const isTranslations = field?.meta?.special?.includes('translations') === true;

  if (isTranslations) {
    return tokens.map((tok) => `${fieldKey}.${tok}`);
  }

  if (isM2M) {
    const relations = relationsStore.getRelationsForField(parentCollection, fieldKey);
    const rel = relations?.[0];
    const junctionField = rel?.meta?.junction_field as string | undefined;
    const junctionCollection = rel?.collection as string | undefined;
    if (!junctionField || !junctionCollection) {
      return [];
    }
    const junctionFieldDef = fieldsStore.getField(junctionCollection, junctionField);
    const targetCollection = junctionFieldDef?.schema?.foreign_key_table as
      | string
      | undefined;
    if (!targetCollection) return [];

    const expanded: string[] = [];
    for (const tok of tokens) {
      const parts = tok.split('.');
      // If user wrote the junction_field as the first segment already, strip it
      // so we don't double-prefix.
      const tokWithoutJunctionPrefix =
        parts[0] === junctionField ? parts.slice(1).join('.') : tok;
      if (!tokWithoutJunctionPrefix) continue;
      const firstSegment = tokWithoutJunctionPrefix.split('.')[0]!;
      if (!fieldsStore.getField(targetCollection, firstSegment)) continue;
      expanded.push(`${fieldKey}.${junctionField}.${tokWithoutJunctionPrefix}`);
    }
    return expanded;
  }

  // M2O / O2M / files: direct paths, validated against related_collection.
  const relations = relationsStore.getRelationsForField(parentCollection, fieldKey);
  const rel = relations?.[0];
  const target =
    (rel?.related_collection as string | undefined) ?? (rel?.collection as string | undefined);
  if (!target) {
    // Best-effort: return as-is when we have no target info to validate against.
    return tokens.map((tok) => `${fieldKey}.${tok}`);
  }

  const expanded: string[] = [];
  for (const tok of tokens) {
    const firstSegment = tok.includes('.') ? (tok.split('.')[0] as string) : tok;
    if (!fieldsStore.getField(target, firstSegment)) continue;
    expanded.push(`${fieldKey}.${tok}`);
  }
  return expanded;
}

/**
 * Adjusts fields based on their display configuration, following the original Directus pattern.
 * This function replicates the core logic from Directus core for proper display field resolution.
 * Enhanced with field existence validation to prevent requesting non-existent fields.
 */
// Module-level store cache. `useStores()` only works inside an active Vue
// setup context. When `adjustFieldsForDisplays` is invoked from a reactive
// recomputation (e.g. our `aliasedFields` computed reruns after columnDisplays
// changes), the call may be outside the setup window — useStores() throws and
// the function would otherwise fall back to returning the raw input fields,
// which silently drops all path-expansion (override / heuristic / display).
// We capture the singleton stores on the first successful call and reuse them.
let cachedFieldsStore: any = null;
let cachedRelationsStore: any = null;

function ensureStores(): { fieldsStore: any; relationsStore: any } {
  if (cachedFieldsStore && cachedRelationsStore) {
    return { fieldsStore: cachedFieldsStore, relationsStore: cachedRelationsStore };
  }
  try {
    const { useFieldsStore, useRelationsStore } = useStores();
    cachedFieldsStore = useFieldsStore();
    cachedRelationsStore = useRelationsStore();
  } catch {
    /* stores not yet available — caller falls back to returning raw fields */
  }
  return { fieldsStore: cachedFieldsStore, relationsStore: cachedRelationsStore };
}

export function adjustFieldsForDisplays(
  fields: readonly string[],
  parentCollection: string,
  overrides: Record<string, ColumnDisplay> = {}
): string[] {
  const { fieldsStore, relationsStore } = ensureStores();
  if (!fieldsStore) return [...fields];

  const adjustedFields: string[] = fields
    .map((fieldKey) => {
      // Issue #48: Override branch
      //
      // Storage normalization: layoutOptions.columnDisplays uses the *root* key
      // (translations.title), but layoutQuery.fields entries can carry a language
      // suffix (translations.title:de-DE). Strip the suffix before lookup so a
      // single override applies to every language column for the same root field.
      const storageKey = fieldKey.includes(':') ? fieldKey.split(':')[0] : fieldKey;
      const override = overrides[storageKey];
      if (override?.template) {
        const tokens = parseTemplateTokens(override.template);
        if (tokens.length === 0) return fieldKey;

        const fieldDef = fieldsStore.getField(parentCollection, fieldKey);

        // Plain field: tokens are already resolved at the parent level — return fieldKey
        // (the template references the field's own value; no path expansion needed).
        if (!isRelational(fieldDef)) {
          return fieldKey;
        }

        // M2M: paths must traverse the junction's junction_field.
        const isM2M = fieldDef?.meta?.special?.includes('m2m');
        if (isM2M) {
          const relations = relationsStore?.getRelationsForField(parentCollection, fieldKey);
          const junctionField = relations?.[0]?.meta?.junction_field;
          if (junctionField) {
            return tokens.map((tok) => `${fieldKey}.${junctionField}.${tok}`);
          }
          return [`${fieldKey}.${tokens[0]}`]; // best-effort fallback
        }

        // M2O / O2M / files: direct dotted paths
        return tokens.map((tok) => `${fieldKey}.${tok}`);
      }

      // Heuristic branch (Issue #48): when no override exists, the field is
      // relational, AND no field-settings display is configured, derive a sensible
      // template via pickHeuristic and expand API paths the same way as override.
      const fieldDefForHeuristic = fieldsStore.getField(parentCollection, fieldKey);
      if (
        fieldDefForHeuristic &&
        !fieldDefForHeuristic.meta?.display &&
        isRelational(fieldDefForHeuristic) &&
        !fieldDefForHeuristic.meta?.special?.includes('translations')
      ) {
        const heuristicTemplate = relationsStore
          ? pickHeuristic(fieldDefForHeuristic, relationsStore as any, fieldsStore as any)
          : null;
        if (heuristicTemplate) {
          const heuristicTokens = parseTemplateTokens(heuristicTemplate);
          if (heuristicTokens.length > 0) {
            const isM2M = fieldDefForHeuristic.meta?.special?.includes('m2m');
            if (isM2M) {
              const relations = relationsStore?.getRelationsForField(parentCollection, fieldKey);
              const junctionField = relations?.[0]?.meta?.junction_field;
              if (junctionField) {
                return heuristicTokens.map((tok) => `${fieldKey}.${junctionField}.${tok}`);
              }
              return [`${fieldKey}.${heuristicTokens[0]}`];
            }
            return heuristicTokens.map((tok) => `${fieldKey}.${tok}`);
          }
        }
      }

      const field = fieldsStore.getField(parentCollection, fieldKey);

      if (!field) return fieldKey;
      if (field.meta?.display === null) return fieldKey;

      // Get the display definition - this is where the magic happens!
      const displayId = field.meta?.display;
      if (!displayId) return fieldKey;

      // Get display-specific fields based on display type
      let displayFields: string[] | null = null;

      try {
        // Handle different display types with their specific field requirements
        switch (displayId) {
          case 'related-values': {
            // For related-values, we need fields for the template
            const template = field.meta?.display_options?.template;
            if (template) {
              // Parse template to extract field requirements
              const templateFields = extractFieldsFromTemplate(template);
              displayFields = templateFields.map((f) => `${fieldKey}.${f}`);
            } else {
              // Default fields for related-values without template
              // Get the primary key of the related collection
              const fieldName = fieldKey.split('.')[0];
              const relatedCollection = getRelatedCollection(
                parentCollection,
                fieldName,
                relationsStore
              );
              const pkField = getPrimaryKeyForCollection(relatedCollection);
              displayFields = [`${fieldKey}.${pkField}`];
            }
            break;
          }
          case 'image': {
            // Image display needs id, type, title (if exists), filename, dimensions
            displayFields = getFileDisplayFields(
              fieldKey,
              ['filename_download', 'width', 'height'],
              fieldsStore
            );
            break;
          }
          case 'file': {
            // File display needs id, type, title (if exists), filename, size
            displayFields = getFileDisplayFields(
              fieldKey,
              ['filename_download', 'filesize'],
              fieldsStore
            );
            break;
          }
          case 'user': {
            // User display needs these specific fields
            // directus_users has standard schema, but validate avatar field
            const userPkField = getPrimaryKeyForCollection('directus_users');
            displayFields = [
              `${fieldKey}.${userPkField}`,
              `${fieldKey}.email`,
              `${fieldKey}.first_name`,
              `${fieldKey}.last_name`,
            ];

            // Only add avatar if it exists
            if (fieldExists('directus_users', 'avatar', fieldsStore)) {
              // Avatar references directus_files
              const avatarPkField = getPrimaryKeyForCollection('directus_files');
              displayFields.push(`${fieldKey}.avatar.${avatarPkField}`);
            }
            break;
          }
          default: {
            // For other display types, try to get fields from display definition
            // This is a fallback that covers most relational fields
            const isRelational = field?.meta?.special?.some((s: string) =>
              ['m2o', 'm2m', 'o2m', 'files', 'translations'].includes(s)
            );

            if (isRelational && relationsStore) {
              displayFields = getDisplayFieldsForRelation(
                field,
                fieldKey,
                parentCollection,
                fieldsStore,
                relationsStore
              );
            }
            break;
          }
        }
      } catch {
        // If display field resolution fails, continue with original field
        return fieldKey;
      }

      if (displayFields) {
        return displayFields.map((displayField) => {
          // Handle special cases like thumbnails for files
          if (displayField.includes('$thumbnail') && field.collection === 'directus_files') {
            return displayField
              .split('.')
              .filter((part) => part !== '$thumbnail')
              .join('.');
          }
          return displayField;
        });
      }

      return fieldKey;
    })
    .flat();

  return adjustedFields;
}

/**
 * Extracts field names from a display template string
 * This is a simplified version of the template parser
 */
function extractFieldsFromTemplate(template: string): string[] {
  if (!template) return [];

  const fieldMatches = template.match(/\{\{([^}]+)\}\}/g);
  if (!fieldMatches) return [];

  return fieldMatches
    .map((match) => match.replace(/\{\{|\}\}/g, '').trim())
    .filter((field) => field && !field.includes('(') && !field.includes(')'))
    .map((field) => field.split('.').pop() || field); // Get the last part for nested fields
}
