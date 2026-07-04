import type { SaveViewInput, ViewPresetContext } from '../types/sharedViews.types';

export const SUPER_TABLE_LAYOUT_ID = 'super-layout-table';

export interface ViewPreset {
  collection: string;
  layout: string;
  layout_options: Record<string, any>;
  layout_query: Record<string, any>;
  filter: Record<string, any> | null;
  search: string | null;
  bookmark: string;
  icon: string;
  color: string | null;
}

// Nests layout state under the layout id so the preset round-trips through native bookmarks.
export function buildViewPreset(ctx: ViewPresetContext, input: SaveViewInput): ViewPreset {
  return {
    collection: ctx.collection,
    layout: SUPER_TABLE_LAYOUT_ID,
    layout_options: { [SUPER_TABLE_LAYOUT_ID]: ctx.layoutOptions ?? {} },
    layout_query: { [SUPER_TABLE_LAYOUT_ID]: ctx.layoutQuery ?? {} },
    filter: ctx.filter ?? null,
    search: ctx.search ?? null,
    bookmark: input.name,
    icon: input.icon || 'bookmark',
    color: input.color ?? null,
  };
}
