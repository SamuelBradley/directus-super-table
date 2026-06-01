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

export function isM2A(
  field: { meta?: { special?: string[] | null } | null } | null | undefined
): boolean {
  return field?.meta?.special?.includes('m2a') === true;
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

/**
 * Conventional token for the M2A discriminator, accepted on both the query and
 * render sides regardless of the relation's actual `one_collection_field` name
 * (which it usually is anyway). Kept here so both sides resolve it identically.
 */
export const M2A_COLLECTION_TOKEN = 'collection';

/**
 * Grammar for a per-collection M2A template token: `item:collection.path`
 * (e.g. `item:articles.title`). Captures [, prefix, collection, path].
 */
export const M2A_TOKEN_RE = /^([^:.]+):([^.]+)\.(.+)$/;

/**
 * Parse a per-collection M2A token. Returns `null` for tokens that aren't in
 * the `prefix:collection.path` form (e.g. plain `{{collection}}` or bare keys).
 */
export function parseM2AToken(
  token: string
): { prefix: string; collection: string; path: string } | null {
  const match = token.match(M2A_TOKEN_RE);
  if (!match) return null;
  const [, prefix, collection, path] = match;
  return { prefix: prefix!, collection: collection!, path: path! };
}

/**
 * Build the API field path for an M2A per-collection token, e.g.
 * `treatment.item:partners_catalog.name`. Single source of the emit shape so
 * the query side and the render side cannot drift.
 */
export function buildM2AFieldPath(
  fieldKey: string,
  itemField: string,
  collection: string,
  path: string
): string {
  return `${fieldKey}.${itemField}:${collection}.${path}`;
}

/**
 * Whether a token prefix addresses this M2A relation, once any parent field-key
 * prefix has been stripped (see `stripM2AFieldPrefix`). The polymorphic item
 * field (`item:col.field`) is the picker/conventional form; the parent field
 * name is also accepted for hand-written `field:col.field` shorthand.
 */
export function isM2APrefix(prefix: string, fieldName: string, itemField: string): boolean {
  return prefix === fieldName || prefix === itemField || prefix === 'item';
}

/**
 * Strip the parent field-key prefix the native display-template picker prepends
 * to M2A tokens. Rooted at the parent collection (M2A has no single related
 * collection to root at), the picker emits `treatment.collection` and
 * `treatment.item:service.name`; stripping `<fieldName>.` makes them field-
 * relative (`collection`, `item:service.name`), matching a hand-written
 * template. Returns the token unchanged when it carries no such prefix.
 */
export function stripM2AFieldPrefix(token: string, fieldName: string): string {
  if (!fieldName) return token;
  const prefix = `${fieldName}.`;
  return token.startsWith(prefix) ? token.slice(prefix.length) : token;
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
