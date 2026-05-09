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
