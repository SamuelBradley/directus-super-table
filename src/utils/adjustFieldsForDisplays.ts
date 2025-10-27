// CORE CHANGES - Following original Directus approach
import { useStores, useCollection } from '@directus/extensions-sdk';

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
 * Adjusts fields based on their display configuration, following the original Directus pattern.
 * This function replicates the core logic from Directus core for proper display field resolution.
 * Enhanced with field existence validation to prevent requesting non-existent fields.
 */
export function adjustFieldsForDisplays(
  fields: readonly string[],
  parentCollection: string
): string[] {
  // Get the stores, but handle the case where they're not available
  let fieldsStore: any = null;
  let relationsStore: any = null;
  try {
    const { useFieldsStore, useRelationsStore } = useStores();
    fieldsStore = useFieldsStore();
    relationsStore = useRelationsStore();
  } catch {
    // Stores not available, return original fields
    return [...fields];
  }

  if (!fieldsStore) return [...fields];

  const adjustedFields: string[] = fields
    .map((fieldKey) => {
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
