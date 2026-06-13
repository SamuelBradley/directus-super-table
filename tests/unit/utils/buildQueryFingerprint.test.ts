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
});
