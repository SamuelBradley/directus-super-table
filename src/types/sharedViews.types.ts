// Shared types for saving the current view as one or more (possibly shared) bookmarks.

export type ViewScope = 'me' | 'all' | 'specific';

// A single share target. 'label' is the display name (for notifications); 'policy' addable later.
export type ShareTarget =
  | { kind: 'role'; id: string; label?: string }
  | { kind: 'user'; id: string; label?: string };

interface BaseViewInput {
  name: string;
  icon?: string;
  color?: string | null;
}

export type SaveViewInput =
  | (BaseViewInput & { scope: 'me' | 'all' })
  | (BaseViewInput & { scope: 'specific'; targets: ShareTarget[] });

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

export interface RoleOption {
  id: string;
  name: string;
}

export interface UserOption {
  id: string;
  name: string;
  email: string | null;
}
