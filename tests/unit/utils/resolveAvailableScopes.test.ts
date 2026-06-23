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

  it('returns me, role, all for an admin with a role', () => {
    expect(
      resolveAvailableScopes({ canSave: true, canShare: true, myRoleId: 'r1', isShareUser: false })
    ).toEqual(['me', 'role', 'all']);
  });

  it('omits role when the admin has no role id', () => {
    expect(
      resolveAvailableScopes({ canSave: true, canShare: true, myRoleId: null, isShareUser: false })
    ).toEqual(['me', 'all']);
  });

  it('omits role for a share-user even if a role id is present', () => {
    expect(
      resolveAvailableScopes({ canSave: true, canShare: true, myRoleId: 'r1', isShareUser: true })
    ).toEqual(['me', 'all']);
  });
});
