import { describe, it, expect } from 'vitest';
import { normalizeIncomingSearch, normalizeOutgoingSearch } from '@/utils/searchSync';

describe('normalizeIncomingSearch', () => {
  it('maps null/undefined to empty string', () => {
    expect(normalizeIncomingSearch(null)).toBe('');
    expect(normalizeIncomingSearch(undefined)).toBe('');
  });
  it('passes a real query through unchanged', () => {
    expect(normalizeIncomingSearch('abc')).toBe('abc');
    expect(normalizeIncomingSearch('')).toBe('');
  });
});

describe('normalizeOutgoingSearch', () => {
  it('collapses empty/whitespace to null', () => {
    expect(normalizeOutgoingSearch('')).toBe(null);
    expect(normalizeOutgoingSearch('   ')).toBe(null);
  });
  it('keeps a real query (untrimmed)', () => {
    expect(normalizeOutgoingSearch('abc')).toBe('abc');
    expect(normalizeOutgoingSearch(' a ')).toBe(' a ');
  });
});
