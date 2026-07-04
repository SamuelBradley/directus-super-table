import { describe, it, expect } from 'vitest';
import { buildShareTargets } from '../../../src/utils/buildShareTargets';
import type { RoleOption, UserOption } from '../../../src/types/sharedViews.types';

const roles: RoleOption[] = [
  { id: 'rA', name: 'Role A' },
  { id: 'rB', name: 'Role B' },
];
const users: UserOption[] = [
  { id: 'uX', name: 'User X', email: 'x@x.io', role: 'rA' },
  { id: 'uY', name: 'User Y', email: 'y@x.io', role: 'rB' },
  { id: 'uZ', name: 'User Z', email: 'z@x.io', role: null },
];

describe('buildShareTargets', () => {
  it('builds role targets with labels', () => {
    expect(buildShareTargets(['rA'], [], roles, users)).toEqual([
      { kind: 'role', id: 'rA', label: 'Role A' },
    ]);
  });

  it('builds an un-covered user target with a label', () => {
    expect(buildShareTargets([], ['uX'], roles, users)).toEqual([
      { kind: 'user', id: 'uX', label: 'User X' },
    ]);
  });

  it('skips a user already covered by a selected role (no double bookmark)', () => {
    expect(buildShareTargets(['rA'], ['uX'], roles, users)).toEqual([
      { kind: 'role', id: 'rA', label: 'Role A' },
    ]);
  });

  it('keeps a user whose role is NOT among the selected roles', () => {
    expect(buildShareTargets(['rA'], ['uY'], roles, users)).toEqual([
      { kind: 'role', id: 'rA', label: 'Role A' },
      { kind: 'user', id: 'uY', label: 'User Y' },
    ]);
  });

  it('keeps a user that has no role', () => {
    expect(buildShareTargets(['rA'], ['uZ'], roles, users)).toEqual([
      { kind: 'role', id: 'rA', label: 'Role A' },
      { kind: 'user', id: 'uZ', label: 'User Z' },
    ]);
  });
});
