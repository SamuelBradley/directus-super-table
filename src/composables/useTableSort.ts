import { computed, Ref } from 'vue';
import type { LayoutQuery } from '../types/table.types';
import { filterValidSort } from '../utils/fieldValidity';

// Define Sort interface locally since it's not exported from @directus/types
interface Sort {
  by: string;
  desc: boolean;
}

interface FieldsStoreLike {
  getField: (collection: string | null, field: string) => unknown;
}

export function useTableSort(
  layoutQuery: Ref<LayoutQuery>,
  collection?: Ref<string | null>,
  fieldsStore?: FieldsStoreLike
) {
  // Helper function to clean language suffixes from sort field
  function cleanSortItem(sortItem: string): string {
    if (sortItem.includes(':')) {
      // Remove language suffix but keep the desc prefix if present
      if (sortItem.startsWith('-')) {
        const field = sortItem.substring(1).split(':')[0];
        return `-${field}`;
      } else {
        return sortItem.split(':')[0];
      }
    }
    return sortItem;
  }

  // Issue #47: drop sort entries pointing at deleted fields so the API
  // doesn't reject the whole query with HTTP 403.
  function dropStaleSortEntries(entries: string[]): string[] {
    if (!collection || !fieldsStore) return entries;
    return filterValidSort(entries, collection.value, fieldsStore);
  }

  // Clean up language suffixes from sort fields
  const sort = computed({
    get() {
      const rawSort = layoutQuery.value?.sort || [];
      const cleaned = rawSort.map(cleanSortItem);
      return dropStaleSortEntries(cleaned);
    },
    set(newSort: string[]) {
      // Clean sort values before saving
      const cleanedSort = newSort.map(cleanSortItem);

      layoutQuery.value = {
        ...layoutQuery.value,
        sort: cleanedSort,
      };
    },
  });

  // Table sort for v-table
  const tableSort = computed(() => {
    if (!sort.value?.[0]) return null;

    let sortField = sort.value[0];
    let desc = false;

    // Check for descending sort
    if (sortField.startsWith('-')) {
      desc = true;
      sortField = sortField.substring(1);
    }

    // Keep the original field with suffix for display
    // The actual sorting will be handled by the sort computed property
    return { by: sortField, desc };
  });

  function onSortChange(newSort: Sort | null) {
    if (!newSort?.by) {
      // Clear sort
      layoutQuery.value = {
        ...layoutQuery.value,
        sort: [],
      };
      return;
    }

    // Remove language suffix from sort field if present
    // e.g., "translations.description:de-DE" -> "translations.description"
    let sortField = newSort.by;
    if (sortField.includes(':')) {
      sortField = sortField.split(':')[0];
    }

    const sortString = newSort.desc ? `-${sortField}` : sortField;

    // Update layoutQuery directly to ensure reactivity
    layoutQuery.value = {
      ...layoutQuery.value,
      sort: [sortString],
    };
  }

  return {
    sort,
    tableSort,
    onSortChange,
  };
}
