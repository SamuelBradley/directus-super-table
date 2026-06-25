import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reactive } from 'vue';

// Reactive mocks so the composable's computeds re-evaluate regardless of the
// order in which a test mutates the mock vs. constructs the composable.
const presetsStore = { create: vi.fn(), savePreset: vi.fn(), update: vi.fn(), hydrate: vi.fn() };
const userStore = reactive<{ currentUser: any; isAdmin: boolean }>({
  currentUser: { id: 'u1', role: { id: 'r1' } },
  isAdmin: true,
});
const permissionsStore = { hasPermission: vi.fn(() => true) };
const notificationsStore = { add: vi.fn() };
const routerPush = vi.fn();
const apiGet = vi.fn();

vi.mock('@directus/extensions-sdk', () => ({
  useStores: () => ({
    usePresetsStore: () => presetsStore,
    useUserStore: () => userStore,
    usePermissionsStore: () => permissionsStore,
    useNotificationsStore: () => notificationsStore,
  }),
  useApi: () => ({ get: apiGet }),
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
  presetsStore.update = vi.fn(async (id, p) => ({ ...p, id }));
  apiGet.mockReset();
  apiGet.mockResolvedValue({ data: { data: [] } }); // default: nothing existing
});

describe('useSharedViews permission computeds', () => {
  it('exposes all scopes for an admin with a role', () => {
    const { availableScopes, canSaveViews, canShareViews } = useSharedViews();
    expect(canSaveViews.value).toBe(true);
    expect(canShareViews.value).toBe(true);
    expect(availableScopes.value).toEqual(['me', 'specific', 'all']);
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

  it('exposes specific+all for a share-user who is also admin', () => {
    userStore.currentUser = { share: 'token-1', role: { id: 'r1' } };
    const { availableScopes } = useSharedViews();
    expect(availableScopes.value).toEqual(['me', 'specific', 'all']);
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
    expect(notificationsStore.add).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  it('scope "specific" creates one row per target with correct owners and a group id', async () => {
    const { saveView } = useSharedViews();
    const ok = await saveView(
      {
        name: 'Team',
        scope: 'specific',
        targets: [
          { kind: 'role', id: 'r1' },
          { kind: 'user', id: 'u1' },
        ],
      },
      ctx
    );
    expect(ok).toBe(true);
    expect(presetsStore.create).toHaveBeenCalledTimes(2);
    const roleCall = presetsStore.create.mock.calls.find((c) => c[0].role === 'r1')[0];
    const userCall = presetsStore.create.mock.calls.find((c) => c[0].user === 'u1')[0];
    expect(roleCall.user).toBeNull();
    expect(userCall.role).toBeNull();
    // both carry the same sharedViewId
    const gid = roleCall.layout_options['super-layout-table'].sharedViewId;
    expect(typeof gid).toBe('string');
    expect(userCall.layout_options['super-layout-table'].sharedViewId).toBe(gid);
    // no navigation for specific
    expect(routerPush).not.toHaveBeenCalled();
    // nav is refreshed so outward-shared rows don't linger optimistically
    expect(presetsStore.hydrate).toHaveBeenCalled();
  });

  it('scope "specific" updates an existing same-name preset instead of creating (upsert)', async () => {
    apiGet.mockImplementation((_url, opts) => {
      const f = opts.params.filter;
      return f.role
        ? Promise.resolve({ data: { data: [{ id: 42 }] } })
        : Promise.resolve({ data: { data: [] } });
    });
    const { saveView } = useSharedViews();
    await saveView({ name: 'Team', scope: 'specific', targets: [{ kind: 'role', id: 'r1' }] }, ctx);
    expect(presetsStore.update).toHaveBeenCalledTimes(1);
    expect(presetsStore.update.mock.calls[0][0]).toBe(42);
    expect(presetsStore.create).not.toHaveBeenCalled();
  });

  it('scope "specific" reports partial failure without throwing', async () => {
    presetsStore.create = vi.fn((p) =>
      p.role === 'rBad'
        ? Promise.reject({ response: { status: 400 } })
        : Promise.resolve({ ...p, id: 1 })
    );
    const { saveView } = useSharedViews();
    const ok = await saveView(
      {
        name: 'T',
        scope: 'specific',
        targets: [
          { kind: 'role', id: 'rOk', label: 'OK Role' },
          { kind: 'role', id: 'rBad', label: 'Bad Role' },
        ],
      },
      ctx
    );
    expect(ok).toBe(true); // not all failed
    expect(notificationsStore.add).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', text: expect.stringContaining('1 von 2') })
    );
    // the summary names the failed target via labelOf (the label, not the raw id)
    expect(notificationsStore.add).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Bad Role') })
    );
  });

  it('scope "specific" reuses an existing sharedViewId for the same name', async () => {
    apiGet.mockImplementation((_url, opts) => {
      const f = opts.params.filter;
      // the resolveGroupId lookup (no user/role filter) returns a row with an existing group id
      if (!f.user && !f.role) {
        return Promise.resolve({
          data: {
            data: [{ layout_options: { 'super-layout-table': { sharedViewId: 'gid-existing' } } }],
          },
        });
      }
      return Promise.resolve({ data: { data: [] } }); // upsert lookups: nothing existing
    });
    const { saveView } = useSharedViews();
    await saveView({ name: 'Team', scope: 'specific', targets: [{ kind: 'role', id: 'r1' }] }, ctx);
    expect(
      presetsStore.create.mock.calls[0][0].layout_options['super-layout-table'].sharedViewId
    ).toBe('gid-existing');
  });

  it('scope "specific" upserts a user target by user filter', async () => {
    apiGet.mockImplementation((_url, opts) =>
      opts.params.filter.user?._eq === 'u1'
        ? Promise.resolve({ data: { data: [{ id: 7 }] } })
        : Promise.resolve({ data: { data: [] } })
    );
    const { saveView } = useSharedViews();
    await saveView({ name: 'T', scope: 'specific', targets: [{ kind: 'user', id: 'u1' }] }, ctx);
    expect(presetsStore.update).toHaveBeenCalledTimes(1);
    expect(presetsStore.update.mock.calls[0][0]).toBe(7);
  });

  it('scope "specific" returns false when ALL targets fail', async () => {
    presetsStore.create = vi.fn(() => Promise.reject({ response: { status: 400 } }));
    const { saveView } = useSharedViews();
    const ok = await saveView(
      { name: 'T', scope: 'specific', targets: [{ kind: 'role', id: 'r1' }] },
      ctx
    );
    expect(ok).toBe(false);
    expect(notificationsStore.add).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));
  });

  it('scope "specific" counts an upsert as failed when update returns null (vanished id)', async () => {
    apiGet.mockResolvedValue({ data: { data: [{ id: 5 }] } }); // a row exists → upsert path
    presetsStore.update = vi.fn(async () => null); // PATCH on a vanished id returns 204 → null body
    const { saveView } = useSharedViews();
    const ok = await saveView(
      { name: 'T', scope: 'specific', targets: [{ kind: 'role', id: 'r1' }] },
      ctx
    );
    expect(ok).toBe(false);
    expect(presetsStore.create).not.toHaveBeenCalled();
  });
});
