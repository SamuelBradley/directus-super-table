<template>
  <div class="column-display-item" @click="$emit('edit')">
    <div class="header">
      <span class="field-label">{{ fieldLabel }}</span>
      <div class="actions" @click.stop>
        <v-icon name="edit" small clickable @click="$emit('edit')" />
        <v-icon name="close" small clickable @click="onDelete" />
      </div>
    </div>
    <div class="template-preview">{{ display.template }}</div>
  </div>
</template>

<script lang="ts" setup>
import type { ColumnDisplay } from '../composables/useColumnDisplays';

defineProps<{
  fieldKey: string;
  fieldLabel: string;
  display: ColumnDisplay;
}>();

const emit = defineEmits<{
  (e: 'edit'): void;
  (e: 'delete'): void;
}>();

function onDelete() {
  emit('delete');
}
</script>

<style scoped>
.column-display-item {
  padding: 8px;
  border: 1px solid var(--primary);
  background: var(--primary-25);
  border-radius: 4px;
  cursor: pointer;
  margin-bottom: 4px;
}
.column-display-item:hover {
  background: var(--primary-50);
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.field-label {
  font-weight: 600;
  font-size: 12px;
}
.actions {
  display: flex;
  gap: 4px;
}
.template-preview {
  font-family: monospace;
  font-size: 11px;
  color: var(--primary);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
