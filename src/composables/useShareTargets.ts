import { ref, type Ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import type { RoleOption, UserOption } from '../types/sharedViews.types';

const ROLES_ENDPOINT = '/roles';
const USERS_ENDPOINT = '/users';
const USERS_LIMIT = 500;

// Loads the roles/users the current user may read (admins: all; restricted: a 403
// yields empty lists). Exposes raw domain objects so the dialog owns formatting.
export function useShareTargets(): {
  roles: Ref<RoleOption[]>;
  users: Ref<UserOption[]>;
  isLoading: Ref<boolean>;
  error: Ref<string | null>;
  load: () => Promise<void>;
} {
  const api = useApi();
  const roles = ref<RoleOption[]>([]);
  const users = ref<UserOption[]>([]);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  async function load(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const [roleRes, userRes] = await Promise.all([
        api.get(ROLES_ENDPOINT, { params: { fields: ['id', 'name'], limit: -1, sort: ['name'] } }),
        api.get(USERS_ENDPOINT, {
          params: {
            fields: ['id', 'first_name', 'last_name', 'email'],
            limit: USERS_LIMIT,
            sort: ['first_name', 'last_name'],
          },
        }),
      ]);
      roles.value = ((roleRes?.data?.data ?? []) as Array<Record<string, any>>).map((r) => ({
        id: String(r.id),
        name: String(r.name ?? r.id),
      }));
      users.value = ((userRes?.data?.data ?? []) as Array<Record<string, any>>).map((u) => {
        const full = [u.first_name, u.last_name].filter(Boolean).join(' ').trim();
        return { id: String(u.id), name: full || u.email || String(u.id), email: u.email ?? null };
      });
    } catch (e: any) {
      roles.value = [];
      users.value = [];
      error.value = e?.message || 'Failed to load targets';
    } finally {
      isLoading.value = false;
    }
  }

  return { roles, users, isLoading, error, load };
}
