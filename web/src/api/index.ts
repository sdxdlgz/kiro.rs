import type { ApiResponse, PoolStatus, AccountInfo, AddAccountRequest, ConfigInfo } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8990';

async function request<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
    return await response.json();
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : '请求失败',
    };
  }
}

// 获取轮换池状态
export async function getPoolStatus(): Promise<ApiResponse<PoolStatus>> {
  return request<PoolStatus>('/admin/pool/status');
}

// 获取所有账号
export async function getAccounts(): Promise<ApiResponse<AccountInfo[]>> {
  return request<AccountInfo[]>('/admin/accounts');
}

// 添加账号
export async function addAccount(data: AddAccountRequest): Promise<ApiResponse<AccountInfo>> {
  return request<AccountInfo>('/admin/accounts', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// 删除账号
export async function removeAccount(name: string, deleteFile: boolean = false): Promise<ApiResponse<void>> {
  return request<void>('/admin/accounts/remove', {
    method: 'POST',
    body: JSON.stringify({ name, delete_file: deleteFile }),
  });
}

// 刷新账号 Token
export async function refreshToken(name: string): Promise<ApiResponse<{ success: boolean; message?: string }>> {
  return request('/admin/accounts/refresh', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

// 重置账号状态
export async function resetAccount(name: string): Promise<ApiResponse<void>> {
  return request<void>('/admin/accounts/reset', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

// 获取配置
export async function getConfig(): Promise<ApiResponse<ConfigInfo>> {
  return request<ConfigInfo>('/admin/config');
}
