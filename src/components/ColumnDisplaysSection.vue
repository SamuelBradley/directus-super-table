<template>
  <div class="column-displays-section">
    <div class="section-label">Column Displays</div>

    <template v-for="(display, fieldKey) in columnDisplays" :key="fieldKey">
      <ColumnDisplayEditor
        v-if="editingFieldKey === fieldKey"
        mode="edit"
        :initial-field-key="String(fieldKey)"
        :initial-value="display"
        :collection="collection"
        :available-field-choices="choicesIncluding(String(fieldKey))"
        @save="onSave"
        @cancel="editingFieldKey = null"
      />
      <ColumnDisplayItem
        v-else
        :field-key="String(fieldKey)"
        :field-label="labelFor(String(fieldKey))"
        :display="display"
        @edit="editingFieldKey = String(fieldKey)"
        @delete="onDelete(String(fieldKey))"
      />
    </template>

    <ColumnDisplayEditor
      v-if="editingFieldKey === '__new__'"
      mode="add"
      :collection="collection"
      :available-field-choices="addModeChoices"
      @save="onSave"
      @cancel="editingFieldKey = null"
    />

    <button v-if="editingFieldKey === null" class="add-button" @click="editingFieldKey = '__new__'">
      <v-icon name="add" small /> Add Column Display
    </button>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import ColumnDisplayItem from './ColumnDisplayItem.vue';
import ColumnDisplayEditor from './ColumnDisplayEditor.vue';
import type { ColumnDisplay } from '../composables/useColumnDisplays';

const props = defineProps<{
  collection: string;
  columnDisplays: Record<string, ColumnDisplay>;
  availableFields: Array<{ key: string; label: string }>;
}>();

const emit = defineEmits<{
  (e: 'set', payload: { fieldKey: string; display: ColumnDisplay }): void;
  (e: 'remove', fieldKey: string): void;
}>();

const editingFieldKey = ref<string | null>(null);

const addModeChoices = computed(() =>
  props.availableFields
    .filter((f) => !(f.key in props.columnDisplays))
    .map((f) => ({ text: f.label, value: f.key }))
);

function choicesIncluding(key: string) {
  // In edit mode the field is locked, but still pass the current key as a choice
  const current = props.availableFields.find((f) => f.key === key);
  if (!current) return addModeChoices.value;
  return [{ text: current.label, value: current.key }];
}

function labelFor(key: string): string {
  return props.availableFields.find((f) => f.key === key)?.label ?? key;
}

function onSave(payload: { fieldKey: string; display: ColumnDisplay }) {
  emit('set', payload);
  editingFieldKey.value = null;
}

function onDelete(fieldKey: string) {
  emit('remove', fieldKey);
}
</script>

<style scoped>
.column-displays-section {
  margin-top: 16px;
}
.section-label {
  font-weight: 600;
  font-size: 12px;
  text-transform: uppercase;
  color: var(--foreground-subdued);
  margin-bottom: 8px;
}
.add-button {
  width: 100%;
  padding: 8px;
  border: 2px dashed var(--primary-50);
  background: transparent;
  border-radius: 4px;
  color: var(--primary);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.add-button:hover {
  background: var(--primary-10);
}
</style>
