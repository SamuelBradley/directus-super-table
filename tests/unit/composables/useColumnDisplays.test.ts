import { describe, it, expect, beforeEach } from 'vitest';
import { ref } from 'vue';
import { useColumnDisplays } from '@/composables/useColumnDisplays';

describe('useColumnDisplays', () => {
  function makeLayoutOptions(initial: Record<string, any> = {}) {
    return ref({ ...initial });
  }

  it('exposes existing entries via getOverride / hasOverride', () => {
    const opts = makeLayoutOptions({
      columnDisplays: {
        author: { template: '{{first_name}}' },
      },
    });
    const cd = useColumnDisplays(opts as any);
    expect(cd.hasOverride('author')).toBe(true);
    expect(cd.getOverride('author')).toEqual({ template: '{{first_name}}' });
    expect(cd.hasOverride('title')).toBe(false);
    expect(cd.getOverride('title')).toBe(null);
  });

  it('returns empty map when columnDisplays is undefined', () => {
    const opts = makeLayoutOptions();
    const cd = useColumnDisplays(opts as any);
    expect(cd.all.value).toEqual({});
  });

  it('setOverride writes a new entry into layoutOptions', () => {
    const opts = makeLayoutOptions();
    const cd = useColumnDisplays(opts as any);
    cd.setOverride('tags', { template: '{{name}}' });
    expect(opts.value.columnDisplays).toEqual({ tags: { template: '{{name}}' } });
  });

  it('setOverride replaces an existing entry', () => {
    const opts = makeLayoutOptions({
      columnDisplays: { author: { template: '{{first_name}}' } },
    });
    const cd = useColumnDisplays(opts as any);
    cd.setOverride('author', { template: '{{first_name}} {{last_name}}' });
    expect(opts.value.columnDisplays.author).toEqual({
      template: '{{first_name}} {{last_name}}',
    });
  });

  it('removeOverride deletes an entry', () => {
    const opts = makeLayoutOptions({
      columnDisplays: {
        author: { template: '{{first_name}}' },
        tags: { template: '{{name}}' },
      },
    });
    const cd = useColumnDisplays(opts as any);
    cd.removeOverride('author');
    expect(opts.value.columnDisplays).toEqual({ tags: { template: '{{name}}' } });
  });

  it('setOverride with empty/whitespace template removes the entry', () => {
    const opts = makeLayoutOptions({
      columnDisplays: { author: { template: '{{x}}' } },
    });
    const cd = useColumnDisplays(opts as any);
    cd.setOverride('author', { template: '   ' });
    expect(opts.value.columnDisplays).toEqual({});
  });

  it('all is reactive — updates when layoutOptions changes externally', () => {
    const opts = makeLayoutOptions();
    const cd = useColumnDisplays(opts as any);
    expect(cd.all.value).toEqual({});
    opts.value = {
      columnDisplays: { tags: { template: '{{name}}' } },
    };
    expect(cd.all.value).toEqual({ tags: { template: '{{name}}' } });
  });
});
