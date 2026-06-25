import { describe, it, expect } from 'vitest';
import { resolveAvailableScopes } from '../../../src/utils/resolveAvailableScopes';

describe('resolveAvailableScopes', () => {
  it('returns no scopes when the user cannot create presets at all', () => {
    expect(resolveAvailableScopes({ canSave: false, canShare: true })).toEqual([]);
  });

  it('returns only "me" for a non-admin who can create presets', () => {
    expect(resolveAvailableScopes({ canSave: true, canShare: false })).toEqual(['me']);
  });

  it('returns me, specific, all for an admin who can share', () => {
    expect(resolveAvailableScopes({ canSave: true, canShare: true })).toEqual([
      'me',
      'specific',
      'all',
    ]);
  });
});
