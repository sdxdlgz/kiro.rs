//! Admin API 路由配置

use axum::{
    routing::{get, post},
    Router,
};
use tower_http::cors::{Any, CorsLayer};

use super::handlers::*;

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
        .layer(cors)
        .with_state(state)
}
