<template>
  <div
    v-if="!isRelational && !props.editMode"
    class="editable-cell non-editable"
    :title="readOnlyHoverTitle"
    :style="{ textAlign: props.align || 'left' }"
  >
    <ColorCell
      v-if="
        field?.interface === 'select-color' ||
        field?.interface === 'color' ||
        actualFieldKey.includes('color')
      "
      :value="displayValue"
      :item="item"
      :field="actualFieldKey"
      :edit-mode="false"
      :alignment="props.align"
    />
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
      :value="displayValue"
      :item="item"
      :field="actualFieldKey"
      :alignment="align"
    />
    <span v-else-if="field?.display === 'user'" class="raw-value" :title="toHoverText(formatUserDisplay(displayValue))">
      {{ formatUserDisplay(displayValue) }}
    </span>
    <render-display
      v-else-if="resolvedDisplay.display !== null"
      :value="displayValue"
      :display="resolvedDisplay.display"
      :options="resolvedDisplay.options"
      :interface="field?.interface"
      :interface-options="field?.interfaceOptions"
      :type="field?.type"
      :collection="field?.collection"
      :field="field?.field"
    />
    <SelectCell
      v-else-if="getInterfaceType() === 'select-dropdown'"
      :value="displayValue"
      :options="interfaceOptions"
      :field="actualFieldKey"
    />
    <span v-else class="raw-value" :title="toHoverText(displayValue)">
      {{ displayValue != null ? String(displayValue) : '—' }}
    </span>
  </div>

  <!-- Use InlineEditPopover with TagCell for tag fields -->
  <InlineEditPopover
    v-else-if="!isRelational && shouldUseTagCell"
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
      <!-- Render user displays as text to avoid avatar/image UI in audit columns. -->
      <span v-else-if="field?.display === 'user'" class="raw-value" :title="toHoverText(formatUserDisplay(value))">
        {{ formatUserDisplay(value) }}
      </span>
      <!-- ABSOLUTE PRIORITY: Resolved display via override → field → heuristic chain -->
      <render-display
        v-else-if="resolvedDisplay.display !== null"
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
      <span v-else class="raw-value" :title="toHoverText(value)">
        {{ value != null ? String(value) : '—' }}
      </span>
    </template>
  </InlineEditPopover>

  <!-- M2A: render each junction row, with a block icon for rows whose target
       collection the current user cannot read -->
  <div
    v-else-if="isM2AField"
    class="editable-cell relational"
    :style="{ textAlign: props.align || 'left' }"
  >
    <span v-if="m2aSegments.length === 0" class="template-display">—</span>
    <span v-else class="template-display">
      <template v-for="(seg, i) in m2aSegments" :key="i">
        <span v-if="i > 0">, </span>
        <v-icon
          v-if="isBlockedSegment(seg)"
          v-tooltip="`No permission to read ${seg.collection}`"
          name="block"
          x-small
          class="m2a-blocked-icon"
        />
        <span v-else>{{ seg.text }}</span>
      </template>
    </span>
  </div>

  <!-- ABSOLUTE PRIORITY: Display templates for relational fields -->
  <div
    v-else-if="resolvedDisplay.display !== null"
    class="editable-cell relational"
    :style="{ textAlign: props.align || 'left' }"
  >
    <!-- Direct Display Value (already rendered in computed) -->
    <span
      class="template-display"
      :title="toHoverText(field?.display === 'user' ? formatUserDisplay(displayValue) : displayValue)"
    >
      {{ field?.display === 'user' ? formatUserDisplay(displayValue) : displayValue }}
    </span>
  </div>

  <!-- FALLBACK: Display only for relational fields without display templates -->
  <div v-else class="editable-cell relational" :style="{ textAlign: props.align || 'left' }">
    <span class="raw-value" :title="toHoverText(displayValue)">
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
import { pickHeuristic, isM2A } from '../utils/displayHeuristics';
import { resolveM2ARelation } from '../utils/resolveM2ARelation';
import { buildM2ASegments, isBlockedSegment, type M2ASegment } from '../utils/buildM2ASegments';
import { createDescribeHop } from '../utils/describeHop';
import { resolveUserLanguage } from '../utils/resolveUserLanguage';
import { resolveTranslationValue } from '../utils/resolveTranslationValue';
import { renderBareTranslation } from '../utils/bareTranslationField';
import { stripHtml } from '../utils/stripHtml';
import { usePermissions } from '../composables/usePermissions';

const { useFieldsStore, useRelationsStore, useUserStore } = useStores();
const fieldsStore = useFieldsStore();
const relationsStore = useRelationsStore();
const permissions = usePermissions();
const userStore = useUserStore?.();

// Schema-aware hop resolver so M2A templates can reach deep relations
// (e.g. translations stored inside the target collection).
const describeHop = createDescribeHop(fieldsStore, relationsStore);

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

// columnDisplays is keyed by the root field (no language suffix).
const storageKey = computed(() =>
  props.fieldKey.includes(':') ? props.fieldKey.split(':')[0] : props.fieldKey
);

const displayValue = computed(() => {
  // For edited values
  if (props.edits !== undefined) {
    return props.edits;
  }

  // Translation sub-fields go through the centralised helper so a sibling
  // re-render during a popover open cannot leak a whole translation row
  // through as "[object Object]".
  if (actualFieldKey.value.includes('translations.')) {
    return resolveTranslationValue(
      props.item,
      actualFieldKey.value,
      fieldLanguage.value ?? null,
      props.languageCodeField || 'languages_code'
    );
  }

  // User displays can arrive as object, scalar id, or be available only via
  // aliased getter/cache depending on permissions and fetched fields.
  if (props.field?.display === 'user') {
    const rawValue = props.item[props.fieldKey];

    if (rawValue && typeof rawValue === 'object') {
      return rawValue;
    }

    if (props.getDisplayValue) {
      const aliasedValue = props.getDisplayValue(props.item, props.fieldKey);

      if (aliasedValue && typeof aliasedValue === 'object') {
        return aliasedValue;
      }

      if (aliasedValue != null) {
        return aliasedValue;
      }
    }

    const cachedValue = relationalCache.value[props.fieldKey];
    if (cachedValue) {
      return cachedValue;
    }

    return rawValue ?? null;
  }

  // Bare `translations` column (no sub-field, no `:lang`): render the active-
  // language row through the configured/heuristic template instead of raw JSON.
  // (selectedLanguage is never passed to the cell, so the active language is
  // effectively the current user's — `fieldLanguage` stays the first operand for
  // consistency with the dotted-translations branch above.)
  if (props.field?.meta?.special?.includes('translations') && !actualFieldKey.value.includes('.')) {
    return renderBareTranslation(
      props.item[actualFieldKey.value],
      fieldLanguage.value ?? resolveUserLanguage(userStore),
      props.languageCodeField || 'languages_code',
      props.columnDisplays?.[storageKey.value]?.template,
      (row, template) => stripHtml(renderTemplate(row, template))
    );
  }

  // Display-template resolution priority: column-display override →
  // field's own display template → relational heuristic → none.
  const override = props.columnDisplays?.[storageKey.value];
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

    void isOverridePath;
    void isHeuristicPath;
    let valueForTemplate = relationalValue;

    // M2A is rendered structurally (see m2aSegments) so blocked rows can show
    // an icon; the string path below only covers non-M2A relations.
    if (isM2AField.value) {
      return '';
    }

    // M2M: unwrap junction items through junction_field so the template
    // resolves against the target row, not the pivot row.
    const needsM2MUnwrap =
      Array.isArray(relationalValue) && props.field?.meta?.special?.includes('m2m');
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

    if (Array.isArray(valueForTemplate)) {
      if (valueForTemplate.length === 0) return '—';
      return valueForTemplate
        .map((item: any) =>
          item && typeof item === 'object' ? renderTemplate(item, template as string) : String(item)
        )
        .filter((s) => s && s !== '—')
        .join(', ');
    }

    if (valueForTemplate && typeof valueForTemplate === 'object') {
      return renderTemplate(valueForTemplate, template);
    }

    if (valueForTemplate !== undefined && valueForTemplate !== null) {
      return renderTemplate(valueForTemplate, template);
    }

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

const readOnlyHoverTitle = computed(() => {
  if (props.field?.display === 'user') {
    return toHoverText(formatUserDisplay(displayValue.value));
  }

  return toHoverText(displayValue.value);
});

const isM2AField = computed(() => isM2A(props.field));

// M2A cells render structurally (see buildM2ASegments) so each junction row can
// show either its resolved template value or a `block` icon when its target
// collection is not readable by the current user.
const m2aSegments = computed<M2ASegment[]>(() => {
  if (!isM2AField.value) return [];
  const collection = props.field?.collection;
  const fieldName = props.field?.field;
  const m2a =
    collection && fieldName
      ? resolveM2ARelation(collection, fieldName, relationsStore, fieldsStore)
      : null;
  if (!m2a) return [];

  const template =
    props.columnDisplays?.[storageKey.value]?.template ||
    props.field?.displayOptions?.template ||
    props.field?.meta?.display_options?.template ||
    `{{${m2a.discriminator}}}`;

  return buildM2ASegments(
    props.item[props.fieldKey],
    template,
    m2a.itemField,
    m2a.discriminator,
    String(fieldName),
    props.item,
    (c) => permissions.canRead(c),
    { describeHop, language: resolveUserLanguage(userStore) }
  );
});

type ResolvedDisplay = {
  display: string | null;
  options: Record<string, unknown>;
  source: 'override' | 'field' | 'heuristic' | 'raw';
};

const resolvedDisplay = computed<ResolvedDisplay>(() => {
  // 1. Layout-level override (renders via related-values unless the user
  //    explicitly stored a different display id alongside the template)
  const override = props.columnDisplays?.[storageKey.value];
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
    // Translation sub-field: resolve the junction collection and check update permission.
    // `collection` may already be the junction (when called from a translation cell whose
    // field metadata.collection points at the junction) or the parent collection. Try the
    // parent → junction lookup first; fall back to treating `collection` as the junction.
    const subField = actualFieldKey.value.split('.').slice(1).join('.');
    const parentRels = relationsStore.getRelationsForField(collection, 'translations');
    const transCollection = parentRels?.[0]?.collection || collection;
    if (!permissions.canUpdate(transCollection, subField)) return false;
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
    const parentRels = relationsStore.getRelationsForField(collection, 'translations');
    const transCollection = parentRels?.[0]?.collection || collection;
    return !permissions.canUpdate(transCollection, subField);
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

function formatUserDisplay(value: any): string {
  if (!value) return 'Unknown User';

  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  if (typeof value === 'object') {
    const firstName = typeof value.first_name === 'string' ? value.first_name.trim() : '';
    const lastName = typeof value.last_name === 'string' ? value.last_name.trim() : '';
    const fullName = `${firstName} ${lastName}`.trim();

    if (fullName) return fullName;
    if (typeof value.email === 'string' && value.email.trim()) return value.email.trim();
    if (value.id != null) return String(value.id);
  }

  return 'Unknown User';
}

function toHoverText(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
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
.m2a-blocked-icon {
  --v-icon-color: var(--foreground-subdued);
  vertical-align: middle;
}
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
  opacity: 1;
  cursor: inherit;
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
