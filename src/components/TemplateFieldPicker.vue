<template>
  <v-menu v-model="open" placement="bottom-start" :close-on-content-click="false">
    <template #activator="{ toggle }">
      <v-icon
        v-tooltip="'Insert field'"
        name="add"
        small
        clickable
        class="insert-field"
        @click="toggle"
      />
    </template>

    <v-list>
      <template v-if="canGoBack">
        <v-list-item clickable @click="goBack">
          <v-list-item-icon><v-icon name="arrow_back" small /></v-list-item-icon>
          <v-list-item-content>Back</v-list-item-content>
        </v-list-item>
        <v-divider />
      </template>

      <!-- Language step (M2A nested translation) -->
      <template v-if="langView">
        <v-list-item clickable @click="pickLanguage(null)">
          <v-list-item-content>Current user's language</v-list-item-content>
        </v-list-item>
        <v-list-item v-for="l in languages" :key="l.code" clickable @click="pickLanguage(l.code)">
          <v-list-item-content>{{ l.name || l.code }}</v-list-item-content>
        </v-list-item>
      </template>

      <!-- M2A root: discriminator + allowed target collections -->
      <template v-else-if="isM2ARoot">
        <v-list-item clickable @click="emitDiscriminator">
          <v-list-item-icon><v-icon name="category" small /></v-list-item-icon>
          <v-list-item-content>Collection</v-list-item-content>
        </v-list-item>
        <v-list-item v-for="c in m2aCollections" :key="c" clickable @click="enterCollection(c)">
          <v-list-item-icon><v-icon name="chevron_right" small /></v-list-item-icon>
          <v-list-item-content>{{ titleCase(c) }}</v-list-item-content>
        </v-list-item>
      </template>

      <!-- Fields of the current collection -->
      <template v-else>
        <v-list-item v-if="fields.length === 0" disabled>
          <v-list-item-content>No fields</v-list-item-content>
        </v-list-item>
        <v-list-item v-for="e in fields" :key="e.field" clickable @click="onEntry(e)">
          <v-list-item-icon
            ><v-icon :name="e.drillable ? 'chevron_right' : 'label'" small
          /></v-list-item-icon>
          <v-list-item-content>{{ titleCase(e.label) }}</v-list-item-content>
        </v-list-item>
      </template>
    </v-list>
  </v-menu>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import { useStores } from '@directus/extensions-sdk';
import { formatTitle } from '@directus/format-title';
import { createDescribeHop } from '../utils/describeHop';
import { listPickerFields, type PickerEntry } from '../utils/listPickerFields';
import { buildTemplateToken } from '../utils/buildTemplateToken';

type PickerContext =
  | { mode: 'm2a'; fieldKey: string; allowedCollections: string[] }
  | { mode: 'relative'; relatedCollection: string };

const props = defineProps<{
  context: PickerContext;
  languages: Array<{ code: string; name?: string }>;
}>();

const emit = defineEmits<{ (e: 'select', token: string): void }>();

const { useFieldsStore, useRelationsStore } = useStores();
const fieldsStore = useFieldsStore();
const relationsStore = useRelationsStore();
const describeHop = createDescribeHop(fieldsStore, relationsStore);

const open = ref(false);

interface Frame {
  collection: string;
  segments: string[];
  withinTranslations: boolean;
  targetCollection: string;
}
const stack = ref<Frame[]>([]);
const langView = ref<{ path: string; targetCollection: string } | null>(null);

function reset() {
  langView.value = null;
  stack.value =
    props.context.mode === 'relative'
      ? [
          {
            collection: props.context.relatedCollection,
            segments: [],
            withinTranslations: false,
            targetCollection: '',
          },
        ]
      : [];
}
watch(open, (isOpen) => {
  if (isOpen) reset();
});

const isM2ARoot = computed(
  () => props.context.mode === 'm2a' && stack.value.length === 0 && !langView.value
);
const m2aCollections = computed(() =>
  props.context.mode === 'm2a' ? props.context.allowedCollections : []
);
const canGoBack = computed(
  () => !!langView.value || stack.value.length > (props.context.mode === 'relative' ? 1 : 0)
);
const fields = computed<PickerEntry[]>(() => {
  if (langView.value || isM2ARoot.value) return [];
  const frame = stack.value[stack.value.length - 1];
  return frame ? listPickerFields(frame.collection, describeHop, fieldsStore) : [];
});

function titleCase(s: string): string {
  return formatTitle(s);
}

function enterCollection(collection: string) {
  stack.value.push({
    collection,
    segments: [],
    withinTranslations: false,
    targetCollection: collection,
  });
}

function onEntry(e: PickerEntry) {
  const frame = stack.value[stack.value.length - 1];
  if (!frame) return;
  if (e.drillable && e.relatedCollection) {
    stack.value.push({
      collection: e.relatedCollection,
      segments: [...frame.segments, e.field],
      withinTranslations: frame.withinTranslations || e.isTranslationsHop,
      targetCollection: frame.targetCollection,
    });
    return;
  }
  const path = [...frame.segments, e.field].join('.');
  if (props.context.mode === 'm2a') {
    if (frame.withinTranslations) {
      langView.value = { path, targetCollection: frame.targetCollection };
      return;
    }
    finish(
      buildTemplateToken({
        mode: 'm2a-item',
        fieldKey: props.context.fieldKey,
        targetCollection: frame.targetCollection,
        path,
      })
    );
  } else {
    finish(buildTemplateToken({ mode: 'relative', path }));
  }
}

function pickLanguage(code: string | null) {
  if (!langView.value || props.context.mode !== 'm2a') return;
  finish(
    buildTemplateToken({
      mode: 'm2a-item',
      fieldKey: props.context.fieldKey,
      targetCollection: langView.value.targetCollection,
      path: langView.value.path,
      language: code,
    })
  );
}

function emitDiscriminator() {
  if (props.context.mode !== 'm2a') return;
  finish(buildTemplateToken({ mode: 'm2a-collection', fieldKey: props.context.fieldKey }));
}

function goBack() {
  if (langView.value) {
    langView.value = null;
    return;
  }
  if (stack.value.length > 0) stack.value.pop();
}

function finish(token: string) {
  emit('select', token);
  open.value = false;
}
</script>

<style scoped>
.insert-field {
  --v-icon-color: var(--foreground-subdued);
  --v-icon-color-hover: var(--primary);
  cursor: pointer;
}
</style>
