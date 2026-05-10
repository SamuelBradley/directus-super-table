import { describe, it, expect, vi } from 'vitest';
import { buildSearchFilter } from '@/utils/buildSearchFilter';
import type { Field } from '@directus/types';

/**
 * These tests pin the *current* behavior of buildSearchFilter — the verbatim
 * port from super-table.vue:689-810. They serve as a safety net for
 * subsequent steps (cumulative hidden-field pass, top-level translations
 * search) and document the parts of the behavior that are intentional vs.
 * the parts that #24 will change.
 */

function field(partial: Partial<Field> & Pick<Field, 'field' | 'type'>): Field {
  return { collection: 'posts', meta: null, schema: null, ...partial } as Field;
}

function fieldsStore(byCollection: Record<string, Record<string, Field>>) {
  return {
    getField: vi.fn((collection: string | null, fieldKey: string) => {
      if (!collection) return null;
      return byCollection[collection]?.[fieldKey] ?? null;
    }),
  };
}

describe('buildSearchFilter — characterization (current behavior)', () => {
  it('returns null for empty / whitespace-only queries', () => {
    const args = {
      visibleFields: ['name'],
      fieldsInCollection: [field({ field: 'name', type: 'string' })],
      collection: 'posts',
      fieldsStore: fieldsStore({ posts: { name: field({ field: 'name', type: 'string' }) } }),
    };
    expect(buildSearchFilter({ query: '', ...args })).toBeNull();
    expect(buildSearchFilter({ query: '   ', ...args })).toBeNull();
  });

  it('builds _icontains clause for visible string fields', () => {
    const result = buildSearchFilter({
      query: 'hello',
      visibleFields: ['name'],
      fieldsInCollection: [field({ field: 'name', type: 'string' })],
      collection: 'posts',
      fieldsStore: fieldsStore({ posts: { name: field({ field: 'name', type: 'string' }) } }),
    });

    expect(result).toEqual({ _or: [{ name: { _icontains: 'hello' } }] });
  });

  it('uses _eq with raw value for UUID fields when query is a valid UUID', () => {
    const validUuid = '11111111-2222-3333-4444-555555555555';
    const result = buildSearchFilter({
      query: validUuid,
      visibleFields: ['author'],
      fieldsInCollection: [field({ field: 'author', type: 'uuid' })],
      collection: 'posts',
      fieldsStore: fieldsStore({
        posts: { author: field({ field: 'author', type: 'uuid' }) },
      }),
    });

    expect(result).toEqual({ _or: [{ author: { _eq: validUuid } }] });
  });

  it('uses _eq with parsed integer for integer fields when query is numeric', () => {
    const result = buildSearchFilter({
      query: '42',
      visibleFields: ['id'],
      fieldsInCollection: [field({ field: 'id', type: 'integer' })],
      collection: 'posts',
      fieldsStore: fieldsStore({ posts: { id: field({ field: 'id', type: 'integer' }) } }),
    });

    expect(result).toEqual({ _or: [{ id: { _eq: 42 } }] });
  });

  it('skips visible UUID/integer fields when input format does not match', () => {
    // 'hello' is neither a UUID nor an integer; visible UUID/integer fields
    // skip in that case (they only support _eq in Directus).
    const result = buildSearchFilter({
      query: 'hello',
      visibleFields: ['author', 'id', 'name'],
      fieldsInCollection: [
        field({ field: 'author', type: 'uuid' }),
        field({ field: 'id', type: 'integer' }),
        field({ field: 'name', type: 'string' }),
      ],
      collection: 'posts',
      fieldsStore: fieldsStore({
        posts: {
          author: field({ field: 'author', type: 'uuid' }),
          id: field({ field: 'id', type: 'integer' }),
          name: field({ field: 'name', type: 'string' }),
        },
      }),
    });

    expect(result).toEqual({ _or: [{ name: { _icontains: 'hello' } }] });
  });

  it('builds _some clause for dot-notation translation fields', () => {
    const result = buildSearchFilter({
      query: 'Berg',
      visibleFields: ['translations.name'],
      fieldsInCollection: [], // not consulted for dot-notation
      collection: 'posts',
      fieldsStore: fieldsStore({}),
    });

    expect(result).toEqual({
      _or: [{ translations: { _some: { name: { _icontains: 'Berg' } } } }],
    });
  });

  it('handles dot-notation for non-translation relations as direct _icontains', () => {
    const result = buildSearchFilter({
      query: 'Berg',
      visibleFields: ['author.email'],
      fieldsInCollection: [],
      collection: 'posts',
      fieldsStore: fieldsStore({}),
    });

    expect(result).toEqual({ _or: [{ 'author.email': { _icontains: 'Berg' } }] });
  });

  it('strips language suffix and deduplicates fields across multi-language columns', () => {
    const result = buildSearchFilter({
      query: 'Berg',
      visibleFields: ['translations.name:de-DE', 'translations.name:en-US'],
      fieldsInCollection: [],
      collection: 'posts',
      fieldsStore: fieldsStore({}),
    });

    // Both columns share the actualFieldKey 'translations.name' — only one clause emitted.
    expect(result).toEqual({
      _or: [{ translations: { _some: { name: { _icontains: 'Berg' } } } }],
    });
  });

  it('searches all collection text fields when no visible field is searchable', () => {
    // Visible field is unsearchable (boolean), so only the cumulative pass
    // contributes — exactly like before, but now via the cumulative path.
    const result = buildSearchFilter({
      query: 'hello',
      visibleFields: ['archived'],
      fieldsInCollection: [
        field({ field: 'archived', type: 'boolean' }),
        field({ field: 'name', type: 'string' }),
        field({ field: 'description', type: 'text' }),
      ],
      collection: 'posts',
      fieldsStore: fieldsStore({
        posts: { archived: field({ field: 'archived', type: 'boolean' }) },
      }),
    });

    expect(result).toEqual({
      _or: [
        { name: { _icontains: 'hello' } },
        { description: { _icontains: 'hello' } },
      ],
    });
  });

  it('cumulative pass: includes hidden/non-visible fields IN ADDITION to visible ones (#24 Sub-Bug A fix)', () => {
    // The visible 'name' clause exists, AND the non-visible 'description' is
    // also searched because the cumulative pass now runs unconditionally.
    // Native `?search=` would do the same — this aligns the layout's behavior
    // with the broad coverage Directus users expect.
    const result = buildSearchFilter({
      query: 'hello',
      visibleFields: ['name'],
      fieldsInCollection: [
        field({ field: 'name', type: 'string' }),
        field({ field: 'description', type: 'text' }),
      ],
      collection: 'posts',
      fieldsStore: fieldsStore({
        posts: { name: field({ field: 'name', type: 'string' }) },
      }),
    });

    expect(result).toEqual({
      _or: [
        { name: { _icontains: 'hello' } },
        { description: { _icontains: 'hello' } },
      ],
    });
  });

  it('cumulative pass: skips fields that the visible pass already covered (no duplicates)', () => {
    // Both 'name' and 'description' are visible AND in fieldsInCollection.
    // The cumulative pass must skip them via processedFields.
    const result = buildSearchFilter({
      query: 'hello',
      visibleFields: ['name', 'description'],
      fieldsInCollection: [
        field({ field: 'name', type: 'string' }),
        field({ field: 'description', type: 'text' }),
      ],
      collection: 'posts',
      fieldsStore: fieldsStore({
        posts: {
          name: field({ field: 'name', type: 'string' }),
          description: field({ field: 'description', type: 'text' }),
        },
      }),
    });

    expect(result).toEqual({
      _or: [
        { name: { _icontains: 'hello' } },
        { description: { _icontains: 'hello' } },
      ],
    });
  });

  it('hidden-field fallback excludes fields with meta.hidden === true', () => {
    const result = buildSearchFilter({
      query: 'hello',
      visibleFields: ['archived'],
      fieldsInCollection: [
        field({ field: 'archived', type: 'boolean' }),
        field({ field: 'name', type: 'string' }),
        field({ field: 'internal', type: 'string', meta: { hidden: true } as any }),
      ],
      collection: 'posts',
      fieldsStore: fieldsStore({
        posts: { archived: field({ field: 'archived', type: 'boolean' }) },
      }),
    });

    expect(result).toEqual({ _or: [{ name: { _icontains: 'hello' } }] });
  });

  it('returns null when nothing produces a clause', () => {
    const result = buildSearchFilter({
      query: 'hello',
      visibleFields: ['archived'],
      fieldsInCollection: [field({ field: 'archived', type: 'boolean' })],
      collection: 'posts',
      fieldsStore: fieldsStore({
        posts: { archived: field({ field: 'archived', type: 'boolean' }) },
      }),
    });

    expect(result).toBeNull();
  });
});

describe('buildSearchFilter — top-level translations alias (#24 Sub-Bug B fix)', () => {
  function makeStores(opts: {
    parentCollection: string;
    aliasFieldName: string;
    aliasFieldSpecial?: string[];
    translationsCollection: string;
    translationsFields: Field[];
  }) {
    const aliasField = field({
      field: opts.aliasFieldName,
      type: 'alias',
      meta: { special: opts.aliasFieldSpecial ?? ['translations'] } as any,
    });

    return {
      aliasField,
      fieldsStore: {
        getField: vi.fn((collection: string | null, fieldKey: string) => {
          if (collection === opts.parentCollection && fieldKey === opts.aliasFieldName) {
            return aliasField;
          }
          return null;
        }),
        getFieldsForCollection: vi.fn((collection: string) =>
          collection === opts.translationsCollection ? opts.translationsFields : []
        ),
      },
      relationsStore: {
        getRelationsForField: vi.fn((collection: string, fieldKey: string) => {
          if (collection === opts.parentCollection && fieldKey === opts.aliasFieldName) {
            return [
              {
                collection: opts.translationsCollection,
                related_collection: opts.parentCollection,
                meta: {
                  many_collection: opts.translationsCollection,
                  one_collection: opts.parentCollection,
                  one_field: opts.aliasFieldName,
                },
              },
            ];
          }
          return [];
        }),
      },
    };
  }

  it('emits one outer-_or clause per searchable text field (avoids _or-inside-_some Directus bug)', () => {
    const { aliasField, fieldsStore, relationsStore } = makeStores({
      parentCollection: 'posts',
      aliasFieldName: 'translations',
      translationsCollection: 'posts_translations',
      translationsFields: [
        field({ field: 'name', type: 'string' }),
        field({ field: 'description', type: 'text' }),
      ],
    });

    const result = buildSearchFilter({
      query: 'Berg',
      visibleFields: ['translations'],
      fieldsInCollection: [aliasField],
      collection: 'posts',
      fieldsStore,
      relationsStore,
    });

    expect(result).toEqual({
      _or: [
        { translations: { _some: { name: { _icontains: 'Berg' } } } },
        { translations: { _some: { description: { _icontains: 'Berg' } } } },
      ],
    });
  });

  it('emits a single clause when only one translation column is searchable', () => {
    const { aliasField, fieldsStore, relationsStore } = makeStores({
      parentCollection: 'posts',
      aliasFieldName: 'translations',
      translationsCollection: 'posts_translations',
      translationsFields: [field({ field: 'name', type: 'string' })],
    });

    const result = buildSearchFilter({
      query: 'Berg',
      visibleFields: ['translations'],
      fieldsInCollection: [aliasField],
      collection: 'posts',
      fieldsStore,
      relationsStore,
    });

    expect(result).toEqual({
      _or: [{ translations: { _some: { name: { _icontains: 'Berg' } } } }],
    });
  });

  it('works with renamed translations alias (e.g. i18n)', () => {
    const { aliasField, fieldsStore, relationsStore } = makeStores({
      parentCollection: 'articles',
      aliasFieldName: 'i18n',
      translationsCollection: 'articles_i18n',
      translationsFields: [field({ field: 'title', type: 'string' })],
    });

    const result = buildSearchFilter({
      query: 'foo',
      visibleFields: ['i18n'],
      fieldsInCollection: [aliasField],
      collection: 'articles',
      fieldsStore,
      relationsStore,
    });

    expect(result).toEqual({
      _or: [{ i18n: { _some: { title: { _icontains: 'foo' } } } }],
    });
  });

  it('excludes M2O fields from the translations search (e.g. <parent>_id, languages_code)', () => {
    const { aliasField, fieldsStore, relationsStore } = makeStores({
      parentCollection: 'posts',
      aliasFieldName: 'translations',
      translationsCollection: 'posts_translations',
      translationsFields: [
        field({ field: 'id', type: 'integer' }),
        field({
          field: 'posts_id',
          type: 'integer',
          meta: { special: ['m2o'] } as any,
        }),
        field({
          field: 'languages_code',
          type: 'string',
          meta: { special: ['m2o'] } as any, // string-typed M2O — must still be excluded
        }),
        field({ field: 'name', type: 'string' }),
      ],
    });

    const result = buildSearchFilter({
      query: 'Berg',
      visibleFields: ['translations'],
      fieldsInCollection: [aliasField],
      collection: 'posts',
      fieldsStore,
      relationsStore,
    });

    expect(result).toEqual({
      _or: [{ translations: { _some: { name: { _icontains: 'Berg' } } } }],
    });
  });

  it('excludes hidden translation fields', () => {
    const { aliasField, fieldsStore, relationsStore } = makeStores({
      parentCollection: 'posts',
      aliasFieldName: 'translations',
      translationsCollection: 'posts_translations',
      translationsFields: [
        field({ field: 'name', type: 'string' }),
        field({
          field: 'internal_notes',
          type: 'string',
          meta: { hidden: true } as any,
        }),
      ],
    });

    const result = buildSearchFilter({
      query: 'Berg',
      visibleFields: ['translations'],
      fieldsInCollection: [aliasField],
      collection: 'posts',
      fieldsStore,
      relationsStore,
    });

    expect(result).toEqual({
      _or: [{ translations: { _some: { name: { _icontains: 'Berg' } } } }],
    });
  });

  it('excludes fields with schema.foreign_key_table even when meta.special is missing', () => {
    const { aliasField, fieldsStore, relationsStore } = makeStores({
      parentCollection: 'posts',
      aliasFieldName: 'translations',
      translationsCollection: 'posts_translations',
      translationsFields: [
        field({
          field: 'languages_code',
          type: 'string',
          meta: null,
          schema: { foreign_key_table: 'languages' } as any,
        }),
        field({ field: 'name', type: 'string' }),
      ],
    });

    const result = buildSearchFilter({
      query: 'Berg',
      visibleFields: ['translations'],
      fieldsInCollection: [aliasField],
      collection: 'posts',
      fieldsStore,
      relationsStore,
    });

    expect(result).toEqual({
      _or: [{ translations: { _some: { name: { _icontains: 'Berg' } } } }],
    });
  });

  it('skips clause when translations collection cannot be resolved', () => {
    const aliasField = field({
      field: 'translations',
      type: 'alias',
      meta: { special: ['translations'] } as any,
    });
    const result = buildSearchFilter({
      query: 'Berg',
      visibleFields: ['translations'],
      fieldsInCollection: [aliasField],
      collection: 'posts',
      fieldsStore: {
        getField: vi.fn().mockReturnValue(aliasField),
        getFieldsForCollection: vi.fn(),
      },
      relationsStore: { getRelationsForField: vi.fn().mockReturnValue([]) },
    });

    // No translations clause is added — but field is still marked processed,
    // so the cumulative pass does not synthesize a string clause for it.
    expect(result).toBeNull();
  });

  it('skips clause when getFieldsForCollection is not available on the store', () => {
    const aliasField = field({
      field: 'translations',
      type: 'alias',
      meta: { special: ['translations'] } as any,
    });
    const result = buildSearchFilter({
      query: 'Berg',
      visibleFields: ['translations'],
      fieldsInCollection: [aliasField],
      collection: 'posts',
      fieldsStore: { getField: vi.fn().mockReturnValue(aliasField) }, // no getFieldsForCollection
      relationsStore: { getRelationsForField: vi.fn().mockReturnValue([]) },
    });

    expect(result).toBeNull();
  });

  it('skips translations alias when relationsStore is omitted from args', () => {
    const aliasField = field({
      field: 'translations',
      type: 'alias',
      meta: { special: ['translations'] } as any,
    });
    const result = buildSearchFilter({
      query: 'Berg',
      visibleFields: ['translations'],
      fieldsInCollection: [aliasField],
      collection: 'posts',
      fieldsStore: { getField: vi.fn().mockReturnValue(aliasField) },
      // relationsStore omitted — translations search opts out, no crash
    });

    expect(result).toBeNull();
  });

  it('handles multiple translations relations (e.g. translations + seo_translations)', () => {
    const translationsAlias = field({
      field: 'translations',
      type: 'alias',
      meta: { special: ['translations'] } as any,
    });
    const seoAlias = field({
      field: 'seo_translations',
      type: 'alias',
      meta: { special: ['translations'] } as any,
    });

    const fieldsByCollection: Record<string, Field[]> = {
      posts_translations: [field({ field: 'name', type: 'string' })],
      posts_seo: [field({ field: 'meta_title', type: 'string' })],
    };

    const result = buildSearchFilter({
      query: 'Berg',
      visibleFields: ['translations', 'seo_translations'],
      fieldsInCollection: [translationsAlias, seoAlias],
      collection: 'posts',
      fieldsStore: {
        getField: vi.fn((coll: string | null, key: string) => {
          if (coll === 'posts' && key === 'translations') return translationsAlias;
          if (coll === 'posts' && key === 'seo_translations') return seoAlias;
          return null;
        }),
        getFieldsForCollection: vi.fn((coll: string) => fieldsByCollection[coll] ?? []),
      },
      relationsStore: {
        getRelationsForField: vi.fn((coll: string, key: string) => {
          if (coll === 'posts' && key === 'translations') {
            return [
              {
                collection: 'posts_translations',
                meta: { many_collection: 'posts_translations' },
              },
            ];
          }
          if (coll === 'posts' && key === 'seo_translations') {
            return [
              {
                collection: 'posts_seo',
                meta: { many_collection: 'posts_seo' },
              },
            ];
          }
          return [];
        }),
      },
    });

    expect(result).toEqual({
      _or: [
        { translations: { _some: { name: { _icontains: 'Berg' } } } },
        { seo_translations: { _some: { meta_title: { _icontains: 'Berg' } } } },
      ],
    });
  });

  it('combines translations clauses with visible string clauses and cumulative hidden ones', () => {
    const translationsAlias = field({
      field: 'translations',
      type: 'alias',
      meta: { special: ['translations'] } as any,
    });
    const codeField = field({ field: 'code', type: 'string' });
    const internalField = field({ field: 'internal', type: 'string' });

    const result = buildSearchFilter({
      query: 'Berg',
      visibleFields: ['code', 'translations'],
      fieldsInCollection: [codeField, translationsAlias, internalField],
      collection: 'posts',
      fieldsStore: {
        getField: vi.fn((coll: string | null, key: string) => {
          if (coll === 'posts' && key === 'code') return codeField;
          if (coll === 'posts' && key === 'translations') return translationsAlias;
          return null;
        }),
        getFieldsForCollection: vi.fn(() => [
          field({ field: 'name', type: 'string' }),
          field({ field: 'body', type: 'text' }),
        ]),
      },
      relationsStore: {
        getRelationsForField: vi.fn(() => [
          { collection: 'posts_translations', meta: { many_collection: 'posts_translations' } },
        ]),
      },
    });

    expect(result).toEqual({
      _or: [
        { code: { _icontains: 'Berg' } },
        { translations: { _some: { name: { _icontains: 'Berg' } } } },
        { translations: { _some: { body: { _icontains: 'Berg' } } } },
        { internal: { _icontains: 'Berg' } },
      ],
    });
  });
});
