/**
 * Safely resolve a translation field value from an item's translations array.
 *
 * Issue #37 (Bug C): When the popover opens for one cell, sibling translation
 * cells could re-render with the full translation row object as their value,
 * which then renders as the literal string "[object Object]" through Vue's
 * default `String()` coercion.
 *
 * This helper centralizes the lookup and guards against the edge case where
 * the resolved sub-field value is itself an object that contains a `text`
 * property (e.g. accidentally double-nested translation rows).
 *
 * @param item - Parent item carrying the `translations` array
 * @param fieldPath - Field key including the leading `translations.` segment (e.g. `translations.text`)
 * @param language - Target language code (e.g. `en-GB`); when null, no lookup is attempted
 * @param languageCodeField - Field on each translation row holding the language code
 * @returns The primitive translation value, or null when no translation matches
 */
export function resolveTranslationValue(
  item: any,
  fieldPath: string,
  language: string | null,
  languageCodeField: string
): unknown {
  if (!Array.isArray(item?.translations) || item.translations.length === 0) return null;
  if (!language) return null;
  const translation = item.translations.find((t: any) => t[languageCodeField] === language);
  if (!translation) return null;
  const subField = fieldPath.split('.').slice(1).join('.');
  const value = translation[subField];
  if (value && typeof value === 'object' && 'text' in value) return (value as any).text;
  return value ?? null;
}
