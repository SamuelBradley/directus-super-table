import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';

const mockApiGet = vi.fn();
vi.mock('@directus/extensions-sdk', () => ({
  useApi: () => ({ get: mockApiGet }),
}));

import { useTranslationLanguages } from '../../../src/composables/useTranslationLanguages';

describe('useTranslationLanguages', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it('returns the languages found in the translations collection', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        data: [
          { languages_code: 'de-DE', count: { '*': 3 } },
          { languages_code: 'en-GB', count: { '*': 3 } },
        ],
      },
    });

    const collection = ref<string | null>('issue_37_test_translations');
    const codeField = ref('languages_code');
    const { probedLanguages, probe } = useTranslationLanguages(collection, codeField);

    await probe();

    expect(probedLanguages.value).toEqual(['de-DE', 'en-GB']);
    expect(mockApiGet).toHaveBeenCalledWith('/items/issue_37_test_translations', {
      params: { aggregate: { count: '*' }, groupBy: ['languages_code'], limit: -1 },
    });
  });

  it('returns null when the API call fails', async () => {
    mockApiGet.mockRejectedValue(new Error('403 Forbidden'));

    const collection = ref<string | null>('issue_37_test_translations');
    const codeField = ref('languages_code');
    const { probedLanguages, probe } = useTranslationLanguages(collection, codeField);

    await probe();

    expect(probedLanguages.value).toBeNull();
  });

  it('returns null when the collection has no rows (empty fresh install)', async () => {
    mockApiGet.mockResolvedValue({ data: { data: [] } });

    const collection = ref<string | null>('issue_37_test_translations');
    const codeField = ref('languages_code');
    const { probedLanguages, probe } = useTranslationLanguages(collection, codeField);

    await probe();

    expect(probedLanguages.value).toBeNull();
  });

  it('skips the probe when collection is null', async () => {
    const collection = ref<string | null>(null);
    const codeField = ref('languages_code');
    const { probedLanguages, probe } = useTranslationLanguages(collection, codeField);

    await probe();

    expect(probedLanguages.value).toBeNull();
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it('uses a custom language code field when provided', async () => {
    mockApiGet.mockResolvedValue({
      data: { data: [{ lang: 'de-DE', count: { '*': 1 } }] },
    });

    const collection = ref<string | null>('custom_translations');
    const codeField = ref('lang');
    const { probedLanguages, probe } = useTranslationLanguages(collection, codeField);

    await probe();

    expect(probedLanguages.value).toEqual(['de-DE']);
    expect(mockApiGet).toHaveBeenCalledWith('/items/custom_translations', {
      params: { aggregate: { count: '*' }, groupBy: ['lang'], limit: -1 },
    });
  });

  it('re-probes when the translationsCollection ref changes', async () => {
    mockApiGet
      .mockResolvedValueOnce({ data: { data: [{ languages_code: 'fr-FR' }] } });

    const collection = ref<string | null>('first_translations');
    const codeField = ref('languages_code');
    const { probedLanguages } = useTranslationLanguages(collection, codeField);

    // Initial probe is deferred to onMounted (not invoked in unit test).
    expect(probedLanguages.value).toBeNull();

    // Changing the ref triggers the watcher.
    collection.value = 'second_translations';
    await nextTick();
    await new Promise((r) => setTimeout(r, 0));
    expect(probedLanguages.value).toEqual(['fr-FR']);
  });
});
