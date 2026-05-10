/**
 * Resolve a single translation field value (e.g. `translations.text` for a
 * given language). Centralised so a sibling cell re-rendering during a popover
 * open cannot leak the whole translation row through Vue's `String()`
 * coercion as `"[object Object]"` — the final guard unwraps the row when it
 * accidentally arrives in place of the sub-field value.
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
