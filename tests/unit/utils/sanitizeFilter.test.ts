import { describe, it, expect } from 'vitest';
import { sanitizeFilter } from '../../../src/utils/sanitizeFilter';

describe('sanitizeFilter', () => {
  const canRead = (field: string) => ['title', 'id'].includes(field);

  it('returns null for null input', () => {
    expect(sanitizeFilter(null, canRead)).toEqual({ sanitized: null, removed: [] });
  });

  it('keeps simple condition on accessible field', () => {
    const filter = { title: { _eq: 'foo' } };
    expect(sanitizeFilter(filter, canRead)).toEqual({ sanitized: filter, removed: [] });
  });

  it('drops simple condition on inaccessible field', () => {
    const filter = { thumbnail: { _nnull: true } };
    expect(sanitizeFilter(filter, canRead)).toEqual({ sanitized: null, removed: ['thumbnail'] });
  });

  it('drops branches inside _and that reference inaccessible fields', () => {
    const filter = {
      _and: [{ title: { _eq: 'foo' } }, { thumbnail: { _nnull: true } }],
    };
    expect(sanitizeFilter(filter, canRead)).toEqual({
      sanitized: { _and: [{ title: { _eq: 'foo' } }] },
      removed: ['thumbnail'],
    });
  });

  it('returns null when _and becomes empty after sanitization', () => {
    const filter = { _and: [{ thumbnail: { _nnull: true } }] };
    expect(sanitizeFilter(filter, canRead)).toEqual({ sanitized: null, removed: ['thumbnail'] });
  });

  it('handles nested _or inside _and', () => {
    const filter = {
      _and: [{ _or: [{ thumbnail: { _eq: 'a' } }, { title: { _eq: 'b' } }] }],
    };
    expect(sanitizeFilter(filter, canRead)).toEqual({
      sanitized: { _and: [{ _or: [{ title: { _eq: 'b' } }] }] },
      removed: ['thumbnail'],
    });
  });
});

describe('sanitizeFilter with nestedScopes (translation sub-fields)', () => {
  // Caller mirrors the real super-table.vue wiring: parent collection is
  // 'pages'; the translations junction is 'pages_translations'. The user
  // can read `text` in the junction but not `description`.
  const canRead = (field: string, scope?: string) => {
    if (scope === 'pages_translations') return field === 'text';
    return ['title', 'translations', 'id'].includes(field);
  };
  const opts = { nestedScopes: { translations: 'pages_translations' } };

  it('keeps allowed sub-field inside _some on translations', () => {
    const filter = { translations: { _some: { text: { _icontains: 'foo' } } } };
    expect(sanitizeFilter(filter, canRead, opts)).toEqual({
      sanitized: { translations: { _some: { text: { _icontains: 'foo' } } } },
      removed: [],
    });
  });

  it('drops disallowed sub-field inside _some, dropping the whole translations clause', () => {
    const filter = { translations: { _some: { description: { _icontains: 'foo' } } } };
    expect(sanitizeFilter(filter, canRead, opts)).toEqual({
      sanitized: null,
      removed: ['description'],
    });
  });

  it('keeps allowed sibling and drops disallowed sibling inside _some', () => {
    const filter = {
      translations: {
        _some: {
          text: { _icontains: 'foo' },
          description: { _icontains: 'bar' },
        },
      },
    };
    expect(sanitizeFilter(filter, canRead, opts)).toEqual({
      sanitized: { translations: { _some: { text: { _icontains: 'foo' } } } },
      removed: ['description'],
    });
  });

  it('drops translation branch inside _or while keeping accessible siblings', () => {
    const filter = {
      _or: [
        { translations: { _some: { description: { _icontains: 'foo' } } } },
        { title: { _icontains: 'foo' } },
      ],
    };
    expect(sanitizeFilter(filter, canRead, opts)).toEqual({
      sanitized: { _or: [{ title: { _icontains: 'foo' } }] },
      removed: ['description'],
    });
  });

  it('handles _none and _every relation match operators', () => {
    const filter = {
      _and: [
        { translations: { _none: { description: { _eq: 'spam' } } } },
        { translations: { _every: { text: { _nnull: true } } } },
      ],
    };
    expect(sanitizeFilter(filter, canRead, opts)).toEqual({
      sanitized: { _and: [{ translations: { _every: { text: { _nnull: true } } } }] },
      removed: ['description'],
    });
  });

  it('passes through when no nestedScopes configured (backward compatibility)', () => {
    // Without nestedScopes, the walker treats translations as a leaf field.
    // Permission only checks the parent-level field, not sub-fields.
    const filter = { translations: { _some: { description: { _icontains: 'foo' } } } };
    expect(sanitizeFilter(filter, canRead)).toEqual({
      sanitized: filter,
      removed: [],
    });
  });

  it('does not require translations scope when filter touches only parent fields', () => {
    const filter = { _and: [{ title: { _eq: 'foo' } }, { id: { _eq: 1 } }] };
    expect(sanitizeFilter(filter, canRead, opts)).toEqual({
      sanitized: filter,
      removed: [],
    });
  });
});
