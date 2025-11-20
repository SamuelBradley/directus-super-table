import { computed, ComputedRef } from 'vue';

/**
 * Translation configuration interface
 */
export interface TranslationConfig {
  languageCodeField: string;
}

/**
 * Default translation configuration
 */
const DEFAULT_CONFIG: TranslationConfig = {
  languageCodeField: 'languages_code',
};

/**
 * Composable for managing translation configuration
 * This allows users to specify custom field names for language codes
 * instead of being forced to use 'languages_code'
 *
 * @param layoutOptions - The layout options from the parent component
 * @returns Translation configuration object
 */
export function useTranslationConfig(
  layoutOptions: ComputedRef<Record<string, any>> | Record<string, any>
): ComputedRef<TranslationConfig> {
  return computed(() => {
    const options = 'value' in layoutOptions ? layoutOptions.value : layoutOptions;

    return {
      languageCodeField: options?.languageCodeField || DEFAULT_CONFIG.languageCodeField,
    };
  });
}

/**
 * Helper function to get the language code field name
 * This is used throughout the extension to access the correct field
 *
 * @param config - Translation configuration
 * @returns The field name to use for language codes
 */
export function getLanguageCodeField(config: TranslationConfig): string {
  return config.languageCodeField;
}

/**
 * Helper function to build the full field path for translations
 *
 * @param config - Translation configuration
 * @returns The full field path (e.g., 'translations.languages_code')
 */
export function getTranslationLanguageFieldPath(config: TranslationConfig): string {
  return `translations.${config.languageCodeField}`;
}
