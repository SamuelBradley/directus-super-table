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
      <div class="label">
        Display Template
        <v-icon v-if="m2aHelp" v-tooltip="m2aHelp.tooltip" name="help" small class="help-icon" />
      </div>
      <interface-system-display-template
        :collection-name="targetCollection"
        :value="form.template"
        placeholder="{{ field }}"
        :include-relations="true"
        @input="form.template = $event ?? ''"
      />
      <div v-if="m2aHelp" class="hint">
        Many-to-Any field — use <code>{{ itemToken }}</code> (no
        <code>{{ m2aHelp.fieldKey }}.</code> prefix).
      </div>
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
import { isRelational, isM2A, resolveTargetCollection } from '../utils/displayHeuristics';
import { resolveM2ARelation } from '../utils/resolveM2ARelation';

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

// Literal token examples for the M2A help notice (kept out of the template so
// the mustache braces aren't parsed as Vue interpolation).
const collectionToken = '{{collection}}';
const itemToken = '{{item:<collection>.<field>}}';

// The system display-template picker can't introspect the polymorphic M2A
// target, so guide the user to the `item:collection.field` token syntax.
const m2aHelp = computed(() => {
  if (!form.value.fieldKey) return null;
  const rootKey = form.value.fieldKey.includes(':')
    ? form.value.fieldKey.split(':')[0]
    : form.value.fieldKey;
  const rootField = rootKey.split('.')[0];
  const fieldDef = fieldsStore.getField(props.collection, rootField);
  if (!isM2A(fieldDef)) return null;

  const m2a = resolveM2ARelation(props.collection, rootField, relationsStore, fieldsStore);
  const collections = m2a?.allowedCollections ?? [];
  const example = collections.length
    ? `{{collection}}: {{item:${collections[0]}.name}}`
    : '{{collection}}: {{item:<collection>.name}}';
  const allowed = collections.length ? `Allowed collections: ${collections.join(', ')}. ` : '';
  const tooltip =
    `Many-to-Any field. Write tokens relative to the field (no "${rootField}." prefix). ` +
    `Use ${collectionToken} for the target collection and ${itemToken} for its values. ` +
    `${allowed}Example: ${example}`;
  return { fieldKey: rootField, collections, example, tooltip };
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
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
  color: var(--foreground-normal);
  font-weight: 600;
  font-size: 13px;
}
.help-icon {
  --v-icon-color: var(--foreground-subdued);
  cursor: help;
}
.actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
.hint {
  margin-top: 4px;
  color: var(--foreground-subdued);
  font-size: 12px;
  line-height: 1.4;
}
.hint code {
  font-size: 11px;
}
</style>
