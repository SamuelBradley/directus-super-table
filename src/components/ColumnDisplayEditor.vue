<template>
  <div class="column-display-editor">
    <div class="field">
      <div class="label">Field</div>
      <v-select
        :model-value="form.fieldKey"
        :items="availableFieldChoices"
        :disabled="mode === 'edit'"
        placeholder="Select a column"
        @update:model-value="onFieldChange"
      />
    </div>

    <div class="field">
      <div class="label">Display Template</div>
      <interface-system-display-template
        :collection-name="targetCollection"
        :value="form.template"
        placeholder="{{ field }}"
        :include-relations="true"
        @input="form.template = $event ?? ''"
      />
    </div>

    <div class="actions">
      <v-button secondary small @click="$emit('cancel')">Cancel</v-button>
      <v-button :disabled="!canSave" small @click="onSave">Save</v-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import { useStores } from '@directus/extensions-sdk';
import type { ColumnDisplay } from '../composables/useColumnDisplays';
import { isRelational, resolveTargetCollection } from '../utils/displayHeuristics';

const props = defineProps<{
  mode: 'add' | 'edit';
  initialFieldKey?: string;
  initialValue?: ColumnDisplay;
  collection: string;
  availableFieldChoices: Array<{ text: string; value: string }>;
}>();

const emit = defineEmits<{
  (e: 'save', payload: { fieldKey: string; display: ColumnDisplay }): void;
  (e: 'cancel'): void;
}>();

const { useFieldsStore, useRelationsStore } = useStores();
const fieldsStore = useFieldsStore();
const relationsStore = useRelationsStore();

const form = ref<{ fieldKey: string; template: string }>({
  fieldKey: props.initialFieldKey ?? '',
  template: props.initialValue?.template ?? '',
});

const targetCollection = computed(() => {
  if (!form.value.fieldKey) return null;
  // Strip language suffix (translations.title:de-DE → translations.title)
  const rootKey = form.value.fieldKey.includes(':')
    ? form.value.fieldKey.split(':')[0]
    : form.value.fieldKey;
  // Use root field on the parent for relational lookup
  const rootField = rootKey.split('.')[0];
  const fieldDef = fieldsStore.getField(props.collection, rootField);
  if (!fieldDef) return props.collection;
  if (!isRelational(fieldDef)) return props.collection;
  const target = resolveTargetCollection(fieldDef, relationsStore as any, fieldsStore as any);
  return target ?? props.collection;
});

const canSave = computed(() => {
  if (!form.value.fieldKey) return false;
  // Save is disabled in both modes when the template is empty. To delete an
  // existing override the user clicks the ⊘ icon on the item, which is the
  // explicit, discoverable path. (Avoids a "Save erases my override" surprise.)
  if (!form.value.template.trim()) return false;
  return true;
});

function onFieldChange(value: string) {
  form.value.fieldKey = value;
  // When the chosen field changes, clear the template to avoid stale tokens
  form.value.template = '';
}

function onSave() {
  emit('save', {
    fieldKey: form.value.fieldKey,
    display: { template: form.value.template },
  });
}

watch(
  () => props.initialValue,
  (val) => {
    if (val) form.value.template = val.template;
  }
);
</script>

<style scoped>
.column-display-editor {
  width: 100%;
  margin-bottom: 12px;
}
.field {
  margin-bottom: 12px;
}
.label {
  display: block;
  margin-bottom: 4px;
  color: var(--foreground-normal);
  font-weight: 600;
  font-size: 13px;
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
