<template>
  <div class="tag-editor">
    <!-- Add new tag input OBEN -->
    <div class="tag-input-container">
      <v-input
        v-model="newTag"
        placeholder="Type tag and press Enter..."
        autofocus
        small
        @keydown.enter.prevent="addTag"
        @keydown.escape="$emit('cancel')"
      />
      <v-button v-if="newTag.trim()" @click="addTag" icon secondary small style="margin-left: 8px">
        <v-icon name="add" />
      </v-button>
    </div>

    <!-- Current tags display UNTEN -->
    <div v-if="localTags.length > 0" class="existing-tags">
      <v-chip
        v-for="(tag, index) in localTags"
        :key="`${tag}-${index}`"
        v-tooltip="t('remove')"
        x-small
        class="tag-chip-native tag-removable"
        @click="removeTag(index)"
      >
        {{ tag }}
      </v-chip>
    </div>

    <!-- Tag suggestions (if available) -->
    <div v-if="suggestions.length > 0" class="tag-suggestions">
      <div class="suggestions-label">Suggestions:</div>
      <div class="suggestions-list">
        <v-chip
          v-for="suggestion in suggestions"
          :key="`suggestion-${suggestion}`"
          small
          clickable
          @click="addSuggestion(suggestion)"
          style="
            --v-chip-background-color: var(--theme--background-subdued);
            --v-chip-color: var(--theme--foreground);
            margin-right: 4px;
            margin-bottom: 4px;
            cursor: pointer;
          "
        >
          {{ suggestion }}
        </v-chip>
      </div>
    </div>

    <!-- Empty state -->
    <div v-if="localTags.length === 0" class="empty-state">
      <span class="empty-text">No tags yet. Type above to add your first tag.</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';

interface Props {
  value: string[] | string | null;
  suggestions?: string[];
}

interface Emits {
  (e: 'update:value', value: string[]): void;
  (e: 'save', value: string[]): void;
  (e: 'cancel'): void;
}

const props = withDefaults(defineProps<Props>(), {
  suggestions: () => [],
});

const emit = defineEmits<Emits>();

const { t } = useI18n();

// State
const localTags = ref<string[]>([]);
const newTag = ref('');

// Initialize local tags from props
watch(
  () => props.value,
  (newValue) => {
    const parsedTags = parseTagsValue(newValue);
    localTags.value = [...parsedTags];
  },
  { immediate: true }
);

// Computed
const suggestions = computed(() => {
  if (!props.suggestions || props.suggestions.length === 0) return [];

  // Filter out already added tags and current input
  return props.suggestions.filter(
    (suggestion) =>
      !localTags.value.some((tag) => tag.toLowerCase() === suggestion.toLowerCase()) &&
      suggestion.toLowerCase() !== newTag.value.toLowerCase()
  );
});

// Methods
function parseTagsValue(value: string[] | string | null): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return value.trim() ? [value] : [];
    }
  }

  return [];
}

function addTag() {
  const trimmed = newTag.value.trim();
  if (!trimmed) return;

  // Check for duplicates (case insensitive)
  const exists = localTags.value.some((tag) => tag.toLowerCase() === trimmed.toLowerCase());

  if (!exists) {
    localTags.value.push(trimmed);
    emit('update:value', localTags.value);
  }

  newTag.value = '';
}

function addSuggestion(suggestion: string) {
  if (!localTags.value.some((tag) => tag.toLowerCase() === suggestion.toLowerCase())) {
    localTags.value.push(suggestion);
    emit('update:value', localTags.value);
  }
}

function removeTag(index: number) {
  localTags.value.splice(index, 1);
  emit('update:value', localTags.value);
}
</script>

<style scoped>
.tag-editor {
  padding: 16px;
  min-width: 300px;
  max-width: 400px;
  background: var(--theme--background);
  border-radius: 8px;
}

.existing-tags {
  margin-bottom: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-input-container {
  display: flex;
  align-items: center;
  margin-bottom: 12px;
}

.tag-input-container :deep(.v-input) {
  flex: 1;
}

.tag-suggestions {
  margin-bottom: 12px;
}

.suggestions-label {
  font-size: 0.875rem;
  color: var(--theme--foreground-subdued);
  margin-bottom: 6px;
  font-weight: 500;
}

.suggestions-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.empty-state {
  text-align: center;
  padding: 20px 0;
  margin-bottom: 12px;
}

.empty-text {
  font-size: 0.875rem;
  color: var(--theme--foreground-subdued);
  font-style: italic;
}

/* CLEAN: Nur das Nötigste für native Tags */
.tag-editor .v-chip {
  --v-chip-color: white;
  --v-chip-background-color: var(--theme--primary);
  margin: 2px;
}

.tag-removable {
  cursor: pointer;
}

.tag-editor .v-chip:hover {
  --v-chip-background-color: var(--theme--danger);
}

/* Responsive adjustments */
@media (max-width: 480px) {
  .tag-editor {
    min-width: 280px;
    max-width: 320px;
  }
}
</style>
