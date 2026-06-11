/**
 * Stable string fingerprint of every parameter that affects the items request.
 * The query watcher dedupes on this string, so it must include EXACTLY what
 * `getItems` reads — extracted here so a test pins that set (dropping a key
 * would silently suppress a needed refetch). Key order is fixed for stable
 * output across evaluations.
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

export function buildQueryFingerprint(input: QueryFingerprintInput): string {
  return JSON.stringify({
    collection: input.collection,
    fields: input.fields,
    filter: input.filter ?? null,
    sort: input.sort,
    page: input.page,
    limit: input.limit,
    deep: input.deep ?? null,
    alias: input.alias ?? null,
  });
}
