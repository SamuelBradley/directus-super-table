import { describe, it, expect } from 'vitest';

// Note: adjustFieldsForDisplays uses useStores() at runtime which we mock in
// tests/setup.ts. With those mocks, calling it with no overrides should return
// the original fields unchanged when the store has no field metadata.

describe('adjustFieldsForDisplays', () => {
  it('accepts overrides as an optional third parameter', async () => {
    const { adjustFieldsForDisplays } = await import('@/utils/adjustFieldsForDisplays');
    // Just call with overrides — the signature should accept it
    const result = adjustFieldsForDisplays(['title', 'tags'], 'parent', {});
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns input fields when no overrides and no field metadata', async () => {
    const { adjustFieldsForDisplays } = await import('@/utils/adjustFieldsForDisplays');
    const result = adjustFieldsForDisplays(['title'], 'parent');
    expect(result).toContain('title');
  });
});
