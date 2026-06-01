import { vi } from 'vitest';
import { config } from '@vue/test-utils';

// Global test setup for Vue Test Utils and mocks

// Mock Directus composables and utilities that are commonly used
vi.mock('@directus/utils', () => ({
  formatTitle: (str: string) => str.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
  isDirectusError: vi.fn(() => false),
  // Minimal dotted-path getter mirroring @directus/utils `get`.
  get: (obj: any, path: string) => {
    if (!path) return undefined;
    return path.split('.').reduce((acc: any, key: string) => acc?.[key], obj);
  },
}));

vi.mock('@directus/format-title', () => ({
  default: (str: string) => str.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
}));

// Mock vue-i18n
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key, // Return key as-is for testing
    n: (value: number) => value.toString(),
    locale: { value: 'en-US' },
  }),
}));

// Mock Directus stores
const mockFieldsStore = {
  getField: vi.fn(),
  getFieldsForCollection: vi.fn(),
};

const mockRelationsStore = {
  getRelationsForField: vi.fn(() => []),
};

const mockCollectionStore = {
  getCollection: vi.fn(),
};

vi.mock('@/stores', () => ({
  useFieldsStore: () => mockFieldsStore,
  useRelationsStore: () => mockRelationsStore,
  useCollectionStore: () => mockCollectionStore,
}));

// Mock the extensions-sdk to keep the real module (and its transitive @directus/themes
// → pinia chain) out of the test runtime. Individual tests can override via
// vi.doMock + vi.resetModules() if they need richer behavior.
vi.mock('@directus/extensions-sdk', () => ({
  useStores: () => ({
    useFieldsStore: () => mockFieldsStore,
    useRelationsStore: () => mockRelationsStore,
    useCollectionStore: () => mockCollectionStore,
  }),
  useCollection: () => ({ primaryKeyField: { value: { field: 'id' } } }),
  useApi: () => ({
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  }),
  useSync: <T,>(props: Record<string, T>, key: string, emit: (e: string, v: T) => void) => ({
    get value(): T {
      return props[key]!;
    },
    set value(v: T) {
      emit(`update:${key}`, v);
    },
  }),
  defineLayout: vi.fn(),
}));

// Mock Directus SDK
vi.mock('@directus/sdk', () => ({
  createDirectus: vi.fn(),
  rest: vi.fn(),
  readItems: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  createItem: vi.fn(),
}));

// Configure Vue Test Utils global properties
config.global.mocks = {
  $t: (key: string) => key,
  $n: (value: number) => value.toString(),
};

config.global.stubs = {
  // Stub common Directus components
  'v-dialog': true,
  'v-card': true,
  'v-card-title': true,
  'v-card-text': true,
  'v-card-actions': true,
  'v-button': true,
  'v-input': true,
  'v-checkbox': true,
  'v-chip': true,
  'v-divider': true,
  'v-notice': true,
  'v-table': true,
  'v-pagination': true,
};