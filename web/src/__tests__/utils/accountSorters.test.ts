import { describe, it, expect } from 'vitest';
import { sortAccounts, createDefaultSortOptions } from '../../utils/accountSorters';
import type { AccountInfo } from '../../types';

const mockAccounts: AccountInfo[] = [
  {
    name: 'charlie',
    healthy: true,
    request_count: 100,
    failure_count: 0,
    in_pool: true,
    provider: 'Google',
    auth_method: 'social',
  },
  {
    name: 'alice',
    healthy: false,
    request_count: 50,
    failure_count: 3,
    in_pool: true,
    provider: 'Github',
    auth_method: 'social',
  },
  {
    name: 'bob',
    healthy: true,
    request_count: 200,
    failure_count: 1,
    in_pool: false,
    provider: 'BuilderId',
    auth_method: 'IdC',
  },
];

describe('sortAccounts', () => {
  describe('by name', () => {
    it('sorts ascending', () => {
      const result = sortAccounts(mockAccounts, { field: 'name', order: 'asc' });
      expect(result.map(a => a.name)).toEqual(['alice', 'bob', 'charlie']);
    });

    it('sorts descending', () => {
      const result = sortAccounts(mockAccounts, { field: 'name', order: 'desc' });
      expect(result.map(a => a.name)).toEqual(['charlie', 'bob', 'alice']);
    });

    it('is case insensitive', () => {
      const accounts: AccountInfo[] = [
        { ...mockAccounts[0], name: 'Alice' },
        { ...mockAccounts[1], name: 'bob' },
        { ...mockAccounts[2], name: 'CHARLIE' },
      ];
      const result = sortAccounts(accounts, { field: 'name', order: 'asc' });
      expect(result.map(a => a.name)).toEqual(['Alice', 'bob', 'CHARLIE']);
    });
  });

  describe('by request_count', () => {
    it('sorts ascending', () => {
      const result = sortAccounts(mockAccounts, { field: 'request_count', order: 'asc' });
      expect(result.map(a => a.request_count)).toEqual([50, 100, 200]);
    });

    it('sorts descending', () => {
      const result = sortAccounts(mockAccounts, { field: 'request_count', order: 'desc' });
      expect(result.map(a => a.request_count)).toEqual([200, 100, 50]);
    });
  });

  describe('by failure_count', () => {
    it('sorts ascending', () => {
      const result = sortAccounts(mockAccounts, { field: 'failure_count', order: 'asc' });
      expect(result.map(a => a.failure_count)).toEqual([0, 1, 3]);
    });

    it('sorts descending', () => {
      const result = sortAccounts(mockAccounts, { field: 'failure_count', order: 'desc' });
      expect(result.map(a => a.failure_count)).toEqual([3, 1, 0]);
    });
  });

  describe('by provider', () => {
    it('sorts ascending', () => {
      const result = sortAccounts(mockAccounts, { field: 'provider', order: 'asc' });
      expect(result.map(a => a.provider)).toEqual(['BuilderId', 'Github', 'Google']);
    });

    it('sorts descending', () => {
      const result = sortAccounts(mockAccounts, { field: 'provider', order: 'desc' });
      expect(result.map(a => a.provider)).toEqual(['Google', 'Github', 'BuilderId']);
    });

    it('handles undefined providers', () => {
      const accounts: AccountInfo[] = [
        { ...mockAccounts[0], provider: undefined },
        { ...mockAccounts[1], provider: 'Github' },
        { ...mockAccounts[2], provider: 'BuilderId' },
      ];
      const result = sortAccounts(accounts, { field: 'provider', order: 'asc' });
      // Empty string sorts first
      expect(result[0].provider).toBeUndefined();
    });
  });

  describe('by status', () => {
    it('sorts ascending (healthy first)', () => {
      const result = sortAccounts(mockAccounts, { field: 'status', order: 'asc' });
      // healthy accounts should come first
      expect(result[0].healthy).toBe(true);
      expect(result[1].healthy).toBe(true);
      expect(result[2].healthy).toBe(false);
    });

    it('sorts descending (unhealthy first)', () => {
      const result = sortAccounts(mockAccounts, { field: 'status', order: 'desc' });
      // unhealthy accounts should come first
      expect(result[0].healthy).toBe(false);
    });
  });

  describe('stability', () => {
    it('maintains original order for equal values', () => {
      const accounts: AccountInfo[] = [
        { ...mockAccounts[0], name: 'first', request_count: 100 },
        { ...mockAccounts[1], name: 'second', request_count: 100 },
        { ...mockAccounts[2], name: 'third', request_count: 100 },
      ];
      const result = sortAccounts(accounts, { field: 'request_count', order: 'asc' });
      expect(result.map(a => a.name)).toEqual(['first', 'second', 'third']);
    });
  });

  describe('edge cases', () => {
    it('handles empty array', () => {
      const result = sortAccounts([], { field: 'name', order: 'asc' });
      expect(result).toEqual([]);
    });

    it('handles single element', () => {
      const result = sortAccounts([mockAccounts[0]], { field: 'name', order: 'asc' });
      expect(result).toHaveLength(1);
    });

    it('does not mutate original array', () => {
      const original = [...mockAccounts];
      sortAccounts(mockAccounts, { field: 'name', order: 'asc' });
      expect(mockAccounts).toEqual(original);
    });
  });
});

describe('createDefaultSortOptions', () => {
  it('returns default sort options', () => {
    const result = createDefaultSortOptions();
    expect(result).toEqual({ field: 'name', order: 'asc' });
  });
});
