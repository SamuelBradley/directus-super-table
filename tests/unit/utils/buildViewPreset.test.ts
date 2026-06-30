import { describe, it, expect } from 'vitest';
import { buildViewPreset, SUPER_TABLE_LAYOUT_ID } from '../../../src/utils/buildViewPreset';
import type { ViewPresetContext } from '../../../src/types/sharedViews.types';

const baseContext: ViewPresetContext = {
  collection: 'orders',
  layoutOptions: { widths: { code: 120 }, editMode: true },
  layoutQuery: { fields: ['code', 'status'], sort: ['-code'], limit: 25 },
  filter: { status: { _eq: 'open' } },
  search: 'abc',
};

describe('buildViewPreset', () => {
  it('nests layout_options and layout_query under the super-layout-table layout id', () => {
    const result = buildViewPreset(baseContext, { name: 'My view', scope: 'me' });
    expect(SUPER_TABLE_LAYOUT_ID).toBe('super-layout-table');
    expect(result.layout).toBe('super-layout-table');
    expect(result.layout_options).toEqual({
      'super-layout-table': { widths: { code: 120 }, editMode: true },
    });
    expect(result.layout_query).toEqual({
      'super-layout-table': { fields: ['code', 'status'], sort: ['-code'], limit: 25 },
    });
  });

  it('copies collection, filter, search and bookmark name', () => {
    const result = buildViewPreset(baseContext, { name: 'My view', scope: 'me' });
    expect(result.collection).toBe('orders');
    expect(result.filter).toEqual({ status: { _eq: 'open' } });
    expect(result.search).toBe('abc');
    expect(result.bookmark).toBe('My view');
  });

  it('defaults icon to "bookmark" and color to null', () => {
    const result = buildViewPreset(baseContext, { name: 'X', scope: 'all' });
    expect(result.icon).toBe('bookmark');
    expect(result.color).toBeNull();
  });

  it('uses provided icon and color', () => {
    const result = buildViewPreset(baseContext, {
      name: 'X',
      icon: 'star',
      color: 'primary',
      scope: 'me',
    });
    expect(result.icon).toBe('star');
    expect(result.color).toBe('primary');
  });

  it('coerces missing layoutOptions/layoutQuery/filter/search to safe defaults', () => {
    const result = buildViewPreset(
      {
        collection: 'pages',
        layoutOptions: undefined,
        layoutQuery: undefined,
        filter: undefined,
        search: undefined,
      },
      { name: 'Empty', scope: 'me' }
    );
    expect(result.layout_options).toEqual({ 'super-layout-table': {} });
    expect(result.layout_query).toEqual({ 'super-layout-table': {} });
    expect(result.filter).toBeNull();
    expect(result.search).toBeNull();
  });
});
