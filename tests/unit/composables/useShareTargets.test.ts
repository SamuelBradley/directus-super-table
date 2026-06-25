import { describe, it, expect, vi, beforeEach } from 'vitest';

const get = vi.fn();
vi.mock('@directus/extensions-sdk', () => ({ useApi: () => ({ get }) }));

import { useShareTargets } from '../../../src/composables/useShareTargets';

beforeEach(() => {
  get.mockReset();
});

describe('useShareTargets.load', () => {
  it('loads roles and users as raw domain objects', async () => {
    get.mockImplementation((url: string) =>
      url === '/roles'
        ? Promise.resolve({ data: { data: [{ id: 'r1', name: 'Editor' }] } })
        : Promise.resolve({
            data: { data: [{ id: 'u1', first_name: 'Anna', last_name: 'M', email: 'a@x.io' }] },
          })
    );
    const { roles, users, load, isLoading, error } = useShareTargets();
    await load();
    expect(roles.value).toEqual([{ id: 'r1', name: 'Editor' }]);
    expect(users.value).toEqual([{ id: 'u1', name: 'Anna M', email: 'a@x.io' }]);
    expect(isLoading.value).toBe(false);
    expect(error.value).toBeNull();
  });

  it('a denied (403) fetch yields empty lists and sets error, never throws', async () => {
    get.mockRejectedValue({ response: { status: 403 } });
    const { roles, users, load, error } = useShareTargets();
    await load();
    expect(roles.value).toEqual([]);
    expect(users.value).toEqual([]);
    expect(error.value).not.toBeNull();
  });

  it('falls back to email/id when a user has no name parts', async () => {
    get.mockImplementation((url: string) =>
      url === '/roles'
        ? Promise.resolve({ data: { data: [] } })
        : Promise.resolve({ data: { data: [{ id: 'u2', email: 'b@x.io' }] } })
    );
    const { users, load } = useShareTargets();
    await load();
    expect(users.value).toEqual([{ id: 'u2', name: 'b@x.io', email: 'b@x.io' }]);
  });
});
