import { describe, it, expect } from 'vitest';
import { createDescribeHop } from '@/utils/describeHop';

const makeStores = (fields: Record<string, any>, relations: Record<string, any[]>) => ({
  fieldsStore: { getField: (c: string, f: string) => fields[`${c}.${f}`] ?? null },
  relationsStore: { getRelationsForField: (c: string, f: string) => relations[`${c}.${f}`] ?? [] },
});

describe('createDescribeHop', () => {
  it('describes a translations hop with the DETECTED language field (junction_field)', () => {
    const { fieldsStore, relationsStore } = makeStores(
      { 'service.translations': { meta: { special: ['translations'] } } },
      {
        'service.translations': [
          {
            collection: 'service_translations',
            field: 'service_id',
            related_collection: 'service',
            meta: { one_field: 'translations', junction_field: 'languages_code' },
          },
        ],
      }
    );
    const describe = createDescribeHop(fieldsStore as any, relationsStore as any);
    expect(describe('service', 'translations')).toEqual({
      kind: 'translations',
      relatedCollection: 'service_translations',
      languageField: 'languages_code',
    });
  });

  it('detects a non-default language field name', () => {
    const { fieldsStore, relationsStore } = makeStores(
      { 'catalog.translations': { meta: { special: ['translations'] } } },
      {
        'catalog.translations': [
          {
            collection: 'catalog_translations',
            field: 'catalog_id',
            related_collection: 'catalog',
            meta: { one_field: 'translations', junction_field: 'lang' },
          },
        ],
      }
    );
    const describe = createDescribeHop(fieldsStore as any, relationsStore as any);
    expect(describe('catalog', 'translations').languageField).toBe('lang');
  });

  it('describes an M2O hop with its related collection', () => {
    const { fieldsStore, relationsStore } = makeStores(
      { 'partners_catalog.catalog_id': { meta: { special: ['m2o'] } } },
      {
        'partners_catalog.catalog_id': [
          { collection: 'partners_catalog', field: 'catalog_id', related_collection: 'catalog', meta: {} },
        ],
      }
    );
    const describe = createDescribeHop(fieldsStore as any, relationsStore as any);
    expect(describe('partners_catalog', 'catalog_id')).toEqual({
      kind: 'm2o',
      relatedCollection: 'catalog',
    });
  });

  it('describes a plain scalar field', () => {
    const { fieldsStore, relationsStore } = makeStores(
      { 'service.name': { meta: {} } },
      {}
    );
    const describe = createDescribeHop(fieldsStore as any, relationsStore as any);
    expect(describe('service', 'name')).toEqual({ kind: 'scalar' });
  });

  it('describes a to-many m2m hop as an array kind', () => {
    const { fieldsStore, relationsStore } = makeStores(
      { 'orders.tags': { meta: { special: ['m2m'] } } },
      {
        'orders.tags': [
          {
            collection: 'orders_tags',
            field: 'orders_id',
            related_collection: 'orders',
            meta: { junction_field: 'tag_id' },
          },
        ],
      }
    );
    const describe = createDescribeHop(fieldsStore as any, relationsStore as any);
    expect(describe('orders', 'tags').kind).toBe('m2m');
  });

  it('is defensive: unknown field → scalar, store throwing → scalar', () => {
    const describe = createDescribeHop(
      { getField: () => null } as any,
      {
        getRelationsForField: () => {
          throw new Error('store not ready');
        },
      } as any
    );
    expect(describe('x', 'y')).toEqual({ kind: 'scalar' });
  });
});
