import { vi } from 'vitest';
import type { AccountInfo, PoolStatus } from '../../types';

export const mockAccounts: AccountInfo[] = [
  {
    name: 'test-account-1',
    healthy: true,
    request_count: 100,
    failure_count: 0,
    in_pool: true,
    provider: 'Google',
    auth_method: 'social',
  },
  {
    name: 'test-account-2',
    healthy: false,
    request_count: 50,
    failure_count: 3,
    in_pool: true,
    provider: 'Github',
    auth_method: 'social',
  },
  {
    name: 'test-account-3',
    healthy: true,
    request_count: 200,
    failure_count: 1,
    in_pool: false,
    provider: 'BuilderId',
    auth_method: 'IdC',
  },
];

export const mockPoolStatus: PoolStatus = {
  total_accounts: mockAccounts.filter(a => a.in_pool).length,
  healthy_accounts: mockAccounts.filter(a => a.healthy && a.in_pool).length,
  total_requests: mockAccounts.reduce((sum, a) => sum + a.request_count, 0),
  accounts: mockAccounts.filter(a => a.in_pool),
};

export function mockFetchSuccess<T>(data: T) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true, data }),
  });
}

export function mockFetchError(error: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: false, error }),
  });
}

export function mockFetchNetworkError() {
  return vi.fn().mockRejectedValue(new Error('Network error'));
}

export function setupFetchMock(responses: Record<string, unknown>) {
  return vi.fn().mockImplementation((url: string) => {
    const path = new URL(url, 'http://localhost').pathname;
    const data = responses[path];

    if (data === undefined) {
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ success: false, error: 'Not found' }),
      });
    }

    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true, data }),
    });
  });
}
