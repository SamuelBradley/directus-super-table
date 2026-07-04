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
        <span>Display Template</span>
        <v-icon v-if="m2aHelp" v-tooltip="m2aHelp.tooltip" name="help" small class="help-icon" />
        <div class="spacer" />
        <TemplateFieldPicker
          v-if="pickerContext"
          :context="pickerContext"
          :languages="languages"
          @select="insertToken"
        />
      </div>
      <!-- Plain-text editor: the native chip editor (system-display-template)
           silently drops the extension-only `:lang` suffix on nested-translation
           tokens and would re-serialize it away on edit (data loss). A raw
           textarea round-trips the template losslessly and keeps every token
           visible. -->
      <v-textarea
        ref="templateRef"
        :model-value="form.template"
        placeholder="{{ field }}"
        :nullable="false"
        @update:model-value="form.template = $event ?? ''"
      />
      <div class="hint">
        Write the template with <code>{{ fieldToken }}</code> tokens.
        <template v-if="m2aHelp">
          For this Many-to-Any field use <code>{{ collectionToken }}</code> and
          <code>{{ itemToken }}</code
          >; add a <code>:lang</code> suffix to pin a nested-translation language (e.g.
          <code>{{ langExampleToken }}</code
          >).
        </template>
      </div>
    </div>

    <div class="actions">
      <v-button secondary small @click="$emit('cancel')">Cancel</v-button>
      <v-button :disabled="!canSave" small @click="onSave">Save</v-button>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { computed, ref, watch, onMounted, nextTick } from 'vue';
import { useStores } from '@directus/extensions-sdk';
import type { ColumnDisplay } from '../composables/useColumnDisplays';
import {
  isM2A,
  isRelational,
  resolveTargetCollection,
  stripLanguageSuffix,
} from '../utils/displayHeuristics';
import { resolveM2ARelation } from '../utils/resolveM2ARelation';
import { useLanguageSelector } from '../composables/useLanguageSelector';
import TemplateFieldPicker from './TemplateFieldPicker.vue';

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

const { languages, fetchLanguages } = useLanguageSelector();
onMounted(() => {
  void fetchLanguages();
});

// Field picker context derived from the column's relation type. Null → no
// picker button (scalar / per-language translation columns: a token template
// doesn't apply there).
const pickerContext = computed(() => {
  if (!form.value.fieldKey) return null;
  const rootField = stripLanguageSuffix(form.value.fieldKey).split('.')[0];
  if (!rootField) return null;
  const fieldDef = fieldsStore.getField(props.collection, rootField);
  if (!fieldDef) return null;
  if (isM2A(fieldDef)) {
    const m2a = resolveM2ARelation(props.collection, rootField, relationsStore, fieldsStore);
    if (!m2a) return null;
    return {
      mode: 'm2a' as const,
      fieldKey: rootField,
      allowedCollections: m2a.allowedCollections,
    };
  }
  if (isRelational(fieldDef)) {
    // Per-language translation columns render via resolveTranslationValue (the
    // column key carries the language), not via a token template — so a picker
    // would only insert dead tokens. No button there.
    if (fieldDef.meta?.special?.includes('translations')) return null;
    const related = resolveTargetCollection(fieldDef, relationsStore as any, fieldsStore as any);
    if (!related) return null;
    return { mode: 'relative' as const, relatedCollection: related };
  }
  return null;
});

const templateRef = ref<any>(null);
function innerTextarea(): HTMLTextAreaElement | null {
  const root = templateRef.value?.$el as HTMLElement | undefined;
  return (root?.querySelector('textarea') as HTMLTextAreaElement) ?? null;
}

// Insert a picker token at the textarea's last caret position (a blurred
// textarea retains its selection), replacing any selection. Falls back to
// appending. The textarea stays the lossless source of truth.
function insertToken(token: string) {
  const el = innerTextarea();
  const current = form.value.template;
  const start = el ? (el.selectionStart ?? current.length) : current.length;
  const end = el ? (el.selectionEnd ?? current.length) : current.length;
  form.value.template = current.slice(0, start) + token + current.slice(end);
  void nextTick(() => {
    const after = innerTextarea();
    if (after) {
      const caret = start + token.length;
      after.focus();
      after.setSelectionRange(caret, caret);
    }
  });
}

// Literal token examples for the help notice (kept out of the template so the
// mustache braces aren't parsed as Vue interpolation).
const fieldToken = '{{ field }}';
const collectionToken = '{{collection}}';
const itemToken = '{{item:<collection>.<field>}}';
const langExampleToken = '{{item:<collection>.translations.<field>:de-DE}}';

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
    `Many-to-Any field. Write tokens by hand: ` +
    `${collectionToken} for the target collection and ${itemToken} for its values. ` +
    `${allowed}Example: ${example}`;
  return { tooltip };
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
.label .spacer {
  flex: 1 1 auto;
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
