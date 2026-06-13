import { describe, it, expect } from 'vitest';
import {
  resolveRelationalPath,
  collectTranslationLanguagePaths,
  splitPathSegments,
  type HopInfo,
} from '@/utils/resolveRelationalPath';

// A mock schema: maps `collection.field` to its relational shape. In production
// this comes from the relations/fields stores; here it's a plain table so the
// resolver can be tested without Directus.
const SCHEMA: Record<string, HopInfo> = {
  'service.name': { kind: 'scalar' },
  'service.translations': {
    kind: 'translations',
    relatedCollection: 'service_translations',
    languageField: 'languages_code',
  },
  'service_translations.label': { kind: 'scalar' },

  'partners_catalog.catalog_id': { kind: 'm2o', relatedCollection: 'catalog' },
  'catalog.title': { kind: 'scalar' },
  // A second M2O hop after catalog, so a pure M2O -> M2O -> scalar chain is covered.
  'catalog.owner': { kind: 'm2o', relatedCollection: 'owner' },
  'owner.name': { kind: 'scalar' },
  // A SECOND translations relation that uses a DIFFERENT language field name,
  // to prove we honour the detected field rather than hardcoding languages_code.
  'catalog.translations': {
    kind: 'translations',
    relatedCollection: 'catalog_translations',
    languageField: 'lang',
  },
  'catalog_translations.title': { kind: 'scalar' },

  'parent.children': { kind: 'o2m', relatedCollection: 'child' },
  'child.name': { kind: 'scalar' },
};

const describeHop = (collection: string, field: string): HopInfo =>
  SCHEMA[`${collection}.${field}`] ?? { kind: 'scalar' };

describe('resolveRelationalPath', () => {
  it('returns the data itself for an empty path', () => {
    expect(resolveRelationalPath({ a: 1 }, '', 'service', describeHop, null)).toEqual({ a: 1 });
  });

  it('resolves a plain scalar field', () => {
    const item = { name: 'Installation' };
    expect(resolveRelationalPath(item, 'name', 'service', describeHop, null)).toBe('Installation');
  });

  it('descends an M2O chain (catalog_id.title)', () => {
    const item = { catalog_id: { title: 'Premium' } };
    expect(resolveRelationalPath(item, 'catalog_id.title', 'partners_catalog', describeHop, null)).toBe(
      'Premium'
    );
  });

  it('descends a pure M2O -> M2O -> scalar chain (catalog_id.owner.name)', () => {
    const item = { catalog_id: { owner: { name: 'ACME' } } };
    expect(
      resolveRelationalPath(item, 'catalog_id.owner.name', 'partners_catalog', describeHop, null)
    ).toBe('ACME');
  });

  it('picks the translation row matching the active language', () => {
    const item = {
      translations: [
        { languages_code: 'en-US', label: 'Maintenance' },
        { languages_code: 'de-DE', label: 'Wartung' },
      ],
    };
    expect(resolveRelationalPath(item, 'translations.label', 'service', describeHop, 'de-DE')).toBe(
      'Wartung'
    );
  });

  it('honours the DETECTED language field, not a hardcoded one', () => {
    const item = {
      translations: [
        { lang: 'en-US', title: 'Catalog' },
        { lang: 'de-DE', title: 'Katalog' },
      ],
    };
    // catalog.translations uses `lang`, not `languages_code`.
    expect(resolveRelationalPath(item, 'translations.title', 'catalog', describeHop, 'de-DE')).toBe(
      'Katalog'
    );
  });

  it('falls back to the first translation row when the language is absent', () => {
    const item = {
      translations: [
        { languages_code: 'en-US', label: 'Maintenance' },
        { languages_code: 'de-DE', label: 'Wartung' },
      ],
    };
    expect(resolveRelationalPath(item, 'translations.label', 'service', describeHop, 'fr-FR')).toBe(
      'Maintenance'
    );
  });

  it('resolves an arbitrarily deep mixed path (M2O -> translations)', () => {
    const item = {
      catalog_id: {
        translations: [
          { lang: 'en-US', title: 'Premium' },
          { lang: 'de-DE', title: 'Premium (DE)' },
        ],
      },
    };
    expect(
      resolveRelationalPath(item, 'catalog_id.translations.title', 'partners_catalog', describeHop, 'de-DE')
    ).toBe('Premium (DE)');
  });

  it('takes the first element for a plain to-many hop (documented boundary)', () => {
    const item = { children: [{ name: 'First' }, { name: 'Second' }] };
    expect(resolveRelationalPath(item, 'children.name', 'parent', describeHop, null)).toBe('First');
  });

  it('skips $-prefixed virtual segments', () => {
    const item = { name: 'X' };
    expect(resolveRelationalPath(item, '$thumbnail.name', 'service', describeHop, null)).toBe('X');
  });

  it('is null/undefined safe (no throw)', () => {
    expect(resolveRelationalPath(null, 'translations.label', 'service', describeHop, 'de-DE')).toBeUndefined();
    expect(resolveRelationalPath({}, 'translations.label', 'service', describeHop, 'de-DE')).toBeUndefined();
    expect(
      resolveRelationalPath({ translations: null }, 'translations.label', 'service', describeHop, 'de-DE')
    ).toBeUndefined();
    expect(resolveRelationalPath('scalar', 'foo', 'service', describeHop, null)).toBeUndefined();
  });

  it('returns undefined for a missing field rather than throwing', () => {
    expect(resolveRelationalPath({ name: 'X' }, 'nope', 'service', describeHop, null)).toBeUndefined();
  });
});

describe('collectTranslationLanguagePaths', () => {
  it('returns the language-field sub-path for a translations hop', () => {
    expect(collectTranslationLanguagePaths('translations.label', 'service', describeHop)).toEqual([
      'translations.languages_code',
    ]);
  });

  it('uses the detected language field (custom name) and handles depth', () => {
    expect(
      collectTranslationLanguagePaths('catalog_id.translations.title', 'partners_catalog', describeHop)
    ).toEqual(['catalog_id.translations.lang']);
  });

  it('returns [] when the path crosses no translations relation', () => {
    expect(
      collectTranslationLanguagePaths('catalog_id.title', 'partners_catalog', describeHop)
    ).toEqual([]);
    expect(collectTranslationLanguagePaths('name', 'service', describeHop)).toEqual([]);
  });
});

describe('splitPathSegments', () => {
  it('splits a dotted path into segments', () => {
    expect(splitPathSegments('translations.label')).toEqual(['translations', 'label']);
  });

  it('returns a single-segment array for a plain field', () => {
    expect(splitPathSegments('name')).toEqual(['name']);
  });

  it('trims whitespace around segments', () => {
    expect(splitPathSegments(' a . b ')).toEqual(['a', 'b']);
  });

  it('drops empty segments (leading/trailing/double dots)', () => {
    expect(splitPathSegments('.a..b.')).toEqual(['a', 'b']);
  });

  it('drops $-virtual segments like $thumbnail', () => {
    expect(splitPathSegments('image.$thumbnail.title')).toEqual(['image', 'title']);
  });

  it('returns [] for an empty or all-virtual path', () => {
    expect(splitPathSegments('')).toEqual([]);
    expect(splitPathSegments('$thumbnail')).toEqual([]);
  });
});
