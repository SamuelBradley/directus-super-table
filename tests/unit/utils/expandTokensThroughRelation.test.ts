import { describe, it, expect } from 'vitest';
import { expandTokensThroughRelation } from '@/utils/adjustFieldsForDisplays';

const makeStores = (
  fieldsByPath: Record<string, any>,
  relationsByPath: Record<string, any[]>
) => ({
  fieldsStore: {
    getField: (col: string, f: string) => fieldsByPath[`${col}.${f}`] ?? null,
  },
  relationsStore: {
    getRelationsForField: (col: string, f: string) => relationsByPath[`${col}.${f}`] ?? [],
  },
});

describe('expandTokensThroughRelation', () => {
  it('returns fieldKey.token for plain M2O when target field exists', () => {
    const { fieldsStore, relationsStore } = makeStores(
      { 'directus_users.first_name': { field: 'first_name' } },
      {
        'parent.author': [
          { collection: 'parent', field: 'author', related_collection: 'directus_users' },
        ],
      }
    );
    const field = { collection: 'parent', field: 'author', meta: { special: ['m2o'] } } as any;
    const result = expandTokensThroughRelation(
      field,
      'author',
      'parent',
      ['first_name'],
      fieldsStore as any,
      relationsStore as any
    );
    expect(result).toEqual(['author.first_name']);
  });

  it('inserts junction_field for M2M relations', () => {
    const { fieldsStore, relationsStore } = makeStores(
      {
        'products_tags.tag_id': {
          field: 'tag_id',
          schema: { foreign_key_table: 'tags' },
        },
        'tags.name': { field: 'name' },
      },
      {
        'products.product_tags': [
          {
            collection: 'products_tags',
            field: 'product_id',
            related_collection: 'products',
            meta: { junction_field: 'tag_id' },
          },
        ],
      }
    );
    const field = {
      collection: 'products',
      field: 'product_tags',
      meta: { special: ['m2m'] },
    } as any;
    const result = expandTokensThroughRelation(
      field,
      'product_tags',
      'products',
      ['name'],
      fieldsStore as any,
      relationsStore as any
    );
    expect(result).toEqual(['product_tags.tag_id.name']);
  });

  it('drops invalid tokens for M2M when target lacks the field', () => {
    const { fieldsStore, relationsStore } = makeStores(
      {
        'products_tags.tag_id': {
          field: 'tag_id',
          schema: { foreign_key_table: 'tags' },
        },
        'tags.id': { field: 'id' },
        // NOTE: tags.name intentionally missing
      },
      {
        'products.product_tags': [
          {
            collection: 'products_tags',
            field: 'product_id',
            related_collection: 'products',
            meta: { junction_field: 'tag_id' },
          },
        ],
      }
    );
    const field = {
      collection: 'products',
      field: 'product_tags',
      meta: { special: ['m2m'] },
    } as any;
    const result = expandTokensThroughRelation(
      field,
      'product_tags',
      'products',
      ['name'],
      fieldsStore as any,
      relationsStore as any
    );
    expect(result).toEqual([]);
  });

  it('drops invalid tokens for M2O when target lacks the field', () => {
    const { fieldsStore, relationsStore } = makeStores(
      { 'directus_users.id': { field: 'id' } },
      {
        'parent.author': [
          { collection: 'parent', field: 'author', related_collection: 'directus_users' },
        ],
      }
    );
    const field = { collection: 'parent', field: 'author', meta: { special: ['m2o'] } } as any;
    const result = expandTokensThroughRelation(
      field,
      'author',
      'parent',
      ['nonexistent'],
      fieldsStore as any,
      relationsStore as any
    );
    expect(result).toEqual([]);
  });

  it('keeps dotted-path tokens as-is and prepends fieldKey + junction (M2M)', () => {
    const { fieldsStore, relationsStore } = makeStores(
      {
        'products_tags.tag_id': {
          field: 'tag_id',
          schema: { foreign_key_table: 'tags' },
        },
        'tags.category': { field: 'category' },
      },
      {
        'products.product_tags': [
          {
            collection: 'products_tags',
            field: 'product_id',
            related_collection: 'products',
            meta: { junction_field: 'tag_id' },
          },
        ],
      }
    );
    const field = {
      collection: 'products',
      field: 'product_tags',
      meta: { special: ['m2m'] },
    } as any;
    const result = expandTokensThroughRelation(
      field,
      'product_tags',
      'products',
      ['category.name'],
      fieldsStore as any,
      relationsStore as any
    );
    expect(result).toEqual(['product_tags.tag_id.category.name']);
  });

  it('does NOT double-prepend junction_field if the token already starts with it', () => {
    // User wrote {{tag_id.name}} directly in the template — junction_field is
    // already explicit. We must avoid producing product_tags.tag_id.tag_id.name.
    const { fieldsStore, relationsStore } = makeStores(
      {
        'products_tags.tag_id': {
          field: 'tag_id',
          schema: { foreign_key_table: 'tags' },
        },
        'tags.name': { field: 'name' },
      },
      {
        'products.product_tags': [
          {
            collection: 'products_tags',
            field: 'product_id',
            related_collection: 'products',
            meta: { junction_field: 'tag_id' },
          },
        ],
      }
    );
    const field = {
      collection: 'products',
      field: 'product_tags',
      meta: { special: ['m2m'] },
    } as any;
    const result = expandTokensThroughRelation(
      field,
      'product_tags',
      'products',
      ['tag_id.name'],
      fieldsStore as any,
      relationsStore as any
    );
    expect(result).toEqual(['product_tags.tag_id.name']);
  });

  it('returns fieldKey.token for translations without field-existence validation', () => {
    const { fieldsStore, relationsStore } = makeStores(
      {
        // NOTE: translations target has no `title` — but we still emit the path
        // because translations have client-side render logic that handles missing.
      },
      {
        'parent.translations': [
          {
            collection: 'parent_translations',
            field: 'parent_id',
            related_collection: 'parent',
            meta: { junction_field: 'languages_code' },
          },
        ],
      }
    );
    const field = {
      collection: 'parent',
      field: 'translations',
      meta: { special: ['translations'] },
    } as any;
    const result = expandTokensThroughRelation(
      field,
      'translations',
      'parent',
      ['title'],
      fieldsStore as any,
      relationsStore as any
    );
    expect(result).toEqual(['translations.title']);
  });

  it('returns [] when M2M has no junction_field meta (defensive)', () => {
    const { fieldsStore, relationsStore } = makeStores(
      {},
      {
        'parent.tags': [
          {
            collection: 'parent_tags',
            field: 'parent_id',
            related_collection: 'parent',
            // NOTE: no meta.junction_field
          },
        ],
      }
    );
    const field = { collection: 'parent', field: 'tags', meta: { special: ['m2m'] } } as any;
    const result = expandTokensThroughRelation(
      field,
      'tags',
      'parent',
      ['name'],
      fieldsStore as any,
      relationsStore as any
    );
    expect(result).toEqual([]);
  });

  describe('M2A', () => {
    // Mirrors the live `orders.treatment` shape: a junction with a `collection`
    // discriminator and a polymorphic `item` FK to two allowed collections.
    const m2aStores = () =>
      makeStores(
        {
          'partners_catalog.name': { field: 'name' },
          'partners_catalog.catalog_id': { field: 'catalog_id' },
          'service.name': { field: 'name' },
        },
        {
          'orders.treatment': [
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
          ],
        }
      );
    const m2aField = {
      collection: 'orders',
      field: 'treatment',
      meta: { special: ['m2a'] },
    } as any;

    it('expands per-collection item tokens and always emits the discriminator', () => {
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['item:partners_catalog.name', 'item:service.name'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual([
        'treatment.collection',
        'treatment.item:partners_catalog.name',
        'treatment.item:service.name',
      ]);
    });

    it('accepts the picker prefix (field name) as well as item', () => {
      const { fieldsStore, relationsStore } = m2aStores();
      // The native display-template picker emits `<fieldName>:collection.field`.
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['treatment:partners_catalog.name', 'treatment:service.name'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual([
        'treatment.collection',
        'treatment.item:partners_catalog.name',
        'treatment.item:service.name',
      ]);
    });

    it('keeps nested item paths intact (M2A -> M2O -> scalar)', () => {
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['item:partners_catalog.catalog_id.title'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual([
        'treatment.collection',
        'treatment.item:partners_catalog.catalog_id.title',
      ]);
    });

    it('drops bare tokens so they never 403 against the junction', () => {
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['code', 'time'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual(['treatment.collection']);
    });

    it('drops tokens for collections outside one_allowed_collections', () => {
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['item:other_collection.name'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual(['treatment.collection']);
    });

    it('drops tokens whose field is missing on the target collection', () => {
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['item:service.nonexistent'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual(['treatment.collection']);
    });

    it('returns [] when the M2A item relation is missing (defensive)', () => {
      const { fieldsStore, relationsStore } = makeStores(
        {},
        {
          'orders.treatment': [
            {
              collection: 'orders_treatment',
              field: 'orders_id',
              related_collection: 'orders',
              // NOTE: no one_collection_field relation present
            },
          ],
        }
      );
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['item:partners_catalog.name'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual([]);
    });
  });
});
