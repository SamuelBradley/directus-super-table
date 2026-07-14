<template>
  <div class="field">
    <label class="type-label">Show Toolbar</label>
    <v-checkbox v-model="showToolbar" label="Display toolbar with actions" />
  </div>

  <div class="field">
    <label class="type-label">Row Spacing</label>
    <v-select v-model="spacing" :items="spacingOptions" />
    <div class="hint">Controls the default row height for non-image tables.</div>
  </div>

  <div class="field">
    <label class="type-label">Search All Fields</label>
    <v-checkbox
      v-model="searchAllFields"
      label="Search non-visible searchable fields as well as visible columns"
    />
    <div class="hint">
      Disable this to keep search restricted to the columns shown in the table. Useful for
      targeted name searches and lower query cost.
    </div>
  </div>

  <div class="field">
    <label class="type-label">Split Search Terms Across Fields</label>
    <v-checkbox
      v-model="splitSearchTermsAcrossFields"
      label="Treat space-separated search terms separately so each part can match a different field"
    />
    <div class="hint">
      Example: searching &quot;John Smith&quot; can match a first name field and a last name field.
      Leave this off for lists where the full search text should stay together.
    </div>
  </div>

  <div class="field">
    <label class="type-label">Edit Mode</label>
    <v-checkbox v-model="editMode" label="Enable inline editing" />
  </div>

  <div class="field" v-if="editMode">
    <label class="type-label">Direct Boolean Toggle</label>
    <v-checkbox
      v-model="directBooleanToggle"
      label="Enable direct boolean field editing (single-click toggle without popover)"
    />
  </div>

  <div class="field">
    <label class="type-label">Language Code Field</label>
    <v-input v-model="languageCodeField" placeholder="languages_code">
      <template #append>
        <v-icon
          v-tooltip="
            'The field name used to identify languages in translation collections. Default: languages_code'
          "
          name="help"
        />
      </template>
    </v-input>
    <div class="hint">
      Custom field name for language codes in translation collections (default: 'languages_code')
    </div>
  </div>

  <ColumnDisplaysSection
    v-if="props.collection && props.availableFieldChoices && props.availableFieldChoices.length > 0"
    :collection="props.collection"
    :column-displays="columnDisplays"
    :available-fields="props.availableFieldChoices"
    @set="onSet"
    @remove="onRemove"
  />
</template>

<script lang="ts" setup>
import { computed, type Ref } from 'vue';
import { useSync } from '@directus/extensions-sdk';
import ColumnDisplaysSection from './components/ColumnDisplaysSection.vue';
import { useColumnDisplays } from './composables/useColumnDisplays';
import type { ColumnDisplay } from './composables/useColumnDisplays';

interface LayoutOptions {
  showToolbar?: boolean;
  showSelect?: boolean;
  editMode?: boolean;
  directBooleanToggle?: boolean;
  spacing?: 'compact' | 'cozy' | 'comfortable';
  searchAllFields?: boolean;
  splitSearchTermsAcrossFields?: boolean;
  quickFilters?: any[];
  customFieldNames?: Record<string, string>;
  widths?: Record<string, number>;
  align?: Record<string, 'left' | 'center' | 'right'>;
  languageCodeField?: string;
  columnDisplays?: Record<string, { template: string; display?: string }>;
}

const props = defineProps<{
  layoutOptions: LayoutOptions;
  collection?: string;
  availableFieldChoices?: Array<{ key: string; label: string }>;
}>();

const emit = defineEmits(['update:layoutOptions']);

const spacingOptions = ['compact', 'cozy', 'comfortable'];

const layoutOptions = useSync(props, 'layoutOptions', emit);

const {
  all: columnDisplays,
  setOverride,
  removeOverride,
} = useColumnDisplays(layoutOptions as unknown as Ref<LayoutOptions & { [key: string]: unknown }>);

function onSet(payload: { fieldKey: string; display: ColumnDisplay }) {
  setOverride(payload.fieldKey, payload.display);
}
function onRemove(fieldKey: string) {
  removeOverride(fieldKey);
}

// Issue #48: read setters from `props.layoutOptions` instead of the synced ref.
// `useSync` is essentially `{ get: () => props.x, set: (v) => emit('update:x', v) }`
// — the local ref does NOT update synchronously after a write; it only updates
// when the parent re-emits the new prop value back. If two setters fire in
// rapid succession (e.g. setOverride from useColumnDisplays then editMode toggle),
// the second one reads STALE state from layoutOptions.value and silently
// overwrites the columnDisplays the first setter just wrote.
// Fix: every setter spreads `props.layoutOptions` (always the latest prop value).

const showToolbar = computed({
  get: () => layoutOptions.value?.showToolbar !== false,
  set: (val) => {
    layoutOptions.value = {
      ...props.layoutOptions,
      showToolbar: val,
    };
  },
});

const spacing = computed({
  get: () => layoutOptions.value?.spacing || 'compact',
  set: (val: LayoutOptions['spacing']) => {
    layoutOptions.value = {
      ...layoutOptions.value,
      spacing: val || 'compact',
    };
  },
});

const searchAllFields = computed({
  get: () => layoutOptions.value?.searchAllFields !== false,
  set: (val) => {
    layoutOptions.value = {
      ...props.layoutOptions,
      searchAllFields: val,
    };
  },
});

const splitSearchTermsAcrossFields = computed({
  get: () => layoutOptions.value?.splitSearchTermsAcrossFields === true,
  set: (val) => {
    layoutOptions.value = {
      ...props.layoutOptions,
      splitSearchTermsAcrossFields: val,
    };
  },
});

const editMode = computed({
  get: () => layoutOptions.value?.editMode === true,
  set: (val) => {
    layoutOptions.value = {
      ...props.layoutOptions,
      editMode: val,
    };
  },
});

const directBooleanToggle = computed({
  get: () => layoutOptions.value?.directBooleanToggle === true,
  set: (val) => {
    layoutOptions.value = {
      ...props.layoutOptions,
      directBooleanToggle: val,
    };
  },
});

const languageCodeField = computed({
  get: () => layoutOptions.value?.languageCodeField || 'languages_code',
  set: (val) => {
    layoutOptions.value = {
      ...props.layoutOptions,
      languageCodeField: val || undefined, // Store undefined if empty to use default
    };
  },
});
</script>

<style scoped>
.field {
  margin-bottom: var(--form-vertical-gap);
}

.type-label {
  display: block;
  margin-bottom: 8px;
  color: var(--foreground-normal);
  font-weight: 600;
  font-size: 14px;
}

.v-notice {
  margin-top: var(--form-vertical-gap);
}

.hint {
  margin-top: 4px;
  color: var(--foreground-subdued);
  font-size: 12px;
  line-height: 1.4;
}
</style>
