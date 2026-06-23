import { computed, type ComputedRef } from 'vue';
import { useStores } from '@directus/extensions-sdk';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { buildViewPreset } from '../utils/buildViewPreset';
import { resolveAvailableScopes } from '../utils/resolveAvailableScopes';
import type { SaveViewInput, ViewPresetContext, ViewScope } from '../types/sharedViews.types';

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

  async function saveView(input: SaveViewInput, context: ViewPresetContext): Promise<boolean> {
    const payload = buildViewPreset(context, input);
    try {
      let created: { id?: number | string } | null;
      if (input.scope === 'me') {
        created = await presetsStore.savePreset(payload);
      } else if (input.scope === 'role') {
        created = await presetsStore.create({ ...payload, user: null, role: myRoleId.value });
      } else {
        created = await presetsStore.create({ ...payload, user: null, role: null });
      }

      if (!created || created.id == null) {
        notificationsStore.add({ title: t('error'), text: 'Failed to save view', type: 'error' });
        return false;
      }

      notificationsStore.add({
        title: 'View saved',
        text: `"${input.name}" has been saved`,
        type: 'success',
      });

      // Match native navigation: full collection path + merged query, not query-only.
      if (router && route) {
        router.push({
          path: route.path,
          query: { ...route.query, bookmark: String(created.id) },
        });
      }
      return true;
    } catch (error: any) {
      const denied = error?.response?.status === 403;
      notificationsStore.add({
        title: t('error'),
        text: denied
          ? 'You do not have permission to save a shared view'
          : error?.message || 'Failed to save view',
        type: 'error',
      });
      return false;
    }
  }

  return { canSaveViews, canShareViews, availableScopes, saveView };
}
