import { useStores } from '@directus/extensions-sdk';
import { unref } from 'vue';

export type PermissionAction = 'read' | 'create' | 'update' | 'delete' | 'share';
export type PermissionAccess = 'full' | 'partial' | 'none';

interface PermissionEntry {
  access: PermissionAccess;
  fields?: string[];
}

interface PermissionsByCollection {
  [collection: string]: {
    [action in PermissionAction]?: PermissionEntry;
  };
}

export function usePermissions() {
  const { usePermissionsStore } = useStores();
  const permissionsStore = usePermissionsStore();

  function getEntry(collection: string, action: PermissionAction): PermissionEntry | null {
    const map = unref(permissionsStore.permissions) as PermissionsByCollection | undefined;
    const perms = map?.[collection];
    return perms?.[action] ?? null;
  }

  function canAction(collection: string, action: PermissionAction, field?: string): boolean {
    const entry = getEntry(collection, action);
    if (!entry || entry.access === 'none') return false;

    if (!field) return true;

    const fields = entry.fields ?? [];
    if (fields.includes('*')) return true;
    return fields.includes(field);
  }

  function getAccessibleLanguages(allLanguages: { code: string; name: string }[]): string[] {
    if (!canAction('languages', 'read')) return [];
    return allLanguages
      .filter((lang) => canAction('languages', 'read', lang.code) || canAction('languages', 'read'))
      .map((lang) => lang.code);
  }

  return {
    canRead: (collection: string, field?: string) => canAction(collection, 'read', field),
    canUpdate: (collection: string, field?: string) => canAction(collection, 'update', field),
    canCreate: (collection: string) => canAction(collection, 'create'),
    canDelete: (collection: string) => canAction(collection, 'delete'),
    getAccessibleLanguages,
  };
}
