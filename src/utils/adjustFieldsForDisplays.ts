// CORE CHANGES - Following original Directus approach
import { useStores, useCollection } from '@directus/extensions-sdk';
import type { ColumnDisplay } from '../composables/useColumnDisplays';
import {
  parseTemplateTokens,
  isRelational,
  isM2A,
  pickHeuristic,
  parseM2AToken,
  buildM2AFieldPath,
  isM2APrefix,
  stripM2AFieldPrefix,
  splitLanguageSuffix,
  stripLanguageSuffix,
  M2A_COLLECTION_TOKEN,
} from './displayHeuristics';
import { resolveM2ARelation } from './resolveM2ARelation';
import { createDescribeHop } from './describeHop';
import { collectTranslationLanguagePaths } from './resolveRelationalPath';
import { validateDeepPath } from './fieldValidity';
import { warnOnce } from './warnOnce';

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

function isSystemUserAuditField(field: any, fieldKey: string): boolean {
  const rootField = fieldKey.split('.')[0];
  const fieldName = field?.field || rootField;
  return fieldName === 'user_created' || fieldName === 'user_updated';
}

function getUserDisplayFields(fieldKey: string, fieldsStore: any): string[] {
  const userPkField = getPrimaryKeyForCollection('directus_users');
  const displayFields = [
    `${fieldKey}.${userPkField}`,
    `${fieldKey}.email`,
    `${fieldKey}.first_name`,
    `${fieldKey}.last_name`,
  ];

  if (fieldExists('directus_users', 'avatar', fieldsStore)) {
    const avatarPkField = getPrimaryKeyForCollection('directus_files');
    displayFields.push(`${fieldKey}.avatar.${avatarPkField}`);

    if (fieldExists('directus_files', 'modified_on', fieldsStore)) {
      displayFields.push(`${fieldKey}.avatar.modified_on`);
    }
  }

  return displayFields;
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

  // M2A target is polymorphic; the bare deep parameter supplies the data and
  // requesting a fixed PK against the junction would 403.
  if (isM2A(field)) {
    return null;
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

// Expands template tokens to API field paths. For M2M, traverses
// junction_field to reach the target collection. Every emitted path is
// walked per segment against the schema (validateDeepPath); invalid tokens
// are dropped with a deduplicated warning. Translations skip validation
// (varying schemas; rows arrive via the deep parameter and the renderer
// tolerates missing leaves).
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
  const isM2A = field?.meta?.special?.includes('m2a') === true;
  const isTranslations = field?.meta?.special?.includes('translations') === true;

  if (isTranslations) {
    return tokens.map((tok) => `${fieldKey}.${tok}`);
  }

  // Shared schema walker for every relational branch below. Creating it is a
  // cheap closure factory; no store access happens until a hop is described.
  const describeHop = createDescribeHop(fieldsStore, relationsStore);

  if (isM2A) {
    const m2a = resolveM2ARelation(parentCollection, fieldKey, relationsStore, fieldsStore);
    if (!m2a) return [];
    const { itemField, discriminator, allowedCollections, junctionCollection } = m2a;

    // The discriminator is always needed so the renderer knows which target
    // collection each row points at before resolving per-collection tokens.
    const expanded: string[] = [`${fieldKey}.${discriminator}`];
    const add = (path: string) => {
      if (!expanded.includes(path)) expanded.push(path);
    };

    for (const rawTok of tokens) {
      // The native picker prefixes relation tokens with the field key. A prefix
      // means a junction/item field; a bare token is a parent-level field.
      const hadPrefix = rawTok.startsWith(`${fieldKey}.`);
      const tok = stripM2AFieldPrefix(rawTok, fieldKey);
      // The discriminator (and its conventional `collection` alias) is always
      // emitted above; skip so it's never re-emitted as a junction/parent field.
      if (tok === discriminator || tok === M2A_COLLECTION_TOKEN) continue;

      // Per-collection item token: "item:collection.path".
      const parsed = parseM2AToken(tok);
      if (parsed && isM2APrefix(parsed.prefix, fieldKey, itemField)) {
        const { collection: col } = parsed;
        // Drop the extension-only `:lang` suffix; the API path must not carry it
        // (the renderer picks the translation language client-side).
        const { path } = splitLanguageSuffix(parsed.path);
        if (allowedCollections.length > 0 && !allowedCollections.includes(col)) continue;
        // Every segment is walked against the schema; an invalid deep leaf
        // would otherwise reach the API, 403, and blank the whole view.
        const validation = validateDeepPath(col, path, fieldsStore, describeHop);
        if (!validation.valid) {
          warnOnce(
            `[super-layout-table] Dropped template field "item:${col}.${path}" (M2A item: ${validation.reason})`
          );
          continue;
        }
        add(buildM2AFieldPath(fieldKey, itemField, col, path));
        // For a translations hop, also fetch its language column so the renderer
        // can match the active language instead of falling back to the first row.
        for (const langPath of collectTranslationLanguagePaths(path, col, describeHop)) {
          add(buildM2AFieldPath(fieldKey, itemField, col, langPath));
        }
        continue;
      }

      const firstSegment = (tok.split('.')[0] ?? '') as string;
      if (!firstSegment) continue;

      if (hadPrefix) {
        // Junction-level field (e.g. `treatment.sort`); every segment is
        // walked against the junction schema so an unknown deep token never
        // reaches the API and 403s.
        if (junctionCollection) {
          const junctionValidation = validateDeepPath(
            junctionCollection,
            tok,
            fieldsStore,
            describeHop
          );
          if (junctionValidation.valid) {
            add(`${fieldKey}.${tok}`);
          } else {
            warnOnce(
              `[super-layout-table] Dropped template field "${rawTok}" (M2A junction "${junctionCollection}": ${junctionValidation.reason})`
            );
          }
        }
        continue;
      }

      // Bare token → parent-level field (e.g. `code`), fetched at the top level.
      // Walked per segment against the parent so a stray token is dropped, not 403'd.
      const parentValidation = validateDeepPath(parentCollection, tok, fieldsStore, describeHop);
      if (parentValidation.valid) {
        add(tok);
      } else {
        warnOnce(
          `[super-layout-table] Dropped template field "${tok}" (M2A parent "${parentCollection}": ${parentValidation.reason})`
        );
      }
    }
    return expanded;
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
    const targetCollection = junctionFieldDef?.schema?.foreign_key_table as string | undefined;
    if (!targetCollection) return [];

    const expanded: string[] = [];
    for (const tok of tokens) {
      const parts = tok.split('.');
      // If user wrote the junction_field as the first segment already, strip it
      // so we don't double-prefix.
      const tokWithoutJunctionPrefix = parts[0] === junctionField ? parts.slice(1).join('.') : tok;
      if (!tokWithoutJunctionPrefix) continue;
      // Every segment is walked against the target schema; an invalid deep
      // leaf would otherwise reach the API, 403, and blank the whole view.
      const validation = validateDeepPath(
        targetCollection,
        tokWithoutJunctionPrefix,
        fieldsStore,
        describeHop
      );
      if (!validation.valid) {
        warnOnce(
          `[super-layout-table] Dropped template field "${tok}" (M2M target "${targetCollection}": ${validation.reason})`
        );
        continue;
      }
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
    // M2A is handled above; never reach the wrong-collection emit for it.
    return isM2A ? [] : tokens.map((tok) => `${fieldKey}.${tok}`);
  }

  const expanded: string[] = [];
  for (const tok of tokens) {
    // Every segment is walked against the related collection; an invalid deep
    // leaf would otherwise reach the API, 403, and blank the whole view.
    const validation = validateDeepPath(target, tok, fieldsStore, describeHop);
    if (!validation.valid) {
      warnOnce(
        `[super-layout-table] Dropped template field "${tok}" (relation target "${target}": ${validation.reason})`
      );
      continue;
    }
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
      const storageKey = stripLanguageSuffix(fieldKey);
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

        const expanded = expandTokensThroughRelation(
          fieldDef,
          fieldKey,
          parentCollection,
          tokens,
          fieldsStore,
          relationsStore
        );
        return expanded.length > 0 ? expanded : [fieldKey];
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
            const expanded = expandTokensThroughRelation(
              fieldDefForHeuristic,
              fieldKey,
              parentCollection,
              heuristicTokens,
              fieldsStore,
              relationsStore
            );
            return expanded.length > 0 ? expanded : [fieldKey];
          }
        }
      }

      const field = fieldsStore.getField(parentCollection, fieldKey);

      if (!field) {
        if (isSystemUserAuditField(null, fieldKey)) {
          return getUserDisplayFields(fieldKey, fieldsStore);
        }

        return fieldKey;
      }
      if (field.meta?.display === null) return fieldKey;

      // Get the display definition - this is where the magic happens!
      const displayId =
        field.meta?.display || (isSystemUserAuditField(field, fieldKey) ? 'user' : null);
      if (!displayId) return fieldKey;

      // Get display-specific fields based on display type
      let displayFields: string[] | null = null;

      try {
        // Handle different display types with their specific field requirements
        switch (displayId) {
          case 'related-values': {
            const template = field.meta?.display_options?.template;
            const isM2A = field.meta?.special?.includes('m2a') === true;
            if (template) {
              // M2A tokens use the "item:collection.field" form whose colon/dot
              // structure must stay intact, so use the prefix-preserving parser;
              // other relation types keep the last-segment flattener.
              const templateTokens = isM2A
                ? parseTemplateTokens(template)
                : extractFieldsFromTemplate(template);
              const expanded = expandTokensThroughRelation(
                field,
                fieldKey,
                parentCollection,
                templateTokens,
                fieldsStore,
                relationsStore
              );

              // PK path so the row can be keyed; M2M needs the junction prefix.
              // M2A already carries its discriminator from the expander, and its
              // per-collection PKs differ per target, so it needs no extra PK here.
              const isM2M = field.meta?.special?.includes('m2m') === true;
              let pkPath: string | null = null;
              if (isM2A) {
                pkPath = null;
              } else if (isM2M) {
                const relations = relationsStore.getRelationsForField(parentCollection, fieldKey);
                const rel = relations?.[0];
                const junctionField = rel?.meta?.junction_field as string | undefined;
                const junctionCollection = rel?.collection as string | undefined;
                if (junctionField && junctionCollection) {
                  const junctionFieldDef = fieldsStore.getField(junctionCollection, junctionField);
                  const targetCollection = junctionFieldDef?.schema?.foreign_key_table as
                    | string
                    | undefined;
                  if (targetCollection) {
                    const targetPk = getPrimaryKeyForCollection(targetCollection);
                    pkPath = `${fieldKey}.${junctionField}.${targetPk}`;
                  }
                }
              } else {
                const rootField = (fieldKey.split('.')[0] ?? fieldKey) as string;
                const relatedCollection = getRelatedCollection(
                  parentCollection,
                  rootField,
                  relationsStore
                );
                if (relatedCollection) {
                  const targetPk = getPrimaryKeyForCollection(relatedCollection);
                  pkPath = `${fieldKey}.${targetPk}`;
                }
              }

              displayFields =
                pkPath && !expanded.includes(pkPath) ? [...expanded, pkPath] : expanded;
              if (displayFields.length === 0) displayFields = [fieldKey];
            } else if (isM2A) {
              // No template: the junction discriminator alone is servable; the
              // bare alias would request invalid columns on the junction.
              const discriminator = resolveM2ARelation(
                parentCollection,
                fieldKey,
                relationsStore,
                fieldsStore
              )?.discriminator;
              displayFields = discriminator ? [`${fieldKey}.${discriminator}`] : [fieldKey];
            } else {
              const rootField = (fieldKey.split('.')[0] ?? fieldKey) as string;
              const relatedCollection = getRelatedCollection(
                parentCollection,
                rootField,
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
            displayFields = getUserDisplayFields(fieldKey, fieldsStore);
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
    .map((field) => field.replace(/^\$+/, ''));
}
