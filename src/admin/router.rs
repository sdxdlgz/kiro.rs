//! Admin API 路由配置

use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post, put, delete},
    Router,
};
use tower_http::cors::{Any, CorsLayer};

use super::handlers::*;

/// Admin API 认证中间件
async fn admin_auth_middleware(
    State(state): State<AdminState>,
    request: Request<Body>,
    next: Next,
) -> Response {
    // 从请求头获取 API Key
    let auth_header = request
        .headers()
        .get("x-api-key")
        .or_else(|| request.headers().get("authorization"))
        .and_then(|v| v.to_str().ok());

    let api_key = match auth_header {
        Some(key) => {
            // 支持 "Bearer xxx" 格式
            if key.starts_with("Bearer ") {
                key.trim_start_matches("Bearer ").to_string()
            } else {
                key.to_string()
            }
        }
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                "Missing API Key. Use x-api-key header or Authorization: Bearer <key>",
            )
                .into_response();
        }
    };

    // 验证 API Key（使用常量时间比较防止时序攻击）
    if !constant_time_eq(&api_key, &state.admin_api_key) {
        return (StatusCode::UNAUTHORIZED, "Invalid API Key").into_response();
    }

    next.run(request).await
}

/// 常量时间字符串比较（防止时序攻击）
fn constant_time_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.bytes()
        .zip(b.bytes())
        .fold(0, |acc, (a, b)| acc | (a ^ b))
        == 0
}

/// 创建 Admin API 路由
pub fn create_admin_router(state: AdminState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        // 轮换池状态
        .route("/pool/status", get(get_pool_status))
        // 账号管理
        .route("/accounts", get(get_accounts))
        .route("/accounts", post(add_account))
        .route("/accounts/remove", post(remove_account))
        .route("/accounts/refresh", post(refresh_token))
        .route("/accounts/reset", post(reset_account))
        .route("/accounts/check", post(check_account))
        .route("/accounts/batch-check", post(batch_check_accounts))
        .route("/accounts/import-sso", post(import_sso_token))
        .route("/accounts/credentials", post(get_credentials))
        // 配置
        .route("/config", get(get_config))
        // API Key 管理
        .route("/api-keys", get(list_api_keys).post(create_api_key))
        .route("/api-keys/{id}", put(update_api_key).delete(delete_api_key))
        // 用量查询
        .route("/usage", get(query_usage))
        .route("/usage/export", get(export_usage))
        .layer(middleware::from_fn_with_state(state.clone(), admin_auth_middleware))
        .layer(cors)
        .with_state(state)
}
