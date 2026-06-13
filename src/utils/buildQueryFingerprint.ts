/**
 * Stable string fingerprint of every parameter that affects the items request.
 * The query watcher dedupes on this string, so it must include EXACTLY what
 * `getItems` reads — extracted here so a test pins that set (dropping a key
 * would silently suppress a needed refetch).
 *
 * This string is ONLY a dedup comparison key — it never forms the wire query
 * (`getItems` reads the original filter/deep/alias objects). `stableReplacer`
 * canonicalizes nested object key order so two semantically identical queries
 * built with a different key insertion order share one fingerprint; arrays keep
 * their order (significant for `fields`/`sort`/`_and`/`_or`).
 */
export interface QueryFingerprintInput {
  collection: string | null;
  fields: readonly string[];
  filter: unknown;
  sort: readonly string[] | null | undefined;
  page: number;
  limit: number;
  deep: unknown;
  alias: unknown;
}

/**
 * JSON.stringify replacer that sorts object keys for canonical output. Arrays
 * pass through untouched (their order is significant); null passes through
 * (`typeof null === 'object'`). JSON.stringify applies it recursively, so
 * nested objects are canonicalized at every depth.
 */
function stableReplacer(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const obj = value as Record<string, unknown>;
  return Object.keys(obj)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = obj[k];
      return acc;
    }, {});
}

export function buildQueryFingerprint(input: QueryFingerprintInput): string {
  return JSON.stringify(
    {
      collection: input.collection,
      fields: input.fields,
      filter: input.filter ?? null,
      sort: input.sort ?? null,
      page: input.page,
      limit: input.limit,
      deep: input.deep ?? null,
      alias: input.alias ?? null,
    },
    stableReplacer
  );
}
