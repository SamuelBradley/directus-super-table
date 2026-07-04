/**
 * Resolve the current user's language from the user store. Used as the default
 * language for nested translations when a template token carries no `:lang`
 * suffix. Pure over a minimal store shape so it stays unit-testable and the
 * call sites drop their `as any` cast. Returns null when no language is set
 * (e.g. share/public context) so callers fall back to the first translation row.
 */
export interface UserLike {
  language?: string | null;
}

export interface UserStoreLike {
  currentUser?: UserLike | null;
}

export function resolveUserLanguage(userStore: UserStoreLike | null | undefined): string | null {
  return userStore?.currentUser?.language ?? null;
}
