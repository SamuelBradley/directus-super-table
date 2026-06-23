// Shared types for the "save current view as a (possibly shared) bookmark" feature.

export type ViewScope = 'me' | 'role' | 'all';

export interface SaveViewInput {
  name: string;
  icon?: string;
  color?: string | null;
  scope: ViewScope;
}

export interface ViewPresetContext {
  collection: string;
  layoutOptions: Record<string, any> | undefined;
  layoutQuery: Record<string, any> | undefined;
  filter: Record<string, any> | null | undefined;
  search: string | null | undefined;
}

export interface ScopeAvailabilityInput {
  canSave: boolean;
  canShare: boolean;
  myRoleId: string | null;
  isShareUser: boolean;
}
