import type { ScopeAvailabilityInput, ViewScope } from '../types/sharedViews.types';

// Admin is the only client-side-reliable signal for shared-write capability:
// the "own presets only" rule lives in a validation constraint that
// /permissions/me omits, so hasPermission('directus_presets','create') reads
// full for everyone. Hence role/all are gated on canShare (isAdmin).
export function resolveAvailableScopes(input: ScopeAvailabilityInput): ViewScope[] {
  if (!input.canSave) return [];
  const scopes: ViewScope[] = ['me'];
  if (input.canShare && input.myRoleId && !input.isShareUser) scopes.push('role');
  if (input.canShare) scopes.push('all');
  return scopes;
}
