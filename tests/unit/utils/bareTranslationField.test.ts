import { describe, it, expect } from 'vitest';
import { defaultBareTranslationField, renderBareTranslation } from '@/utils/bareTranslationField';

describe('defaultBareTranslationField', () => {
  it('prefers description over other present fields', () => {
    expect(
      defaultBareTranslationField(
        { languages_code: 'de-DE', title: 'T', description: 'D' },
        'languages_code'
      )
    ).toBe('description');
  });

  it('falls through the preferred list (title when no description)', () => {
    expect(defaultBareTranslationField({ languages_code: 'de-DE', title: 'T' }, 'languages_code')).toBe(
      'title'
    );
  });

  it('matches a preferred field even alongside id / *_id', () => {
    expect(
      defaultBareTranslationField(
        { id: 1, languages_code: 'de-DE', service_id: 5, headline: 'H' },
        'languages_code'
      )
    ).toBe('headline');
  });

  it('falls back to the first non-id scalar, skipping id and the language field', () => {
    expect(
      defaultBareTranslationField({ id: 1, languages_code: 'de-DE', slug: 'abc' }, 'languages_code')
    ).toBe('slug');
  });

  it('skips *_id keys and object/relational values', () => {
    expect(
      defaultBareTranslationField(
        { id: 1, languages_code: 'de-DE', parent_id: 9, nested: { a: 1 }, code: 'X' },
        'languages_code'
      )
    ).toBe('code');
  });

  it('honours a non-default language-code field name', () => {
    expect(defaultBareTranslationField({ id: 1, lang: 'de-DE', tagline: 'T' }, 'lang')).toBe('tagline');
  });

  it('returns null for null or nothing displayable', () => {
    expect(defaultBareTranslationField(null, 'languages_code')).toBeNull();
    expect(defaultBareTranslationField(undefined, 'languages_code')).toBeNull();
    expect(defaultBareTranslationField({ id: 1, languages_code: 'de-DE' }, 'languages_code')).toBeNull();
  });
});

describe('renderBareTranslation', () => {
  const rows = [
    { languages_code: 'en-US', description: '<p>English</p>' },
    { languages_code: 'de-DE', description: '<p>Deutsch</p>' },
  ];
  // Mimics the component's render: interpolate {{key}} then strip tags.
  const render = (row: Record<string, unknown>, tmpl: string): string =>
    tmpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(row[k] ?? '')).replace(/<[^>]+>/g, '');

  it('renders the active-language row via the heuristic field', () => {
    expect(renderBareTranslation(rows, 'de-DE', 'languages_code', undefined, render)).toBe('Deutsch');
  });

  it('falls back to the first row when the language is absent', () => {
    expect(renderBareTranslation(rows, 'fr-FR', 'languages_code', undefined, render)).toBe('English');
  });

  it('prefers a configured template over the heuristic field', () => {
    const r = [{ languages_code: 'de-DE', description: 'D', title: 'T' }];
    expect(renderBareTranslation(r, 'de-DE', 'languages_code', '{{title}}', render)).toBe('T');
  });

  it('returns an em dash for a non-array or empty value', () => {
    expect(renderBareTranslation(null, 'de-DE', 'languages_code', undefined, render)).toBe('—');
    expect(renderBareTranslation([], 'de-DE', 'languages_code', undefined, render)).toBe('—');
  });

  it('returns an em dash when the row has nothing displayable', () => {
    expect(
      renderBareTranslation([{ languages_code: 'de-DE', id: 1 }], 'de-DE', 'languages_code', undefined, render)
    ).toBe('—');
  });
});
