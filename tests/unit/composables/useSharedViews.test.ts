import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reactive } from 'vue';

// Reactive mocks so the composable's computeds re-evaluate regardless of the
// order in which a test mutates the mock vs. constructs the composable.
const presetsStore = { create: vi.fn(), savePreset: vi.fn() };
const userStore = reactive<{ currentUser: any; isAdmin: boolean }>({
  currentUser: { id: 'u1', role: { id: 'r1' } },
  isAdmin: true,
});
const permissionsStore = { hasPermission: vi.fn(() => true) };
const notificationsStore = { add: vi.fn() };
const routerPush = vi.fn();

vi.mock('@directus/extensions-sdk', () => ({
  useStores: () => ({
    usePresetsStore: () => presetsStore,
    useUserStore: () => userStore,
    usePermissionsStore: () => permissionsStore,
    useNotificationsStore: () => notificationsStore,
  }),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
  useRoute: () => ({ path: '/content/orders', query: {} }),
}));

import { useSharedViews } from '../../../src/composables/useSharedViews';
import type { ViewPresetContext } from '../../../src/types/sharedViews.types';

const ctx: ViewPresetContext = {
  collection: 'orders',
  layoutOptions: { editMode: true },
  layoutQuery: { fields: ['code'] },
  filter: { status: { _eq: 'open' } },
  search: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  userStore.currentUser = { id: 'u1', role: { id: 'r1' } };
  userStore.isAdmin = true;
  permissionsStore.hasPermission = vi.fn(() => true);
  presetsStore.create = vi.fn(async (p) => ({ ...p, id: 99 }));
  presetsStore.savePreset = vi.fn(async (p) => ({ ...p, id: 77 }));
});

describe('useSharedViews permission computeds', () => {
  it('exposes all scopes for an admin with a role', () => {
    const { availableScopes, canSaveViews, canShareViews } = useSharedViews();
    expect(canSaveViews.value).toBe(true);
    expect(canShareViews.value).toBe(true);
    expect(availableScopes.value).toEqual(['me', 'role', 'all']);
  });

  it('limits a non-admin to "me"', () => {
    userStore.isAdmin = false;
    const { availableScopes } = useSharedViews();
    expect(availableScopes.value).toEqual(['me']);
  });

  it('hides the feature when create permission is missing', () => {
    permissionsStore.hasPermission = vi.fn(() => false);
    const { canSaveViews, availableScopes } = useSharedViews();
    expect(canSaveViews.value).toBe(false);
    expect(availableScopes.value).toEqual([]);
  });
});

describe('useSharedViews.saveView', () => {
  it('scope "me" calls savePreset (not create) and navigates to the new bookmark', async () => {
    const { saveView } = useSharedViews();
    const ok = await saveView({ name: 'Personal', scope: 'me' }, ctx);
    expect(ok).toBe(true);
    expect(presetsStore.savePreset).toHaveBeenCalledTimes(1);
    expect(presetsStore.create).not.toHaveBeenCalled();
    const payload = presetsStore.savePreset.mock.calls[0][0];
    expect(payload.layout_query).toEqual({ 'super-layout-table': { fields: ['code'] } });
    expect(routerPush).toHaveBeenCalledWith({
      path: '/content/orders',
      query: { bookmark: '77' },
    });
    expect(notificationsStore.add).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success' })
    );
  });

  it('scope "all" creates a global preset (user null, role null)', async () => {
    const { saveView } = useSharedViews();
    await saveView({ name: 'Everyone', scope: 'all' }, ctx);
    expect(presetsStore.create).toHaveBeenCalledTimes(1);
    const payload = presetsStore.create.mock.calls[0][0];
    expect(payload.user).toBeNull();
    expect(payload.role).toBeNull();
    expect(payload.bookmark).toBe('Everyone');
  });

  it('scope "role" creates a role-wide preset (user null, role = my role id)', async () => {
    const { saveView } = useSharedViews();
    await saveView({ name: 'Team', scope: 'role' }, ctx);
    const payload = presetsStore.create.mock.calls[0][0];
    expect(payload.user).toBeNull();
    expect(payload.role).toBe('r1');
  });

  it('returns false and shows a 403-specific error without throwing on permission denial', async () => {
    presetsStore.create = vi.fn(async () => {
      throw { response: { status: 403 } };
    });
    const { saveView } = useSharedViews();
    const ok = await saveView({ name: 'Nope', scope: 'all' }, ctx);
    expect(ok).toBe(false);
    expect(routerPush).not.toHaveBeenCalled();
    expect(notificationsStore.add).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', text: expect.stringContaining('permission') })
    );
  });

  it('returns false and shows an error when the store returns no preset', async () => {
    presetsStore.savePreset = vi.fn(async () => null);
    const { saveView } = useSharedViews();
    const ok = await saveView({ name: 'NoUser', scope: 'me' }, ctx);
    expect(ok).toBe(false);
    expect(routerPush).not.toHaveBeenCalled();
    expect(notificationsStore.add).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error' })
    );
  });
});
