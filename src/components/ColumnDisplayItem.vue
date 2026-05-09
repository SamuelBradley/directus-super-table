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
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border-subdued);
  background: var(--background-subdued);
  border-radius: var(--border-radius);
  cursor: pointer;
  margin-bottom: 6px;
}
.column-display-item:hover {
  border-color: var(--border-normal);
  background: var(--background-normal-alt, var(--background-subdued));
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.field-label {
  font-weight: 600;
  font-size: 13px;
  color: var(--foreground-normal);
}
.actions {
  display: flex;
  gap: 4px;
  color: var(--foreground-subdued);
}
.template-preview {
  font-family: var(--family-monospace);
  font-size: 12px;
  color: var(--foreground-subdued);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
