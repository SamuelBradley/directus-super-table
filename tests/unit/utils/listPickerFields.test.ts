import { describe, it, expect } from 'vitest';
import { listPickerFields } from '@/utils/listPickerFields';
import type { DescribeHop, HopInfo } from '@/utils/resolveRelationalPath';

const makeDescribeHop =
  (map: Record<string, HopInfo>): DescribeHop =>
  (collection, field) =>
    map[`${collection}.${field}`] ?? { kind: 'scalar' };

const fieldsStore = (byCollection: Record<string, Array<{ field: string; name?: string }>>) => ({
  getFieldsForCollection: (c: string) => byCollection[c] ?? [],
});

describe('listPickerFields', () => {
  it('lists scalars as leaves and to-one/translations as drillable; omits to-many', () => {
    const fs = fieldsStore({
      service: [
        { field: 'name', name: 'Name' },
        { field: 'author' },
        { field: 'translations' },
        { field: 'tags' },
        { field: '$thumbnail' },
      ],
    });
    const hop = makeDescribeHop({
      'service.name': { kind: 'scalar' },
      'service.author': { kind: 'm2o', relatedCollection: 'users' },
      'service.translations': { kind: 'translations', relatedCollection: 'service_translations' },
      'service.tags': { kind: 'm2m', relatedCollection: 'service_tags' },
    });
    expect(listPickerFields('service', hop, fs)).toEqual([
      { field: 'name', label: 'Name', drillable: false, relatedCollection: null, isTranslationsHop: false },
      { field: 'author', label: 'author', drillable: true, relatedCollection: 'users', isTranslationsHop: false },
      { field: 'translations', label: 'translations', drillable: true, relatedCollection: 'service_translations', isTranslationsHop: true },
      // 'tags' (m2m) omitted; '$thumbnail' skipped
    ]);
  });

  it('omits a relation without a related collection', () => {
    const fs = fieldsStore({ x: [{ field: 'blocks' }] });
    const hop = makeDescribeHop({ 'x.blocks': { kind: 'm2a', relatedCollection: null } });
    expect(listPickerFields('x', hop, fs)).toEqual([]);
  });

  it('returns [] for an unknown/empty collection', () => {
    expect(listPickerFields('nope', makeDescribeHop({}), fieldsStore({}))).toEqual([]);
  });
});
