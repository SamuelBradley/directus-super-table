import { describe, it, expect, vi, beforeEach } from 'vitest';
import { expandTokensThroughRelation } from '@/utils/adjustFieldsForDisplays';
import { __resetWarnOnce } from '@/utils/warnOnce';

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
  // warnOnce dedupes per module instance; this file imports the module
  // statically, so reset the cache to keep every test order-independent.
  beforeEach(() => {
    __resetWarnOnce();
  });

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
        'tags.category': { field: 'category', meta: { special: ['m2o'] } },
        'categories.name': { field: 'name' },
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
        'tags.category': [
          { collection: 'tags', field: 'category', related_collection: 'categories' },
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
          'catalog.title': { field: 'title' },
          'service.name': { field: 'name' },
          'service.translations': { field: 'translations', meta: { special: ['translations'] } },
          'service.blocks': { field: 'blocks', meta: { special: ['m2a'] } },
          'service.attachments': { field: 'attachments', meta: { special: ['files'] } },
          'service_translations.label': { field: 'label' },
          'service_translations.languages_code': { field: 'languages_code' },
          // Parent (orders) and junction (orders_treatment) own fields, used to
          // validate bare parent tokens and field-prefixed junction tokens.
          'orders.code': { field: 'code' },
          'orders_treatment.sort': { field: 'sort' },
          // Junction- and parent-level M2O hops for deep junction/parent tokens.
          'orders_treatment.added_by': { field: 'added_by', meta: { special: ['m2o'] } },
          'directus_users.email': { field: 'email' },
          'orders.customer': { field: 'customer', meta: { special: ['m2o'] } },
          'customers.email': { field: 'email' },
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
          'partners_catalog.catalog_id': [
            { collection: 'partners_catalog', field: 'catalog_id', related_collection: 'catalog' },
          ],
          'service.translations': [
            {
              collection: 'service_translations',
              field: 'service_id',
              related_collection: 'service',
              meta: { one_field: 'translations', junction_field: 'languages_code' },
            },
          ],
          'orders_treatment.added_by': [
            {
              collection: 'orders_treatment',
              field: 'added_by',
              related_collection: 'directus_users',
            },
          ],
          'orders.customer': [
            { collection: 'orders', field: 'customer', related_collection: 'customers' },
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

    it('accepts the hand-written `<fieldName>:collection.field` shorthand', () => {
      const { fieldsStore, relationsStore } = m2aStores();
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

    it('expands the native picker tokens `<fieldName>.collection` / `<fieldName>.item:col.field`', () => {
      // What the field-key-prefixed picker actually emits (verified live against
      // Directus 11.11.0): the parent field key is prepended to every token.
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['treatment.collection', 'treatment.item:partners_catalog.name', 'treatment.item:service.name'],
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

    it('drops bare tokens that match no parent or junction field (no 403)', () => {
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['time', 'unknown_field'],
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

    it('emits a bare parent-level token at the top level (validated against parent)', () => {
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['treatment.collection', 'code'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual(['treatment.collection', 'code']);
    });

    it('drops a bare token that is not a field on the parent collection', () => {
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['ghost_field'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual(['treatment.collection']);
    });

    it('emits a field-prefixed junction-level token validated against the junction', () => {
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['treatment.sort'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual(['treatment.collection', 'treatment.sort']);
    });

    it('drops a field-prefixed token that is not a junction field', () => {
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['treatment.bogus'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual(['treatment.collection']);
    });

    it('strips the :lang suffix from a nested translation token for the API path', () => {
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['treatment.item:service.translations.label:de-DE'],
        fieldsStore as any,
        relationsStore as any
      );
      // The language companion is emitted alongside (pre-existing behavior;
      // the old mock just couldn't resolve the translations relation).
      expect(result).toEqual([
        'treatment.collection',
        'treatment.item:service.translations.label',
        'treatment.item:service.translations.languages_code',
      ]);
    });

    it('drops a deep token whose leaf does not exist (validated per segment)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['item:service.translations.missing_field'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual(['treatment.collection']);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing_field'));
      warnSpy.mockRestore();
    });

    it('drops a deep token whose middle segment is a scalar (not a relation)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['item:service.name.deeper'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual(['treatment.collection']);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('service.name'));
      warnSpy.mockRestore();
    });

    it('emits a valid deep translations path together with its language companion', () => {
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['item:service.translations.label'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual([
        'treatment.collection',
        'treatment.item:service.translations.label',
        'treatment.item:service.translations.languages_code',
      ]);
    });

    it('keeps a path it cannot walk further (nested M2A hop) — permissive, no warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['item:service.blocks.title'],
        fieldsStore as any,
        relationsStore as any
      );
      // `blocks` is an M2A hop (relatedCollection unknown) — validation stops
      // and keeps the token instead of guessing.
      expect(result).toEqual(['treatment.collection', 'treatment.item:service.blocks.title']);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('keeps the token when the fields store throws mid-walk (early-boot safety)', () => {
      const { fieldsStore, relationsStore } = m2aStores();
      const throwingFieldsStore = {
        getField: (col: string, f: string) => {
          if (col === 'service_translations') throw new Error('store not hydrated');
          return (fieldsStore as any).getField(col, f);
        },
      };
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['item:service.translations.label'],
        throwingFieldsStore as any,
        relationsStore as any
      );
      expect(result).toContain('treatment.item:service.translations.label');
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

    it('keeps a deep path across a files hop — permissive, no warn', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['item:service.attachments.directus_files_id.title'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual([
        'treatment.collection',
        'treatment.item:service.attachments.directus_files_id.title',
      ]);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('emits a deep junction token when every segment exists (M2A junction)', () => {
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['treatment.added_by.email'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual(['treatment.collection', 'treatment.added_by.email']);
    });

    it('drops a deep junction token whose leaf is missing, with a warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['treatment.added_by.ghost'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual(['treatment.collection']);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('directus_users.ghost'));
      warnSpy.mockRestore();
    });

    it('emits a deep parent token when every segment exists (M2A parent)', () => {
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['customer.email'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual(['treatment.collection', 'customer.email']);
    });

    it('drops a deep parent token whose middle segment is scalar, with a warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { fieldsStore, relationsStore } = m2aStores();
      const result = expandTokensThroughRelation(
        m2aField,
        'treatment',
        'orders',
        ['code.deeper'],
        fieldsStore as any,
        relationsStore as any
      );
      expect(result).toEqual(['treatment.collection']);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('orders.code'));
      warnSpy.mockRestore();
    });

    it('warns only once for the same dropped token across recomputes (warnOnce)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { fieldsStore, relationsStore } = m2aStores();
      for (let i = 0; i < 3; i++) {
        expandTokensThroughRelation(
          m2aField,
          'treatment',
          'orders',
          ['item:service.nonexistent'],
          fieldsStore as any,
          relationsStore as any
        );
      }
      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });
  });

  it('keeps a valid deep M2M token without warning (per-segment walk)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { fieldsStore, relationsStore } = makeStores(
      {
        'products_tags.tag_id': { field: 'tag_id', schema: { foreign_key_table: 'tags' } },
        'tags.category': { field: 'category', meta: { special: ['m2o'] } },
        'categories.name': { field: 'name' },
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
        'tags.category': [
          { collection: 'tags', field: 'category', related_collection: 'categories' },
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
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('drops a deep M2M token whose leaf is missing on the deep target, with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { fieldsStore, relationsStore } = makeStores(
      {
        'products_tags.tag_id': { field: 'tag_id', schema: { foreign_key_table: 'tags' } },
        'tags.category': { field: 'category', meta: { special: ['m2o'] } },
        'categories.name': { field: 'name' },
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
        'tags.category': [
          { collection: 'tags', field: 'category', related_collection: 'categories' },
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
      ['category.ghost'],
      fieldsStore as any,
      relationsStore as any
    );
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('categories.ghost'));
    warnSpy.mockRestore();
  });

  it('keeps a deep M2M token across a files hop — permissive, no warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { fieldsStore, relationsStore } = makeStores(
      {
        'products_tags.tag_id': { field: 'tag_id', schema: { foreign_key_table: 'tags' } },
        'tags.attachments': { field: 'attachments', meta: { special: ['files'] } },
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
      ['attachments.directus_files_id.title'],
      fieldsStore as any,
      relationsStore as any
    );
    expect(result).toEqual(['product_tags.tag_id.attachments.directus_files_id.title']);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('keeps a valid deep M2O token after walking each segment (role.name)', () => {
    const { fieldsStore, relationsStore } = makeStores(
      {
        'directus_users.role': { field: 'role', meta: { special: ['m2o'] } },
        'directus_roles.name': { field: 'name' },
      },
      {
        'parent.author': [
          { collection: 'parent', field: 'author', related_collection: 'directus_users' },
        ],
        'directus_users.role': [
          { collection: 'directus_users', field: 'role', related_collection: 'directus_roles' },
        ],
      }
    );
    const field = { collection: 'parent', field: 'author', meta: { special: ['m2o'] } } as any;
    const result = expandTokensThroughRelation(
      field,
      'author',
      'parent',
      ['role.name'],
      fieldsStore as any,
      relationsStore as any
    );
    expect(result).toEqual(['author.role.name']);
  });

  it('drops a deep M2O token whose middle segment is scalar, with a warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
      ['first_name.deeper'],
      fieldsStore as any,
      relationsStore as any
    );
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('directus_users.first_name'));
    warnSpy.mockRestore();
  });
});
