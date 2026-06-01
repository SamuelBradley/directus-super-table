import { describe, it, expect } from 'vitest';
import { renderM2ATemplate } from '@/utils/renderM2ATemplate';

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
});
