import type { ApiResponse, PoolStatus, AccountInfo, AddAccountRequest, ConfigInfo, CheckAccountResponse, BatchCheckAccountResponse, ImportSsoTokenRequest, ImportSsoTokenResponse, AccountCredentialsExport, CreateApiKeyRequest, CreateApiKeyResponse, ApiKeyListItem, UpdateApiKeyRequest, UsageQueryParams, UsageResponse } from '../types';

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

// ============ API Key 管理 ============

// 创建 API Key
export async function createApiKey(data: CreateApiKeyRequest): Promise<ApiResponse<CreateApiKeyResponse>> {
  return request<CreateApiKeyResponse>('/admin/api-keys', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// 获取所有 API Key
export async function listApiKeys(): Promise<ApiResponse<ApiKeyListItem[]>> {
  return request<ApiKeyListItem[]>('/admin/api-keys');
}

// 更新 API Key
export async function updateApiKey(id: number, data: UpdateApiKeyRequest): Promise<ApiResponse<ApiKeyListItem>> {
  return request<ApiKeyListItem>(`/admin/api-keys/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// 删除 API Key
export async function deleteApiKey(id: number): Promise<ApiResponse<void>> {
  return request<void>(`/admin/api-keys/${id}`, {
    method: 'DELETE',
  });
}

// ============ 用量统计 ============

// 查询用量统计
export async function queryUsage(params?: UsageQueryParams): Promise<ApiResponse<UsageResponse>> {
  const searchParams = new URLSearchParams();
  if (params?.apiKeyId) searchParams.set('apiKeyId', params.apiKeyId.toString());
  if (params?.model) searchParams.set('model', params.model);
  if (params?.startTime) searchParams.set('startTime', params.startTime);
  if (params?.endTime) searchParams.set('endTime', params.endTime);
  if (params?.groupBy) searchParams.set('groupBy', params.groupBy);

  const queryString = searchParams.toString();
  const path = queryString ? `/admin/usage?${queryString}` : '/admin/usage';
  return request<UsageResponse>(path);
}

// 导出用量记录为 XLSX 文件
export async function exportUsage(params?: UsageQueryParams): Promise<Blob> {
  const searchParams = new URLSearchParams();
  if (params?.apiKeyId) searchParams.set('apiKeyId', params.apiKeyId.toString());
  if (params?.model) searchParams.set('model', params.model);
  if (params?.startTime) searchParams.set('startTime', params.startTime);
  if (params?.endTime) searchParams.set('endTime', params.endTime);

  const queryString = searchParams.toString();
  const path = queryString ? `/admin/usage/export?${queryString}` : '/admin/usage/export';

  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error('导出失败');
  }
  return await response.blob();
}
