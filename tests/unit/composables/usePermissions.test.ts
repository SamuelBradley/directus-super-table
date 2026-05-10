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
