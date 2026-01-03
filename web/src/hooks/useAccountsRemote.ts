import { useState, useCallback, useEffect, useRef } from 'react';
import { getAccounts, refreshToken, resetAccount, removeAccount, addAccount, checkAccount, batchCheckAccounts, getCredentials } from '../api';
import type { AccountInfo, AddAccountRequest, CheckAccountResponse, AccountCredentialsExport } from '../types';

export interface UseAccountsRemoteResult {
  accounts: AccountInfo[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshAccountToken: (name: string) => Promise<boolean>;
  resetAccountStatus: (name: string) => Promise<boolean>;
  deleteAccount: (name: string, deleteFile?: boolean) => Promise<boolean>;
  createAccount: (data: AddAccountRequest) => Promise<boolean>;
  batchRefresh: (names: string[], onProgress?: (completed: number, total: number) => void) => Promise<{ success: string[]; failed: Array<{ name: string; error: string }> }>;
  batchDelete: (names: string[], deleteFile?: boolean, onProgress?: (completed: number, total: number) => void) => Promise<{ success: string[]; failed: Array<{ name: string; error: string }> }>;
  checkAccountUsage: (name: string) => Promise<CheckAccountResponse | null>;
  batchCheckAccountsUsage: (names: string[]) => Promise<CheckAccountResponse[]>;
  getAccountCredentials: (name: string) => Promise<AccountCredentialsExport | null>;
}

export function useAccountsRemote(): UseAccountsRemoteResult {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;

    const res = await getAccounts();

    if (!mountedRef.current) return;

    if (res.success && res.data) {
      setAccounts(res.data);
      setError(null);
    } else {
      setError(res.error || '获取账号列表失败');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();

    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  const refreshAccountToken = useCallback(async (name: string): Promise<boolean> => {
    const res = await refreshToken(name);
    if (res.success) {
      await refresh();
      return true;
    }
    return false;
  }, [refresh]);

  const resetAccountStatus = useCallback(async (name: string): Promise<boolean> => {
    const res = await resetAccount(name);
    if (res.success) {
      await refresh();
      return true;
    }
    return false;
  }, [refresh]);

  const deleteAccount = useCallback(async (name: string, deleteFile = true): Promise<boolean> => {
    const res = await removeAccount(name, deleteFile);
    if (res.success) {
      await refresh();
      return true;
    }
    return false;
  }, [refresh]);

  const createAccount = useCallback(async (data: AddAccountRequest): Promise<boolean> => {
    const res = await addAccount(data);
    if (res.success) {
      await refresh();
      return true;
    }
    return false;
  }, [refresh]);

  const batchRefresh = useCallback(async (
    names: string[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<{ success: string[]; failed: Array<{ name: string; error: string }> }> => {
    const success: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];
    const total = names.length;

    // 并发控制，最多同时 5 个
    const concurrency = 5;
    let completed = 0;

    const processName = async (name: string) => {
      try {
        const res = await refreshToken(name);
        if (res.success) {
          success.push(name);
        } else {
          failed.push({ name, error: res.error || '刷新失败' });
        }
      } catch (e) {
        failed.push({ name, error: e instanceof Error ? e.message : '未知错误' });
      }
      completed++;
      onProgress?.(completed, total);
    };

    // 分批处理
    for (let i = 0; i < names.length; i += concurrency) {
      const batch = names.slice(i, i + concurrency);
      await Promise.all(batch.map(processName));
    }

    await refresh();
    return { success, failed };
  }, [refresh]);

  const batchDelete = useCallback(async (
    names: string[],
    deleteFile = true,
    onProgress?: (completed: number, total: number) => void
  ): Promise<{ success: string[]; failed: Array<{ name: string; error: string }> }> => {
    const success: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];
    const total = names.length;

    // 并发控制，最多同时 5 个
    const concurrency = 5;
    let completed = 0;

    const processName = async (name: string) => {
      try {
        const res = await removeAccount(name, deleteFile);
        if (res.success) {
          success.push(name);
        } else {
          failed.push({ name, error: res.error || '删除失败' });
        }
      } catch (e) {
        failed.push({ name, error: e instanceof Error ? e.message : '未知错误' });
      }
      completed++;
      onProgress?.(completed, total);
    };

    // 分批处理
    for (let i = 0; i < names.length; i += concurrency) {
      const batch = names.slice(i, i + concurrency);
      await Promise.all(batch.map(processName));
    }

    await refresh();
    return { success, failed };
  }, [refresh]);

  const checkAccountUsage = useCallback(async (name: string): Promise<CheckAccountResponse | null> => {
    const res = await checkAccount(name);
    if (res.success && res.data) {
      return res.data;
    }
    return null;
  }, []);

  const batchCheckAccountsUsage = useCallback(async (names: string[]): Promise<CheckAccountResponse[]> => {
    const res = await batchCheckAccounts(names);
    if (res.success && res.data) {
      return res.data.results;
    }
    return [];
  }, []);

  const getAccountCredentials = useCallback(async (name: string): Promise<AccountCredentialsExport | null> => {
    const res = await getCredentials([name]);
    if (res.success && res.data && res.data.length > 0) {
      return res.data[0];
    }
    return null;
  }, []);

  return {
    accounts,
    loading,
    error,
    refresh,
    refreshAccountToken,
    resetAccountStatus,
    deleteAccount,
    createAccount,
    batchRefresh,
    batchDelete,
    checkAccountUsage,
    batchCheckAccountsUsage,
    getAccountCredentials,
  };
}
