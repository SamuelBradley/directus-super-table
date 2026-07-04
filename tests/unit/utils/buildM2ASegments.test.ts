import { describe, it, expect } from 'vitest';
import { buildM2ASegments, isBlockedSegment } from '@/utils/buildM2ASegments';

const itemField = 'item';
const discriminator = 'collection';
const fieldName = 'treatment';
const allow = () => true;
const deny = () => false;

describe('buildM2ASegments', () => {
  it('returns [] for non-array / empty input', () => {
    expect(buildM2ASegments(null, '{{collection}}', itemField, discriminator, fieldName, null, allow)).toEqual([]);
    expect(buildM2ASegments(undefined, '{{collection}}', itemField, discriminator, fieldName, null, allow)).toEqual([]);
    expect(buildM2ASegments('x', '{{collection}}', itemField, discriminator, fieldName, null, allow)).toEqual([]);
    expect(buildM2ASegments([], '{{collection}}', itemField, discriminator, fieldName, null, allow)).toEqual([]);
  });

  it('skips non-object rows', () => {
    const rows = [null, 'x', 5, { collection: 'service', item: { name: 'A' } }];
    expect(
      buildM2ASegments(rows, '{{item:service.name}}', itemField, discriminator, fieldName, null, allow)
    ).toEqual([{ text: 'A' }]);
  });

  // The guard's reason for being: distinguish "not fetched" from "absent".
  it('renders a discriminator-only template when item was not fetched (undefined)', () => {
    const rows = [{ collection: 'service' }, { collection: 'partners_catalog' }];
    expect(
      buildM2ASegments(rows, '{{collection}}', itemField, discriminator, fieldName, null, allow)
    ).toEqual([{ text: 'service' }, { text: 'partners_catalog' }]);
  });

  it('shows a block segment when item is null AND the collection is unreadable', () => {
    const rows = [{ collection: 'service', item: null }];
    const segs = buildM2ASegments(
      rows,
      '{{item:service.name}}',
      itemField,
      discriminator,
      fieldName,
      null,
      (c) => c !== 'service'
    );
    expect(segs).toEqual([{ blocked: true, collection: 'service' }]);
    expect(isBlockedSegment(segs[0]!)).toBe(true);
  });

  it('skips a row when item is null but the collection IS readable (dangling FK)', () => {
    const rows = [{ collection: 'service', item: null }];
    expect(
      buildM2ASegments(rows, '{{item:service.name}}', itemField, discriminator, fieldName, null, allow)
    ).toEqual([]);
  });

  it('renders item values when the item is present', () => {
    const rows = [{ collection: 'service', item: { name: 'Installation' } }];
    expect(
      buildM2ASegments(rows, '{{item:service.name}}', itemField, discriminator, fieldName, null, allow)
    ).toEqual([{ text: 'Installation' }]);
  });

  it('threads the parent row into bare tokens', () => {
    const rows = [{ collection: 'service', item: { name: 'Installation' } }];
    expect(
      buildM2ASegments(
        rows,
        '{{collection}}: {{code}}',
        itemField,
        discriminator,
        fieldName,
        { code: 'V-2600' },
        allow
      )
    ).toEqual([{ text: 'service: V-2600' }]);
  });

  it('drops rows whose template renders empty', () => {
    const rows = [{ collection: 'service', item: {} }];
    expect(
      buildM2ASegments(rows, '{{item:service.name}}', itemField, discriminator, fieldName, null, allow)
    ).toEqual([]);
  });

  it('mixes readable text and blocked segments across rows', () => {
    const rows = [
      { collection: 'partners_catalog', item: { name: 'Partner Alpha' } },
      { collection: 'service', item: null },
    ];
    const segs = buildM2ASegments(
      rows,
      '{{item:partners_catalog.name}}{{item:service.name}}',
      itemField,
      discriminator,
      fieldName,
      null,
      (c) => c !== 'service'
    );
    expect(segs).toEqual([{ text: 'Partner Alpha' }, { blocked: true, collection: 'service' }]);
  });

  it('never blocks on a readable target even with no permission helper hits', () => {
    const rows = [{ collection: 'service', item: { name: 'X' } }];
    expect(
      buildM2ASegments(rows, '{{collection}}', itemField, discriminator, fieldName, null, deny)
    ).toEqual([{ text: 'service' }]);
  });
});
