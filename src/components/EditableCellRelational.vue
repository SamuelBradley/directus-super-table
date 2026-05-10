<template>
  <!-- Use InlineEditPopover with TagCell for tag fields -->
  <InlineEditPopover
    v-if="!isRelational && shouldUseTagCell"
    :value="displayValue"
    :field-key="actualFieldKey"
    :field-label="field?.name || actualFieldKey"
    :field-type="field?.type"
    :interface-type="'tags'"
    :interface-options="interfaceOptions"
    :is-editable="isFieldEditableComputed"
    :permission-denied="permissionDenied"
    :is-relational="false"
    :auto-save="false"
    :saving="saving"
    :collection="item?.collection || field?.collection"
    :primary-key-value="(item?.id || item?.[primaryKeyField]) ?? undefined"
    :style="{ textAlign: props.align || 'left' }"
    :field-support-level="fieldSupportLevel"
    :edit-mode-active="props.editMode"
    :field-edit-warning="fieldEditWarning"
    @update:value="handleUpdate"
    @save="handleSave"
    @next-field="navigateToNextCell"
    @prev-field="navigateToPrevCell"
  >
    <template #display="{ value }">
      <TagCell
        :value="value"
        :item="item"
        :field="actualFieldKey"
        :edit-mode="props.editMode"
        :alignment="props.align"
      />
    </template>
  </InlineEditPopover>
  <!-- Use BooleanToggleCell for boolean fields when directBooleanToggle is enabled -->
  <BooleanToggleCell
    v-else-if="!isRelational && shouldUseBooleanToggle"
    :model-value="displayValue"
    :collection="item?.collection || field?.collection"
    :primary-key="(item?.[primaryKeyField] || item?.id) ?? ''"
    :field="actualFieldKey"
    :disabled="!isFieldEditableComputed"
    :readonly="!props.editMode"
    @update:model-value="handleBooleanToggle"
    @update:success="handleSave"
  />
  <!-- Use InlineEditPopover for all other non-relational fields (including date fields) -->
  <InlineEditPopover
    v-else-if="!isRelational"
    :value="displayValue"
    :field-key="actualFieldKey"
    :field-label="field?.name || actualFieldKey"
    :field-type="field?.type"
    :interface-type="getInterfaceType() || undefined"
    :interface-options="interfaceOptions"
    :is-editable="isFieldEditableComputed"
    :permission-denied="permissionDenied"
    :is-relational="false"
    :auto-save="false"
    :language-code-field="props.languageCodeField"
    :saving="saving"
    :collection="item?.collection || field?.collection"
    :primary-key-value="(item?.[primaryKeyField] || item?.id) ?? undefined"
    :all-translations="item?.translations"
    :style="{ textAlign: props.align || 'left' }"
    :field-support-level="fieldSupportLevel"
    :edit-mode-active="props.editMode"
    :field-edit-warning="fieldEditWarning"
    @update:value="handleUpdate"
    @save="handleSave"
    @next-field="navigateToNextCell"
    @prev-field="navigateToPrevCell"
  >
    <template #display="{ value }">
      <!-- Use custom ColorCell for color fields -->
      <ColorCell
        v-if="
          field?.interface === 'select-color' ||
          field?.interface === 'color' ||
          actualFieldKey.includes('color')
        "
        :value="value"
        :item="item"
        :field="actualFieldKey"
        :edit-mode="props.editMode"
        :alignment="props.align"
      />
      <!-- Use custom ImageCell for image fields -->
      <ImageCell
        v-else-if="
          field?.interface === 'file-image' ||
          field?.interface === 'file' ||
          field?.interface === 'image' ||
          (field?.type === 'uuid' &&
            (actualFieldKey.includes('image') ||
              actualFieldKey.includes('photo') ||
              actualFieldKey.includes('picture')))
        "
        :value="value"
        :item="item"
        :field="actualFieldKey"
        :alignment="align"
      />
      <!-- ABSOLUTE PRIORITY: Resolved display via override → field → heuristic chain -->
      <render-display
        v-if="resolvedDisplay.display !== null"
        :value="value"
        :display="resolvedDisplay.display"
        :options="resolvedDisplay.options"
        :interface="field?.interface"
        :interface-options="field?.interfaceOptions"
        :type="field?.type"
        :collection="field?.collection"
        :field="field?.field"
      />
      <!-- FALLBACK 1: Custom SelectCell for select-dropdown fields WITHOUT display template -->
      <SelectCell
        v-else-if="getInterfaceType() === 'select-dropdown'"
        :value="value"
        :options="interfaceOptions"
        :field="actualFieldKey"
      />
      <!-- FALLBACK 2: Custom RelationalCell for relational fields WITHOUT display template -->
      <RelationalCell
        v-else-if="isRelationalInterface"
        :value="value"
        :field="actualFieldKey"
        :item="item"
        :primary-key-field-name="primaryKeyField"
      />
      <!-- FINAL FALLBACK: Raw value display for fields without any special handling -->
      <span v-else class="raw-value">
        {{ value != null ? String(value) : '—' }}
      </span>
    </template>
  </InlineEditPopover>

  <!-- ABSOLUTE PRIORITY: Display templates for relational fields -->
  <div
    v-else-if="resolvedDisplay.display !== null"
    class="editable-cell relational"
    :style="{ textAlign: props.align || 'left' }"
  >
    <!-- Direct Display Value (already rendered in computed) -->
    <span class="template-display">{{ displayValue }}</span>
  </div>

  <!-- FALLBACK: Display only for relational fields without display templates -->
  <div v-else class="editable-cell relational" :style="{ textAlign: props.align || 'left' }">
    <span class="raw-value">
      {{ displayValue != null ? String(displayValue) : '—' }}
    </span>
  </div>
</template>

<script lang="ts" setup>
import { computed, onBeforeMount, markRaw, ref } from 'vue';
import type { Field, Item } from '@directus/types';
import { useStores } from '@directus/extensions-sdk';
import InlineEditPopover from './InlineEditPopover.vue';
import BooleanToggleCell from './CellRenderers/BooleanToggleCell.vue';
import SelectCell from './CellRenderers/SelectCell.vue';
import ImageCell from './CellRenderers/ImageCell.vue';
import RelationalCell from './CellRenderers/RelationalCell.vue';
import ColorCell from './CellRenderers/ColorCell.vue';
import TagCell from './TagCell.vue';
import { isFieldEditable, getFieldEditWarning, getFieldSupportLevel } from '../utils/fieldSupport';
import { pickHeuristic } from '../utils/displayHeuristics';
import { usePermissions } from '../composables/usePermissions';

const { useFieldsStore, useRelationsStore } = useStores();
const fieldsStore = useFieldsStore();
const relationsStore = useRelationsStore();
const permissions = usePermissions();

const props = defineProps<{
  item: Item;
  fieldKey: string;
  field: Field | null;
  edits?: any;
  getDisplayValue?: (_item: Item, _key: string) => any;
  selectedLanguage?: string;
  saving?: boolean;
  editMode?: boolean;
  align?: 'left' | 'center' | 'right';
  directBooleanToggle?: boolean;
  primaryKeyFieldName?: string;
  languageCodeField?: string;
  columnDisplays?: Record<string, { template: string; display?: string }>;
}>();

const emit = defineEmits<{
  update: [itemId: string | number, field: string, value: any];
  save: [];
  'navigate-next': [];
  'navigate-prev': [];
}>();

// Simple cache for relational objects - only cache on mount to avoid corruption
const relationalCache = ref<Record<string, any>>({});

onBeforeMount(() => {
  // Cache relational objects once on mount
  if (props.item) {
    Object.keys(props.item).forEach((key) => {
      const value = props.item[key];
      if (value && typeof value === 'object' && value !== null) {
        relationalCache.value[key] = markRaw(value);
      }
    });
  }
});

// Computed
const primaryKeyField = computed(() => {
  // Use the provided primaryKeyFieldName prop if available
  if (props.primaryKeyFieldName) {
    return props.primaryKeyFieldName;
  }

  // Fallback: Try to detect from item keys
  const detectedKey = Object.keys(props.item).find((key) => key === 'id' || key.endsWith('_id'));
  if (detectedKey) {
    return detectedKey;
  }

  // Last resort fallback with warning
  console.warn(
    '[Super Layout Table] Could not determine primary key field for item. Using fallback "id".',
    props.item
  );
  return 'id';
});

// Extract language code if present in field key
const fieldLanguage = computed(() => {
  if (props.fieldKey?.includes(':')) {
    return props.fieldKey.split(':')[1];
  }
  return props.selectedLanguage;
});

// Get actual field key without language suffix
const actualFieldKey = computed(() => {
  if (props.fieldKey?.includes(':')) {
    return props.fieldKey.split(':')[0];
  }
  return props.fieldKey;
});

const displayValue = computed(() => {
  // For edited values
  if (props.edits !== undefined) {
    return props.edits;
  }

  // Special handling for translations fields
  if (actualFieldKey.value.includes('translations.')) {
    const translationField = actualFieldKey.value.split('.').slice(1).join('.');

    // Check if translations exist and is an array
    if (Array.isArray(props.item.translations) && props.item.translations.length > 0) {
      // Use the language from field key (if specified) or the selected language
      const targetLanguage = fieldLanguage.value;

      if (targetLanguage) {
        const languageField = props.languageCodeField || 'languages_code';
        const translation = props.item.translations.find(
          (t: any) => t[languageField] === targetLanguage
        );

        // Return the specific field value if translation exists
        if (translation) {
          return translation[translationField] || null;
        }
      }

      // No translation for this language
      return null;
    }

    // No translations available at all
    return null;
  }

  // Handle relational fields with display templates.
  // Resolved priority: override → field-display → heuristic → none.
  // Issue #48: layout-level override (columnDisplays) takes priority over the
  // field-settings display.
  const storageKey = props.fieldKey.includes(':') ? props.fieldKey.split(':')[0] : props.fieldKey;
  const override = props.columnDisplays?.[storageKey];
  const fieldTemplate =
    props.field?.displayOptions?.template || props.field?.meta?.display_options?.template;

  let template: string | null | undefined = null;
  let isOverridePath = false;
  let isHeuristicPath = false;

  if (override?.template) {
    template = override.template;
    isOverridePath = true;
  } else if (props.field?.display && fieldTemplate) {
    template = fieldTemplate;
  } else {
    // Heuristic only fires for relational fields without override/field.display
    const heuristic = pickHeuristic(props.field as any, relationsStore as any, fieldsStore as any);
    if (heuristic) {
      template = heuristic;
      isHeuristicPath = true;
    }
  }

  if (template) {
    const relationalValue = props.item[props.fieldKey];

    // M2M unwrap when override OR heuristic provides the template. (Field-display
    // renders via the existing path which handles its own shape.)
    let valueForTemplate = relationalValue;
    const needsM2MUnwrap =
      (isOverridePath || isHeuristicPath) &&
      Array.isArray(relationalValue) &&
      props.field?.meta?.special?.includes('m2m');
    if (needsM2MUnwrap) {
      const collection = props.field?.collection;
      const fieldName = props.field?.field;
      if (collection && fieldName) {
        const relations = relationsStore.getRelationsForField(collection, fieldName);
        const junctionField = relations?.[0]?.meta?.junction_field;
        if (junctionField) {
          valueForTemplate = relationalValue
            .map((item: any) => item?.[junctionField])
            .filter(Boolean);
        }
      }
    }

    // If we have an array (M2M / O2M), render each item with the template and join
    if (Array.isArray(valueForTemplate)) {
      if (valueForTemplate.length === 0) return '—';
      return valueForTemplate
        .map((item: any) =>
          item && typeof item === 'object' ? renderTemplate(item, template as string) : String(item)
        )
        .filter((s) => s && s !== '—')
        .join(', ');
    }

    // Single object → render once
    if (valueForTemplate && typeof valueForTemplate === 'object') {
      return renderTemplate(valueForTemplate, template);
    }

    // If corrupted (primitive value), try cache fallback
    const cachedValue = relationalCache.value[props.fieldKey];
    if (cachedValue) {
      return renderTemplate(cachedValue, template);
    }

    // No data available
    return '—';
  }

  // For other relational fields, use the aliased getter if provided
  if (props.getDisplayValue) {
    return props.getDisplayValue(props.item, props.fieldKey);
  }

  // For normal fields with dot notation
  if (props.fieldKey.includes('.')) {
    const parts = props.fieldKey.split('.');
    let value = props.item;
    for (const part of parts) {
      value = value?.[part];
    }
    return value;
  }

  // Simple field access
  return props.item[props.fieldKey];
});

type ResolvedDisplay = {
  display: string | null;
  options: Record<string, unknown>;
  source: 'override' | 'field' | 'heuristic' | 'raw';
};

const resolvedDisplay = computed<ResolvedDisplay>(() => {
  // Storage key for translations is the root (no language suffix)
  const storageKey = props.fieldKey.includes(':') ? props.fieldKey.split(':')[0] : props.fieldKey;

  // 1. Layout-level override (renders via related-values unless the user
  //    explicitly stored a different display id alongside the template)
  const override = props.columnDisplays?.[storageKey];
  if (override?.template) {
    return {
      display: override.display ?? 'related-values',
      options: { template: override.template },
      source: 'override',
    };
  }

  // 2. Field-settings display — pass the full options object so template-less
  //    displays (image, color, formatted-value with prefix/suffix, ...) work.
  if (props.field?.display) {
    return {
      display: props.field.display,
      options: (props.field as any).displayOptions ?? props.field?.meta?.display_options ?? {},
      source: 'field',
    };
  }

  // 3. Smart heuristics for relational fields without any configured display
  const heuristic = pickHeuristic(props.field as any, relationsStore as any, fieldsStore as any);
  if (heuristic) {
    return {
      display: 'related-values',
      options: { template: heuristic },
      source: 'heuristic',
    };
  }

  return { display: null, options: {}, source: 'raw' };
});

// Check if field is editable using the field support utility
const isFieldEditableComputed = computed(() => {
  if (!props.editMode) return false;

  // Permission check first — denies independent of field-support
  const collection = props.field?.collection || props.item?.collection;
  if (!collection) return false;

  if (actualFieldKey.value.startsWith('translations.')) {
    // Translation sub-field: check update on the translations junction collection
    const subField = actualFieldKey.value.split('.').slice(1).join('.');
    const transRelations = relationsStore.getRelationsForField(collection, 'translations');
    const transCollection = transRelations?.[0]?.collection;
    if (transCollection && !permissions.canUpdate(transCollection, subField)) return false;
  } else {
    if (!permissions.canUpdate(collection, actualFieldKey.value)) return false;
  }

  // Field-support check (unchanged)
  if (actualFieldKey.value.startsWith('translations.')) return true;
  return isFieldEditable(props.field, actualFieldKey.value);
});

const permissionDenied = computed(() => {
  if (!props.editMode) return false;
  const collection = props.field?.collection || props.item?.collection;
  if (!collection) return false;

  if (actualFieldKey.value.startsWith('translations.')) {
    const subField = actualFieldKey.value.split('.').slice(1).join('.');
    const transCollection = relationsStore.getRelationsForField(collection, 'translations')?.[0]
      ?.collection;
    return transCollection ? !permissions.canUpdate(transCollection, subField) : false;
  }
  return !permissions.canUpdate(collection, actualFieldKey.value);
});

// Get field edit warning message
const fieldEditWarning = computed(() => {
  if (!props.editMode) return '';
  if (isFieldEditableComputed.value) return '';

  // Use the unified warning system for all fields
  return getFieldEditWarning(props.field, actualFieldKey.value);
});

// Get field support level for UI display
const fieldSupportLevel = computed(() => {
  return getFieldSupportLevel(props.field, actualFieldKey.value);
});

// Check if we should use TagCell for tag fields
const shouldUseTagCell = computed(() => {
  if (!props.field) return false;

  // Primary check: Field has 'tags' interface
  const interfaceType = props.field.interface || props.field.meta?.interface;
  if (interfaceType === 'tags') {
    return true; // Always use TagCell for explicit tag fields
  }

  // Secondary check: JSON field with string array content (legacy support)
  if (props.field.type === 'json' && props.editMode) {
    const value = displayValue.value;

    // Check if value is a string array (tags)
    if (Array.isArray(value)) {
      // All items must be strings and non-empty
      return (
        value.length === 0 ||
        value.every((item) => typeof item === 'string' && item.trim().length > 0)
      );
    }

    // Check if it's a JSON string that parses to a string array
    if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        return (
          Array.isArray(parsed) &&
          (parsed.length === 0 ||
            parsed.every((item) => typeof item === 'string' && item.trim().length > 0))
        );
      } catch {
        return false;
      }
    }

    // Empty/null values in JSON fields could be tags if field name suggests it
    if ((value === null || value === undefined || value === '') && actualFieldKey.value) {
      const fieldName = actualFieldKey.value.toLowerCase();
      return (
        fieldName.includes('tag') || fieldName.includes('label') || fieldName.includes('keyword')
      );
    }
  }

  return false;
});

// Check if we should use BooleanToggleCell
const shouldUseBooleanToggle = computed(() => {
  return (
    props.directBooleanToggle === true &&
    props.editMode === true &&
    (props.field?.type === 'boolean' ||
      props.field?.interface === 'boolean' ||
      props.field?.interface === 'toggle')
  );
});

// Check if field is relational
const isRelational = computed(() => {
  if (!props.field) return false;

  // Translation fields should be editable even though they use dot notation
  if (actualFieldKey.value.startsWith('translations.')) {
    return false; // Allow editing of translation fields
  }

  // Check for relational special flags
  const special = props.field.meta?.special;
  if (Array.isArray(special)) {
    return special.some((s) => ['m2o', 'o2m', 'm2m', 'm2a'].includes(s));
  }

  // Check if field key contains dot notation (nested field)
  return actualFieldKey.value.includes('.');
});

// Check if field has a relational interface
const isRelationalInterface = computed(() => {
  if (!props.field) return false;

  const relationalInterfaces = [
    'many-to-one',
    'one-to-many',
    'many-to-many',
    'many-to-any',
    'list-m2m',
    'list-o2m',
    'list-m2a',
    'files',
  ];

  return relationalInterfaces.includes(props.field.interface || '');
});

// Get interface options
const interfaceOptions = computed(() => {
  const options = props.field?.interfaceOptions || props.field?.meta?.options || {};

  // Add field-specific props
  if (
    props.field?.interface === 'select-dropdown' ||
    props.field?.meta?.interface === 'select-dropdown'
  ) {
    return {
      ...options,
      items: options.choices || [],
      itemText: 'text',
      itemValue: 'value',
    };
  }

  if (props.field?.type === 'integer' || props.field?.type === 'float') {
    return {
      ...options,
      type: 'number',
    };
  }

  return options;
});

// Methods
function getInterfaceType() {
  return props.field?.interface || props.field?.meta?.interface;
}

// Manual Template Rendering - Production Fix for render-display issue
function renderTemplate(value: any, template: string): string {
  if (!template || template === null || template === undefined) {
    // No template - return formatted value
    return value != null ? String(value) : '—';
  }

  if (!value) {
    return '—';
  }

  // Handle object values for related fields
  if (typeof value === 'object' && value !== null) {
    let result = template;

    // Replace template variables with actual values
    Object.keys(value).forEach((key) => {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      const fieldValue = value[key];
      result = result.replace(regex, fieldValue != null ? String(fieldValue) : '');
    });

    return result;
  }

  // Handle simple values - replace all template vars with the same value
  return template.replace(/\{\{.*?\}\}/g, String(value));
}

function handleUpdate(value: any) {
  const itemId = props.item?.[primaryKeyField.value];

  if (itemId !== undefined && itemId !== null) {
    // Check if this is a full translations update
    if (typeof value === 'object' && value?.isFullTranslations) {
      // Handle full translations update from interface-translations
      emit('update', itemId, 'translations', {
        isFullTranslations: true,
        translations: value.translations,
      });
    }
    // Special handling for single translation field
    else if (actualFieldKey.value.startsWith('translations.')) {
      const translationField = actualFieldKey.value.split('.').slice(1).join('.');
      const translationUpdate = {
        fieldKey: props.fieldKey, // Use original field key with language
        translationField,
        value,
        language: fieldLanguage.value, // Use language from field key or selected
        isTranslation: true,
      };
      emit('update', itemId, props.fieldKey, translationUpdate);
    } else {
      emit('update', itemId, props.fieldKey, value);
    }
  }
}

function handleBooleanToggle(value: boolean) {
  const itemId = props.item?.[primaryKeyField.value];
  if (itemId !== undefined && itemId !== null) {
    emit('update', itemId, props.fieldKey, value);
  }
}

function handleSave(value?: any) {
  if (value !== undefined) {
    handleUpdate(value);
  }
  emit('save');
}

function navigateToNextCell() {
  const cells = document.querySelectorAll('.inline-edit-wrapper .edit-cell');
  const currentCell = document.activeElement?.closest('.inline-edit-wrapper');

  if (currentCell) {
    const currentIndex = Array.from(cells).findIndex(
      (cell) => cell.closest('.inline-edit-wrapper') === currentCell
    );
    const nextCell = cells[currentIndex + 1] as HTMLElement;

    if (nextCell) {
      nextCell.click();
    }
  }

  emit('navigate-next');
}

function navigateToPrevCell() {
  const cells = document.querySelectorAll('.inline-edit-wrapper .edit-cell');
  const currentCell = document.activeElement?.closest('.inline-edit-wrapper');

  if (currentCell) {
    const currentIndex = Array.from(cells).findIndex(
      (cell) => cell.closest('.inline-edit-wrapper') === currentCell
    );
    const prevCell = cells[currentIndex - 1] as HTMLElement;

    if (prevCell) {
      prevCell.click();
    }
  }

  emit('navigate-prev');
}
</script>

<style scoped>
.editable-cell.relational,
.editable-cell.non-editable {
  position: relative;
  min-height: 42px;
  padding: 8px 12px;
  cursor: default;
  display: flex;
  align-items: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editable-cell.non-editable {
  opacity: 0.7;
  cursor: not-allowed !important;
}

.lock-icon {
  margin-right: 8px;
  color: var(--foreground-subdued);
  opacity: 0.6;
}

/* Ensure full height for inline edit wrapper */
:deep(.inline-edit-wrapper) {
  height: 100%;
}

/* Ensure proper cell display */
:deep(.edit-cell) {
  min-height: 36px;
  height: 100%;
}

/* Match table cell styling */
:deep(.cell-display) {
  display: flex;
  align-items: center;
  min-height: 26px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}
</style>
