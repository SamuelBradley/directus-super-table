import { describe, it, expect } from 'vitest';
import { isRelational, parseTemplateTokens } from '@/utils/displayHeuristics';

describe('isRelational', () => {
  it('returns true when meta.special includes m2o, o2m, m2m, m2a, files, translations', () => {
    expect(isRelational({ meta: { special: ['m2o'] } } as any)).toBe(true);
    expect(isRelational({ meta: { special: ['o2m'] } } as any)).toBe(true);
    expect(isRelational({ meta: { special: ['m2m'] } } as any)).toBe(true);
    expect(isRelational({ meta: { special: ['m2a'] } } as any)).toBe(true);
    expect(isRelational({ meta: { special: ['files'] } } as any)).toBe(true);
    expect(isRelational({ meta: { special: ['translations'] } } as any)).toBe(true);
  });

  it('returns false for plain fields', () => {
    expect(isRelational({ meta: { special: [] } } as any)).toBe(false);
    expect(isRelational({ meta: {} } as any)).toBe(false);
    expect(isRelational({} as any)).toBe(false);
    expect(isRelational(null as any)).toBe(false);
  });
});

describe('parseTemplateTokens', () => {
  it('extracts simple field tokens', () => {
    expect(parseTemplateTokens('{{name}}')).toEqual(['name']);
    expect(parseTemplateTokens('{{first_name}} {{last_name}}')).toEqual([
      'first_name',
      'last_name',
    ]);
  });

  it('handles whitespace inside the braces', () => {
    expect(parseTemplateTokens('{{ name }}')).toEqual(['name']);
    expect(parseTemplateTokens('{{  name  }}')).toEqual(['name']);
  });

  it('extracts nested paths as-is (caller decides what to do with them)', () => {
    expect(parseTemplateTokens('{{author.first_name}}')).toEqual(['author.first_name']);
  });

  it('returns [] for templates with no tokens', () => {
    expect(parseTemplateTokens('plain text')).toEqual([]);
    expect(parseTemplateTokens('')).toEqual([]);
  });

  it('deduplicates repeated tokens', () => {
    expect(parseTemplateTokens('{{name}} - {{name}}')).toEqual(['name']);
  });
});
