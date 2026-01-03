import { useState, useCallback } from 'react';
import type { CheckAccountResponse } from '../types';

const STORAGE_KEY = 'kiro-check-results';

export interface CheckResultsStorage {
  results: Record<string, CheckAccountResponse>;
  lastUpdated: number;
}

export interface UseCheckResultsStorageResult {
  checkResults: Record<string, CheckAccountResponse>;
  updateCheckResult: (name: string, result: CheckAccountResponse) => void;
  updateCheckResults: (results: CheckAccountResponse[]) => void;
  getCheckResult: (name: string) => CheckAccountResponse | undefined;
  clearCheckResults: () => void;
  // 汇总统计
  totalUsage: number;
  totalLimit: number;
  checkedCount: number;
}

export function useCheckResultsStorage(): UseCheckResultsStorageResult {
  const [checkResults, setCheckResults] = useState<Record<string, CheckAccountResponse>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data: CheckResultsStorage = JSON.parse(stored);
        return data.results || {};
      }
    } catch (e) {
      console.error('Failed to load check results from localStorage:', e);
    }
    return {};
  });

  // 保存到 localStorage
  const saveToStorage = useCallback((results: Record<string, CheckAccountResponse>) => {
    try {
      const data: CheckResultsStorage = {
        results,
        lastUpdated: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save check results to localStorage:', e);
    }
  }, []);

  // 更新单个检查结果
  const updateCheckResult = useCallback((name: string, result: CheckAccountResponse) => {
    setCheckResults(prev => {
      const updated = { ...prev, [name]: result };
      saveToStorage(updated);
      return updated;
    });
  }, [saveToStorage]);

  // 批量更新检查结果
  const updateCheckResults = useCallback((results: CheckAccountResponse[]) => {
    setCheckResults(prev => {
      const updated = { ...prev };
      results.forEach(r => {
        if (!r.error) {
          updated[r.name] = r;
        }
      });
      saveToStorage(updated);
      return updated;
    });
  }, [saveToStorage]);

  // 获取单个检查结果
  const getCheckResult = useCallback((name: string) => {
    return checkResults[name];
  }, [checkResults]);

  // 清除所有检查结果
  const clearCheckResults = useCallback(() => {
    setCheckResults({});
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // 计算汇总统计
  const stats = Object.values(checkResults).reduce(
    (acc, r) => {
      if (!r.error) {
        acc.totalUsage += r.currentUsage;
        acc.totalLimit += r.usageLimit;
        acc.checkedCount++;
      }
      return acc;
    },
    { totalUsage: 0, totalLimit: 0, checkedCount: 0 }
  );

  return {
    checkResults,
    updateCheckResult,
    updateCheckResults,
    getCheckResult,
    clearCheckResults,
    totalUsage: stats.totalUsage,
    totalLimit: stats.totalLimit,
    checkedCount: stats.checkedCount,
  };
}
