// 身份提供商类型
export type IdpType = 'Google' | 'Github' | 'BuilderId' | 'AWSIdC' | 'Internal';

// 认证方式
export type AuthMethod = 'IdC' | 'social';

// 账号状态
export type AccountStatus = 'healthy' | 'unhealthy' | 'refreshing' | 'unknown';

// 完整凭证 (用于 SSO 导入)
export interface AccountCredentials {
  accessToken?: string;
  csrfToken?: string;
  refreshToken: string;
  clientId?: string;
  clientSecret?: string;
  region?: string;
  expiresAt?: number;
  authMethod?: AuthMethod;
  provider?: IdpType;
}

// 账号信息 (后端返回)
export interface AccountInfo {
  name: string;
  healthy: boolean;
  request_count: number;
  failure_count: number;
  in_pool: boolean;
  profile_arn?: string;
  auth_method?: string;
  provider?: string;
  email?: string;
  // 新增字段
  region?: string;
  expires_at?: string;
}

// 账号分组
export interface AccountGroup {
  id: string;
  name: string;
  color?: string;
  order: number;
  createdAt: number;
}

// 账号标签
export interface AccountTag {
  id: string;
  name: string;
  color: string;
}

// 账号本地元数据
export interface AccountMeta {
  groupId?: string;
  tagIds: string[];
  notes?: string;
}

// 本地存储 Schema
export interface AccountsMetaStorage {
  version: number;
  groups: AccountGroup[];
  tags: AccountTag[];
  metaByName: Record<string, AccountMeta>;
}

// 筛选选项
export interface FilterOptions {
  search?: string;
  status?: AccountStatus[];
  providers?: IdpType[];
  authMethods?: AuthMethod[];
  groupIds?: string[];
  tagIds?: string[];
  inPool?: boolean;
}

// 排序选项
export type SortField = 'name' | 'request_count' | 'failure_count' | 'provider' | 'status';
export type SortOrder = 'asc' | 'desc';

export interface SortOptions {
  field: SortField;
  order: SortOrder;
}

// 添加账号请求 (扩展)
export interface AddAccountRequest {
  name: string;
  accessToken?: string;
  refreshToken: string;
  csrfToken?: string;
  clientId?: string;
  clientSecret?: string;
  region?: string;
  profileArn?: string;
  expiresAt?: string;
  authMethod?: string;
  provider?: string;
  addToPool?: boolean;
}

// 视图模式
export type ViewMode = 'card' | 'table' | 'compact';

// 批量操作状态
export interface BatchOperationState {
  isRunning: boolean;
  total: number;
  completed: number;
  failed: number;
  errors: Array<{ name: string; error: string }>;
}

// 账号操作状态
export type AccountActionState = 'idle' | 'refreshing' | 'deleting' | 'checking';

// 检查账号响应
export interface CheckAccountResponse {
  name: string;
  healthy: boolean;
  subscription?: string;
  currentUsage: number;
  usageLimit: number;
  usagePercent: number;
  nextResetDate?: number;
  error?: string;
}

// 批量检查账号响应
export interface BatchCheckAccountResponse {
  results: CheckAccountResponse[];
  successCount: number;
  failedCount: number;
}

// SSO Token 导入请求
export interface ImportSsoTokenRequest {
  name: string;
  ssoToken: string;
  region?: string;
  addToPool?: boolean;
}

// SSO Token 导入响应
export interface ImportSsoTokenResponse {
  account: AccountInfo;
  email?: string;
  subscription?: string;
  currentUsage: number;
  usageLimit: number;
}

// 获取凭证请求
export interface GetCredentialsRequest {
  names?: string[];
}

// 账号完整凭证（用于导出）
export interface AccountCredentialsExport {
  name: string;
  healthy: boolean;
  requestCount: number;
  failureCount: number;
  inPool: boolean;
  profileArn?: string;
  authMethod?: string;
  provider?: string;
  region?: string;
  accessToken?: string;
  refreshToken?: string;
  csrfToken?: string;
  clientId?: string;
  clientSecret?: string;
  expiresAt?: string;
}
