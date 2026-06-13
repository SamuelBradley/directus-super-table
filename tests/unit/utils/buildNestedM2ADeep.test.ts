import { describe, it, expect } from 'vitest';
import { buildNestedM2ADeep, mergeNestedM2ADeep } from '@/utils/buildNestedM2ADeep';
import type { DescribeHop, HopInfo } from '@/utils/resolveRelationalPath';
import { buildM2AFieldPath } from '@/utils/displayHeuristics';

const makeDescribeHop =
  (hopMap: Record<string, Record<string, HopInfo>>): DescribeHop =>
  (collection, field) =>
    hopMap[collection]?.[field] ?? { kind: 'scalar' };

describe('buildNestedM2ADeep', () => {
  it('emits _limit:-1 for a translations hop directly on the target', () => {
    const describeHop = makeDescribeHop({
      service: {
        translations: {
          kind: 'translations',
          relatedCollection: 'service_translations',
          languageField: 'languages_code',
        },
      },
    });
    expect(
      buildNestedM2ADeep(
        ['treatment.item:service.translations.label', 'treatment.item:service.translations.languages_code'],
        describeHop
      )
    ).toEqual({
      treatment: { 'item:service': { translations: { _limit: -1 } } },
    });
  });

  it('nests the entry under intermediate to-one hops (m2o -> translations)', () => {
    const describeHop = makeDescribeHop({
      service: { author: { kind: 'm2o', relatedCollection: 'users' } },
      users: {
        translations: { kind: 'translations', relatedCollection: 'users_translations' },
      },
    });
    expect(
      buildNestedM2ADeep(['treatment.item:service.author.translations.bio'], describeHop)
    ).toEqual({
      treatment: { 'item:service': { author: { translations: { _limit: -1 } } } },
    });
  });

  it('covers o2m/m2m/files hops, not just translations', () => {
    const describeHop = makeDescribeHop({
      service: { attachments: { kind: 'files', relatedCollection: 'directus_files' } },
    });
    expect(
      buildNestedM2ADeep(['treatment.item:service.attachments.id'], describeHop)
    ).toEqual({
      treatment: { 'item:service': { attachments: { _limit: -1 } } },
    });
  });

  it('returns nothing for scalar-only or to-one-only paths', () => {
    const describeHop = makeDescribeHop({
      service: { author: { kind: 'm2o', relatedCollection: 'users' } },
      users: { name: { kind: 'scalar' } },
    });
    expect(
      buildNestedM2ADeep(
        ['treatment.item:service.name', 'treatment.item:service.author.name'],
        describeHop
      )
    ).toEqual({});
  });

  it('merges multiple target collections and multiple M2A fields', () => {
    const describeHop = makeDescribeHop({
      service: { translations: { kind: 'translations', relatedCollection: 'service_translations' } },
      partners: { items: { kind: 'm2m', relatedCollection: 'partner_items' } },
    });
    expect(
      buildNestedM2ADeep(
        [
          'treatment.item:service.translations.label',
          'treatment.item:partners.items.id',
          'blocks.item:service.translations.label',
        ],
        describeHop
      )
    ).toEqual({
      treatment: {
        'item:service': { translations: { _limit: -1 } },
        'item:partners': { items: { _limit: -1 } },
      },
      blocks: { 'item:service': { translations: { _limit: -1 } } },
    });
  });

  it('ignores non-M2A paths (no item: scope) and bare fields', () => {
    const describeHop = makeDescribeHop({});
    expect(
      buildNestedM2ADeep(['code', 'tags.tag_id.name', 'translations.title'], describeHop)
    ).toEqual({});
  });

  it('round-trips paths built by buildM2AFieldPath (drift guard for the emit shape)', () => {
    const describeHop = makeDescribeHop({
      service: {
        translations: { kind: 'translations', relatedCollection: 'service_translations' },
      },
    });
    const emitted = buildM2AFieldPath('treatment', 'item', 'service', 'translations.label');
    expect(buildNestedM2ADeep([emitted], describeHop)).toEqual({
      treatment: { 'item:service': { translations: { _limit: -1 } } },
    });
  });

  it('handles a to-many hop as the LAST segment', () => {
    const describeHop = makeDescribeHop({
      service: {
        translations: { kind: 'translations', relatedCollection: 'service_translations' },
      },
    });
    expect(buildNestedM2ADeep(['treatment.item:service.translations'], describeHop)).toEqual({
      treatment: { 'item:service': { translations: { _limit: -1 } } },
    });
  });

  it('emits limits for MULTIPLE to-many hops along one path', () => {
    const describeHop = makeDescribeHop({
      service: {
        translations: { kind: 'translations', relatedCollection: 'service_translations' },
      },
      service_translations: { tags: { kind: 'o2m', relatedCollection: 'tags' } },
    });
    expect(
      buildNestedM2ADeep(['treatment.item:service.translations.tags.name'], describeHop)
    ).toEqual({
      treatment: {
        'item:service': { translations: { _limit: -1, tags: { _limit: -1 } } },
      },
    });
  });
});

describe('mergeNestedM2ADeep', () => {
  it('adds the M2A default for a field absent from deepFields', () => {
    const deepFields: Record<string, any> = {};
    mergeNestedM2ADeep(deepFields, { treatment: { 'item:service': { translations: { _limit: -1 } } } });
    expect(deepFields).toEqual({
      treatment: { _fields: ['*'], _limit: -1, 'item:service': { translations: { _limit: -1 } } },
    });
  });

  it('preserves an existing field entry and adds the scope keys', () => {
    const deepFields: Record<string, any> = { treatment: { _fields: ['*'], _limit: -1 } };
    mergeNestedM2ADeep(deepFields, { treatment: { 'item:service': { translations: { _limit: -1 } } } });
    expect(deepFields.treatment).toEqual({
      _fields: ['*'],
      _limit: -1,
      'item:service': { translations: { _limit: -1 } },
    });
  });

  it('merges multiple fields and returns the same object', () => {
    const deepFields: Record<string, any> = { tags: { _fields: ['*'] } };
    const out = mergeNestedM2ADeep(deepFields, {
      treatment: { 'item:service': { translations: { _limit: -1 } } },
      blocks: { 'item:content': { items: { _limit: -1 } } },
    });
    expect(out).toBe(deepFields);
    expect(deepFields.tags).toEqual({ _fields: ['*'] });
    expect(deepFields.treatment['item:service']).toEqual({ translations: { _limit: -1 } });
    expect(deepFields.blocks['item:content']).toEqual({ items: { _limit: -1 } });
  });

  it('is a no-op for empty nested input', () => {
    const deepFields: Record<string, any> = { treatment: { _fields: ['*'], _limit: -1 } };
    mergeNestedM2ADeep(deepFields, {});
    expect(deepFields).toEqual({ treatment: { _fields: ['*'], _limit: -1 } });
  });
});
