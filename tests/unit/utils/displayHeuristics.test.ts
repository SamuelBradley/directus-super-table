import { describe, it, expect } from 'vitest';
import {
  isRelational,
  isM2A,
  parseTemplateTokens,
  resolveTargetCollection,
  pickHeuristic,
  parseM2AToken,
  buildM2AFieldPath,
} from '@/utils/displayHeuristics';

describe('isRelational', () => {
  it('returns true when meta.special includes m2o, o2m, m2m, m2a, files, translations', () => {
    expect(isRelational({ meta: { special: ['m2o'] } } as any)).toBe(true);
    expect(isRelational({ meta: { special: ['o2m'] } } as any)).toBe(true);
    expect(isRelational({ meta: { special: ['m2m'] } } as any)).toBe(true);
    expect(isRelational({ meta: { special: ['m2a'] } } as any)).toBe(true);
    expect(isRelational({ meta: { special: ['files'] } } as any)).toBe(true);
    expect(isRelational({ meta: { special: ['translations'] } } as any)).toBe(true);
  });

  it('returns false for plain fields', () => {
    expect(isRelational({ meta: { special: [] } } as any)).toBe(false);
    expect(isRelational({ meta: {} } as any)).toBe(false);
    expect(isRelational({} as any)).toBe(false);
    expect(isRelational(null as any)).toBe(false);
  });
});

describe('isM2A', () => {
  it('returns true only for m2a special', () => {
    expect(isM2A({ meta: { special: ['m2a'] } } as any)).toBe(true);
    expect(isM2A({ meta: { special: ['m2o'] } } as any)).toBe(false);
    expect(isM2A({ meta: { special: ['m2m'] } } as any)).toBe(false);
  });

  it('returns false for missing/empty/null meta', () => {
    expect(isM2A({ meta: { special: [] } } as any)).toBe(false);
    expect(isM2A({ meta: { special: null } } as any)).toBe(false);
    expect(isM2A({ meta: null } as any)).toBe(false);
    expect(isM2A(null as any)).toBe(false);
    expect(isM2A(undefined as any)).toBe(false);
  });
});

describe('parseTemplateTokens', () => {
  it('extracts simple field tokens', () => {
    expect(parseTemplateTokens('{{name}}')).toEqual(['name']);
    expect(parseTemplateTokens('{{first_name}} {{last_name}}')).toEqual([
      'first_name',
      'last_name',
    ]);
  });

  it('handles whitespace inside the braces', () => {
    expect(parseTemplateTokens('{{ name }}')).toEqual(['name']);
    expect(parseTemplateTokens('{{  name  }}')).toEqual(['name']);
  });

  it('extracts nested paths as-is (caller decides what to do with them)', () => {
    expect(parseTemplateTokens('{{author.first_name}}')).toEqual(['author.first_name']);
  });

  it('returns [] for templates with no tokens', () => {
    expect(parseTemplateTokens('plain text')).toEqual([]);
    expect(parseTemplateTokens('')).toEqual([]);
  });

  it('deduplicates repeated tokens', () => {
    expect(parseTemplateTokens('{{name}} - {{name}}')).toEqual(['name']);
  });
});

describe('resolveTargetCollection', () => {
  function makeRelationsStore(relations: Record<string, any[]>) {
    return {
      getRelationsForField: (collection: string, fieldName: string) =>
        relations[`${collection}.${fieldName}`] ?? [],
    };
  }
  function makeFieldsStore(map: Record<string, any>) {
    return {
      getField: (collection: string | null, field: string) =>
        collection ? map[`${collection}.${field}`] ?? null : null,
    };
  }

  it('returns m2o target collection', () => {
    const relations = makeRelationsStore({
      'parent.author': [
        { collection: 'parent', field: 'author', related_collection: 'directus_users' },
      ],
    });
    const fields = makeFieldsStore({});
    const field = { collection: 'parent', field: 'author', meta: { special: ['m2o'] } } as any;
    expect(resolveTargetCollection(field, relations as any, fields as any)).toBe('directus_users');
  });

  it('returns target through the junction for m2m', () => {
    const relations = makeRelationsStore({
      'parent.tags': [
        {
          collection: 'parent_tags',
          field: 'parent_id',
          related_collection: 'parent',
          meta: { junction_field: 'tag_id' },
        },
      ],
    });
    const fields = makeFieldsStore({
      'parent_tags.tag_id': {
        schema: { foreign_key_table: 'tags' },
        meta: { special: ['m2o'] },
      },
    });
    const field = { collection: 'parent', field: 'tags', meta: { special: ['m2m'] } } as any;
    expect(resolveTargetCollection(field, relations as any, fields as any)).toBe('tags');
  });

  it('returns null when no relations are defined', () => {
    const relations = makeRelationsStore({});
    const fields = makeFieldsStore({});
    const field = { collection: 'parent', field: 'unknown', meta: { special: ['m2o'] } } as any;
    expect(resolveTargetCollection(field, relations as any, fields as any)).toBe(null);
  });

  it('returns null for a non-relational field', () => {
    const relations = makeRelationsStore({});
    const fields = makeFieldsStore({});
    const field = { collection: 'parent', field: 'title', meta: { special: [] } } as any;
    expect(resolveTargetCollection(field, relations as any, fields as any)).toBe(null);
  });

  it('returns null for M2A (polymorphic target has no single related collection)', () => {
    // The junction `item` FK is type-erased (foreign_key_table null), so there
    // is no single target to resolve — heuristics must stay out of M2A.
    const relations = makeRelationsStore({
      'orders.treatment': [
        {
          collection: 'orders_treatment',
          field: 'orders_id',
          related_collection: 'orders',
          meta: { junction_field: 'item' },
        },
      ],
    });
    const fields = makeFieldsStore({
      'orders_treatment.item': { schema: { foreign_key_table: null } },
    });
    const field = {
      collection: 'orders',
      field: 'treatment',
      meta: { special: ['m2a'] },
    } as any;
    expect(resolveTargetCollection(field, relations as any, fields as any)).toBe(null);
  });

  it('does NOT junction-traverse for translation fields (special=translations)', () => {
    // Translation relations also carry meta.junction_field (languages_code), but the
    // intended target is the translations collection itself — not the languages table.
    const relations = makeRelationsStore({
      'parent.translations': [
        {
          collection: 'parent_translations',
          field: 'parent_id',
          related_collection: 'parent',
          meta: { junction_field: 'languages_code' },
        },
      ],
    });
    const fields = makeFieldsStore({});
    const field = {
      collection: 'parent',
      field: 'translations',
      meta: { special: ['translations'] },
    } as any;
    expect(resolveTargetCollection(field, relations as any, fields as any)).toBe(
      'parent_translations'
    );
  });
});

describe('pickHeuristic', () => {
  it('returns null for non-relational fields', () => {
    const relations = { getRelationsForField: () => [] };
    const fields = { getField: () => null };
    const field = { meta: { special: [] } } as any;
    expect(pickHeuristic(field, relations as any, fields as any)).toBe(null);
  });

  it('uses first_name + last_name for directus_users targets', () => {
    const relations = {
      getRelationsForField: () => [
        { collection: 'parent', field: 'author', related_collection: 'directus_users' },
      ],
    };
    const fields = { getField: () => ({ field: 'first_name' }) };
    const field = {
      collection: 'parent',
      field: 'author',
      meta: { special: ['m2o'] },
    } as any;
    expect(pickHeuristic(field, relations as any, fields as any)).toBe(
      '{{first_name}} {{last_name}}'
    );
  });

  it('uses {{title}} for directus_files when title exists', () => {
    const relations = {
      getRelationsForField: () => [
        { collection: 'parent', field: 'avatar', related_collection: 'directus_files' },
      ],
    };
    const fields = {
      getField: (col: string, f: string) => (f === 'title' ? { field: 'title' } : null),
    };
    const field = {
      collection: 'parent',
      field: 'avatar',
      meta: { special: ['files'] },
    } as any;
    expect(pickHeuristic(field, relations as any, fields as any)).toBe('{{title}}');
  });

  it('falls back to {{filename_download}} for directus_files without title', () => {
    const relations = {
      getRelationsForField: () => [
        { collection: 'parent', field: 'avatar', related_collection: 'directus_files' },
      ],
    };
    const fields = { getField: () => null };
    const field = {
      collection: 'parent',
      field: 'avatar',
      meta: { special: ['files'] },
    } as any;
    expect(pickHeuristic(field, relations as any, fields as any)).toBe('{{filename_download}}');
  });

  it('tries name → title → label on a custom collection', () => {
    let getFieldCalls = 0;
    const relations = {
      getRelationsForField: () => [
        { collection: 'parent', field: 'category', related_collection: 'categories' },
      ],
    };
    const fields = {
      getField: (col: string, f: string) => {
        getFieldCalls++;
        return f === 'title' ? { field: 'title' } : null;
      },
    };
    const field = {
      collection: 'parent',
      field: 'category',
      meta: { special: ['m2o'] },
    } as any;
    expect(pickHeuristic(field, relations as any, fields as any)).toBe('{{title}}');
  });

  it('returns null when no heuristic matches', () => {
    const relations = {
      getRelationsForField: () => [
        { collection: 'parent', field: 'thing', related_collection: 'things' },
      ],
    };
    const fields = { getField: () => null };
    const field = {
      collection: 'parent',
      field: 'thing',
      meta: { special: ['m2o'] },
    } as any;
    expect(pickHeuristic(field, relations as any, fields as any)).toBe(null);
  });

  it('returns null for M2A fields (polymorphic, no single heuristic target)', () => {
    const relations = {
      getRelationsForField: () => [
        {
          collection: 'orders_treatment',
          field: 'orders_id',
          related_collection: 'orders',
          meta: { junction_field: 'item' },
        },
      ],
    };
    const fields = {
      getField: (_col: string, f: string) =>
        f === 'item' ? { schema: { foreign_key_table: null } } : null,
    };
    const field = {
      collection: 'orders',
      field: 'treatment',
      meta: { special: ['m2a'] },
    } as any;
    expect(pickHeuristic(field, relations as any, fields as any)).toBe(null);
  });

  it('returns null for translation fields (existing render path handles them)', () => {
    const relations = {
      getRelationsForField: () => [
        {
          collection: 'parent_translations',
          field: 'parent_id',
          related_collection: 'parent',
          meta: { junction_field: 'languages_code' },
        },
      ],
    };
    const fields = { getField: () => ({ field: 'title' }) };
    const field = {
      collection: 'parent',
      field: 'translations',
      meta: { special: ['translations'] },
    } as any;
    expect(pickHeuristic(field, relations as any, fields as any)).toBe(null);
  });
});

describe('parseM2AToken', () => {
  it('parses a per-collection token into prefix/collection/path', () => {
    expect(parseM2AToken('item:partners_catalog.name')).toEqual({
      prefix: 'item',
      collection: 'partners_catalog',
      path: 'name',
    });
  });

  it('keeps a nested path intact (M2A -> M2O -> scalar)', () => {
    expect(parseM2AToken('item:partners_catalog.catalog_id.title')).toEqual({
      prefix: 'item',
      collection: 'partners_catalog',
      path: 'catalog_id.title',
    });
  });

  it('returns null for a token without a path (no dot after collection)', () => {
    expect(parseM2AToken('item:partners_catalog')).toBeNull();
  });

  it('returns null for a plain token', () => {
    expect(parseM2AToken('collection')).toBeNull();
    expect(parseM2AToken('name')).toBeNull();
  });
});

describe('buildM2AFieldPath', () => {
  it('builds the API field path for an M2A per-collection token', () => {
    expect(buildM2AFieldPath('treatment', 'item', 'partners_catalog', 'name')).toBe(
      'treatment.item:partners_catalog.name'
    );
  });

  it('round-trips with parseM2AToken on the item-relative portion', () => {
    const built = buildM2AFieldPath('treatment', 'item', 'service', 'name');
    // strip the "<fieldKey>." prefix to get back the item-relative token
    const token = built.slice('treatment.'.length);
    expect(parseM2AToken(token)).toEqual({
      prefix: 'item',
      collection: 'service',
      path: 'name',
    });
  });
});
