import { renderM2ATemplate, type RenderM2AOptions } from './renderM2ATemplate';

/**
 * One rendered M2A junction row: either resolved template text, or a `block`
 * marker when its target collection is not readable by the current user.
 */
export type M2ASegment = { text: string } | { blocked: true; collection: string };

/** Narrow a segment to the blocked variant (for template branching). */
export function isBlockedSegment(seg: M2ASegment): seg is { blocked: true; collection: string } {
  return 'blocked' in seg;
}

/**
 * Build the per-junction-row segments for an M2A cell.
 *
 * The `item` value distinguishes three cases:
 *  - `null`  → the item is genuinely absent: a permission denial (emit a `block`
 *    marker when the target can't be read) or a dangling FK (skip the row).
 *  - `undefined` → the item simply wasn't fetched because the template references
 *    no item field; render anyway so a discriminator-only template still shows.
 *  - present (object or scalar FK) → render the template.
 *
 * Pure: `canRead` is injected so this is unit-testable without the stores.
 */
export function buildM2ASegments(
  rows: unknown,
  template: string,
  itemField: string,
  discriminator: string,
  fieldName: string,
  parentRow: Record<string, any> | null | undefined,
  canRead: (collection: string) => boolean,
  renderOpts?: RenderM2AOptions
): M2ASegment[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const segments: M2ASegment[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const rowCollection = (row as Record<string, any>)[discriminator];

    if (rowCollection && (row as Record<string, any>)[itemField] === null) {
      if (!canRead(String(rowCollection))) {
        segments.push({ blocked: true, collection: String(rowCollection) });
      }
      continue;
    }

    const text = renderM2ATemplate(
      row as Record<string, any>,
      template,
      itemField,
      discriminator,
      fieldName,
      parentRow,
      renderOpts
    ).trim();
    if (text && text !== '—') segments.push({ text });
  }
  return segments;
}
