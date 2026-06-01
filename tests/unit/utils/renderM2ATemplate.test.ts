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

  // Both token formats must work: `item:` (hand-written) and `<fieldName>:`
  // (emitted by the native display-template picker, issue #60 follow-up).
  describe('token prefix formats', () => {
    const row = { collection: 'service', item: { name: 'Installation' } };

    it('resolves the hand-written {{item:col.field}} form', () => {
      expect(
        renderM2ATemplate(row, '{{item:service.name}}', itemField, discriminator, fieldName).trim()
      ).toBe('Installation');
    });

    it('resolves the picker {{<fieldName>:col.field}} form', () => {
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
});
