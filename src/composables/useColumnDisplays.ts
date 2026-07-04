import { computed, type Ref } from 'vue';

export interface ColumnDisplay {
  template: string;
  display?: string;
}

interface LayoutOptionsLike {
  columnDisplays?: Record<string, ColumnDisplay>;
  [key: string]: unknown;
}

/**
 * Issue #48: CRUD wrapper for the per-layout columnDisplays map. Mutating a
 * single entry rewrites the whole map so we trigger reactive watchers cleanly
 * without partial-object surprises.
 */
export function useColumnDisplays(layoutOptions: Ref<LayoutOptionsLike>) {
  const all = computed<Record<string, ColumnDisplay>>(
    () => layoutOptions.value?.columnDisplays ?? {}
  );

  function getOverride(fieldKey: string): ColumnDisplay | null {
    return all.value[fieldKey] ?? null;
  }

  function hasOverride(fieldKey: string): boolean {
    return Object.prototype.hasOwnProperty.call(all.value, fieldKey);
  }

  function setOverride(fieldKey: string, value: ColumnDisplay): void {
    const trimmed = value.template?.trim() ?? '';
    if (trimmed.length === 0) {
      removeOverride(fieldKey);
      return;
    }
    const next = { ...all.value, [fieldKey]: { ...value, template: trimmed } };
    layoutOptions.value = { ...layoutOptions.value, columnDisplays: next };
  }

  function removeOverride(fieldKey: string): void {
    if (!hasOverride(fieldKey)) return;
    const next = { ...all.value };
    delete next[fieldKey];
    layoutOptions.value = { ...layoutOptions.value, columnDisplays: next };
  }

  return { all, getOverride, hasOverride, setOverride, removeOverride };
}
