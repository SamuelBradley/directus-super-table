import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref } from 'vue';

const mockPermissions = ref<Record<string, any>>({});
vi.mock('@directus/extensions-sdk', () => ({
  useStores: () => ({
    usePermissionsStore: () => ({ permissions: mockPermissions }),
  }),
}));

import { usePermissions } from '../../../src/composables/usePermissions';

describe('usePermissions.canRead', () => {
  beforeEach(() => {
    mockPermissions.value = {
      issue_37_test: {
        read: { access: 'full', fields: ['id', 'title', 'translations'] },
      },
    };
  });

  it('returns true when collection is readable and field is in whitelist', () => {
    const { canRead } = usePermissions();
    expect(canRead('issue_37_test', 'title')).toBe(true);
  });

  it('returns false when field is not in whitelist', () => {
    const { canRead } = usePermissions();
    expect(canRead('issue_37_test', 'thumbnail')).toBe(false);
  });

  it('returns true for any field when access is full and fields contains "*"', () => {
    mockPermissions.value.issue_37_test.read.fields = ['*'];
    const { canRead } = usePermissions();
    expect(canRead('issue_37_test', 'anything')).toBe(true);
  });

  it('returns false when collection has access "none"', () => {
    mockPermissions.value.issue_37_test.read.access = 'none';
    const { canRead } = usePermissions();
    expect(canRead('issue_37_test', 'title')).toBe(false);
  });

  it('returns false when collection is not in permissions map at all', () => {
    const { canRead } = usePermissions();
    expect(canRead('unknown_collection', 'title')).toBe(false);
  });

  it('returns true when called without a field if collection has any access', () => {
    const { canRead } = usePermissions();
    expect(canRead('issue_37_test')).toBe(true);
  });
});

describe('usePermissions.canUpdate / canCreate / canDelete', () => {
  beforeEach(() => {
    mockPermissions.value = {
      issue_37_test: {
        read: { access: 'full', fields: ['*'] },
        update: { access: 'partial', fields: ['title', 'status'] },
        create: { access: 'full' },
        delete: { access: 'none' },
      },
    };
  });

  it('canUpdate returns true when field is in update whitelist', () => {
    const { canUpdate } = usePermissions();
    expect(canUpdate('issue_37_test', 'title')).toBe(true);
  });

  it('canUpdate returns false when field is not in update whitelist', () => {
    const { canUpdate } = usePermissions();
    expect(canUpdate('issue_37_test', 'thumbnail')).toBe(false);
  });

  it('canUpdate returns false when collection has no update entry', () => {
    const { canUpdate } = usePermissions();
    expect(canUpdate('unknown_collection', 'title')).toBe(false);
  });

  it('canCreate returns true when collection has create access', () => {
    const { canCreate } = usePermissions();
    expect(canCreate('issue_37_test')).toBe(true);
  });

  it('canCreate returns false when collection has no create entry', () => {
    const { canCreate } = usePermissions();
    expect(canCreate('unknown_collection')).toBe(false);
  });

  it('canDelete returns false when delete access is "none"', () => {
    const { canDelete } = usePermissions();
    expect(canDelete('issue_37_test')).toBe(false);
  });
});

describe('usePermissions shape resilience', () => {
  it('returns false when permissions store exposes an array (legacy shape)', () => {
    mockPermissions.value = [] as any;
    const { canRead, canUpdate, canCreate, canDelete } = usePermissions();
    expect(canRead('issue_37_test', 'title')).toBe(false);
    expect(canUpdate('issue_37_test', 'title')).toBe(false);
    expect(canCreate('issue_37_test')).toBe(false);
    expect(canDelete('issue_37_test')).toBe(false);
  });

  it('returns false when permissions store is null/undefined', () => {
    mockPermissions.value = null as any;
    const { canRead } = usePermissions();
    expect(canRead('issue_37_test', 'title')).toBe(false);
  });
});

describe('usePermissions.getAccessibleLanguages', () => {
  it('returns the list of language codes the user can read', () => {
    mockPermissions.value = {
      languages: { read: { access: 'partial', fields: ['*'] } },
    };
    const allLanguages = [
      { code: 'de-DE', name: 'German' },
      { code: 'en-GB', name: 'English' },
      { code: 'fr-FR', name: 'Français' },
    ];

    const { getAccessibleLanguages } = usePermissions();
    expect(getAccessibleLanguages(allLanguages)).toEqual(['de-DE', 'en-GB', 'fr-FR']);
  });

  it('returns empty array when user has no access to languages collection', () => {
    mockPermissions.value = {};
    const { getAccessibleLanguages } = usePermissions();
    expect(getAccessibleLanguages([{ code: 'de-DE', name: 'German' }])).toEqual([]);
  });
});

describe('usePermissions.sanitizeFields', () => {
  beforeEach(() => {
    mockPermissions.value = {
      issue_37_test: {
        read: { access: 'full', fields: ['id', 'title', 'translations'] },
      },
      issue_37_test_translations: {
        read: { access: 'partial', fields: ['id', 'languages_code', 'text', 'description'] },
      },
    };
  });

  it('keeps fields the user can read', () => {
    const { sanitizeFields } = usePermissions();
    expect(sanitizeFields('issue_37_test', ['id', 'title'])).toEqual(['id', 'title']);
  });

  it('drops fields the user cannot read', () => {
    const { sanitizeFields } = usePermissions();
    expect(sanitizeFields('issue_37_test', ['id', 'title', 'thumbnail'])).toEqual(['id', 'title']);
  });

  it('keeps language-suffixed translation fields when sub-field is readable', () => {
    const { sanitizeFields } = usePermissions();
    expect(
      sanitizeFields('issue_37_test', ['translations.text:de-DE', 'translations.text:en-GB'], {
        translationsCollection: 'issue_37_test_translations',
      })
    ).toEqual(['translations.text:de-DE', 'translations.text:en-GB']);
  });

  it('drops language-suffixed fields when sub-field is not readable', () => {
    mockPermissions.value.issue_37_test_translations.read.fields = ['id', 'languages_code', 'text'];
    const { sanitizeFields } = usePermissions();
    expect(
      sanitizeFields('issue_37_test', ['translations.text:de-DE', 'translations.description:de-DE'], {
        translationsCollection: 'issue_37_test_translations',
      })
    ).toEqual(['translations.text:de-DE']);
  });

  it('drops language-suffixed fields when language is not in accessibleLanguages', () => {
    const { sanitizeFields } = usePermissions();
    expect(
      sanitizeFields('issue_37_test', ['translations.text:de-DE', 'translations.text:fr-FR'], {
        translationsCollection: 'issue_37_test_translations',
        accessibleLanguages: ['de-DE'],
      })
    ).toEqual(['translations.text:de-DE']);
  });

  // Documents the contract: sanitizeFields treats every field the same way,
  // including structural fields like the primary key and translation language
  // code. The `fieldsWithRelational` caller in super-table.vue relies on this
  // to fall back gracefully — when the user lacks read permission on the PK,
  // sanitize drops it, the API request omits it, and the layout degrades the
  // same way native Directus does (items render with limited interaction
  // instead of an empty 403 error state).
  it('drops the primary key when it is not in the read whitelist (graceful degradation)', () => {
    mockPermissions.value.issue_37_test.read.fields = ['title'];
    const { sanitizeFields } = usePermissions();
    expect(sanitizeFields('issue_37_test', ['id', 'title'])).toEqual(['title']);
  });

  it('drops translations.languages_code when sub-field is not in the junction whitelist (graceful degradation)', () => {
    mockPermissions.value.issue_37_test_translations.read.fields = ['id', 'text'];
    const { sanitizeFields } = usePermissions();
    expect(
      sanitizeFields('issue_37_test', ['translations.languages_code', 'translations.text'], {
        translationsCollection: 'issue_37_test_translations',
      })
    ).toEqual(['translations.text']);
  });
});
