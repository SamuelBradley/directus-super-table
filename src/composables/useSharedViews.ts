import { computed, type ComputedRef } from 'vue';
import { useStores, useApi } from '@directus/extensions-sdk';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { buildViewPreset, SUPER_TABLE_LAYOUT_ID } from '../utils/buildViewPreset';
import { resolveAvailableScopes } from '../utils/resolveAvailableScopes';
import type {
  SaveViewInput,
  ShareTarget,
  ViewPresetContext,
  ViewScope,
} from '../types/sharedViews.types';

const PRESETS_COLLECTION = 'directus_presets';

export function useSharedViews(): {
  canSaveViews: ComputedRef<boolean>;
  canShareViews: ComputedRef<boolean>;
  availableScopes: ComputedRef<ViewScope[]>;
  saveView: (input: SaveViewInput, context: ViewPresetContext) => Promise<boolean>;
} {
  const { usePresetsStore, useUserStore, usePermissionsStore, useNotificationsStore } = useStores();
  const presetsStore = usePresetsStore();
  const userStore = useUserStore();
  const permissionsStore = usePermissionsStore();
  const notificationsStore = useNotificationsStore();
  // useRouter/useRoute may be undefined in this slot context; navigation is skipped if so.
  const router = useRouter();
  const route = useRoute();
  const { t } = useI18n();
  const api = useApi();

  const isShareUser = computed(() => {
    const user = userStore.currentUser;
    return !!user && 'share' in user;
  });

  // role hydrates as a populated object {id} or a bare id string.
  const myRoleId = computed<string | null>(() => {
    const role = (userStore.currentUser as { role?: { id?: string } | string } | null)?.role;
    if (typeof role === 'string') return role;
    return role?.id ?? null;
  });

  const canSaveViews = computed(() => permissionsStore.hasPermission(PRESETS_COLLECTION, 'create'));
  const canShareViews = computed(() => userStore.isAdmin === true);

  const availableScopes = computed<ViewScope[]>(() =>
    resolveAvailableScopes({
      canSave: canSaveViews.value,
      canShare: canShareViews.value,
      myRoleId: myRoleId.value,
      isShareUser: isShareUser.value,
    })
  );

  type Owner = { user: string | null; role: string | null };

  function ownerOf(target: ShareTarget): Owner {
    return target.kind === 'role'
      ? { user: null, role: target.id }
      : { user: target.id, role: null };
  }

  function labelOf(target: ShareTarget): string {
    // the dialog sets target.label from the loaded lists; fall back to id only if absent.
    return target.label ?? (target.kind === 'role' ? `Role ${target.id}` : `User ${target.id}`);
  }

  // Reuse an existing same-name view's group id (match is intentionally owner-crossing — same name = same logical view), else mint a new one.
  // NOTE: renaming an already-shared view creates new rows under the new name; old-name rows are left orphaned (revocation/rename is an out-of-scope management feature).
  async function resolveGroupId(name: string, collection: string): Promise<string> {
    try {
      const res = await api.get('/presets', {
        params: {
          filter: {
            collection: { _eq: collection },
            bookmark: { _eq: name },
            layout: { _eq: SUPER_TABLE_LAYOUT_ID },
          },
          fields: ['layout_options'],
          limit: -1,
        },
      });
      for (const row of (res?.data?.data ?? []) as Array<{
        layout_options?: Record<string, any>;
      }>) {
        const gid = row.layout_options?.[SUPER_TABLE_LAYOUT_ID]?.sharedViewId;
        if (typeof gid === 'string' && gid) return gid;
      }
    } catch {
      // ignore — fall through to a fresh id
    }
    return `svg-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  }

  function withGroup(payload: ReturnType<typeof buildViewPreset>, groupId: string) {
    const opts = payload.layout_options[SUPER_TABLE_LAYOUT_ID] ?? {};
    return {
      ...payload,
      layout_options: {
        ...payload.layout_options,
        [SUPER_TABLE_LAYOUT_ID]: { ...opts, sharedViewId: groupId },
      },
    };
  }

  // Update the matching row if one exists for this owner+name+collection+layout, else create.
  async function upsertForOwner(
    payload: Record<string, any>,
    owner: Owner,
    name: string,
    collection: string
  ) {
    // layout in the filter prevents matching a same-name bookmark of another layout (e.g. tabular).
    const filter: Record<string, any> = {
      collection: { _eq: collection },
      bookmark: { _eq: name },
      layout: { _eq: SUPER_TABLE_LAYOUT_ID },
    };
    if (owner.role != null) {
      filter.role = { _eq: owner.role };
      filter.user = { _null: true };
    } else {
      filter.user = { _eq: owner.user };
      filter.role = { _null: true };
    }
    const res = await api.get('/presets', { params: { filter, fields: ['id'], limit: 1 } });
    const id = res?.data?.data?.[0]?.id;
    if (id != null) {
      // PATCH on a vanished id returns 204 (no throw) — treat a null result as a failure.
      const updated = await presetsStore.update(id, { ...payload, ...owner });
      if (!updated) throw new Error('Preset no longer exists');
      return updated;
    }
    return presetsStore.create({ ...payload, ...owner });
  }

  function notifyError(error: any) {
    const status = error?.response?.status;
    notificationsStore.add({
      title: t('error'),
      text:
        status === 403
          ? 'You do not have permission to save a shared view'
          : status === 400
            ? 'A selected target is invalid or no longer exists'
            : error?.message || 'Failed to save view',
      type: 'error',
    });
  }

  async function saveView(input: SaveViewInput, context: ViewPresetContext): Promise<boolean> {
    const payload = buildViewPreset(context, input);

    if (input.scope !== 'specific') {
      try {
        const created =
          input.scope === 'me'
            ? await presetsStore.savePreset(payload)
            : await presetsStore.create({ ...payload, user: null, role: null });
        if (!created || created.id == null) {
          notificationsStore.add({ title: t('error'), text: 'Failed to save view', type: 'error' });
          return false;
        }
        notificationsStore.add({
          title: 'View saved',
          text: `"${input.name}" has been saved`,
          type: 'success',
        });
        if (router && route) {
          router.push({
            path: route.path,
            query: { ...route.query, bookmark: String(created.id) },
          });
        }
        return true;
      } catch (error: any) {
        notifyError(error);
        return false;
      }
    }

    const groupId = await resolveGroupId(input.name, context.collection);
    const stamped = withGroup(payload, groupId);
    const results = await Promise.allSettled(
      input.targets.map((target) =>
        upsertForOwner(stamped, ownerOf(target), input.name, context.collection)
      )
    );
    const failed = input.targets.filter((_, i) => results[i].status === 'rejected');
    const okCount = results.length - failed.length;
    if (failed.length === 0) {
      notificationsStore.add({
        title: 'View shared',
        text: `"${input.name}" shared with ${okCount} target(s)`,
        type: 'success',
      });
    } else {
      notificationsStore.add({
        title: t('error'),
        text: `${okCount} von ${results.length} gespeichert. Fehlgeschlagen: ${failed.map(labelOf).join(', ')}`,
        type: 'error',
      });
    }
    return okCount > 0;
  }

  return { canSaveViews, canShareViews, availableScopes, saveView };
}
