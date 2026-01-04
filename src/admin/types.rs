//! Admin API 类型定义

use serde::{Deserialize, Serialize};

/// 账号状态信息
#[derive(Debug, Clone, Serialize)]
pub struct AccountInfo {
    /// 账号名称
    pub name: String,
    /// 是否健康
    pub healthy: bool,
    /// 请求次数
    pub request_count: u64,
    /// 连续失败次数
    pub failure_count: u64,
    /// 是否在轮换池中
    pub in_pool: bool,
    /// Profile ARN
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_arn: Option<String>,
    /// 认证方式
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_method: Option<String>,
    /// 登录提供商
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// 用户邮箱
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}

/// 轮换池状态
#[derive(Debug, Clone, Serialize)]
pub struct PoolStatus {
    /// 总账号数
    pub total_accounts: usize,
    /// 健康账号数
    pub healthy_accounts: usize,
    /// 总请求数
    pub total_requests: u64,
    /// 账号列表
    pub accounts: Vec<AccountInfo>,
}

/// 添加账号请求
#[derive(Debug, Clone, Deserialize)]
pub struct AddAccountRequest {
    /// 账号名称（用于文件名）
    pub name: String,
    /// Access Token (可选)
    #[serde(rename = "accessToken")]
    pub access_token: Option<String>,
    /// Refresh Token
    #[serde(rename = "refreshToken")]
    pub refresh_token: String,
    /// CSRF Token
    #[serde(rename = "csrfToken")]
    pub csrf_token: Option<String>,
    /// OIDC Client ID
    #[serde(rename = "clientId")]
    pub client_id: Option<String>,
    /// OIDC Client Secret
    #[serde(rename = "clientSecret")]
    pub client_secret: Option<String>,
    /// Region
    pub region: Option<String>,
    /// Profile ARN
    #[serde(rename = "profileArn")]
    pub profile_arn: Option<String>,
    /// 过期时间 (ISO 8601)
    #[serde(rename = "expiresAt")]
    pub expires_at: Option<String>,
    /// 认证方式: "social" 或 "IdC"
    #[serde(rename = "authMethod")]
    pub auth_method: Option<String>,
    /// 登录提供商: "Google", "Github", "BuilderId"
    pub provider: Option<String>,
    /// 是否加入轮换池
    #[serde(rename = "addToPool")]
    pub add_to_pool: Option<bool>,
}

/// 添加账号响应
#[derive(Debug, Clone, Serialize)]
pub struct AddAccountResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account: Option<AccountInfo>,
}

/// 删除账号请求
#[derive(Debug, Clone, Deserialize)]
pub struct RemoveAccountRequest {
    /// 账号名称
    pub name: String,
    /// 是否删除凭证文件
    #[serde(default)]
    pub delete_file: bool,
}

/// 通用响应
#[derive(Debug, Clone, Serialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl<T> ApiResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message.into()),
        }
    }
}

/// 刷新 Token 请求
#[derive(Debug, Clone, Deserialize)]
pub struct RefreshTokenRequest {
    /// 账号名称
    pub name: String,
}

/// 刷新 Token 响应
#[derive(Debug, Clone, Serialize)]
pub struct RefreshTokenResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// 配置信息
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigInfo {
    pub host: String,
    pub port: u16,
    pub region: String,
    pub kiro_version: String,
    pub credentials_dir: Option<String>,
    pub failure_cooldown_secs: u64,
    pub max_failures: u64,
}

/// 检查账号请求
#[derive(Debug, Clone, Deserialize)]
pub struct CheckAccountRequest {
    /// 账号名称
    pub name: String,
}

/// 批量检查账号请求
#[derive(Debug, Clone, Deserialize)]
pub struct BatchCheckAccountRequest {
    /// 账号名称列表
    pub names: Vec<String>,
}

/// 检查账号响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckAccountResponse {
    /// 账号名称
    pub name: String,
    /// 是否健康
    pub healthy: bool,
    /// 订阅类型 (KIRO PRO+ / KIRO FREE 等)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription: Option<String>,
    /// 当前使用量
    pub current_usage: f64,
    /// 使用限额
    pub usage_limit: f64,
    /// 使用百分比
    pub usage_percent: f64,
    /// 下次重置日期 (Unix 时间戳)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_reset_date: Option<f64>,
    /// 错误信息
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// 批量检查账号响应
#[derive(Debug, Clone, Serialize)]
pub struct BatchCheckAccountResponse {
    /// 检查结果列表
    pub results: Vec<CheckAccountResponse>,
    /// 成功数量
    pub success_count: usize,
    /// 失败数量
    pub failed_count: usize,
}

/// SSO Token 导入请求
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSsoTokenRequest {
    /// 账号名称
    pub name: String,
    /// x-amz-sso_authn cookie 值
    pub sso_token: String,
    /// AWS Region (默认 us-east-1)
    #[serde(default = "default_region")]
    pub region: String,
    /// 是否加入轮换池
    #[serde(default = "default_true")]
    pub add_to_pool: bool,
}

fn default_region() -> String {
    "us-east-1".to_string()
}

fn default_true() -> bool {
    true
}

/// SSO Token 导入响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSsoTokenResponse {
    /// 账号信息
    pub account: AccountInfo,
    /// 邮箱
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
    /// 订阅类型
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subscription: Option<String>,
    /// 当前使用量
    pub current_usage: f64,
    /// 使用限额
    pub usage_limit: f64,
}

/// 获取账号凭证请求
#[derive(Debug, Clone, Deserialize)]
pub struct GetCredentialsRequest {
    /// 账号名称列表（为空则获取所有）
    #[serde(default)]
    pub names: Vec<String>,
}

/// 账号完整凭证（用于导出）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountCredentialsExport {
    /// 账号名称
    pub name: String,
    /// 是否健康
    pub healthy: bool,
    /// 请求次数
    pub request_count: u64,
    /// 连续失败次数
    pub failure_count: u64,
    /// 是否在轮换池中
    pub in_pool: bool,
    /// Profile ARN
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_arn: Option<String>,
    /// 认证方式
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_method: Option<String>,
    /// 登录提供商
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    /// Region
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    /// Access Token
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_token: Option<String>,
    /// Refresh Token
    #[serde(skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    /// CSRF Token
    #[serde(skip_serializing_if = "Option::is_none")]
    pub csrf_token: Option<String>,
    /// Client ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    /// Client Secret
    #[serde(skip_serializing_if = "Option::is_none")]
    pub client_secret: Option<String>,
    /// 过期时间 (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
}

// ============ API Key 管理 ============

/// 创建 API Key 请求
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateApiKeyRequest {
    /// API Key 名称
    pub name: String,
    /// 过期时间 (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    /// 速率限制（每分钟请求数）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rate_limit: Option<i64>,
}

/// 创建 API Key 响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateApiKeyResponse {
    /// API Key ID
    pub id: i64,
    /// 完整的 API Key（仅在创建时返回）
    pub key: String,
    /// API Key 名称
    pub name: String,
    /// 创建时间 (ISO 8601)
    pub created_at: String,
    /// 过期时间 (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    /// 速率限制
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rate_limit: Option<i64>,
}

/// API Key 列表项
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyListItem {
    /// API Key ID
    pub id: i64,
    /// API Key 前缀（用于显示）
    pub key_prefix: String,
    /// API Key 名称
    pub name: String,
    /// 是否启用
    pub enabled: bool,
    /// 创建时间 (ISO 8601)
    pub created_at: String,
    /// 过期时间 (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<String>,
    /// 速率限制
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rate_limit: Option<i64>,
}

/// 更新 API Key 请求
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateApiKeyRequest {
    /// API Key 名称
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// 是否启用
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,
    /// 速率限制
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rate_limit: Option<i64>,
}

// ============ 用量查询 ============

/// 用量查询参数
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageQueryParams {
    /// API Key ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key_id: Option<i64>,
    /// 模型名称
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// 开始时间 (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start_time: Option<String>,
    /// 结束时间 (ISO 8601)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_time: Option<String>,
    /// 分组方式: none, model, day, hour
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_by: Option<String>,
}

/// 用量统计摘要
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummaryData {
    /// 总请求数
    pub total_requests: i64,
    /// 总输入 tokens
    pub total_input_tokens: i64,
    /// 总输出 tokens
    pub total_output_tokens: i64,
    /// 总 tokens
    pub total_tokens: i64,
    /// 总费用
    pub total_cost: f64,
}

/// 用量分组数据
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageGroupData {
    /// 分组键（模型名称、日期或小时）
    pub key: String,
    /// 请求数
    pub requests: i64,
    /// 输入 tokens
    pub input_tokens: i64,
    /// 输出 tokens
    pub output_tokens: i64,
    /// 总 tokens
    pub total_tokens: i64,
    /// 费用
    pub cost: f64,
}

/// 用量查询响应
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageResponse {
    /// 统计摘要
    pub summary: UsageSummaryData,
    /// 分组数据
    pub groups: Vec<UsageGroupData>,
}
