type FilterValue = Record<string, unknown> | unknown[] | null;

export interface SanitizeResult {
  sanitized: FilterValue;
  removed: string[];
}

const LOGICAL_KEYS = new Set(['_and', '_or']);

export function sanitizeFilter(
  filter: FilterValue,
  canRead: (field: string) => boolean
): SanitizeResult {
  const removed: string[] = [];

  function walk(node: FilterValue): FilterValue {
    if (node === null || node === undefined || typeof node !== 'object') return node;

    if (Array.isArray(node)) {
      const cleaned = node
        .map((entry) => walk(entry as FilterValue))
        .filter((entry) => {
          if (entry === null) return false;
          if (typeof entry === 'object' && !Array.isArray(entry) && Object.keys(entry).length === 0)
            return false;
          return true;
        });
      return cleaned;
    }

    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (LOGICAL_KEYS.has(key)) {
        const cleaned = walk(value as FilterValue);
        if (Array.isArray(cleaned) && cleaned.length > 0) out[key] = cleaned;
        continue;
      }

      const rootField = key.split('.')[0];
      if (!canRead(rootField)) {
        removed.push(key);
        continue;
      }

      out[key] = value;
    }

    return Object.keys(out).length === 0 ? null : out;
  }

  return { sanitized: walk(filter), removed };
}
