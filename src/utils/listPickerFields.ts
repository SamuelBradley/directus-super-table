import type { DescribeHop } from './resolveRelationalPath';

export interface PickerEntry {
  /** Field key on the current collection. */
  field: string;
  /** Display label (field name, falling back to the key). */
  label: string;
  /** True for to-one + translations hops the picker follows. */
  drillable: boolean;
  /** Collection to drill into (null for scalar leaves). */
  relatedCollection: string | null;
  /** True when this field is a `translations` relation (enables the language step). */
  isTranslationsHop: boolean;
}

interface FieldLike {
  field: string;
  name?: string;
}
interface FieldsStoreLike {
  getFieldsForCollection: (collection: string) => FieldLike[];
}

/** Hop kinds whose value is a single related row the picker drills into. */
const TO_ONE = new Set(['m2o', 'file']);

/**
 * Build one menu level for `collection`: scalar fields become selectable leaves;
 * to-one (m2o/file) and `translations` relations become drillable entries.
 * Everything else (to-many relations, or any hop with no related collection) is
 * omitted, so the picker can never produce a token the renderer won't resolve.
 */
export function listPickerFields(
  collection: string,
  describeHop: DescribeHop,
  fieldsStore: FieldsStoreLike
): PickerEntry[] {
  const fields = fieldsStore.getFieldsForCollection(collection) ?? [];
  const out: PickerEntry[] = [];
  for (const f of fields) {
    if (!f?.field || f.field.startsWith('$')) continue;
    const label = f.name && f.name.length > 0 ? f.name : f.field;
    const hop = describeHop(collection, f.field);
    if (hop.kind === 'scalar') {
      out.push({
        field: f.field,
        label,
        drillable: false,
        relatedCollection: null,
        isTranslationsHop: false,
      });
    } else if (hop.kind === 'translations' && hop.relatedCollection) {
      out.push({
        field: f.field,
        label,
        drillable: true,
        relatedCollection: hop.relatedCollection,
        isTranslationsHop: true,
      });
    } else if (TO_ONE.has(hop.kind) && hop.relatedCollection) {
      out.push({
        field: f.field,
        label,
        drillable: true,
        relatedCollection: hop.relatedCollection,
        isTranslationsHop: false,
      });
    }
    // to-many / unknown / no-related → omitted
  }
  return out;
}
