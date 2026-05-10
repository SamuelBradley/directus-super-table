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
});
