//! Anthropic API 中间件

use std::sync::Arc;

use axum::{
    body::Body,
    extract::State,
    http::{header, Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Json, Response},
};

use crate::db::Database;
use crate::kiro::provider::KiroProvider;

use super::types::ErrorResponse;

/// 已认证的 API Key 信息（存储在请求扩展中）
#[derive(Clone, Debug)]
pub struct AuthenticatedKey {
    /// API Key ID（数据库中的ID）
    pub id: i64,
    /// Key 名称
    pub name: String,
    /// 速率限制（可选）
    pub rate_limit: Option<i64>,
}

/// 应用共享状态
#[derive(Clone)]
pub struct AppState {
    /// 管理员 API 密钥（用于后向兼容和管理操作）
    pub admin_api_key: String,
    /// 数据库连接（用于多Key认证）
    pub database: Option<Arc<Database>>,
    /// Kiro Provider（可选，用于实际 API 调用）
    pub kiro_provider: Option<Arc<KiroProvider>>,
    /// Profile ARN（可选，用于请求）
    pub profile_arn: Option<String>,
}

impl AppState {
    /// 创建新的应用状态
    pub fn new(admin_api_key: impl Into<String>) -> Self {
        Self {
            admin_api_key: admin_api_key.into(),
            database: None,
            kiro_provider: None,
            profile_arn: None,
        }
    }

    /// 设置数据库连接
    pub fn with_database(mut self, db: Arc<Database>) -> Self {
        self.database = Some(db);
        self
    }

    /// 设置 KiroProvider
    pub fn with_kiro_provider(mut self, provider: KiroProvider) -> Self {
        self.kiro_provider = Some(Arc::new(provider));
        self
    }

    /// 设置 Profile ARN
    pub fn with_profile_arn(mut self, arn: impl Into<String>) -> Self {
        self.profile_arn = Some(arn.into());
        self
    }
}

/// 从请求中提取 API Key
///
/// 支持两种认证方式：
/// - `x-api-key` header
/// - `Authorization: Bearer <token>` header
fn extract_api_key(request: &Request<Body>) -> Option<String> {
    // 优先检查 x-api-key
    if let Some(key) = request
        .headers()
        .get("x-api-key")
        .and_then(|v| v.to_str().ok())
    {
        return Some(key.to_string());
    }

    // 其次检查 Authorization: Bearer
    request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.to_string())
}

/// 常量时间字符串比较，防止时序攻击
///
/// 无论字符串内容如何，比较所需的时间都是恒定的，
/// 这可以防止攻击者通过测量响应时间来猜测 API Key。
fn constant_time_eq(a: &str, b: &str) -> bool {
    let a_bytes = a.as_bytes();
    let b_bytes = b.as_bytes();

    // 长度不同时仍然遍历完整的比较，以保持恒定时间
    if a_bytes.len() != b_bytes.len() {
        // 遍历较长的字符串以保持恒定时间
        let max_len = a_bytes.len().max(b_bytes.len());
        let mut _dummy = 0u8;
        for i in 0..max_len {
            let x = a_bytes.get(i).copied().unwrap_or(0);
            let y = b_bytes.get(i).copied().unwrap_or(0);
            _dummy |= x ^ y;
        }
        return false;
    }

    let mut result = 0u8;
    for (x, y) in a_bytes.iter().zip(b_bytes.iter()) {
        result |= x ^ y;
    }
    result == 0
}

/// API Key 认证中间件
///
/// 认证优先级：
/// 1. 首先检查是否是管理员 API Key（后向兼容）
/// 2. 如果配置了数据库，则从数据库验证分发的 Key
pub async fn auth_middleware(
    State(state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    let key = match extract_api_key(&request) {
        Some(k) => k,
        None => {
            let error = ErrorResponse::authentication_error();
            return (StatusCode::UNAUTHORIZED, Json(error)).into_response();
        }
    };

    // 1. 首先检查是否是管理员 API Key（后向兼容）
    if constant_time_eq(&key, &state.admin_api_key) {
        // 管理员 Key，使用特殊的 AuthenticatedKey
        let auth_key = AuthenticatedKey {
            id: 0, // 管理员 Key 使用 ID 0
            name: "admin".to_string(),
            rate_limit: None,
        };
        request.extensions_mut().insert(auth_key);
        return next.run(request).await;
    }

    // 2. 如果配置了数据库，从数据库验证分发的 Key
    if let Some(ref db) = state.database {
        match crate::db::api_keys::verify_api_key(db, &key) {
            Ok(Some(key_info)) => {
                // Key 有效，将信息存入请求扩展
                let auth_key = AuthenticatedKey {
                    id: key_info.id,
                    name: key_info.name,
                    rate_limit: key_info.rate_limit,
                };
                request.extensions_mut().insert(auth_key);
                return next.run(request).await;
            }
            Ok(None) => {
                // Key 无效或已禁用/过期
                tracing::debug!("API Key 验证失败: Key 无效或已禁用");
            }
            Err(e) => {
                // 数据库错误
                tracing::error!("API Key 验证数据库错误: {}", e);
            }
        }
    }

    // 认证失败
    let error = ErrorResponse::authentication_error();
    (StatusCode::UNAUTHORIZED, Json(error)).into_response()
}

/// CORS 中间件层
///
/// **安全说明**：当前配置允许所有来源（Any），这是为了支持公开 API 服务。
/// 如果需要更严格的安全控制，请根据实际需求配置具体的允许来源、方法和头信息。
///
/// # 配置说明
/// - `allow_origin(Any)`: 允许任何来源的请求
/// - `allow_methods(Any)`: 允许任何 HTTP 方法
/// - `allow_headers(Any)`: 允许任何请求头
pub fn cors_layer() -> tower_http::cors::CorsLayer {
    use tower_http::cors::{Any, CorsLayer};

    CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any)
}
