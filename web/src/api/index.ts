import type { ApiResponse, PoolStatus, AccountInfo, AddAccountRequest, ConfigInfo, CheckAccountResponse, BatchCheckAccountResponse, ImportSsoTokenRequest, ImportSsoTokenResponse, AccountCredentialsExport } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE || '';

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

// 检查单个账号（获取使用额度和订阅信息）
export async function checkAccount(name: string): Promise<ApiResponse<CheckAccountResponse>> {
  return request<CheckAccountResponse>('/admin/accounts/check', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

// 批量检查账号
export async function batchCheckAccounts(names: string[]): Promise<ApiResponse<BatchCheckAccountResponse>> {
  return request<BatchCheckAccountResponse>('/admin/accounts/batch-check', {
    method: 'POST',
    body: JSON.stringify({ names }),
  });
}

// 从 SSO Token 导入账号
export async function importSsoToken(data: ImportSsoTokenRequest): Promise<ApiResponse<ImportSsoTokenResponse>> {
  return request<ImportSsoTokenResponse>('/admin/accounts/import-sso', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// 获取账号完整凭证（用于导出）
export async function getCredentials(names?: string[]): Promise<ApiResponse<AccountCredentialsExport[]>> {
  return request<AccountCredentialsExport[]>('/admin/accounts/credentials', {
    method: 'POST',
    body: JSON.stringify({ names: names || [] }),
  });
}
