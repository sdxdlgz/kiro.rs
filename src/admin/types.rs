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
#[serde(rename_all = "camelCase")]
pub struct AddAccountRequest {
    /// 账号名称（用于文件名）
    pub name: String,
    /// Access Token
    pub access_token: String,
    /// Refresh Token
    pub refresh_token: String,
    /// Profile ARN
    #[serde(default)]
    pub profile_arn: Option<String>,
    /// 过期时间 (ISO 8601)
    #[serde(default)]
    pub expires_at: Option<String>,
    /// 认证方式: "social" 或 "IdC"
    #[serde(default = "default_auth_method")]
    pub auth_method: String,
    /// 登录提供商: "Google", "Github", "BuilderId"
    #[serde(default)]
    pub provider: Option<String>,
    /// 是否加入轮换池
    #[serde(default = "default_true")]
    pub add_to_pool: bool,
}

fn default_auth_method() -> String {
    "social".to_string()
}

fn default_true() -> bool {
    true
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
