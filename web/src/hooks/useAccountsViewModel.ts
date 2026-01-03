import { useState, useCallback, useMemo } from 'react';
import type { AccountInfo, AccountMeta, FilterOptions, SortOptions, AccountActionState } from '../types';

export interface UseAccountsViewModelOptions {
  accounts: AccountInfo[];
  metaByName: Record<string, AccountMeta>;
}

export interface UseAccountsViewModelResult {
  // 筛选和排序
  filterOptions: FilterOptions;
  setFilterOptions: (options: FilterOptions) => void;
  sortOptions: SortOptions;
  setSortOptions: (options: SortOptions) => void;

  // 选择
  selectedNames: Set<string>;
  selectAccount: (name: string) => void;
  deselectAccount: (name: string) => void;
  toggleSelection: (name: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  isSelected: (name: string) => boolean;

  // 操作状态
  actionStates: Record<string, AccountActionState>;
  setActionState: (name: string, state: AccountActionState) => void;

  // 计算属性
  filteredAccounts: AccountInfo[];
  sortedAccounts: AccountInfo[];
  selectedAccounts: AccountInfo[];
  hasSelection: boolean;
  selectionCount: number;
}

export function useAccountsViewModel({
  accounts,
  metaByName,
}: UseAccountsViewModelOptions): UseAccountsViewModelResult {
  // 筛选选项
  const [filterOptions, setFilterOptions] = useState<FilterOptions>({});

  // 排序选项
  const [sortOptions, setSortOptions] = useState<SortOptions>({
    field: 'name',
    order: 'asc',
  });

  // 选择状态
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());

  // 操作状态
  const [actionStates, setActionStates] = useState<Record<string, AccountActionState>>({});

  // 筛选账号
  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      // 搜索过滤
      if (filterOptions.search) {
        const search = filterOptions.search.toLowerCase();
        if (!account.name.toLowerCase().includes(search)) {
          return false;
        }
      }

      // 状态过滤
      if (filterOptions.status && filterOptions.status.length > 0) {
        const status = account.healthy ? 'healthy' : 'unhealthy';
        if (!filterOptions.status.includes(status)) {
          return false;
        }
      }

      // 提供商过滤
      if (filterOptions.providers && filterOptions.providers.length > 0) {
        if (!account.provider || !filterOptions.providers.includes(account.provider as any)) {
          return false;
        }
      }

      // 认证方式过滤
      if (filterOptions.authMethods && filterOptions.authMethods.length > 0) {
        const authMethod = account.auth_method?.toLowerCase();
        if (!authMethod || !filterOptions.authMethods.some(m => m.toLowerCase() === authMethod)) {
          return false;
        }
      }

      // 是否在池中过滤
      if (filterOptions.inPool !== undefined) {
        if (account.in_pool !== filterOptions.inPool) {
          return false;
        }
      }

      // 分组过滤
      if (filterOptions.groupIds && filterOptions.groupIds.length > 0) {
        const meta = metaByName[account.name];
        if (!meta?.groupId || !filterOptions.groupIds.includes(meta.groupId)) {
          return false;
        }
      }

      // 标签过滤
      if (filterOptions.tagIds && filterOptions.tagIds.length > 0) {
        const meta = metaByName[account.name];
        const tagIds = meta?.tagIds ?? [];
        if (!filterOptions.tagIds.every(id => tagIds.includes(id))) {
          return false;
        }
      }

      return true;
    });
  }, [accounts, metaByName, filterOptions]);

  // 排序账号
  const sortedAccounts = useMemo(() => {
    const sorted = [...filteredAccounts];
    const { field, order } = sortOptions;
    const factor = order === 'asc' ? 1 : -1;

    sorted.sort((a, b) => {
      let cmp = 0;

      switch (field) {
        case 'name':
          cmp = a.name.localeCompare(b.name);
          break;
        case 'request_count':
          cmp = a.request_count - b.request_count;
          break;
        case 'failure_count':
          cmp = a.failure_count - b.failure_count;
          break;
        case 'provider':
          cmp = (a.provider ?? '').localeCompare(b.provider ?? '');
          break;
        case 'status':
          cmp = (a.healthy ? 0 : 1) - (b.healthy ? 0 : 1);
          break;
      }

      return cmp * factor;
    });

    return sorted;
  }, [filteredAccounts, sortOptions]);

  // 选择操作
  const selectAccount = useCallback((name: string) => {
    setSelectedNames(prev => new Set([...prev, name]));
  }, []);

  const deselectAccount = useCallback((name: string) => {
    setSelectedNames(prev => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
  }, []);

  const toggleSelection = useCallback((name: string) => {
    setSelectedNames(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedNames(new Set(sortedAccounts.map(a => a.name)));
  }, [sortedAccounts]);

  const deselectAll = useCallback(() => {
    setSelectedNames(new Set());
  }, []);

  const isSelected = useCallback((name: string) => {
    return selectedNames.has(name);
  }, [selectedNames]);

  // 操作状态
  const setActionState = useCallback((name: string, state: AccountActionState) => {
    setActionStates(prev => ({
      ...prev,
      [name]: state,
    }));
  }, []);

  // 计算属性
  const selectedAccounts = useMemo(() => {
    return sortedAccounts.filter(a => selectedNames.has(a.name));
  }, [sortedAccounts, selectedNames]);

  const hasSelection = selectedNames.size > 0;
  const selectionCount = selectedNames.size;

  return {
    filterOptions,
    setFilterOptions,
    sortOptions,
    setSortOptions,
    selectedNames,
    selectAccount,
    deselectAccount,
    toggleSelection,
    selectAll,
    deselectAll,
    isSelected,
    actionStates,
    setActionState,
    filteredAccounts,
    sortedAccounts,
    selectedAccounts,
    hasSelection,
    selectionCount,
  };
}
