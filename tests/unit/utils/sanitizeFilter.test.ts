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
