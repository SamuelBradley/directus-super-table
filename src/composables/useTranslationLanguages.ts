import { onMounted, ref, watch, type Ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';

/**
 * Probe the translations junction for the language codes the user can actually
 * read. The server applies row-level permission filters during the aggregate,
 * so the result captures restrictions Directus does not expose via
 * `/permissions/me`. Returns `null` on failure or when the collection has no
 * accessible rows — the caller is expected to fall back to a permission-store
 * lookup so an empty collection doesn't silently drop every language column.
 */
export function useTranslationLanguages(
  translationsCollection: Ref<string | null>,
  languageCodeField: Ref<string>
) {
  const api = useApi();
  const probedLanguages = ref<string[] | null>(null);

  async function probe(): Promise<void> {
    const collection = translationsCollection.value;
    const codeField = languageCodeField.value;
    if (!collection || !codeField) {
      probedLanguages.value = null;
      return;
    }
    try {
      const response = await api.get(`/items/${collection}`, {
        params: {
          aggregate: { count: '*' },
          groupBy: [codeField],
          limit: -1,
        },
      });
      const rows = (response?.data?.data ?? []) as Array<Record<string, unknown>>;
      const codes = rows
        .map((row) => row[codeField])
        .filter((c): c is string => typeof c === 'string' && c.length > 0);
      probedLanguages.value = codes.length > 0 ? codes : null;
    } catch {
      probedLanguages.value = null;
    }
  }

  // The initial probe is deferred to onMounted so upstream computeds (e.g.
  // `hasTranslationFields`) are initialized before the watcher's reactive
  // tracking touches them — `{ immediate: true }` here triggers a TDZ error.
  watch([translationsCollection, languageCodeField], () => {
    if (translationsCollection.value) probe();
    else probedLanguages.value = null;
  });

  onMounted(() => {
    if (translationsCollection.value) probe();
  });

  return { probedLanguages, probe };
}
