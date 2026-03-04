<template>
  <div ref="containerRef" class="tag-cell" :class="`align-${alignment || 'left'}`">
    <!-- Display Mode: Show tags as chips (Display-Only like ColorCell) -->
    <div ref="displayRef" class="tag-display">
      <v-chip
        v-for="(tag, index) in visibleTags"
        :key="`${tag}-${index}`"
        :ref="
          (el: unknown) => {
            if (el) chipRefs[index] = el as HTMLElement;
          }
        "
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
import { computed, ref, onMounted, onBeforeUpdate, watch, nextTick } from 'vue';

interface Props {
  value: string[] | string | null;
  item?: any;
  field?: string;
  editMode?: boolean;
  alignment?: 'left' | 'center' | 'right';
}

const props = withDefaults(defineProps<Props>(), {
  alignment: 'left',
});

// Refs
const containerRef = ref<HTMLElement | null>(null);
const displayRef = ref<HTMLElement | null>(null);
const chipRefs: Record<number, HTMLElement> = {};
const visibleCount = ref<number>(0);

// Clear chip refs before each update
onBeforeUpdate(() => {
  Object.keys(chipRefs).forEach((key) => delete chipRefs[Number(key)]);
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

const visibleTags = computed(() => {
  if (visibleCount.value === 0) {
    return displayTags.value;
  }
  return displayTags.value.slice(0, visibleCount.value);
});

const hasMore = computed(() => {
  if (visibleCount.value === 0) return false;
  return displayTags.value.length > visibleCount.value;
});

const additionalCount = computed(() => {
  if (visibleCount.value === 0) return 0;
  return Math.max(0, displayTags.value.length - visibleCount.value);
});

// Calculate how many tags fit in available space
async function calculateVisibleTags() {
  if (!containerRef.value || !displayRef.value || displayTags.value.length === 0) {
    visibleCount.value = displayTags.value.length;
    return;
  }

  // If chips aren't rendered yet, show all first to get measurements
  if (Object.keys(chipRefs).length === 0 && visibleCount.value === 0) {
    visibleCount.value = displayTags.value.length;
    await nextTick();
    // Recalculate after chips are rendered
    if (Object.keys(chipRefs).length > 0) {
      calculateVisibleTags();
    }
    return;
  }

  const containerWidth = containerRef.value.offsetWidth;
  const moreTextWidth = 80; // Estimated width for "+X more" text
  const gap = 4; // Gap between chips
  const padding = 16; // Container padding

  // Measure all chips
  const chipWidths: number[] = [];
  for (let i = 0; i < displayTags.value.length; i++) {
    const chip = chipRefs[i];
    if (chip) {
      chipWidths[i] = chip.offsetWidth;
    } else {
      // Estimate if not yet rendered
      chipWidths[i] = displayTags.value[i].length * 8 + 20;
    }
  }

  // Calculate how many fit
  let totalWidth = padding;
  let count = 0;

  for (let i = 0; i < displayTags.value.length; i++) {
    const chipWidth = chipWidths[i];
    const willHaveMore = i + 1 < displayTags.value.length;

    // Calculate available width (reserve space for "+X more" if there will be more tags)
    const availableWidth = willHaveMore ? containerWidth - moreTextWidth : containerWidth;

    // Check if adding this chip would exceed available width
    if (totalWidth + chipWidth + gap > availableWidth) {
      break;
    }

    totalWidth += chipWidth + gap;
    count++;
  }

  // Show at least 1 tag if there's any space
  const newCount = Math.max(1, count);

  // Only update if changed to prevent infinite loops
  if (newCount !== visibleCount.value) {
    visibleCount.value = newCount;
  }
}

// Watch for changes and recalculate
watch(
  () => displayTags.value,
  async () => {
    await nextTick();
    calculateVisibleTags();
  },
  { immediate: true }
);

// Setup ResizeObserver to recalculate on column resize
onMounted(() => {
  if (!containerRef.value) return;

  // eslint-disable-next-line no-undef
  const resizeObserver = new ResizeObserver(() => {
    calculateVisibleTags();
  });

  resizeObserver.observe(containerRef.value);

  // Initial calculation
  nextTick(() => {
    calculateVisibleTags();
  });

  // Cleanup
  return () => {
    resizeObserver.disconnect();
  };
});
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
  flex-wrap: nowrap;
  align-items: center;
  gap: 4px;
  min-height: 28px;
  overflow: hidden;
  white-space: nowrap;
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

/* Individual tag chip styling */
.tag-chip-display {
  flex-shrink: 0;
}
</style>
