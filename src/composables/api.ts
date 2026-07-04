import { ref, computed } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import type { Item, Filter } from '@directus/types';
import { filterUsesSome } from '../utils/filterUsesSome';

export interface ApiOptions {
  collection: string;
  fields: string[];
  filter?: Filter;
  search?: string;
  sort?: string[];
  page?: number;
  limit?: number;
  deep?: Record<string, any>;
  alias?: Record<string, string>;
}

export interface ApiResponse {
  data: Item[];
  meta?: {
    filter_count?: number;
    total_count?: number;
  };
}

export function useTableApi() {
  const api = useApi();
  const loading = ref(false);
  const error = ref<Error | null>(null);
  const items = ref<Item[]>([]);
  const totalCount = ref(0);
  const filterCount = ref(0);

  /**
   * Fetch items from the API.
   *
   * Intentionally does NOT request `meta=filter_count,total_count`. The
   * server resolves that meta block via `countDistinct(pk)` which 403s for
   * users without read permission on the primary key — see `fetchItemCount`
   * below for the count, which uses `count(*)` and works regardless.
   */
  async function fetchItems(options: ApiOptions): Promise<ApiResponse> {
    loading.value = true;
    error.value = null;

    try {
      const params: any = {
        fields: options.fields,
        page: options.page || 1,
        limit: options.limit || 100,
      };
      if (options.filter) params.filter = options.filter;
      // The main listing path drives search through `filter` (intelligent _or);
      // this `search` param stays for other callers (e.g. export).
      if (options.search) params.search = options.search;
      if (options.sort && options.sort.length > 0) params.sort = options.sort;
      if (options.deep) params.deep = options.deep;
      if (options.alias) params.alias = options.alias;

      const response = await api.get(`/items/${options.collection}`, { params });

      if (response.data) {
        items.value = response.data.data || [];
        return { data: items.value };
      }

      return { data: [] };
    } catch (err) {
      error.value = err as Error;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Fetch the filter-count for the current query as a separate request.
   *
   * Uses `aggregate[count]=*` (SQL `COUNT(*)`) so it does not require read
   * permission on the primary key — `meta=filter_count` and
   * `aggregate[countDistinct]=<pk>` both 403 when the user lacks PK access.
   * Returns the previous count on failure so a transient aggregate error
   * doesn't reset pagination to zero.
   *
   * Exception: when `primaryKeyField` is provided and the filter contains a
   * `_some` operator (to-many join), `COUNT(*)` counts the join product instead
   * of distinct parent rows — e.g. 1 item with 4 matching translations returns
   * 4.  In that case we attempt `countDistinct(<pk>)` first and fall back to
   * `count(*)` when it 403s (permission-denied on PK).
   */
  async function fetchItemCount(
    collection: string,
    filter?: Filter,
    search?: string,
    primaryKeyField?: string
  ): Promise<number> {
    // Use countDistinct when the filter crosses a to-many boundary (_some) and
    // the caller supplied the PK field name.  Fall back to count(*) on error.
    if (primaryKeyField && filter && filterUsesSome(filter)) {
      try {
        const params: any = { aggregate: { countDistinct: primaryKeyField } };
        if (filter) params.filter = filter;
        if (search) params.search = search;
        const response = await api.get(`/items/${collection}`, { params });
        // Directus returns countDistinct under data[0].countDistinct.<fieldName>.
        // Guard the shape: on an unexpected (but non-throwing) response, fall
        // through to the count(*) path instead of silently reporting 0.
        const raw = response.data?.data?.[0]?.countDistinct?.[primaryKeyField];
        const count = Number(raw);
        if (raw == null || !Number.isFinite(count)) {
          throw new Error('unexpected countDistinct response shape');
        }
        filterCount.value = count;
        totalCount.value = count;
        return count;
      } catch {
        // 403 or other error — fall through to the permissive count(*) path.
      }
    }

    try {
      const params: any = { aggregate: { count: '*' } };
      if (filter) params.filter = filter;
      if (search) params.search = search;
      const response = await api.get(`/items/${collection}`, { params });
      const count = Number(response.data?.data?.[0]?.count ?? 0);
      filterCount.value = count;
      totalCount.value = count;
      return count;
    } catch {
      return filterCount.value;
    }
  }

  /**
   * Update a single item
   */
  async function updateItem(
    collection: string,
    primaryKey: string | number,
    field: string,
    value: any,
    languageCodeField = 'languages_code'
  ): Promise<void> {
    try {
      // Handle translation updates specially
      if (typeof value === 'object' && value?.isTranslation) {
        await updateTranslation(collection, primaryKey, value, languageCodeField);
      } else if (typeof value === 'object' && value?.isFullTranslations) {
        // Handle full translations update from interface-translations
        await api.patch(`/items/${collection}/${primaryKey}`, {
          translations: value.translations,
        });
      } else {
        // Regular field update
        const cleanField = field.includes(':') ? field.split(':')[0] : field;
        await api.patch(`/items/${collection}/${primaryKey}`, {
          [cleanField]: value,
        });
      }
    } catch (err) {
      error.value = err as Error;
      throw err;
    }
  }

  /**
   * Update a translation field
   */
  async function updateTranslation(
    collection: string,
    primaryKey: string | number,
    translationData: any,
    languageCodeField = 'languages_code'
  ): Promise<void> {
    // Get current item with translations
    const currentItem = await api.get(`/items/${collection}/${primaryKey}`, {
      params: {
        fields: ['translations.*'],
      },
    });

    const existingTranslations = currentItem.data?.data?.translations || [];

    // Find or create translation for the language
    const translationIndex = existingTranslations.findIndex(
      (t: any) => t[languageCodeField] === translationData.language
    );

    if (translationIndex >= 0) {
      // Update existing translation
      existingTranslations[translationIndex][translationData.translationField] =
        translationData.value;
    } else {
      // Create new translation
      existingTranslations.push({
        [languageCodeField]: translationData.language,
        [translationData.translationField]: translationData.value,
      });
    }

    // Update the item with modified translations
    await api.patch(`/items/${collection}/${primaryKey}`, {
      translations: existingTranslations,
    });
  }

  /**
   * Delete items
   */
  async function deleteItems(collection: string, primaryKeys: (string | number)[]): Promise<void> {
    try {
      if (primaryKeys.length === 1) {
        await api.delete(`/items/${collection}/${primaryKeys[0]}`);
      } else {
        await api.delete(`/items/${collection}`, {
          data: primaryKeys,
        });
      }
    } catch (err) {
      error.value = err as Error;
      throw err;
    }
  }

  /**
   * Duplicate an item
   */
  async function duplicateItem(
    collection: string,
    primaryKey: string | number,
    primaryKeyField: string = 'id'
  ): Promise<Item> {
    try {
      // Get the original item
      const response = await api.get(`/items/${collection}/${primaryKey}`);
      const originalItem = response.data?.data;

      if (!originalItem) {
        throw new Error('Item not found');
      }

      // Remove primary key and system fields
      const newItem = { ...originalItem };
      delete newItem[primaryKeyField];
      delete newItem.date_created;
      delete newItem.date_updated;
      delete newItem.user_created;
      delete newItem.user_updated;

      // Create the duplicate
      const createResponse = await api.post(`/items/${collection}`, newItem);
      return createResponse.data?.data;
    } catch (err) {
      error.value = err as Error;
      throw err;
    }
  }

  /**
   * Export items
   */
  async function exportItems(
    collection: string,
    format: 'csv' | 'json' | 'xml' | 'yaml',
    options?: ApiOptions
  ): Promise<Blob> {
    try {
      const params: any = {
        export: format,
        ...options,
      };

      const response = await api.get(`/items/${collection}`, {
        params,
        responseType: 'blob',
      });

      return response.data;
    } catch (err) {
      error.value = err as Error;
      throw err;
    }
  }

  /**
   * Save a filter preset
   */
  async function savePreset(preset: any): Promise<any> {
    try {
      const response = await api.post('/presets', preset);
      return response.data?.data;
    } catch (err) {
      error.value = err as Error;
      throw err;
    }
  }

  /**
   * Fetch a single preset/bookmark
   */
  async function fetchPreset(presetId: string | number): Promise<any> {
    try {
      const response = await api.get(`/presets/${presetId}`);
      return response.data?.data;
    } catch (err) {
      error.value = err as Error;
      throw err;
    }
  }

  /**
   * Update an existing preset/bookmark
   */
  async function updatePreset(presetId: string | number, updates: any): Promise<any> {
    try {
      const response = await api.patch(`/presets/${presetId}`, updates);
      return response.data?.data;
    } catch (err) {
      error.value = err as Error;
      throw err;
    }
  }

  /**
   * Fetch available languages
   */
  async function fetchLanguages(): Promise<any[]> {
    try {
      const response = await api.get('/items/languages', {
        params: {
          fields: ['code', 'name'],
          limit: -1,
          sort: ['name'],
        },
      });
      return response.data?.data || [];
    } catch (err) {
      error.value = err as Error;
      throw err;
    }
  }

  /**
   * Fetch file details
   */
  async function fetchFile(fileId: string): Promise<any> {
    try {
      const response = await api.get(`/files/${fileId}`, {
        params: {
          fields: [
            'id',
            'title',
            'filename_download',
            'type',
            'filesize',
            'width',
            'height',
            'created_on',
            'modified_on',
          ],
        },
      });
      return response.data?.data;
    } catch {
      // Try alternative endpoint
      try {
        const response = await api.get(`/items/directus_files/${fileId}`, {
          params: {
            fields: [
              'id',
              'title',
              'filename_download',
              'type',
              'filesize',
              'width',
              'height',
              'created_on',
              'modified_on',
            ],
          },
        });
        return response.data?.data;
      } catch (err2) {
        error.value = err2 as Error;
        throw err2;
      }
    }
  }

  /**
   * Fetch files list
   */
  async function fetchFiles(options: {
    folder?: string | null;
    search?: string;
    limit?: number;
    page?: number;
  }): Promise<{ files: any[]; folders: any[] }> {
    try {
      const params: any = {
        fields: ['id', 'title', 'filename_download', 'type', 'folder', 'modified_on', 'filesize'],
        limit: options.limit || 50,
        page: options.page || 1,
        sort: ['-uploaded_on'],
        filter: {},
      };

      // Set filter for folder - null means root level
      if (options.folder === null || options.folder === undefined) {
        params.filter = { folder: { _null: true } };
      } else {
        params.filter = { folder: { _eq: options.folder } };
      }

      if (options.search) {
        params.search = options.search;
      }

      let filesResponse;
      try {
        filesResponse = await api.get('/files', { params });
      } catch {
        filesResponse = await api.get('/items/directus_files', { params });
      }

      // Also fetch folders for the current level
      const folderParams: any = {
        fields: ['id', 'name', 'parent'],
        limit: -1,
        sort: ['name'],
        filter: {},
      };

      // Set filter for parent folder - null means root level
      if (options.folder === null || options.folder === undefined) {
        folderParams.filter = { parent: { _null: true } };
      } else {
        folderParams.filter = { parent: { _eq: options.folder } };
      }

      let foldersResponse;
      try {
        foldersResponse = await api.get('/folders', { params: folderParams });
      } catch {
        foldersResponse = await api.get('/items/directus_folders', { params: folderParams });
      }

      return {
        files: filesResponse.data?.data || [],
        folders: foldersResponse.data?.data || [],
      };
    } catch (err) {
      error.value = err as Error;
      throw err;
    }
  }

  /**
   * Fetch folder details and breadcrumb
   */
  async function fetchFolder(folderId: string | null): Promise<{ folder: any; breadcrumb: any[] }> {
    try {
      if (!folderId) {
        return { folder: null, breadcrumb: [] };
      }

      let response;
      try {
        response = await api.get(`/folders/${folderId}`);
      } catch {
        response = await api.get(`/items/directus_folders/${folderId}`);
      }

      const folder = response.data?.data;
      const breadcrumb = [];

      if (folder) {
        let current = folder;
        breadcrumb.unshift(current);

        while (current.parent) {
          try {
            const parentResponse = await api.get(`/folders/${current.parent}`);
            current = parentResponse.data?.data;
          } catch {
            const parentResponse = await api.get(`/items/directus_folders/${current.parent}`);
            current = parentResponse.data?.data;
          }
          if (current) {
            breadcrumb.unshift(current);
          } else {
            break;
          }
        }
      }

      return { folder, breadcrumb };
    } catch (err) {
      error.value = err as Error;
      throw err;
    }
  }

  /**
   * Duplicate item with translations (deep copy)
   */
  async function duplicateItemWithTranslations(
    collection: string,
    primaryKey: string | number,
    primaryKeyField: string = 'id',
    includeTranslations: boolean = true
  ): Promise<Item> {
    try {
      // Get the original item with translations
      const params: any = {
        fields: ['*'],
      };

      if (includeTranslations) {
        params.fields.push('translations.*');
      }

      const response = await api.get(`/items/${collection}/${primaryKey}`, { params });
      const originalItem = response.data?.data;

      if (!originalItem) {
        throw new Error('Item not found');
      }

      // Remove primary key and system fields
      const mainItemData = { ...originalItem };
      delete mainItemData[primaryKeyField];
      delete mainItemData.date_created;
      delete mainItemData.date_updated;
      delete mainItemData.user_created;
      delete mainItemData.user_updated;

      // Store translations separately and remove from main item
      const translations = mainItemData.translations;
      delete mainItemData.translations;

      // Create the main item
      const newItemResponse = await api.post(`/items/${collection}`, mainItemData);
      const newItemId = newItemResponse.data?.data?.[primaryKeyField];

      // Duplicate translations if they exist and includeTranslations is true
      if (includeTranslations && translations && translations.length > 0 && newItemId) {
        for (const translation of translations) {
          const translationData = { ...translation };

          // Remove translation ID and set new parent reference
          delete translationData.id;

          // Determine the parent field name
          const parentFieldName = `${collection.replace('content_', '')}_id`;
          translationData[parentFieldName] = newItemId;

          try {
            await api.post(`/items/${collection}_translations`, translationData);
          } catch {
            // Failed to duplicate translation
          }
        }
      }

      return newItemResponse.data?.data;
    } catch (err) {
      error.value = err as Error;
      throw err;
    }
  }

  return {
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    items: computed(() => items.value),
    totalCount: computed(() => totalCount.value),
    filterCount: computed(() => filterCount.value),
    fetchItems,
    fetchItemCount,
    updateItem,
    updateTranslation,
    deleteItems,
    duplicateItem,
    duplicateItemWithTranslations,
    exportItems,
    savePreset,
    fetchPreset,
    updatePreset,
    fetchLanguages,
    fetchFile,
    fetchFiles,
    fetchFolder,
  };
}
