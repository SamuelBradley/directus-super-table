import { describe, it, expect } from 'vitest';
import { renderM2ATemplate } from '@/utils/renderM2ATemplate';
import type { DescribeHop } from '@/utils/resolveRelationalPath';

// Junction rows mirror the live orders.treatment shape: a `collection`
// discriminator + a polymorphic `item` payload. `treatment` is the parent
// field name the native picker uses as the token prefix.
const itemField = 'item';
const discriminator = 'collection';
const fieldName = 'treatment';

describe('renderM2ATemplate', () => {
  it('resolves {{collection}} from the discriminator', () => {
    const row = { collection: 'service', item: { name: 'Installation' } };
    expect(renderM2ATemplate(row, '{{collection}}', itemField, discriminator, fieldName)).toBe(
      'service'
    );
  });

  it('walks a nested path (M2A -> M2O -> scalar)', () => {
    const row = { collection: 'partners_catalog', item: { catalog_id: { title: 'Premium' } } };
    expect(
      renderM2ATemplate(
        row,
        '{{item:partners_catalog.catalog_id.title}}',
        itemField,
        discriminator,
        fieldName
      )
    ).toBe('Premium');
  });

  it('returns "—" for a null/non-object row', () => {
    expect(renderM2ATemplate(null, '{{collection}}', itemField, discriminator, fieldName)).toBe('—');
  });

  it('renders empty for an item token whose collection does not match the row', () => {
    const row = { collection: 'service', item: { name: 'X' } };
    expect(
      renderM2ATemplate(row, '{{item:partners_catalog.name}}', itemField, discriminator, fieldName).trim()
    ).toBe('');
  });

  it('collapses object/array leaves to empty (no "[object Object]")', () => {
    const row = { collection: 'service', item: { nested: { a: 1 }, list: [1, 2] } };
    expect(
      renderM2ATemplate(row, '{{item:service.nested}}', itemField, discriminator, fieldName).trim()
    ).toBe('');
    expect(
      renderM2ATemplate(row, '{{item:service.list}}', itemField, discriminator, fieldName).trim()
    ).toBe('');
  });

  it('renders empty when the item payload is null (blocked / dangling)', () => {
    const row = { collection: 'service', item: null };
    expect(
      renderM2ATemplate(row, '{{item:service.name}}', itemField, discriminator, fieldName).trim()
    ).toBe('');
  });

  // Hand-written shorthands both resolve: the conventional `item:col.field` and
  // the parent field name `<fieldName>:col.field`. (The native picker emits a
  // field-key-prefixed form instead — covered separately below.)
  describe('token prefix formats', () => {
    const row = { collection: 'service', item: { name: 'Installation' } };

    it('resolves the hand-written {{item:col.field}} form', () => {
      expect(
        renderM2ATemplate(row, '{{item:service.name}}', itemField, discriminator, fieldName).trim()
      ).toBe('Installation');
    });

    it('resolves the {{<fieldName>:col.field}} shorthand', () => {
      expect(
        renderM2ATemplate(row, '{{treatment:service.name}}', itemField, discriminator, fieldName).trim()
      ).toBe('Installation');
    });

    it('both forms yield identical output', () => {
      const manual = renderM2ATemplate(
        row,
        '{{collection}}: {{item:service.name}}',
        itemField,
        discriminator,
        fieldName
      );
      const picker = renderM2ATemplate(
        row,
        '{{collection}}: {{treatment:service.name}}',
        itemField,
        discriminator,
        fieldName
      );
      expect(picker).toBe(manual);
      expect(picker).toBe('service: Installation');
    });

    it('ignores an unrelated prefix that is neither the field name nor item', () => {
      expect(
        renderM2ATemplate(row, '{{other:service.name}}', itemField, discriminator, fieldName).trim()
      ).toBe('');
    });
  });

  // The native display-template picker is rooted at the PARENT collection, so it
  // prefixes every M2A token with the field key: `treatment.collection` and
  // `treatment.item:service.name` (verified live against Directus 11.11.0).
  describe('native picker field-key-prefixed tokens (issue #60)', () => {
    const row = { collection: 'service', item: { name: 'Installation' } };

    it('resolves the prefixed discriminator {{<field>.collection}}', () => {
      expect(
        renderM2ATemplate(row, '{{treatment.collection}}', itemField, discriminator, fieldName).trim()
      ).toBe('service');
    });

    it('resolves the prefixed item token {{<field>.item:col.field}}', () => {
      expect(
        renderM2ATemplate(
          row,
          '{{treatment.item:service.name}}',
          itemField,
          discriminator,
          fieldName
        ).trim()
      ).toBe('Installation');
    });

    it('renders a full picker template identically to the hand-written form', () => {
      const picker = renderM2ATemplate(
        row,
        '{{treatment.collection}}: {{treatment.item:service.name}}',
        itemField,
        discriminator,
        fieldName
      );
      const manual = renderM2ATemplate(
        row,
        '{{collection}}: {{item:service.name}}',
        itemField,
        discriminator,
        fieldName
      );
      expect(picker).toBe('service: Installation');
      expect(picker).toBe(manual);
    });

    it('renders empty when the prefixed item collection does not match the row', () => {
      expect(
        renderM2ATemplate(
          row,
          '{{treatment.item:partners_catalog.name}}',
          itemField,
          discriminator,
          fieldName
        ).trim()
      ).toBe('');
    });
  });

  // Parent-row fields (bare tokens) and junction-level fields (field-prefixed)
  // are also resolvable. On a name clash the deeper token wins by shape:
  // `{{item:col.f}}` (item) > `{{<field>.f}}` (junction) > `{{f}}` (parent).
  describe('parent and junction field scopes (issue #60)', () => {
    const parentRow = { code: 'V-2600', name: 'PARENT' };

    it('resolves a bare token against the parent row', () => {
      const row = { collection: 'service', item: { name: 'Installation' } };
      expect(
        renderM2ATemplate(
          row,
          '{{treatment.collection}}: {{code}}',
          itemField,
          discriminator,
          fieldName,
          parentRow
        ).trim()
      ).toBe('service: V-2600');
    });

    it('resolves a field-prefixed non-item token against the junction row', () => {
      const row = { collection: 'service', item: { name: 'X' }, sort: 5 };
      expect(
        renderM2ATemplate(
          row,
          '{{treatment.sort}}',
          itemField,
          discriminator,
          fieldName,
          parentRow
        ).trim()
      ).toBe('5');
    });

    it('lets the deeper item token win over a same-named parent field', () => {
      const row = { collection: 'service', item: { name: 'ITEM' } };
      expect(
        renderM2ATemplate(
          row,
          '{{treatment.item:service.name}} / {{name}}',
          itemField,
          discriminator,
          fieldName,
          parentRow
        ).trim()
      ).toBe('ITEM / PARENT');
    });

    it('renders a bare token empty when no parent row is supplied (back-compat)', () => {
      const row = { collection: 'service', item: { name: 'Installation' } };
      expect(renderM2ATemplate(row, '{{code}}', itemField, discriminator, fieldName).trim()).toBe(
        ''
      );
    });
  });

  // Deep relational paths — e.g. a translations relation INSIDE the M2A target —
  // resolved via the schema-aware describeHop + the `:lang` suffix (issue #60 follow-up).
  describe('deep relational paths via describeHop', () => {
    const describeHop: DescribeHop = (collection, field) =>
      collection === 'service' && field === 'translations'
        ? {
            kind: 'translations',
            relatedCollection: 'service_translations',
            languageField: 'languages_code',
          }
        : { kind: 'scalar' };

    const row = {
      collection: 'service',
      item: {
        translations: [
          { languages_code: 'en-US', label: 'Maintenance (EN)' },
          { languages_code: 'de-DE', label: 'Wartung (DE)' },
        ],
      },
    };

    it('resolves a nested translation in the language from the :lang suffix', () => {
      expect(
        renderM2ATemplate(
          row,
          '{{treatment.item:service.translations.label:de-DE}}',
          itemField,
          discriminator,
          fieldName,
          null,
          { describeHop }
        ).trim()
      ).toBe('Wartung (DE)');
      expect(
        renderM2ATemplate(
          row,
          '{{treatment.item:service.translations.label:en-US}}',
          itemField,
          discriminator,
          fieldName,
          null,
          { describeHop }
        ).trim()
      ).toBe('Maintenance (EN)');
    });

    it('falls back to the first translation row without a :lang suffix', () => {
      expect(
        renderM2ATemplate(
          row,
          '{{treatment.item:service.translations.label}}',
          itemField,
          discriminator,
          fieldName,
          null,
          { describeHop }
        ).trim()
      ).toBe('Maintenance (EN)');
    });

    it('uses opts.language as the default when no :lang suffix is present', () => {
      expect(
        renderM2ATemplate(
          row,
          '{{treatment.item:service.translations.label}}',
          itemField,
          discriminator,
          fieldName,
          null,
          { describeHop, language: 'de-DE' }
        ).trim()
      ).toBe('Wartung (DE)');
    });

    it('lets the token :lang suffix override opts.language', () => {
      expect(
        renderM2ATemplate(
          row,
          '{{treatment.item:service.translations.label:en-US}}',
          itemField,
          discriminator,
          fieldName,
          null,
          { describeHop, language: 'de-DE' }
        ).trim()
      ).toBe('Maintenance (EN)');
    });

    it('renders empty for the nested translation without a resolver (back-compat)', () => {
      expect(
        renderM2ATemplate(
          row,
          '{{treatment.item:service.translations.label:de-DE}}',
          itemField,
          discriminator,
          fieldName
        ).trim()
      ).toBe('');
    });

    // Regression guard: the render path must pick the translation row via the
    // DETECTED language field (here `lang`), not a hardcoded `languages_code`.
    // A hardcode would miss every row and fall back to the first → wrong language.
    it('honours the detected language field (lang) at render, not hardcoded languages_code', () => {
      const langHop: DescribeHop = (collection, field) =>
        collection === 'service' && field === 'translations'
          ? { kind: 'translations', relatedCollection: 'service_translations', languageField: 'lang' }
          : { kind: 'scalar' };
      const langRow = {
        collection: 'service',
        item: {
          translations: [
            { lang: 'en-US', label: 'Maintenance (EN)' },
            { lang: 'de-DE', label: 'Wartung (DE)' },
          ],
        },
      };
      expect(
        renderM2ATemplate(
          langRow,
          '{{treatment.item:service.translations.label:de-DE}}',
          itemField,
          discriminator,
          fieldName,
          null,
          { describeHop: langHop }
        ).trim()
      ).toBe('Wartung (DE)');
    });
  });

  describe('HTML stripping of resolved values', () => {
    it('strips HTML tags from item field values', () => {
      const row = {
        collection: 'content_headline',
        item: { description: '<p data-start="258">Seamless connection</p>' },
      };
      expect(
        renderM2ATemplate(
          row,
          '{{item:content_headline.description}}',
          itemField,
          discriminator,
          fieldName
        )
      ).toBe('Seamless connection');
    });

    it('decodes entities in resolved values', () => {
      const row = { collection: 'service', item: { name: 'Fix &amp; Flip' } };
      expect(
        renderM2ATemplate(row, '{{item:service.name}}', itemField, discriminator, fieldName)
      ).toBe('Fix & Flip');
    });

    it('strips HTML from junction-level and parent-row tokens too', () => {
      const row = { collection: 'service', item: {}, note: '<b>urgent</b>' };
      const parentRow = { context: '<em>Q3</em>' };
      expect(
        renderM2ATemplate(
          row,
          '{{treatment.note}} {{context}}',
          itemField,
          discriminator,
          fieldName,
          parentRow
        )
      ).toBe('urgent Q3');
    });

    it('leaves plain text values untouched', () => {
      const row = { collection: 'service', item: { name: 'Installation (DE)' } };
      expect(
        renderM2ATemplate(row, '{{item:service.name}}', itemField, discriminator, fieldName)
      ).toBe('Installation (DE)');
    });
  });
});
