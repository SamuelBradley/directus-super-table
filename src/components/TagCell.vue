<template>
  <div class="tag-cell" :class="`align-${alignment || 'left'}`">
    <!-- Display Mode: Show tags as chips (Display-Only like ColorCell) -->
    <div class="tag-display">
      <v-chip
        v-for="(tag, index) in visibleTags"
        :key="`${tag}-${index}`"
        small
        class="tag-chip-display"
      >
        {{ tag }}
      </v-chip>
      <span v-if="hasMore" class="tag-more">+{{ additionalCount }} more</span>
      <span v-if="displayTags.length === 0" class="tag-empty">No tags</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  value: string[] | string | null;
  item?: any;
  field?: string;
  editMode?: boolean;
  alignment?: 'left' | 'center' | 'right';
  maxVisible?: number;
}

const props = withDefaults(defineProps<Props>(), {
  maxVisible: 3,
  alignment: 'left',
});

// Computed
const displayTags = computed<string[]>(() => {
  if (!props.value) return [];
  if (Array.isArray(props.value)) return props.value;

  // Handle JSON string
  if (typeof props.value === 'string') {
    try {
      const parsed = JSON.parse(props.value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      // If it's not JSON, treat as single tag
      return props.value.trim() ? [props.value] : [];
    }
  }

  return [];
});

const visibleTags = computed(() => displayTags.value.slice(0, props.maxVisible));

const hasMore = computed(() => displayTags.value.length > props.maxVisible);

const additionalCount = computed(() => displayTags.value.length - props.maxVisible);
</script>

<style scoped>
.tag-cell {
  width: 100%;
  min-height: 32px;
  display: flex;
  align-items: center;
}

.tag-cell.align-left {
  justify-content: flex-start;
}

.tag-cell.align-center {
  justify-content: center;
}

.tag-cell.align-right {
  justify-content: flex-end;
}

.tag-display {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  min-height: 28px;
}

.tag-more {
  font-size: 0.875rem;
  color: var(--theme--foreground-subdued);
  font-style: italic;
  margin-left: 4px;
}

.tag-empty {
  font-size: 0.875rem;
  color: var(--theme--foreground-subdued);
  font-style: italic;
}

/* Tag styling for table display */
.tag-chip-display {
  --v-chip-background-color: #e5e7eb !important; /* Grauer Hintergrund */
  --v-chip-color: #1f2937 !important; /* Schwarze/dunkle Schrift */
  margin-right: 4px;
  margin-bottom: 2px;
}

/* Responsive behavior */
@media (max-width: 768px) {
  .tag-display {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
