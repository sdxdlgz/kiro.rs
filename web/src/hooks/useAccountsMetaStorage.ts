import { useCallback, useEffect, useState } from 'react';
import type { AccountGroup, AccountMeta, AccountTag, AccountsMetaStorage } from '../types';

const DEFAULT_STORAGE_KEY = 'kiro.accountsMetaStorage';
const CURRENT_VERSION = 1;

function createEmptyStorage(): AccountsMetaStorage {
  return {
    version: CURRENT_VERSION,
    groups: [],
    tags: [],
    metaByName: {},
  };
}

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function uniqStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') continue;
    if (item.length === 0) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}

function normalizeMeta(value: unknown): AccountMeta {
  if (!isRecord(value)) return { tagIds: [] };

  const meta: AccountMeta = { tagIds: uniqStrings(value.tagIds) };
  const groupId = asString(value.groupId);
  const notes = asString(value.notes);

  if (groupId && groupId.trim()) meta.groupId = groupId;
  if (notes && notes.trim()) meta.notes = notes;

  return meta;
}

function compactMeta(meta: AccountMeta): AccountMeta | undefined {
  const next: AccountMeta = {
    tagIds: Array.from(new Set(meta.tagIds)).filter((id) => id.trim().length > 0),
  };

  if (meta.groupId && meta.groupId.trim()) next.groupId = meta.groupId;
  if (meta.notes && meta.notes.trim()) next.notes = meta.notes;

  if (!next.groupId && next.tagIds.length === 0 && !next.notes) return undefined;
  return next;
}

function migrateStorage(value: unknown): AccountsMetaStorage {
  const empty = createEmptyStorage();
  if (!isRecord(value)) return empty;

  const groupsRaw = Array.isArray(value.groups) ? value.groups : [];
  const tagsRaw = Array.isArray(value.tags) ? value.tags : [];
  const metaByNameRaw = isRecord(value.metaByName) ? value.metaByName : {};

  const groups: AccountGroup[] = [];
  for (let index = 0; index < groupsRaw.length; index++) {
    const item = groupsRaw[index];
    if (!isRecord(item)) continue;
    const id = asString(item.id);
    const name = asString(item.name);
    if (!id || !name) continue;

    const order = asFiniteNumber(item.order) ?? index;
    const createdAt = asFiniteNumber(item.createdAt) ?? Date.now();
    const color = asString(item.color);

    const group: AccountGroup = { id, name, order, createdAt };
    if (color && color.trim()) group.color = color;
    groups.push(group);
  }

  const tags: AccountTag[] = [];
  for (const item of tagsRaw) {
    if (!isRecord(item)) continue;
    const id = asString(item.id);
    const name = asString(item.name);
    const color = asString(item.color);
    if (!id || !name || !color) continue;
    tags.push({ id, name, color });
  }

  const metaByName: Record<string, AccountMeta> = {};
  for (const [name, metaValue] of Object.entries(metaByNameRaw)) {
    const normalized = compactMeta(normalizeMeta(metaValue));
    if (normalized) metaByName[name] = normalized;
  }

  return {
    version: CURRENT_VERSION,
    groups,
    tags,
    metaByName,
  };
}

function readStorage(storageKey: string): AccountsMetaStorage {
  if (!canUseLocalStorage()) return createEmptyStorage();
  const raw = window.localStorage.getItem(storageKey);
  if (!raw) return createEmptyStorage();
  return migrateStorage(safeJsonParse(raw));
}

function writeStorage(storageKey: string, storage: AccountsMetaStorage): void {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(storage));
  } catch {
    // ignore quota/security errors
  }
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export interface UseAccountsMetaStorageResult {
  storage: AccountsMetaStorage;
  groups: AccountGroup[];
  tags: AccountTag[];
  metaByName: Record<string, AccountMeta>;
  addGroup: (input: { name: string; color?: string }) => string;
  updateGroup: (groupId: string, patch: Partial<Omit<AccountGroup, 'id' | 'createdAt'>>) => void;
  removeGroup: (groupId: string) => void;
  addTag: (input: { name: string; color: string }) => string;
  updateTag: (tagId: string, patch: Partial<Omit<AccountTag, 'id'>>) => void;
  removeTag: (tagId: string) => void;
  setAccountMeta: (accountName: string, patch: Partial<AccountMeta>) => void;
  removeAccountMeta: (accountName: string) => void;
  moveAccountsToGroup: (accountNames: string[], groupId?: string) => void;
  addTagToAccounts: (accountNames: string[], tagId: string) => void;
  removeTagFromAccounts: (accountNames: string[], tagId: string) => void;
}

export function useAccountsMetaStorage(storageKey: string = DEFAULT_STORAGE_KEY): UseAccountsMetaStorageResult {
  const [storage, setStorage] = useState<AccountsMetaStorage>(() => readStorage(storageKey));

  useEffect(() => {
    setStorage(readStorage(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (!canUseLocalStorage()) return;

    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key !== storageKey) return;
      if (!event.newValue) {
        setStorage(createEmptyStorage());
        return;
      }
      setStorage(migrateStorage(safeJsonParse(event.newValue)));
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKey]);

  const persist = useCallback(
    (updater: (current: AccountsMetaStorage) => AccountsMetaStorage) => {
      setStorage((current) => {
        const next = updater(current);
        writeStorage(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const addGroup = useCallback(
    (input: { name: string; color?: string }) => {
      const id = createId();
      const createdAt = Date.now();
      const name = input.name.trim();
      const color = input.color?.trim();

      persist((current) => {
        const maxOrder = current.groups.reduce((max, group) => Math.max(max, group.order), -1);
        const group: AccountGroup = { id, name, order: maxOrder + 1, createdAt };
        if (color) group.color = color;
        return {
          ...current,
          groups: [...current.groups, group],
          version: CURRENT_VERSION,
        };
      });

      return id;
    },
    [persist]
  );

  const updateGroup = useCallback(
    (groupId: string, patch: Partial<Omit<AccountGroup, 'id' | 'createdAt'>>) => {
      persist((current) => ({
        ...current,
        groups: current.groups.map((group) =>
          group.id === groupId ? { ...group, ...patch, id: group.id, createdAt: group.createdAt } : group
        ),
        version: CURRENT_VERSION,
      }));
    },
    [persist]
  );

  const removeGroup = useCallback(
    (groupId: string) => {
      persist((current) => {
        const nextMetaByName: Record<string, AccountMeta> = {};
        for (const [name, meta] of Object.entries(current.metaByName)) {
          if (meta.groupId !== groupId) {
            nextMetaByName[name] = meta;
            continue;
          }

          const nextMeta = compactMeta({ ...meta, groupId: undefined });
          if (nextMeta) nextMetaByName[name] = nextMeta;
        }

        return {
          ...current,
          groups: current.groups.filter((group) => group.id !== groupId),
          metaByName: nextMetaByName,
          version: CURRENT_VERSION,
        };
      });
    },
    [persist]
  );

  const addTag = useCallback(
    (input: { name: string; color: string }) => {
      const id = createId();
      const name = input.name.trim();
      const color = input.color.trim();

      persist((current) => ({
        ...current,
        tags: [...current.tags, { id, name, color }],
        version: CURRENT_VERSION,
      }));

      return id;
    },
    [persist]
  );

  const updateTag = useCallback(
    (tagId: string, patch: Partial<Omit<AccountTag, 'id'>>) => {
      persist((current) => ({
        ...current,
        tags: current.tags.map((tag) => (tag.id === tagId ? { ...tag, ...patch, id: tag.id } : tag)),
        version: CURRENT_VERSION,
      }));
    },
    [persist]
  );

  const removeTag = useCallback(
    (tagId: string) => {
      persist((current) => {
        const nextMetaByName: Record<string, AccountMeta> = {};
        for (const [name, meta] of Object.entries(current.metaByName)) {
          if (!meta.tagIds.includes(tagId)) {
            nextMetaByName[name] = meta;
            continue;
          }
          const nextMeta = compactMeta({ ...meta, tagIds: meta.tagIds.filter((id) => id !== tagId) });
          if (nextMeta) nextMetaByName[name] = nextMeta;
        }

        return {
          ...current,
          tags: current.tags.filter((tag) => tag.id !== tagId),
          metaByName: nextMetaByName,
          version: CURRENT_VERSION,
        };
      });
    },
    [persist]
  );

  const setAccountMeta = useCallback(
    (accountName: string, patch: Partial<AccountMeta>) => {
      persist((current) => {
        const currentMeta = current.metaByName[accountName] ?? { tagIds: [] };

        const nextMeta: AccountMeta = {
          groupId: currentMeta.groupId,
          notes: currentMeta.notes,
          tagIds: currentMeta.tagIds,
        };

        if (hasOwn(patch, 'groupId')) nextMeta.groupId = patch.groupId;
        if (hasOwn(patch, 'notes')) nextMeta.notes = patch.notes;
        if (hasOwn(patch, 'tagIds')) nextMeta.tagIds = patch.tagIds ?? [];

        const normalized = compactMeta(nextMeta);
        const nextMetaByName = { ...current.metaByName };
        if (normalized) nextMetaByName[accountName] = normalized;
        else delete nextMetaByName[accountName];

        return {
          ...current,
          metaByName: nextMetaByName,
          version: CURRENT_VERSION,
        };
      });
    },
    [persist]
  );

  const removeAccountMeta = useCallback(
    (accountName: string) => {
      persist((current) => {
        if (!hasOwn(current.metaByName, accountName)) return current;
        const nextMetaByName = { ...current.metaByName };
        delete nextMetaByName[accountName];
        return { ...current, metaByName: nextMetaByName, version: CURRENT_VERSION };
      });
    },
    [persist]
  );

  const moveAccountsToGroup = useCallback(
    (accountNames: string[], groupId?: string) => {
      const deduped = Array.from(new Set(accountNames)).filter((name) => name.trim().length > 0);
      if (deduped.length === 0) return;

      persist((current) => {
        const nextMetaByName = { ...current.metaByName };
        for (const name of deduped) {
          const currentMeta = nextMetaByName[name] ?? { tagIds: [] };
          const normalized = compactMeta({ ...currentMeta, groupId });
          if (normalized) nextMetaByName[name] = normalized;
          else delete nextMetaByName[name];
        }
        return { ...current, metaByName: nextMetaByName, version: CURRENT_VERSION };
      });
    },
    [persist]
  );

  const addTagToAccounts = useCallback(
    (accountNames: string[], tagId: string) => {
      const deduped = Array.from(new Set(accountNames)).filter((name) => name.trim().length > 0);
      if (deduped.length === 0) return;

      persist((current) => {
        const nextMetaByName = { ...current.metaByName };
        for (const name of deduped) {
          const currentMeta = nextMetaByName[name] ?? { tagIds: [] };
          const tagIds = currentMeta.tagIds.includes(tagId) ? currentMeta.tagIds : [...currentMeta.tagIds, tagId];
          const normalized = compactMeta({ ...currentMeta, tagIds });
          if (normalized) nextMetaByName[name] = normalized;
          else delete nextMetaByName[name];
        }
        return { ...current, metaByName: nextMetaByName, version: CURRENT_VERSION };
      });
    },
    [persist]
  );

  const removeTagFromAccounts = useCallback(
    (accountNames: string[], tagId: string) => {
      const deduped = Array.from(new Set(accountNames)).filter((name) => name.trim().length > 0);
      if (deduped.length === 0) return;

      persist((current) => {
        const nextMetaByName = { ...current.metaByName };
        for (const name of deduped) {
          const currentMeta = nextMetaByName[name];
          if (!currentMeta) continue;
          const normalized = compactMeta({
            ...currentMeta,
            tagIds: currentMeta.tagIds.filter((id) => id !== tagId),
          });
          if (normalized) nextMetaByName[name] = normalized;
          else delete nextMetaByName[name];
        }
        return { ...current, metaByName: nextMetaByName, version: CURRENT_VERSION };
      });
    },
    [persist]
  );

  return {
    storage,
    groups: storage.groups,
    tags: storage.tags,
    metaByName: storage.metaByName,
    addGroup,
    updateGroup,
    removeGroup,
    addTag,
    updateTag,
    removeTag,
    setAccountMeta,
    removeAccountMeta,
    moveAccountsToGroup,
    addTagToAccounts,
    removeTagFromAccounts,
  };
}
