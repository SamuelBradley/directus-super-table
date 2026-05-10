import { describe, it, expect, vi } from 'vitest';
import {
  resolveTranslationsCollection,
  getTranslationFieldMetadata,
} from '@/utils/resolveTranslationsCollection';

describe('resolveTranslationsCollection', () => {
  it('returns the translations collection from meta.many_collection (canonical path)', () => {
    const relationsStore = {
      getRelationsForField: vi.fn().mockReturnValue([
        {
          collection: 'posts_translations',
          related_collection: 'posts',
          meta: {
            many_collection: 'posts_translations',
            one_collection: 'posts',
            one_field: 'translations',
          },
        },
      ]),
    };

    expect(resolveTranslationsCollection('posts', 'translations', relationsStore)).toBe(
      'posts_translations'
    );
  });

  it('falls back to relation.collection when meta.many_collection is missing', () => {
    const relationsStore = {
      getRelationsForField: vi.fn().mockReturnValue([
        { collection: 'posts_translations', related_collection: 'posts', meta: null },
      ]),
    };

    expect(resolveTranslationsCollection('posts', 'translations', relationsStore)).toBe(
      'posts_translations'
    );
  });

  it('returns null when no relations exist for the field', () => {
    const relationsStore = { getRelationsForField: vi.fn().mockReturnValue([]) };
    expect(resolveTranslationsCollection('posts', 'translations', relationsStore)).toBeNull();
  });

  it('returns null when getRelationsForField returns null/undefined', () => {
    const nullStore = { getRelationsForField: vi.fn().mockReturnValue(null) };
    const undefinedStore = { getRelationsForField: vi.fn().mockReturnValue(undefined) };

    expect(resolveTranslationsCollection('posts', 'translations', nullStore)).toBeNull();
    expect(resolveTranslationsCollection('posts', 'translations', undefinedStore)).toBeNull();
  });

  it('returns null gracefully when getRelationsForField throws', () => {
    const relationsStore = {
      getRelationsForField: vi.fn().mockImplementation(() => {
        throw new Error('store not loaded');
      }),
    };

    expect(resolveTranslationsCollection('posts', 'translations', relationsStore)).toBeNull();
  });

  it('works with custom alias names (not literal "translations")', () => {
    const relationsStore = {
      getRelationsForField: vi.fn().mockImplementation((collection: string, field: string) => {
        if (collection === 'articles' && field === 'i18n') {
          return [
            {
              collection: 'articles_i18n',
              related_collection: 'articles',
              meta: { many_collection: 'articles_i18n', one_field: 'i18n' },
            },
          ];
        }
        return [];
      }),
    };

    expect(resolveTranslationsCollection('articles', 'i18n', relationsStore)).toBe('articles_i18n');
    expect(relationsStore.getRelationsForField).toHaveBeenCalledWith('articles', 'i18n');
  });
});

describe('getTranslationFieldMetadata', () => {
  const nameField = {
    field: 'name',
    type: 'string',
    meta: { interface: 'input' },
  } as any;

  function makeStores(translationsCollection: string, fields: Record<string, unknown>) {
    return {
      fieldsStore: {
        getField: vi.fn().mockImplementation((collection: string, field: string) => {
          if (collection === translationsCollection) return fields[field] ?? null;
          return null;
        }),
      },
      relationsStore: {
        getRelationsForField: vi.fn().mockReturnValue([
          {
            collection: translationsCollection,
            related_collection: 'posts',
            meta: { many_collection: translationsCollection, one_field: 'translations' },
          },
        ]),
      },
    };
  }

  it('returns the schema field for an existing translation subfield', () => {
    const { fieldsStore, relationsStore } = makeStores('posts_translations', { name: nameField });

    expect(
      getTranslationFieldMetadata('posts', 'translations.name', fieldsStore, relationsStore)
    ).toEqual(nameField);
    expect(fieldsStore.getField).toHaveBeenCalledWith('posts_translations', 'name');
  });

  it('returns null for a non-existing subfield (no hardcoded fallback)', () => {
    // 'title' used to be silently mapped to a hardcoded definition by the old
    // commonTranslationFields fallback. After the fix, schema is the only
    // source — non-existing fields return null, and callers must decide how
    // to handle them (typically: skip rendering as a translation column).
    const { fieldsStore, relationsStore } = makeStores('posts_translations', {});

    expect(
      getTranslationFieldMetadata('posts', 'translations.title', fieldsStore, relationsStore)
    ).toBeNull();
  });

  it('returns null for keys without dot-notation', () => {
    const fieldsStore = { getField: vi.fn() };
    const relationsStore = { getRelationsForField: vi.fn() };

    expect(
      getTranslationFieldMetadata('posts', 'translations', fieldsStore, relationsStore)
    ).toBeNull();
    expect(
      getTranslationFieldMetadata('posts', '', fieldsStore, relationsStore)
    ).toBeNull();
    expect(fieldsStore.getField).not.toHaveBeenCalled();
    expect(relationsStore.getRelationsForField).not.toHaveBeenCalled();
  });

  it('returns null for malformed keys (trailing dot, leading dot)', () => {
    const fieldsStore = { getField: vi.fn() };
    const relationsStore = { getRelationsForField: vi.fn() };

    expect(
      getTranslationFieldMetadata('posts', 'translations.', fieldsStore, relationsStore)
    ).toBeNull();
    expect(
      getTranslationFieldMetadata('posts', '.name', fieldsStore, relationsStore)
    ).toBeNull();
  });

  it('returns null when the translations collection cannot be resolved', () => {
    const fieldsStore = { getField: vi.fn() };
    const relationsStore = { getRelationsForField: vi.fn().mockReturnValue([]) };

    expect(
      getTranslationFieldMetadata('posts', 'translations.name', fieldsStore, relationsStore)
    ).toBeNull();
    expect(fieldsStore.getField).not.toHaveBeenCalled();
  });

  it('handles deeply nested subfield keys (e.g. translations.seo.title)', () => {
    // Edge case: if a user configures a key like `translations.seo.title`, we
    // join everything after the first segment as the subfield name. The schema
    // lookup will then either find a literal field with that name or return null.
    const { fieldsStore, relationsStore } = makeStores('posts_translations', {
      'seo.title': { field: 'seo.title', type: 'string' } as any,
    });

    expect(
      getTranslationFieldMetadata('posts', 'translations.seo.title', fieldsStore, relationsStore)
    ).toEqual({ field: 'seo.title', type: 'string' });
  });

  it('works with renamed translations alias (e.g. i18n.title)', () => {
    const titleField = { field: 'title', type: 'string' } as any;
    const fieldsStore = {
      getField: vi.fn().mockImplementation((collection: string, field: string) => {
        if (collection === 'articles_i18n' && field === 'title') return titleField;
        return null;
      }),
    };
    const relationsStore = {
      getRelationsForField: vi.fn().mockReturnValue([
        {
          collection: 'articles_i18n',
          related_collection: 'articles',
          meta: { many_collection: 'articles_i18n', one_field: 'i18n' },
        },
      ]),
    };

    expect(
      getTranslationFieldMetadata('articles', 'i18n.title', fieldsStore, relationsStore)
    ).toEqual(titleField);
  });
});
