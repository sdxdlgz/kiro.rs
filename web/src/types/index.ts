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
