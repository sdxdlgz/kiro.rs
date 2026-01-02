//! Admin API 处理器

use std::path::PathBuf;
use std::sync::Arc;
use axum::{
    extract::State,
    Json,
};
use tokio::sync::RwLock;

use crate::kiro::account_pool::{AccountPool, AccountState};
use crate::kiro::model::credentials::KiroCredentials;
use crate::kiro::token_manager::TokenManager;
use crate::model::config::Config;

use super::types::*;

/// Admin API 状态
#[derive(Clone)]
pub struct AdminState {
    /// 账号池
    pub account_pool: Arc<RwLock<AccountPool>>,
    /// 配置
    pub config: Config,
    /// 凭证目录
    pub credentials_dir: PathBuf,
}

impl AdminState {
    pub fn new(account_pool: Arc<RwLock<AccountPool>>, config: Config, credentials_dir: PathBuf) -> Self {
        Self {
            account_pool,
            config,
            credentials_dir,
        }
    }
}

/// 获取轮换池状态
pub async fn get_pool_status(
    State(state): State<AdminState>,
) -> Json<ApiResponse<PoolStatus>> {
    let pool = state.account_pool.read().await;

    let mut accounts = Vec::new();
    let mut total_requests = 0u64;

    for account in pool.get_all_accounts() {
        let request_count = account.get_request_count();
        total_requests += request_count;

        let profile_arn = account.get_profile_arn().await;
        let tm = account.token_manager.read().await;
        let creds = tm.credentials();

        accounts.push(AccountInfo {
            name: account.name.clone(),
            healthy: account.is_healthy(),
            request_count,
            failure_count: account.failure_count.load(std::sync::atomic::Ordering::Relaxed),
            in_pool: true,
            profile_arn,
            auth_method: creds.auth_method.clone(),
            provider: creds.provider.clone(),
        });
    }

    let status = PoolStatus {
        total_accounts: pool.account_count(),
        healthy_accounts: pool.healthy_count(),
        total_requests,
        accounts,
    };

    Json(ApiResponse::success(status))
}

/// 获取所有账号列表
pub async fn get_accounts(
    State(state): State<AdminState>,
) -> Json<ApiResponse<Vec<AccountInfo>>> {
    let pool = state.account_pool.read().await;

    let mut accounts = Vec::new();

    for account in pool.get_all_accounts() {
        let profile_arn = account.get_profile_arn().await;
        let tm = account.token_manager.read().await;
        let creds = tm.credentials();

        accounts.push(AccountInfo {
            name: account.name.clone(),
            healthy: account.is_healthy(),
            request_count: account.get_request_count(),
            failure_count: account.failure_count.load(std::sync::atomic::Ordering::Relaxed),
            in_pool: true,
            profile_arn,
            auth_method: creds.auth_method.clone(),
            provider: creds.provider.clone(),
        });
    }

    Json(ApiResponse::success(accounts))
}

/// 添加账号
pub async fn add_account(
    State(state): State<AdminState>,
    Json(req): Json<AddAccountRequest>,
) -> Json<ApiResponse<AccountInfo>> {
    // 验证账号名称
    if req.name.is_empty() {
        return Json(ApiResponse::error("账号名称不能为空"));
    }

    // 验证 token
    if req.refresh_token.is_empty() {
        return Json(ApiResponse::error("Refresh Token 不能为空"));
    }

    // 创建凭证
    let credentials = KiroCredentials {
        access_token: Some(req.access_token),
        refresh_token: Some(req.refresh_token),
        profile_arn: req.profile_arn,
        expires_at: req.expires_at,
        auth_method: Some(req.auth_method.clone()),
        provider: req.provider.clone(),
        client_id: None,
        client_secret: None,
        start_url: None,
    };

    // 保存凭证文件
    let file_path = state.credentials_dir.join(format!("{}.json", req.name));

    if let Err(e) = credentials.save(&file_path) {
        return Json(ApiResponse::error(format!("保存凭证文件失败: {}", e)));
    }

    // 如果需要加入轮换池
    if req.add_to_pool {
        let token_manager = TokenManager::new(
            state.config.clone(),
            credentials.clone(),
            file_path,
        );

        let account_state = Arc::new(AccountState::new(req.name.clone(), token_manager));

        // 添加到池中
        let mut pool = state.account_pool.write().await;
        pool.add_account(account_state);

        tracing::info!("添加账号到轮换池: {}", req.name);
    }

    let account_info = AccountInfo {
        name: req.name,
        healthy: true,
        request_count: 0,
        failure_count: 0,
        in_pool: req.add_to_pool,
        profile_arn: credentials.profile_arn,
        auth_method: credentials.auth_method,
        provider: credentials.provider,
    };

    Json(ApiResponse::success(account_info))
}

/// 删除账号
pub async fn remove_account(
    State(state): State<AdminState>,
    Json(req): Json<RemoveAccountRequest>,
) -> Json<ApiResponse<()>> {
    // 从池中移除
    {
        let mut pool = state.account_pool.write().await;
        pool.remove_account(&req.name);
    }

    // 删除文件
    if req.delete_file {
        let file_path = state.credentials_dir.join(format!("{}.json", req.name));
        if file_path.exists() {
            if let Err(e) = std::fs::remove_file(&file_path) {
                return Json(ApiResponse::error(format!("删除凭证文件失败: {}", e)));
            }
        }
    }

    tracing::info!("删除账号: {} (删除文件: {})", req.name, req.delete_file);

    Json(ApiResponse::success(()))
}

/// 刷新账号 Token
pub async fn refresh_token(
    State(state): State<AdminState>,
    Json(req): Json<RefreshTokenRequest>,
) -> Json<ApiResponse<RefreshTokenResponse>> {
    let pool = state.account_pool.read().await;

    // 查找账号
    let account = pool.get_all_accounts()
        .iter()
        .find(|a| a.name == req.name)
        .cloned();

    drop(pool);

    let Some(account) = account else {
        return Json(ApiResponse::error(format!("账号不存在: {}", req.name)));
    };

    // 刷新 token
    match account.ensure_valid_token().await {
        Ok(_) => {
            account.mark_healthy();
            Json(ApiResponse::success(RefreshTokenResponse {
                success: true,
                message: Some("Token 刷新成功".to_string()),
            }))
        }
        Err(e) => {
            account.mark_unhealthy().await;
            Json(ApiResponse::error(format!("Token 刷新失败: {}", e)))
        }
    }
}

/// 获取配置信息
pub async fn get_config(
    State(state): State<AdminState>,
) -> Json<ApiResponse<ConfigInfo>> {
    let config = &state.config;

    let info = ConfigInfo {
        host: config.host.clone(),
        port: config.port,
        region: config.region.clone(),
        kiro_version: config.kiro_version.clone(),
        credentials_dir: config.credentials_dir.clone(),
        failure_cooldown_secs: config.failure_cooldown_secs,
        max_failures: config.max_failures,
    };

    Json(ApiResponse::success(info))
}

/// 重置账号状态（标记为健康）
pub async fn reset_account(
    State(state): State<AdminState>,
    Json(req): Json<RefreshTokenRequest>,
) -> Json<ApiResponse<()>> {
    let pool = state.account_pool.read().await;

    // 查找账号
    let account = pool.get_all_accounts()
        .iter()
        .find(|a| a.name == req.name)
        .cloned();

    let Some(account) = account else {
        return Json(ApiResponse::error(format!("账号不存在: {}", req.name)));
    };

    account.mark_healthy();
    tracing::info!("重置账号状态: {}", req.name);

    Json(ApiResponse::success(()))
}
