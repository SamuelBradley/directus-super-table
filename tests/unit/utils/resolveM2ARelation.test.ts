import { describe, it, expect, vi } from 'vitest';
import { resolveM2ARelation } from '@/utils/resolveM2ARelation';

// Mirrors the live orders.treatment shape: the junction's polymorphic `item`
// relation carries the collection discriminator and the allowed collections.
const itemRelation = {
  collection: 'orders_treatment',
  field: 'item',
  meta: {
    one_collection_field: 'collection',
    one_allowed_collections: ['partners_catalog', 'service'],
  },
};
const parentRelation = {
  collection: 'orders_treatment',
  field: 'orders_id',
  meta: { one_collection_field: null },
};

describe('resolveM2ARelation', () => {
  it('resolves itemField, discriminator, allowedCollections and junctionCollection', () => {
    const relationsStore = {
      getRelationsForField: vi.fn().mockReturnValue([parentRelation, itemRelation]),
    };
    expect(resolveM2ARelation('orders', 'treatment', relationsStore)).toEqual({
      itemField: 'item',
      discriminator: 'collection',
      allowedCollections: ['partners_catalog', 'service'],
      junctionCollection: 'orders_treatment',
    });
  });

  it('picks the discriminator-carrying relation regardless of order', () => {
    const relationsStore = {
      getRelationsForField: vi.fn().mockReturnValue([itemRelation, parentRelation]),
    };
    expect(resolveM2ARelation('orders', 'treatment', relationsStore)?.itemField).toBe('item');
  });

  it('defaults allowedCollections to [] when not constrained', () => {
    const relationsStore = {
      getRelationsForField: vi.fn().mockReturnValue([
        { field: 'item', meta: { one_collection_field: 'collection' } },
      ]),
    };
    expect(resolveM2ARelation('orders', 'treatment', relationsStore)?.allowedCollections).toEqual(
      []
    );
  });

  it('returns junctionCollection null when the relation carries no collection', () => {
    const relationsStore = {
      getRelationsForField: vi.fn().mockReturnValue([
        { field: 'item', meta: { one_collection_field: 'collection' } },
      ]),
    };
    expect(
      resolveM2ARelation('orders', 'treatment', relationsStore)?.junctionCollection
    ).toBeNull();
  });

  it('returns null when no relation carries one_collection_field', () => {
    const relationsStore = {
      getRelationsForField: vi.fn().mockReturnValue([parentRelation]),
    };
    expect(resolveM2ARelation('orders', 'treatment', relationsStore)).toBeNull();
  });

  it('returns null when the item relation lacks a field name', () => {
    const relationsStore = {
      getRelationsForField: vi
        .fn()
        .mockReturnValue([{ meta: { one_collection_field: 'collection' } }]),
    };
    expect(resolveM2ARelation('orders', 'treatment', relationsStore)).toBeNull();
  });

  it('returns null when no relations exist for the field', () => {
    const relationsStore = { getRelationsForField: vi.fn().mockReturnValue([]) };
    expect(resolveM2ARelation('orders', 'treatment', relationsStore)).toBeNull();
  });

  it('returns null (no throw) when the store throws during early boot', () => {
    const relationsStore = {
      getRelationsForField: vi.fn().mockImplementation(() => {
        throw new Error('store not ready');
      }),
    };
    expect(resolveM2ARelation('orders', 'treatment', relationsStore)).toBeNull();
  });
});

describe('resolveM2ARelation — permission fallback', () => {
  // When the user cannot read a target collection, Directus filters the
  // polymorphic relation out of the store, leaving only the parent relation
  // (which still carries junction_field). The field options stay readable.
  const parentOnly = {
    getRelationsForField: vi.fn().mockReturnValue([
      {
        collection: 'orders_treatment',
        field: 'orders_id',
        meta: { one_field: 'treatment', junction_field: 'item', one_collection_field: null },
      },
    ]),
  };

  it('reconstructs the shape from junction_field + field options when the item relation is hidden', () => {
    const fieldsStore = {
      getField: vi.fn().mockReturnValue({
        meta: { options: { allowedCollections: ['partners_catalog', 'service'] } },
      }),
    };
    expect(resolveM2ARelation('orders', 'treatment', parentOnly, fieldsStore)).toEqual({
      itemField: 'item',
      discriminator: 'collection',
      allowedCollections: ['partners_catalog', 'service'],
      junctionCollection: 'orders_treatment',
    });
  });

  it('falls back to empty allowedCollections when no fieldsStore is given', () => {
    expect(resolveM2ARelation('orders', 'treatment', parentOnly)).toEqual({
      itemField: 'item',
      discriminator: 'collection',
      allowedCollections: [],
      junctionCollection: 'orders_treatment',
    });
  });

  it('returns null when neither the item relation nor a junction_field is available', () => {
    const relationsStore = {
      getRelationsForField: vi.fn().mockReturnValue([{ field: 'orders_id', meta: {} }]),
    };
    expect(resolveM2ARelation('orders', 'treatment', relationsStore)).toBeNull();
  });
});
