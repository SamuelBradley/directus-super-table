import type { RoleOption, ShareTarget, UserOption } from '../types/sharedViews.types';

// Builds the share-target list; a user already covered by a selected role is skipped
// so a recipient matched via role AND personally is not bookmarked twice.
export function buildShareTargets(
  selectedRoleIds: string[],
  selectedUserIds: string[],
  roles: RoleOption[],
  users: UserOption[]
): ShareTarget[] {
  const selectedRoles = new Set(selectedRoleIds);
  const roleTargets: ShareTarget[] = selectedRoleIds.map((id) => ({
    kind: 'role',
    id,
    label: roles.find((r) => r.id === id)?.name,
  }));
  const userTargets: ShareTarget[] = selectedUserIds
    .map((id) => users.find((u) => u.id === id))
    .filter((u): u is UserOption => !!u && !(u.role !== null && selectedRoles.has(u.role)))
    .map((u) => ({ kind: 'user', id: u.id, label: u.name }));
  return [...roleTargets, ...userTargets];
}
