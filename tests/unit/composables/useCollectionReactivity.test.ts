/**
 * Issue #55 (comment by draxx318): The layout must pass a reactive Ref to
 * `useCollection` so the SDK can update `fieldsInCollection` when the
 * collection prop changes. Passing `collection.value` extracts a static
 * string, breaking reactivity and causing 403s on collection-switch (a
 * second collection's request includes the first collection's field list).
 *
 * Directus core itself accepts `string | Ref<string | null>` in
 * useCollection — passing the Ref is the canonical pattern.
 *
 * We use source-text assertions here instead of a component mount because
 * super-table.vue has a large dependency surface; the bug is fundamentally
 * a single-character regression and a source-level guard is sufficient
 * (and immune to vacuous-pass risk from setup() never running).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..', '..', '..');

describe('useCollection reactivity contract (issue #55 comment)', () => {
  it('src/super-table.vue does NOT pass collection.value to useCollection', () => {
    const src = readFileSync(resolve(root, 'src/super-table.vue'), 'utf-8');
    expect(src).not.toMatch(/useCollection\s*\(\s*collection\.value\s*\)/);
  });

  it('src/super-table.vue passes the reactive collection ref to useCollection', () => {
    const src = readFileSync(resolve(root, 'src/super-table.vue'), 'utf-8');
    // Accept either `useCollection(collection)` (ref) or
    // `useCollection(<some-ref-expression>)` but not the buggy `.value` form.
    // Easiest positive assertion: useCollection( collection ) without `.value`.
    expect(src).toMatch(/useCollection\s*\(\s*collection\s*\)/);
  });

  it('index.ts does NOT pass props.collection (raw string) to useCollection', () => {
    const src = readFileSync(resolve(root, 'index.ts'), 'utf-8');
    // The setup-time call in index.ts was always unused (the return value
    // is discarded). After Task 6 it is either removed entirely, or rewritten
    // to take a ref. Either way, the buggy raw-string form must not be there.
    expect(src).not.toMatch(/useCollection\s*\(\s*props\.collection\s*\)/);
  });
});
