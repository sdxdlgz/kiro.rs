// 账号信息
export interface AccountInfo {
  name: string;
  healthy: boolean;
  request_count: number;
  failure_count: number;
  in_pool: boolean;
  profile_arn?: string;
  auth_method?: string;
  provider?: string;
}

// 轮换池状态
export interface PoolStatus {
  total_accounts: number;
  healthy_accounts: number;
  total_requests: number;
  accounts: AccountInfo[];
}

// 添加账号请求
export interface AddAccountRequest {
  name: string;
  accessToken: string;
  refreshToken: string;
  profileArn?: string;
  expiresAt?: string;
  authMethod?: string;
  provider?: string;
  addToPool?: boolean;
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
