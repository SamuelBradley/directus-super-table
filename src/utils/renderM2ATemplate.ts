import { get } from '@directus/utils';
import {
  parseM2AToken,
  isM2APrefix,
  stripM2AFieldPrefix,
  splitLanguageSuffix,
  M2A_COLLECTION_TOKEN,
} from './displayHeuristics';
import { resolveRelationalPath, type DescribeHop } from './resolveRelationalPath';
import { stripHtml } from './stripHtml';

export interface RenderM2AOptions {
  /** Schema-aware hop resolver; enables deep relational paths (e.g. nested translations). */
  describeHop?: DescribeHop;
  /** Fallback language when a token carries no `:lang` suffix. */
  language?: string | null;
}

/**
 * Render one M2A junction row against a related-values template.
 *
 * `{{collection}}` resolves from the discriminator; `{{item:col.path}}` resolves
 * only when the row points at `col`. Shares `parseM2AToken` with the query-side
 * expander so the two cannot drift.
 */
export function renderM2ATemplate(
  row: Record<string, any> | null | undefined,
  template: string,
  itemField: string,
  discriminator: string,
  fieldName: string,
  parentRow?: Record<string, any> | null,
  opts?: RenderM2AOptions
): string {
  if (!row || typeof row !== 'object') return '—';
  const rowCollection = row[discriminator];
  const item = row[itemField];

  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawToken: string) => {
    const raw = String(rawToken).trim();
    // The native picker prefixes relation tokens with the field key. A prefix
    // selects the relation scope (junction/item); a bare token reads the parent
    // row. On a name clash the more specific (deeper) token wins by shape.
    const hadPrefix = raw.startsWith(`${fieldName}.`);
    const token = stripM2AFieldPrefix(raw, fieldName);

    // 1. Discriminator (junction level).
    if (token === discriminator || token === M2A_COLLECTION_TOKEN) {
      return rowCollection != null ? String(rowCollection) : '';
    }

    // 2. Per-collection item value (deepest); only the branch matching this
    //    row's collection contributes a value.
    const parsed = parseM2AToken(token);
    if (parsed && isM2APrefix(parsed.prefix, fieldName, itemField)) {
      if (parsed.collection !== rowCollection) return '';
      const { path: itemPath, language } = splitLanguageSuffix(parsed.path);
      const lang = language ?? opts?.language ?? null;
      // Schema-aware resolution handles deep relations (e.g. nested translations);
      // without a resolver, fall back to a plain dotted lookup (M2O chains, scalars).
      const value = opts?.describeHop
        ? resolveRelationalPath(item, itemPath, parsed.collection, opts.describeHop, lang)
        : getNestedValue(item, itemPath);
      return scalarOrEmpty(value);
    }

    // 3. Other junction-level field (prefixed, e.g. `treatment.sort`).
    if (hadPrefix) {
      return scalarOrEmpty(getNestedValue(row, token));
    }

    // 4. Bare token → parent row field (shallowest).
    return scalarOrEmpty(getNestedValue(parentRow, token));
  });
}

/**
 * Resolve a dotted path, skipping Directus `$`-prefixed virtual segments
 * (e.g. `$thumbnail`) before delegating to the shared `get` helper.
 */
function getNestedValue(source: any, path: string): any {
  const cleaned = path
    .split('.')
    .filter((segment) => !segment.startsWith('$'))
    .join('.');
  return get(source, cleaned);
}

/** Tokens render scalars only; objects/arrays collapse to '' to avoid "[object Object]".
 *  HTML is stripped so rich-text values match the native formatted-value display. */
function scalarOrEmpty(value: any): string {
  return value != null && typeof value !== 'object' ? stripHtml(value) : '';
}
