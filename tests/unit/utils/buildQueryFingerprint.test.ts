import { describe, it, expect } from 'vitest';
import { buildQueryFingerprint, type QueryFingerprintInput } from '@/utils/buildQueryFingerprint';

const base: QueryFingerprintInput = {
  collection: 'orders',
  fields: ['code', 'treatment'],
  filter: null,
  sort: ['code'],
  page: 1,
  limit: 25,
  deep: null,
  alias: null,
};

describe('buildQueryFingerprint', () => {
  it('is stable for identical input', () => {
    expect(buildQueryFingerprint(base)).toBe(buildQueryFingerprint({ ...base }));
  });

  it('normalizes nullish filter/deep/alias to null', () => {
    const a = buildQueryFingerprint({ ...base, filter: undefined, deep: undefined, alias: undefined });
    const b = buildQueryFingerprint({ ...base, filter: null, deep: null, alias: null });
    expect(a).toBe(b);
  });

  it('changes when ANY fetch parameter changes (guards against a dropped key)', () => {
    const fp = buildQueryFingerprint(base);
    expect(buildQueryFingerprint({ ...base, collection: 'orders_simple' })).not.toBe(fp);
    expect(buildQueryFingerprint({ ...base, fields: ['code'] })).not.toBe(fp);
    expect(buildQueryFingerprint({ ...base, filter: { code: { _eq: 'X' } } })).not.toBe(fp);
    expect(buildQueryFingerprint({ ...base, sort: ['-code'] })).not.toBe(fp);
    expect(buildQueryFingerprint({ ...base, page: 2 })).not.toBe(fp);
    expect(buildQueryFingerprint({ ...base, limit: 50 })).not.toBe(fp);
    expect(buildQueryFingerprint({ ...base, deep: { treatment: { _limit: -1 } } })).not.toBe(fp);
    expect(buildQueryFingerprint({ ...base, alias: { x: 'y' } })).not.toBe(fp);
  });

  it('is stable across nested object key reordering (filter/deep)', () => {
    const a = buildQueryFingerprint({
      ...base,
      filter: { status: { _eq: 'A' }, code: { _eq: 'X' } },
      deep: { translations: { _fields: ['*'], _limit: -1 } },
    });
    const b = buildQueryFingerprint({
      ...base,
      filter: { code: { _eq: 'X' }, status: { _eq: 'A' } },
      deep: { translations: { _limit: -1, _fields: ['*'] } },
    });
    expect(a).toBe(b);
  });

  it('canonicalizes key order INSIDE array elements (filter._and[0])', () => {
    const a = buildQueryFingerprint({ ...base, filter: { _and: [{ a: { _eq: 1 }, b: { _eq: 2 } }] } });
    const b = buildQueryFingerprint({ ...base, filter: { _and: [{ b: { _eq: 2 }, a: { _eq: 1 } }] } });
    expect(a).toBe(b);
  });

  it('keeps array element ORDER significant even when elements are objects', () => {
    const a = buildQueryFingerprint({ ...base, filter: { _or: [{ x: { _eq: 1 } }, { y: { _eq: 2 } }] } });
    const b = buildQueryFingerprint({ ...base, filter: { _or: [{ y: { _eq: 2 } }, { x: { _eq: 1 } }] } });
    expect(a).not.toBe(b);
  });

  it('still differs when a value inside a nested object changes', () => {
    const a = buildQueryFingerprint({ ...base, deep: { t: { _limit: -1 } } });
    const b = buildQueryFingerprint({ ...base, deep: { t: { _limit: -2 } } });
    expect(a).not.toBe(b);
  });

  it('treats sort null and undefined identically', () => {
    expect(buildQueryFingerprint({ ...base, sort: null })).toBe(
      buildQueryFingerprint({ ...base, sort: undefined })
    );
  });
});
