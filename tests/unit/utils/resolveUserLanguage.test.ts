import { describe, it, expect } from 'vitest';
import { resolveUserLanguage } from '@/utils/resolveUserLanguage';

describe('resolveUserLanguage', () => {
  it('returns the language when set', () => {
    expect(resolveUserLanguage({ currentUser: { language: 'de-DE' } })).toBe('de-DE');
  });

  it('returns null when currentUser is null', () => {
    expect(resolveUserLanguage({ currentUser: null })).toBeNull();
  });

  it('returns null for a null or undefined store', () => {
    expect(resolveUserLanguage(null)).toBeNull();
    expect(resolveUserLanguage(undefined)).toBeNull();
  });

  it('returns null in a share/public context (currentUser without a language key)', () => {
    // A share token's currentUser has no `language` property → undefined → null,
    // so callers fall back to the first translation row.
    expect(resolveUserLanguage({ currentUser: {} })).toBeNull();
  });

  it('passes an empty-string language through (caller applies its own fallback)', () => {
    // `?? null` only coalesces null/undefined; '' flows through so a caller's
    // `|| DEFAULT` still kicks in — parity with the pre-extraction behavior.
    expect(resolveUserLanguage({ currentUser: { language: '' } })).toBe('');
  });
});
