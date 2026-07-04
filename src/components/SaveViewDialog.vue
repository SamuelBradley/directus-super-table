<template>
  <span v-if="canSaveViews">
    <!-- Save current view as a (personal or shared) bookmark -->
    <v-button
      v-tooltip.bottom="'Save current view'"
      icon
      rounded
      class="save-view-button"
      @click="openSaveViewDialog"
    >
      <v-icon name="bookmarks" />
    </v-button>

    <!-- Save View Dialog -->
    <v-dialog
      v-if="saveViewDialogActive"
      :model-value="saveViewDialogActive"
      @update:model-value="saveViewDialogActive = $event"
      @esc="saveViewDialogActive = false"
      persistent
    >
      <v-card>
        <v-card-title>Save current view</v-card-title>
        <v-card-text>
          <div class="form-grid" @click.stop>
            <div class="full-width">
              <v-input
                v-model="viewName"
                placeholder="View name (e.g. Team overview)"
                autofocus
                @keydown.enter="submitSaveView"
                @click.stop
              />
            </div>

            <div class="full-width" @click.stop>
              <label class="field-label">Icon (optional)</label>
              <interface-select-icon
                :value="viewIcon"
                @input="viewIcon = $event"
                @click.stop="fixIconMenuScroll"
              />
            </div>

            <div class="full-width" @click.stop>
              <label class="field-label">Color (optional)</label>
              <div class="color-selector" @click.stop>
                <div
                  v-for="option in colorOptions"
                  :key="option.value"
                  :class="['color-circle', { active: viewColor === option.value }]"
                  :style="{ backgroundColor: getColorValue(option.value) }"
                  :title="option.text"
                  @click.stop="viewColor = viewColor === option.value ? null : option.value"
                >
                  <v-icon v-if="viewColor === option.value" name="check" small class="check-icon" />
                </div>
              </div>
              <div class="color-label">{{ viewColor ? getColorLabel(viewColor) : 'None' }}</div>
            </div>

            <div v-if="scopeItems.length > 1" class="full-width" @click.stop>
              <label class="field-label">Visible to</label>
              <v-select
                :model-value="viewScope"
                :items="scopeItems"
                @update:model-value="onScopeChange"
              />
            </div>

            <div v-if="viewScope === 'specific'" class="full-width" @click.stop>
              <label class="field-label">Roles</label>
              <v-select
                v-model="selectedRoleIds"
                :items="roleItems"
                multiple
                :loading="targetsLoading"
                placeholder="Select roles"
              />
              <label class="field-label">Users</label>
              <v-select
                v-model="selectedUserIds"
                :items="userItems"
                multiple
                :loading="targetsLoading"
                placeholder="Select users"
              />
              <v-notice v-if="usersTruncated" type="info">
                Showing the first 500 users — type to search for a specific one.
              </v-notice>
              <v-notice v-if="targetsError" type="warning">Could not load targets.</v-notice>
            </div>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-button secondary @click="saveViewDialogActive = false">Cancel</v-button>
          <v-button :loading="savingView" :disabled="!canSubmit" @click="submitSaveView">
            Save
          </v-button>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useSharedViews } from '../composables/useSharedViews';
import { useShareTargets } from '../composables/useShareTargets';
import type { SaveViewInput, ViewScope } from '../types/sharedViews.types';
import { buildShareTargets } from '../utils/buildShareTargets';
import { colorOptions, getColorLabel, getColorValue } from '../utils/colors';
import { fixIconMenuScroll } from '../utils/fixIconMenuScroll';

const props = defineProps<{
  collection: string;
  filter?: any;
  search?: string;
  layoutOptions?: any;
  layoutQuery?: any;
  canSaveViews: boolean;
  availableScopes: ViewScope[];
}>();

const { saveView } = useSharedViews();
const {
  roles,
  users,
  isLoading: targetsLoading,
  error: targetsError,
  load: loadTargets,
  usersTruncated,
} = useShareTargets();

const saveViewDialogActive = ref(false);
const viewName = ref('');
const viewIcon = ref('bookmark');
const viewColor = ref<string | null>(null);
const viewScope = ref<ViewScope>('me');
const savingView = ref(false);
const selectedRoleIds = ref<string[]>([]);
const selectedUserIds = ref<string[]>([]);

const SCOPE_LABELS: Record<ViewScope, string> = {
  me: 'Just me',
  all: 'Everyone',
  specific: 'Specific targets',
};
const scopeItems = computed(() =>
  props.availableScopes.map((s) => ({ text: SCOPE_LABELS[s], value: s }))
);
const roleItems = computed(() => roles.value.map((r) => ({ text: r.name, value: r.id })));
const userItems = computed(() =>
  users.value.map((u) => ({ text: u.email ? `${u.name} (${u.email})` : u.name, value: u.id }))
);

const hasTargets = computed(
  () => selectedRoleIds.value.length > 0 || selectedUserIds.value.length > 0
);
const canSubmit = computed(
  () =>
    !!viewName.value && !savingView.value && (viewScope.value !== 'specific' || hasTargets.value)
);

function onScopeChange(scope: ViewScope) {
  viewScope.value = scope;
  if (scope === 'specific' && roles.value.length === 0 && users.value.length === 0) loadTargets();
}

function openSaveViewDialog() {
  viewName.value = '';
  viewIcon.value = 'bookmark';
  viewColor.value = null;
  viewScope.value = 'me';
  selectedRoleIds.value = [];
  selectedUserIds.value = [];
  saveViewDialogActive.value = true;
}

async function submitSaveView() {
  if (!canSubmit.value) return;
  savingView.value = true;
  try {
    const base = { name: viewName.value, icon: viewIcon.value, color: viewColor.value };
    const scope = viewScope.value;
    let input: SaveViewInput;
    if (scope === 'specific') {
      input = {
        ...base,
        scope: 'specific',
        targets: buildShareTargets(
          selectedRoleIds.value,
          selectedUserIds.value,
          roles.value,
          users.value
        ),
      };
    } else {
      input = { ...base, scope };
    }
    const ok = await saveView(input, {
      collection: props.collection,
      layoutOptions: props.layoutOptions,
      layoutQuery: props.layoutQuery,
      filter: props.filter,
      search: props.search,
    });
    if (ok) saveViewDialogActive.value = false;
  } finally {
    savingView.value = false;
  }
}
</script>

<style scoped>
.form-grid {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 20px;
}

.full-width {
  width: 100%;
}

.field-label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--foreground-normal);
}

.color-selector {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.color-circle {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.color-circle:hover {
  transform: scale(1.1);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.color-circle.active {
  border-color: var(--foreground-normal);
  box-shadow:
    0 0 0 3px var(--background-normal),
    0 0 0 5px var(--border-normal);
}

.color-circle .check-icon {
  color: white;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
}

.color-label {
  margin-top: 8px;
  font-size: 13px;
  color: var(--foreground-subdued);
  text-align: center;
}
</style>
