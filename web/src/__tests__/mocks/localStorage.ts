import { vi } from 'vitest';
import type { AccountsMetaStorage, AccountGroup, AccountTag, AccountMeta } from '../../types/account';

export const defaultMetaStorage: AccountsMetaStorage = {
  version: 1,
  groups: [],
  tags: [],
  metaByName: {},
};

export function createMockGroup(overrides?: Partial<AccountGroup>): AccountGroup {
  return {
    id: `group-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: 'Test Group',
    order: 0,
    createdAt: Date.now(),
    ...overrides,
  };
}

export function createMockTag(overrides?: Partial<AccountTag>): AccountTag {
  return {
    id: `tag-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    name: 'Test Tag',
    color: '#3b82f6',
    ...overrides,
  };
}

export function createMockMeta(overrides?: Partial<AccountMeta>): AccountMeta {
  return {
    tagIds: [],
    ...overrides,
  };
}

export function createLocalStorageMock(initialData?: Partial<AccountsMetaStorage>) {
  const storage = new Map<string, string>();

  if (initialData) {
    storage.set('kiro.accountsMetaStorage', JSON.stringify({ ...defaultMetaStorage, ...initialData }));
  }

  const api: Storage = {
    get length() {
      return storage.size;
    },
    key: vi.fn((index: number) => Array.from(storage.keys())[index] ?? null),
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    }),
    clear: vi.fn(() => {
      storage.clear();
    }),
  };

  return api;
}

export function getStoredMetaStorage(localStorage: Storage): AccountsMetaStorage | null {
  const raw = localStorage.getItem('kiro.accountsMetaStorage');
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AccountsMetaStorage;
  } catch {
    return null;
  }
}
