/**
 * Generic, schema-driven resolver for a dotted path through relational data.
 *
 * It walks the path one hop at a time and asks `describeHop` what each hop is,
 * so it scales to arbitrary depth without per-level special-casing:
 *   - `m2o` / `file`        → descend into the related object
 *   - `translations`        → array of language rows; pick the row matching the
 *                             active language via the *detected* language field
 *   - `o2m` / `m2m` / `m2a` / `files` → to-many array; take the first element
 *                             (a single table cell can't render a collection;
 *                             this is the documented boundary)
 *   - `scalar` / unknown    → read the value and stop traversing
 *
 * Pure: all schema knowledge is injected through `describeHop`, so this is
 * unit-testable without the Directus stores.
 */

export type HopKind = 'scalar' | 'm2o' | 'o2m' | 'm2m' | 'm2a' | 'file' | 'files' | 'translations';

export interface HopInfo {
  kind: HopKind;
  /** Collection to continue resolving on after this hop (null when unknown). */
  relatedCollection?: string | null;
  /** For `translations`: the junction field that holds the language code. */
  languageField?: string | null;
}

export type DescribeHop = (collection: string, field: string) => HopInfo;

/** Hop kinds whose value is a to-one related object we descend into. */
const TO_ONE = new Set<HopKind>(['m2o', 'file']);
/** Hop kinds whose value is a to-many array with no single-cell representation. */
const TO_MANY = new Set<HopKind>(['o2m', 'm2m', 'm2a', 'files']);

/**
 * Split a dotted relational path into walkable segments: trims whitespace,
 * drops empty segments and Directus virtual segments (e.g. `$thumbnail`).
 * Canonical splitter for every schema walk — query building, validation and
 * rendering must tokenize identically, or a path could validate differently
 * than it resolves.
 */
export function splitPathSegments(path: string): string[] {
  return path
    .split('.')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('$'));
}

export function resolveRelationalPath(
  data: unknown,
  path: string,
  startCollection: string | null,
  describeHop: DescribeHop,
  language: string | null
): unknown {
  // Skip Directus virtual segments (e.g. `$thumbnail`) like the rest of the codebase.
  const segments = splitPathSegments(path);

  let current: unknown = data;
  let collection: string | null = startCollection;

  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return undefined;

    const hop: HopInfo = collection ? describeHop(collection, segment) : { kind: 'scalar' };
    const raw = (current as Record<string, unknown>)[segment];

    if (hop.kind === 'translations') {
      current = pickTranslationRow(raw, language, hop.languageField);
      collection = hop.relatedCollection ?? null;
    } else if (TO_MANY.has(hop.kind)) {
      current = Array.isArray(raw) ? (raw[0] ?? null) : raw;
      collection = hop.relatedCollection ?? null;
    } else if (TO_ONE.has(hop.kind)) {
      current = raw;
      collection = hop.relatedCollection ?? null;
    } else {
      // scalar / unknown: read and stop traversing relations
      current = raw;
      collection = null;
    }
  }

  return current;
}

/**
 * For a dotted path, return the sub-path to the language field of every
 * `translations` hop along the way. The query side must fetch these so the
 * renderer has the language column to match the active language against
 * (otherwise it can only fall back to the first row). Empty when the path
 * crosses no translations relation.
 */
export function collectTranslationLanguagePaths(
  path: string,
  startCollection: string | null,
  describeHop: DescribeHop
): string[] {
  const segments = splitPathSegments(path);

  const out: string[] = [];
  const acc: string[] = [];
  let collection = startCollection;

  for (const segment of segments) {
    const hop: HopInfo = collection ? describeHop(collection, segment) : { kind: 'scalar' };
    acc.push(segment);
    if (hop.kind === 'translations' && hop.languageField) {
      out.push([...acc, hop.languageField].join('.'));
    }
    collection = hop.relatedCollection ?? null;
  }
  return out;
}

/**
 * From a translations array, return the row for the active language (matched on
 * the detected language field), falling back to the first row when the language
 * is absent. Returns null for a non-array / empty value.
 */
function pickTranslationRow(
  value: unknown,
  language: string | null,
  languageField: string | null | undefined
): Record<string, unknown> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const field = languageField ?? 'languages_code';
  if (language != null) {
    const match = value.find(
      (row) =>
        row && typeof row === 'object' && (row as Record<string, unknown>)[field] === language
    );
    if (match) return match as Record<string, unknown>;
  }
  const first = value[0];
  return first && typeof first === 'object' ? (first as Record<string, unknown>) : null;
}
