import { describe, it, expect } from 'vitest';
import { filterAccounts, getAccountStatus, hasActiveFilters, createEmptyFilterOptions } from '../../utils/accountFilters';
import type { AccountInfo, AccountMeta } from '../../types';

const mockAccounts: AccountInfo[] = [
  {
    name: 'google-account',
    healthy: true,
    request_count: 100,
    failure_count: 0,
    in_pool: true,
    provider: 'Google',
    auth_method: 'social',
  },
  {
    name: 'github-account',
    healthy: false,
    request_count: 50,
    failure_count: 3,
    in_pool: true,
    provider: 'Github',
    auth_method: 'social',
  },
  {
    name: 'builderid-account',
    healthy: true,
    request_count: 200,
    failure_count: 1,
    in_pool: false,
    provider: 'BuilderId',
    auth_method: 'IdC',
  },
  {
    name: 'internal-account',
    healthy: true,
    request_count: 10,
    failure_count: 0,
    in_pool: true,
    provider: 'Internal',
    auth_method: 'IdC',
  },
];

const mockMetaByName: Record<string, AccountMeta> = {
  'google-account': { groupId: 'group-1', tagIds: ['tag-1', 'tag-2'] },
  'github-account': { groupId: 'group-1', tagIds: ['tag-1'] },
  'builderid-account': { groupId: 'group-2', tagIds: ['tag-2'] },
};

describe('getAccountStatus', () => {
  it('returns healthy for healthy accounts', () => {
    expect(getAccountStatus({ ...mockAccounts[0], healthy: true })).toBe('healthy');
  });

  it('returns unhealthy for unhealthy accounts', () => {
    expect(getAccountStatus({ ...mockAccounts[0], healthy: false })).toBe('unhealthy');
  });
});

describe('filterAccounts', () => {
  it('returns all accounts when no filters applied', () => {
    const result = filterAccounts(mockAccounts, mockMetaByName, {});
    expect(result).toHaveLength(4);
  });

  it('filters by search term (case insensitive)', () => {
    const result = filterAccounts(mockAccounts, mockMetaByName, { search: 'GOOGLE' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('google-account');
  });

  it('filters by search term with partial match', () => {
    const result = filterAccounts(mockAccounts, mockMetaByName, { search: 'account' });
    expect(result).toHaveLength(4);
  });

  it('filters by status (healthy)', () => {
    const result = filterAccounts(mockAccounts, mockMetaByName, { status: ['healthy'] });
    expect(result).toHaveLength(3);
    expect(result.every(a => a.healthy)).toBe(true);
  });

  it('filters by status (unhealthy)', () => {
    const result = filterAccounts(mockAccounts, mockMetaByName, { status: ['unhealthy'] });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('github-account');
  });

  it('filters by multiple statuses', () => {
    const result = filterAccounts(mockAccounts, mockMetaByName, { status: ['healthy', 'unhealthy'] });
    expect(result).toHaveLength(4);
  });

  it('filters by provider', () => {
    const result = filterAccounts(mockAccounts, mockMetaByName, { providers: ['Google'] });
    expect(result).toHaveLength(1);
    expect(result[0].provider).toBe('Google');
  });

  it('filters by multiple providers', () => {
    const result = filterAccounts(mockAccounts, mockMetaByName, { providers: ['Google', 'Github'] });
    expect(result).toHaveLength(2);
  });

  it('filters by auth method', () => {
    const result = filterAccounts(mockAccounts, mockMetaByName, { authMethods: ['IdC'] });
    expect(result).toHaveLength(2);
  });

  it('filters by inPool', () => {
    const result = filterAccounts(mockAccounts, mockMetaByName, { inPool: true });
    expect(result).toHaveLength(3);
    expect(result.every(a => a.in_pool)).toBe(true);
  });

  it('filters by inPool false', () => {
    const result = filterAccounts(mockAccounts, mockMetaByName, { inPool: false });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('builderid-account');
  });

  it('filters by group', () => {
    const result = filterAccounts(mockAccounts, mockMetaByName, { groupIds: ['group-1'] });
    expect(result).toHaveLength(2);
  });

  it('filters by tag (single)', () => {
    const result = filterAccounts(mockAccounts, mockMetaByName, { tagIds: ['tag-1'] });
    expect(result).toHaveLength(2);
  });

  it('filters by tags (multiple - must have all)', () => {
    const result = filterAccounts(mockAccounts, mockMetaByName, { tagIds: ['tag-1', 'tag-2'] });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('google-account');
  });

  it('combines multiple filters', () => {
    const result = filterAccounts(mockAccounts, mockMetaByName, {
      status: ['healthy'],
      providers: ['Google', 'BuilderId'],
      inPool: true,
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('google-account');
  });

  it('returns empty array when no matches', () => {
    const result = filterAccounts(mockAccounts, mockMetaByName, { search: 'nonexistent' });
    expect(result).toHaveLength(0);
  });

  it('handles empty accounts array', () => {
    const result = filterAccounts([], mockMetaByName, { search: 'test' });
    expect(result).toHaveLength(0);
  });

  it('handles empty metaByName', () => {
    const result = filterAccounts(mockAccounts, {}, { groupIds: ['group-1'] });
    expect(result).toHaveLength(0);
  });

  it('handles accounts without meta when filtering by tags', () => {
    const result = filterAccounts(mockAccounts, mockMetaByName, { tagIds: ['tag-1'] });
    // internal-account has no meta, so it should be excluded
    expect(result.find(a => a.name === 'internal-account')).toBeUndefined();
  });
});

describe('hasActiveFilters', () => {
  it('returns false for empty options', () => {
    expect(hasActiveFilters({})).toBe(false);
  });

  it('returns true when search is set', () => {
    expect(hasActiveFilters({ search: 'test' })).toBe(true);
  });

  it('returns false for whitespace-only search', () => {
    expect(hasActiveFilters({ search: '   ' })).toBe(false);
  });

  it('returns true when status is set', () => {
    expect(hasActiveFilters({ status: ['healthy'] })).toBe(true);
  });

  it('returns false for empty status array', () => {
    expect(hasActiveFilters({ status: [] })).toBe(false);
  });

  it('returns true when providers is set', () => {
    expect(hasActiveFilters({ providers: ['Google'] })).toBe(true);
  });

  it('returns true when inPool is set', () => {
    expect(hasActiveFilters({ inPool: true })).toBe(true);
    expect(hasActiveFilters({ inPool: false })).toBe(true);
  });

  it('returns true when groupIds is set', () => {
    expect(hasActiveFilters({ groupIds: ['group-1'] })).toBe(true);
  });

  it('returns true when tagIds is set', () => {
    expect(hasActiveFilters({ tagIds: ['tag-1'] })).toBe(true);
  });
});

describe('createEmptyFilterOptions', () => {
  it('returns empty object', () => {
    const result = createEmptyFilterOptions();
    expect(result).toEqual({});
  });
});
