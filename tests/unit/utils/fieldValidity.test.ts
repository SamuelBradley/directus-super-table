import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isFieldValid,
  isSortFieldValid,
  filterValidFields,
  filterValidSort,
  filterValidColumnDisplays,
} from '@/utils/fieldValidity';

const COLLECTION = 'issue_47_test';
const KNOWN_FIELDS = new Set(['id', 'title', 'status', 'price', 'translations', 'tags']);

function makeFieldsStore() {
  return {
    getField: vi.fn((collection: string | null, field: string) => {
      if (collection !== COLLECTION) return null;
      return KNOWN_FIELDS.has(field) ? { collection, field } : null;
    }),
  };
}

describe('isFieldValid', () => {
  let fieldsStore: ReturnType<typeof makeFieldsStore>;

  beforeEach(() => {
    fieldsStore = makeFieldsStore();
  });

  it('returns true for an existing plain field', () => {
    expect(isFieldValid('title', COLLECTION, fieldsStore)).toBe(true);
  });

  it('returns false for a deleted plain field', () => {
    expect(isFieldValid('obsolete_notes', COLLECTION, fieldsStore)).toBe(false);
  });

  it('accepts dotted relations as long as the root field exists', () => {
    expect(isFieldValid('tags.name', COLLECTION, fieldsStore)).toBe(true);
    expect(isFieldValid('translations.description', COLLECTION, fieldsStore)).toBe(true);
  });

  it('rejects dotted relations whose root field is gone', () => {
    expect(isFieldValid('ghosts.label', COLLECTION, fieldsStore)).toBe(false);
  });

  it('strips language suffix before validating root', () => {
    expect(isFieldValid('translations.description:de-DE', COLLECTION, fieldsStore)).toBe(true);
    expect(isFieldValid('ghosts.label:en-US', COLLECTION, fieldsStore)).toBe(false);
  });

  it.each([null, undefined, '', 0 as unknown as string, {} as unknown as string])(
    'rejects non-string / empty input %p',
    (input) => {
      expect(isFieldValid(input as string | null | undefined, COLLECTION, fieldsStore)).toBe(false);
    }
  );

  it('rejects when collection is null/empty', () => {
    expect(isFieldValid('title', null, fieldsStore)).toBe(false);
    expect(isFieldValid('title', '', fieldsStore)).toBe(false);
  });

  it('rejects degenerate keys like ":" or "."', () => {
    expect(isFieldValid(':', COLLECTION, fieldsStore)).toBe(false);
    expect(isFieldValid('.', COLLECTION, fieldsStore)).toBe(false);
    expect(isFieldValid(':de-DE', COLLECTION, fieldsStore)).toBe(false);
  });

  it('does not consult fieldsStore for invalid input (short-circuit)', () => {
    isFieldValid('', COLLECTION, fieldsStore);
    isFieldValid(null, COLLECTION, fieldsStore);
    isFieldValid('title', null, fieldsStore);
    expect(fieldsStore.getField).not.toHaveBeenCalled();
  });
});

describe('isSortFieldValid', () => {
  let fieldsStore: ReturnType<typeof makeFieldsStore>;

  beforeEach(() => {
    fieldsStore = makeFieldsStore();
  });

  it('accepts a sort entry with leading "-" (descending)', () => {
    expect(isSortFieldValid('-title', COLLECTION, fieldsStore)).toBe(true);
  });

  it('rejects desc-prefixed entries pointing at deleted fields', () => {
    expect(isSortFieldValid('-obsolete_notes', COLLECTION, fieldsStore)).toBe(false);
  });

  it('handles desc + language suffix together', () => {
    expect(isSortFieldValid('-translations.description:de-DE', COLLECTION, fieldsStore)).toBe(true);
    expect(isSortFieldValid('-ghosts.label:de-DE', COLLECTION, fieldsStore)).toBe(false);
  });

  it('rejects null/empty input', () => {
    expect(isSortFieldValid(null, COLLECTION, fieldsStore)).toBe(false);
    expect(isSortFieldValid('', COLLECTION, fieldsStore)).toBe(false);
  });
});

describe('filterValidFields', () => {
  let fieldsStore: ReturnType<typeof makeFieldsStore>;

  beforeEach(() => {
    fieldsStore = makeFieldsStore();
  });

  it('returns only the still-existing fields, in original order', () => {
    const input = ['title', 'obsolete_notes', 'price', 'ghosts.label', 'translations.description'];
    expect(filterValidFields(input, COLLECTION, fieldsStore)).toEqual([
      'title',
      'price',
      'translations.description',
    ]);
  });

  it('returns [] when every entry is invalid (caller falls back to default)', () => {
    expect(filterValidFields(['ghost_a', 'ghost_b'], COLLECTION, fieldsStore)).toEqual([]);
  });

  it('returns [] for null/undefined/empty input', () => {
    expect(filterValidFields(null, COLLECTION, fieldsStore)).toEqual([]);
    expect(filterValidFields(undefined, COLLECTION, fieldsStore)).toEqual([]);
    expect(filterValidFields([], COLLECTION, fieldsStore)).toEqual([]);
  });
});

describe('filterValidSort', () => {
  let fieldsStore: ReturnType<typeof makeFieldsStore>;

  beforeEach(() => {
    fieldsStore = makeFieldsStore();
  });

  it('keeps valid sort entries with desc prefix and drops stale ones', () => {
    const input = ['-title', 'obsolete_notes', '-ghosts.label', 'price'];
    expect(filterValidSort(input, COLLECTION, fieldsStore)).toEqual(['-title', 'price']);
  });

  it('returns [] when every entry references a deleted field', () => {
    expect(filterValidSort(['ghost_a', '-ghost_b'], COLLECTION, fieldsStore)).toEqual([]);
  });
});

describe('filterValidColumnDisplays', () => {
  let fieldsStore: ReturnType<typeof makeFieldsStore>;

  beforeEach(() => {
    fieldsStore = makeFieldsStore();
  });

  it('keeps entries whose root field still exists', () => {
    const input = {
      title: { template: '{{title}}' },
      tags: { template: '{{name}}' },
    };
    expect(filterValidColumnDisplays(input, COLLECTION, fieldsStore)).toEqual({
      title: { template: '{{title}}' },
      tags: { template: '{{name}}' },
    });
  });

  it('drops entries whose root field has been deleted', () => {
    const input = {
      title: { template: '{{title}}' },
      ghost: { template: '{{name}}' },
    };
    expect(filterValidColumnDisplays(input, COLLECTION, fieldsStore)).toEqual({
      title: { template: '{{title}}' },
    });
  });

  it('keeps translation root entries (translations.title, no language suffix)', () => {
    const input = {
      'translations.title': { template: '📌 {{title}}' },
    };
    expect(filterValidColumnDisplays(input, COLLECTION, fieldsStore)).toEqual({
      'translations.title': { template: '📌 {{title}}' },
    });
  });

  it('returns {} for null/undefined/empty input', () => {
    expect(filterValidColumnDisplays(null, COLLECTION, fieldsStore)).toEqual({});
    expect(filterValidColumnDisplays(undefined, COLLECTION, fieldsStore)).toEqual({});
    expect(filterValidColumnDisplays({}, COLLECTION, fieldsStore)).toEqual({});
  });

  it('returns {} when collection is null', () => {
    const input = { title: { template: '{{title}}' } };
    expect(filterValidColumnDisplays(input, null, fieldsStore)).toEqual({});
  });
});
