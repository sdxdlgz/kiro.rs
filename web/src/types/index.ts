// 从 account.ts 导出所有类型
export * from './account';

// 轮换池状态 (使用 account.ts 中的 AccountInfo)
import type { AccountInfo } from './account';

export interface PoolStatus {
  total_accounts: number;
  healthy_accounts: number;
  total_requests: number;
  accounts: AccountInfo[];
}

// 配置信息
export interface ConfigInfo {
  host: string;
  port: number;
  region: string;
  kiroVersion: string;
  credentialsDir?: string;
  failureCooldownSecs: number;
  maxFailures: number;
}

// API 响应
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============ 错误日志 ============

// 错误类型
export type ApiErrorType = '400' | '429' | 'other';

// 错误日志条目
export interface ApiErrorLogEntry {
  timestamp: string;
  account_name: string;
  status_code: number;
  error_type: ApiErrorType;
  message: string;
  is_stream: boolean;
}

// ============ API Key 管理 ============

// 创建 API Key 请求
export interface CreateApiKeyRequest {
  name: string;
  expiresAt?: string;
  rateLimit?: number;
}

// 创建 API Key 响应
export interface CreateApiKeyResponse {
  id: number;
  key: string;
  name: string;
  createdAt: string;
}

// API Key 列表项
export interface ApiKeyListItem {
  id: number;
  keyPrefix: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  expiresAt?: string;
  rateLimit?: number;
}

// 更新 API Key 请求
export interface UpdateApiKeyRequest {
  name?: string;
  enabled?: boolean;
  rateLimit?: number;
}

// ============ 用量统计 ============

// 用量查询参数
export interface UsageQueryParams {
  apiKeyId?: number;
  model?: string;
  startTime?: string;
  endTime?: string;
  groupBy?: 'none' | 'model' | 'day' | 'hour';
}

// 用量汇总数据
export interface UsageSummaryData {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
  totalCost: number;
}

// 用量分组数据
export interface UsageGroupData {
  key: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
}

// 用量响应
export interface UsageResponse {
  summary: UsageSummaryData;
  groups: UsageGroupData[];
}
