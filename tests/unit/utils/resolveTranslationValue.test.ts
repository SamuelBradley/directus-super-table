import { describe, it, expect } from 'vitest';
import { resolveTranslationValue } from '../../../src/utils/resolveTranslationValue';

describe('resolveTranslationValue', () => {
  it('returns text string for normal translation', () => {
    const item = { translations: [{ text: 'Hello', languages_code: 'en-GB' }] };
    expect(resolveTranslationValue(item, 'translations.text', 'en-GB', 'languages_code')).toBe(
      'Hello'
    );
  });

  it('returns null for unknown language', () => {
    const item = { translations: [{ text: 'Hello', languages_code: 'en-GB' }] };
    expect(
      resolveTranslationValue(item, 'translations.text', 'fr-FR', 'languages_code')
    ).toBeNull();
  });

  it('returns null when item has no translations', () => {
    expect(resolveTranslationValue({}, 'translations.text', 'en-GB', 'languages_code')).toBeNull();
  });

  it('extracts .text when value is accidentally a translation object', () => {
    const item = {
      translations: [
        {
          text: { text: 'Nested!', languages_code: 'en-GB' },
          languages_code: 'en-GB',
        },
      ],
    };
    expect(resolveTranslationValue(item, 'translations.text', 'en-GB', 'languages_code')).toBe(
      'Nested!'
    );
  });

  it('returns null for missing language argument', () => {
    const item = { translations: [{ text: 'Hello', languages_code: 'en-GB' }] };
    expect(resolveTranslationValue(item, 'translations.text', null, 'languages_code')).toBeNull();
  });
});
