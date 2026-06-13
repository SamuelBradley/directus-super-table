import { describe, it, expect, beforeEach } from 'vitest';
import { vi } from 'vitest';

// Note: adjustFieldsForDisplays uses useStores() at runtime which we mock in
// tests/setup.ts. With those mocks, calling it with no overrides should return
// the original fields unchanged when the store has no field metadata.
// Reset modules before every test so the module-level store cache in
// adjustFieldsForDisplays.ts cannot leak between tests.
beforeEach(() => {
  vi.resetModules();
});

describe('adjustFieldsForDisplays', () => {
  it('accepts overrides as an optional third parameter', async () => {
    const { adjustFieldsForDisplays } = await import('@/utils/adjustFieldsForDisplays');
    // Just call with overrides — the signature should accept it
    const result = adjustFieldsForDisplays(['title', 'tags'], 'parent', {});
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns input fields when no overrides and no field metadata', async () => {
    const { adjustFieldsForDisplays } = await import('@/utils/adjustFieldsForDisplays');
    const result = adjustFieldsForDisplays(['title'], 'parent');
    expect(result).toContain('title');
  });
});

describe('adjustFieldsForDisplays — override path', () => {
  beforeEach(() => {
    // Re-mock fields/relations stores so we can assert what gets requested
    vi.resetModules();
  });

  it('expands template fields for a plain-field override', async () => {
    vi.doMock('@directus/extensions-sdk', () => ({
      useStores: () => ({
        useFieldsStore: () => ({
          getField: (col: string, f: string) =>
            f === 'title' ? { field: 'title', meta: {} } : null,
          getFieldsForCollection: () => [],
        }),
        useRelationsStore: () => ({
          getRelationsForField: () => [],
        }),
      }),
      useCollection: () => ({ primaryKeyField: { value: { field: 'id' } } }),
    }));
    const { adjustFieldsForDisplays } = await import('@/utils/adjustFieldsForDisplays');
    const result = adjustFieldsForDisplays(
      ['title'],
      'parent',
      { title: { template: '{{title}}' } }
    );
    expect(result).toContain('title');
  });

  it('expands m2o override to dotted target paths', async () => {
    vi.doMock('@directus/extensions-sdk', () => ({
      useStores: () => ({
        useFieldsStore: () => ({
          getField: (col: string, f: string) => {
            if (col === 'parent' && f === 'author')
              return { field: 'author', meta: { special: ['m2o'] }, collection: 'parent' };
            if (col === 'directus_users' && (f === 'first_name' || f === 'last_name'))
              return { field: f };
            return null;
          },
          getFieldsForCollection: () => [],
        }),
        useRelationsStore: () => ({
          getRelationsForField: (col: string, f: string) =>
            col === 'parent' && f === 'author'
              ? [{ collection: 'parent', field: 'author', related_collection: 'directus_users' }]
              : [],
        }),
      }),
      useCollection: () => ({ primaryKeyField: { value: { field: 'id' } } }),
    }));
    const { adjustFieldsForDisplays } = await import('@/utils/adjustFieldsForDisplays');
    const result = adjustFieldsForDisplays(
      ['author'],
      'parent',
      { author: { template: '{{first_name}} {{last_name}}' } }
    );
    expect(result).toEqual(expect.arrayContaining(['author.first_name', 'author.last_name']));
  });
});

describe('adjustFieldsForDisplays — M2M related-values display (issue #55)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('expands a related-values template through the junction_field for M2M (no name on pivot)', async () => {
    // Setup mirrors a real M2M: Products → Products_Tags (junction, no `name` field) → Tags (`name` exists)
    vi.doMock('@directus/extensions-sdk', () => ({
      useStores: () => ({
        useFieldsStore: () => ({
          getField: (col: string, f: string) => {
            if (col === 'products' && f === 'product_tags') {
              return {
                field: 'product_tags',
                collection: 'products',
                meta: {
                  special: ['m2m'],
                  display: 'related-values',
                  display_options: { template: '{{name}}' },
                },
              };
            }
            if (col === 'tags' && f === 'name') return { field: 'name' };
            // CRITICAL: junction has no `name` field
            if (col === 'products_tags' && f === 'name') return null;
            if (col === 'products_tags' && f === 'id') return { field: 'id' };
            if (col === 'products_tags' && f === 'tag_id')
              return { field: 'tag_id', schema: { foreign_key_table: 'tags' } };
            if (col === 'tags' && f === 'id') return { field: 'id' };
            return null;
          },
          getFieldsForCollection: () => [],
        }),
        useRelationsStore: () => ({
          getRelationsForField: (col: string, f: string) =>
            col === 'products' && f === 'product_tags'
              ? [
                  {
                    collection: 'products_tags',
                    field: 'product_id',
                    related_collection: 'products',
                    meta: { junction_field: 'tag_id' },
                  },
                ]
              : [],
        }),
      }),
      useCollection: () => ({ primaryKeyField: { value: { field: 'id' } } }),
      useExtensions: () => ({ displays: { value: [] } }),
    }));
    const { adjustFieldsForDisplays } = await import('@/utils/adjustFieldsForDisplays');
    const result = adjustFieldsForDisplays(['product_tags'], 'products');

    // MUST traverse the junction: product_tags.tag_id.name, NEVER product_tags.name
    expect(result).not.toContain('product_tags.name');
    expect(
      result.some((f) => f === 'product_tags.tag_id.name' || f === 'product_tags.tag_id.id')
    ).toBe(true);
  });
});

describe('adjustFieldsForDisplays — override branch M2M validation (issue #55)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('drops invalid override-template tokens for M2M when target lacks the field', async () => {
    vi.doMock('@directus/extensions-sdk', () => ({
      useStores: () => ({
        useFieldsStore: () => ({
          getField: (col: string, f: string) => {
            if (col === 'parent' && f === 'tags')
              return { field: 'tags', collection: 'parent', meta: { special: ['m2m'] } };
            if (col === 'parent_tags' && f === 'tag_id')
              return { field: 'tag_id', schema: { foreign_key_table: 'tags' } };
            if (col === 'tags' && f === 'id') return { field: 'id' };
            // CRITICAL: tags has no 'name'
            return null;
          },
          getFieldsForCollection: () => [],
        }),
        useRelationsStore: () => ({
          getRelationsForField: (col: string, f: string) =>
            col === 'parent' && f === 'tags'
              ? [
                  {
                    collection: 'parent_tags',
                    field: 'parent_id',
                    related_collection: 'parent',
                    meta: { junction_field: 'tag_id' },
                  },
                ]
              : [],
        }),
      }),
      useCollection: () => ({ primaryKeyField: { value: { field: 'id' } } }),
      useExtensions: () => ({ displays: { value: [] } }),
    }));
    const { adjustFieldsForDisplays } = await import('@/utils/adjustFieldsForDisplays');
    const result = adjustFieldsForDisplays(
      ['tags'],
      'parent',
      { tags: { template: '{{name}}' } }
    );
    // `name` does not exist on `tags` (the target) → must NOT appear in the path
    expect(result).not.toContain('tags.tag_id.name');
    expect(result).not.toContain('tags.name');
  });

  it('expands valid override-template tokens for M2M through junction_field', async () => {
    vi.doMock('@directus/extensions-sdk', () => ({
      useStores: () => ({
        useFieldsStore: () => ({
          getField: (col: string, f: string) => {
            if (col === 'parent' && f === 'tags')
              return { field: 'tags', collection: 'parent', meta: { special: ['m2m'] } };
            if (col === 'parent_tags' && f === 'tag_id')
              return { field: 'tag_id', schema: { foreign_key_table: 'tags' } };
            if (col === 'tags' && f === 'label') return { field: 'label' };
            return null;
          },
          getFieldsForCollection: () => [],
        }),
        useRelationsStore: () => ({
          getRelationsForField: (col: string, f: string) =>
            col === 'parent' && f === 'tags'
              ? [
                  {
                    collection: 'parent_tags',
                    field: 'parent_id',
                    related_collection: 'parent',
                    meta: { junction_field: 'tag_id' },
                  },
                ]
              : [],
        }),
      }),
      useCollection: () => ({ primaryKeyField: { value: { field: 'id' } } }),
      useExtensions: () => ({ displays: { value: [] } }),
    }));
    const { adjustFieldsForDisplays } = await import('@/utils/adjustFieldsForDisplays');
    const result = adjustFieldsForDisplays(
      ['tags'],
      'parent',
      { tags: { template: '{{label}}' } }
    );
    expect(result).toContain('tags.tag_id.label');
  });
});

describe('adjustFieldsForDisplays — M2A (issue #60)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // Mirrors the live orders.treatment M2A: junction orders_treatment with a
  // `collection` discriminator and a polymorphic `item` FK to two collections.
  const mockM2A = (displayTemplate?: string) =>
    vi.doMock('@directus/extensions-sdk', () => ({
      useStores: () => ({
        useFieldsStore: () => ({
          getField: (col: string, f: string) => {
            if (col === 'orders' && f === 'treatment')
              return {
                field: 'treatment',
                collection: 'orders',
                meta: {
                  special: ['m2a'],
                  ...(displayTemplate
                    ? { display: 'related-values', display_options: { template: displayTemplate } }
                    : {}),
                },
              };
            if (col === 'partners_catalog' && (f === 'name' || f === 'catalog_id'))
              return { field: f };
            if (col === 'service' && f === 'name') return { field: 'name' };
            if (col === 'orders' && f === 'code') return { field: 'code' };
            if (col === 'catalog' && f === 'title') return { field: 'title' };
            return null;
          },
          getFieldsForCollection: () => [],
        }),
        useRelationsStore: () => ({
          getRelationsForField: (col: string, f: string) => {
            if (col === 'orders' && f === 'treatment')
              return [
                {
                  collection: 'orders_treatment',
                  field: 'orders_id',
                  related_collection: 'orders',
                  meta: { junction_field: 'item' },
                },
                {
                  collection: 'orders_treatment',
                  field: 'item',
                  related_collection: null,
                  meta: {
                    one_collection_field: 'collection',
                    one_allowed_collections: ['partners_catalog', 'service'],
                    junction_field: 'orders_id',
                  },
                },
              ];
            if (col === 'partners_catalog' && f === 'catalog_id')
              return [
                { collection: 'partners_catalog', field: 'catalog_id', related_collection: 'catalog' },
              ];
            return [];
          },
        }),
      }),
      useCollection: () => ({ primaryKeyField: { value: { field: 'id' } } }),
      useExtensions: () => ({ displays: { value: [] } }),
    }));

  it('expands a related-values M2A template into per-collection item paths', async () => {
    mockM2A('{{collection}}: {{item:partners_catalog.catalog_id.title}} {{item:service.name}}');
    const { adjustFieldsForDisplays } = await import('@/utils/adjustFieldsForDisplays');
    const result = adjustFieldsForDisplays(['treatment'], 'orders');
    expect(result).toEqual(
      expect.arrayContaining([
        'treatment.collection',
        'treatment.item:partners_catalog.catalog_id.title',
        'treatment.item:service.name',
      ])
    );
  });

  it('emits a bare parent token at the top level, never prefixed under the junction', async () => {
    mockM2A();
    const { adjustFieldsForDisplays } = await import('@/utils/adjustFieldsForDisplays');
    const result = adjustFieldsForDisplays(['treatment'], 'orders', {
      treatment: { template: '{{code}}' },
    });
    // `code` is a parent field: fetched at the top level, never prefixed under
    // the junction (which would 403). The discriminator is always emitted.
    expect(result).toContain('code');
    expect(result).not.toContain('treatment.code');
    expect(result).not.toContain('treatment.item');
    expect(result).not.toContain('treatment.id');
    expect(result).toContain('treatment.collection');
  });
});
