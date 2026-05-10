import { onMounted, ref, watch, type Ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';

/**
 * Probes the user's accessible languages by querying which `languages_code`
 * values appear in the translations junction collection. The server enforces
 * the row-level filter automatically, so the result reflects exactly the
 * languages the user can read — including row-level restrictions that the
 * client cannot otherwise inspect (Directus does not expose raw permission
 * filters via /permissions/me).
 *
 * Returns:
 *   - non-empty `string[]` when the probe succeeded and the collection had
 *     at least one accessible row,
 *   - `null` when the probe failed (network error, 403, etc.) — caller is
 *     expected to fall back to permission-based detection,
 *   - `null` when the collection is empty (no rows exist at all) so callers
 *     don't accidentally drop every language column on a fresh installation.
 */
export function useTranslationLanguages(
  translationsCollection: Ref<string | null>,
  languageCodeField: Ref<string>
) {
  const api = useApi();
  const probedLanguages = ref<string[] | null>(null);
  const probing = ref(false);

  async function probe(): Promise<void> {
    const collection = translationsCollection.value;
    const codeField = languageCodeField.value;
    if (!collection || !codeField) {
      probedLanguages.value = null;
      return;
    }
    probing.value = true;
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
    } finally {
      probing.value = false;
    }
  }

  // Re-probe on subsequent ref changes. Initial probe is deferred to onMounted
  // so we don't force evaluation of upstream computeds (e.g. hasTranslationFields)
  // before they are initialized in the parent setup() — a previous attempt with
  // `{ immediate: true }` triggered a TDZ error.
  watch([translationsCollection, languageCodeField], () => {
    if (translationsCollection.value) probe();
    else probedLanguages.value = null;
  });

  onMounted(() => {
    if (translationsCollection.value) probe();
  });

  return { probedLanguages, probing, probe };
}
