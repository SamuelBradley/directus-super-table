import { describe, it, expect } from 'vitest';
import { filterUsesSome } from '@/utils/filterUsesSome';

describe('filterUsesSome', () => {
  it('detects a top-level _some operator', () => {
    const filter = { translations: { _some: { text: { _icontains: 'hello' } } } };
    expect(filterUsesSome(filter)).toBe(true);
  });

  it('detects _some nested inside an _or array', () => {
    const filter = {
      _or: [
        { title: { _icontains: 'hello' } },
        { translations: { _some: { text: { _icontains: 'hello' } } } },
      ],
    };
    expect(filterUsesSome(filter)).toBe(true);
  });

  it('detects _some nested inside an _and array', () => {
    const filter = {
      _and: [
        { status: { _eq: 'published' } },
        { tags: { _some: { name: { _icontains: 'news' } } } },
      ],
    };
    expect(filterUsesSome(filter)).toBe(true);
  });

  it('returns false for plain field filters with no _some', () => {
    const filter = {
      _or: [
        { title: { _icontains: 'hello' } },
        { id: { _eq: 42 } },
      ],
    };
    expect(filterUsesSome(filter)).toBe(false);
  });

  it('returns false for null and undefined', () => {
    expect(filterUsesSome(null)).toBe(false);
    expect(filterUsesSome(undefined)).toBe(false);
  });

  it('returns false for keys that merely start with _some (exact match only)', () => {
    // Hypothetical key that is NOT the _some operator
    const filter = { _something: { title: { _eq: 'x' } } };
    expect(filterUsesSome(filter)).toBe(false);
  });
});
