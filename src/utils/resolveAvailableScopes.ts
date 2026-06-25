import type { ScopeAvailabilityInput, ViewScope } from '../types/sharedViews.types';

// specific/all are admin-only: the "own presets" rule is a validation constraint /permissions/me hides.
export function resolveAvailableScopes(input: ScopeAvailabilityInput): ViewScope[] {
  if (!input.canSave) return [];
  const scopes: ViewScope[] = ['me'];
  if (input.canShare) scopes.push('specific');
  if (input.canShare) scopes.push('all');
  return scopes;
}
