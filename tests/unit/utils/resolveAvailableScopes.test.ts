import { describe, it, expect } from 'vitest';
import { resolveAvailableScopes } from '../../../src/utils/resolveAvailableScopes';

describe('resolveAvailableScopes', () => {
  it('returns no scopes when the user cannot create presets at all', () => {
    expect(
      resolveAvailableScopes({ canSave: false, canShare: true, myRoleId: 'r1', isShareUser: false })
    ).toEqual([]);
  });

  it('returns only "me" for a non-admin who can create presets', () => {
    expect(
      resolveAvailableScopes({ canSave: true, canShare: false, myRoleId: 'r1', isShareUser: false })
    ).toEqual(['me']);
  });

  it('returns me, specific, all for an admin who can share', () => {
    expect(
      resolveAvailableScopes({ canSave: true, canShare: true, myRoleId: 'r1', isShareUser: false })
    ).toEqual(['me', 'specific', 'all']);
  });

  it('returns me, specific, all for an admin even without a role id', () => {
    expect(
      resolveAvailableScopes({ canSave: true, canShare: true, myRoleId: null, isShareUser: false })
    ).toEqual(['me', 'specific', 'all']);
  });

  it('returns me, specific, all for a share-user admin (specific is not role-derived)', () => {
    expect(
      resolveAvailableScopes({ canSave: true, canShare: true, myRoleId: 'r1', isShareUser: true })
    ).toEqual(['me', 'specific', 'all']);
  });
});
