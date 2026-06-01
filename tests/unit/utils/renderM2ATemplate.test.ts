import { describe, it, expect } from 'vitest';
import { renderM2ATemplate } from '@/utils/renderM2ATemplate';

// Junction rows mirror the live orders.treatment shape: a `collection`
// discriminator + a polymorphic `item` payload.
const itemField = 'item';
const discriminator = 'collection';

describe('renderM2ATemplate', () => {
  it('resolves {{collection}} from the discriminator', () => {
    const row = { collection: 'service', item: { name: 'Installation' } };
    expect(renderM2ATemplate(row, '{{collection}}', itemField, discriminator)).toBe('service');
  });

  it('resolves {{item:col.field}} only for the matching collection', () => {
    const row = { collection: 'service', item: { name: 'Installation' } };
    const tpl = '{{item:partners_catalog.name}} {{item:service.name}}';
    // partners_catalog branch is skipped (row is a service), service branch wins
    expect(renderM2ATemplate(row, tpl, itemField, discriminator).trim()).toBe('Installation');
  });

  it('walks a nested path (M2A -> M2O -> scalar)', () => {
    const row = { collection: 'partners_catalog', item: { catalog_id: { title: 'Premium' } } };
    expect(
      renderM2ATemplate(row, '{{item:partners_catalog.catalog_id.title}}', itemField, discriminator)
    ).toBe('Premium');
  });

  it('combines discriminator and item tokens', () => {
    const row = { collection: 'service', item: { name: 'Repair' } };
    expect(renderM2ATemplate(row, '{{collection}}: {{item:service.name}}', itemField, discriminator)).toBe(
      'service: Repair'
    );
  });

  it('returns "—" for a null/non-object row', () => {
    expect(renderM2ATemplate(null, '{{collection}}', itemField, discriminator)).toBe('—');
  });

  it('renders empty for an item token whose collection does not match the row', () => {
    const row = { collection: 'service', item: { name: 'X' } };
    expect(renderM2ATemplate(row, '{{item:partners_catalog.name}}', itemField, discriminator).trim()).toBe(
      ''
    );
  });

  it('collapses object/array leaves to empty (no "[object Object]")', () => {
    const row = { collection: 'service', item: { nested: { a: 1 }, list: [1, 2] } };
    expect(renderM2ATemplate(row, '{{item:service.nested}}', itemField, discriminator).trim()).toBe('');
    expect(renderM2ATemplate(row, '{{item:service.list}}', itemField, discriminator).trim()).toBe('');
  });

  it('renders empty when the item payload is null (blocked / dangling)', () => {
    const row = { collection: 'service', item: null };
    expect(renderM2ATemplate(row, '{{item:service.name}}', itemField, discriminator).trim()).toBe('');
  });

  it('honors a custom discriminator name via {{collection}} alias', () => {
    const row = { kind: 'service', item: { name: 'Installation' } };
    // discriminator is 'kind', but the literal {{collection}} alias still resolves it
    expect(renderM2ATemplate(row, '{{collection}}', itemField, 'kind')).toBe('service');
  });
});
