/**
 * Issue #48: pure helpers for resolving display templates and target collections
 * for relational fields when the user has not configured an override or a field
 * display in collection settings.
 */

const RELATIONAL_SPECIALS = ['m2o', 'o2m', 'm2m', 'm2a', 'files', 'translations'] as const;

export function isRelational(field: { meta?: { special?: string[] } } | null | undefined): boolean {
  if (!field?.meta?.special) return false;
  return field.meta.special.some((s) => (RELATIONAL_SPECIALS as readonly string[]).includes(s));
}

/**
 * Pull the field tokens out of a display template. Whitespace is stripped,
 * duplicates are removed, dotted paths are kept intact (callers decide whether
 * to flatten them).
 */
export function parseTemplateTokens(template: string): string[] {
  if (!template) return [];
  const matches = template.match(/\{\{\s*([^}]+?)\s*\}\}/g);
  if (!matches) return [];
  const fields = matches
    .map((m) => m.replace(/\{\{\s*|\s*\}\}/g, '').trim())
    .filter((f) => f.length > 0);
  return [...new Set(fields)];
}

interface RelationsStoreLike {
  getRelationsForField: (
    collection: string,
    field: string
  ) => Array<{
    collection?: string;
    field?: string;
    related_collection?: string | null;
    meta?: { junction_field?: string | null } | null;
  }>;
}

interface FieldsStoreLike {
  getField: (
    collection: string | null,
    field: string
  ) => { schema?: { foreign_key_table?: string | null } | null } | null | undefined;
}

/**
 * Resolves the display-target collection for a relational field.
 *
 *   M2O           → relation.related_collection
 *   O2M (no junction) → relation.collection (the related table)
 *   M2M (with junction) → traverse junction.junction_field to get its target table
 *   M2A           → not supported in heuristics; returns null
 */
export function resolveTargetCollection(
  field: { collection?: string; field?: string; meta?: { special?: string[] } } | null,
  relationsStore: RelationsStoreLike,
  fieldsStore: FieldsStoreLike
): string | null {
  if (!field?.collection || !field.field) return null;
  if (!isRelational(field)) return null;

  const relations = relationsStore.getRelationsForField(field.collection, field.field);
  const rel = relations?.[0];
  if (!rel) return null;

  // M2O: parent owns the FK
  if (rel.collection === field.collection && rel.related_collection) {
    return rel.related_collection;
  }

  // Translations also carry meta.junction_field (languages_code), but the
  // intended target is the translations collection — never traverse the junction
  // for translation fields.
  if (field.meta?.special?.includes('translations')) {
    return rel.collection ?? null;
  }

  // M2M: junction relation has junction_field pointing at the target FK
  if (rel.meta?.junction_field) {
    const junctionCollection = rel.collection;
    const junctionField = rel.meta.junction_field;
    if (!junctionCollection) return null;
    const junctionFieldDef = fieldsStore.getField(junctionCollection, junctionField);
    return junctionFieldDef?.schema?.foreign_key_table ?? null;
  }

  // Pure O2M: the related collection IS the target
  return rel.collection ?? null;
}

const HEURISTIC_FALLBACK_FIELDS = ['name', 'title', 'label'] as const;

export function pickHeuristic(
  field: { collection?: string; field?: string; meta?: { special?: string[] } } | null,
  relationsStore: RelationsStoreLike,
  fieldsStore: FieldsStoreLike
): string | null {
  if (!isRelational(field)) return null;

  // Translations have their own client-side rendering path in EditableCellRelational
  // (language-filtered before display). Heuristics would interfere; skip them.
  if (field?.meta?.special?.includes('translations')) return null;

  const target = resolveTargetCollection(field, relationsStore, fieldsStore);
  if (!target) return null;

  if (target === 'directus_users') {
    return '{{first_name}} {{last_name}}';
  }

  if (target === 'directus_files') {
    return fieldsStore.getField(target, 'title') ? '{{title}}' : '{{filename_download}}';
  }

  for (const candidate of HEURISTIC_FALLBACK_FIELDS) {
    if (fieldsStore.getField(target, candidate)) {
      return `{{${candidate}}}`;
    }
  }

  return null;
}
