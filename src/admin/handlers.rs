//! Admin API 处理器

use std::path::PathBuf;
use std::sync::Arc;
use axum::{
    extract::State,
    Json,
};
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};

use crate::admin::error_logs::{ApiErrorLogEntry, ApiErrorLogStore};
use crate::db::Database;
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
    /// 数据库连接（用于多Key分发和用量统计）
    pub database: Option<Arc<Database>>,
    /// 管理员 API Key（用于认证）
    pub admin_api_key: String,
    /// 错误日志存储
    pub error_log_store: Arc<RwLock<ApiErrorLogStore>>,
}

impl AdminState {
    pub fn new(
        account_pool: Arc<RwLock<AccountPool>>,
        config: Config,
        credentials_dir: PathBuf,
        database: Option<Arc<Database>>,
        admin_api_key: String,
    ) -> Self {
        Self {
            account_pool,
            config,
            credentials_dir,
            database,
            admin_api_key,
            error_log_store: Arc::new(RwLock::new(ApiErrorLogStore::new())),
        }
    }

    /// 设置错误日志存储（用于共享）
    pub fn with_error_log_store(mut self, store: Arc<RwLock<ApiErrorLogStore>>) -> Self {
        self.error_log_store = store;
        self
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
            email: creds.email.clone(),
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
            email: creds.email.clone(),
        });
    }

    Json(ApiResponse::success(accounts))
}

/// 添加账号
pub async fn add_account(
    State(state): State<AdminState>,
    Json(req): Json<AddAccountRequest>,
) -> Json<ApiResponse<AccountInfo>> {
    let AddAccountRequest {
        name,
        access_token,
        refresh_token,
        csrf_token,
        client_id,
        client_secret,
        region,
        profile_arn,
        expires_at,
        auth_method,
        provider,
        add_to_pool,
    } = req;

    // 验证账号名称
    if name.is_empty() {
        return Json(ApiResponse::error("账号名称不能为空"));
    }

    // 验证 token
    if refresh_token.is_empty() {
        return Json(ApiResponse::error("Refresh Token 不能为空"));
    }

    let add_to_pool = add_to_pool.unwrap_or(true);
    let auth_method = auth_method.unwrap_or_else(|| "social".to_string());

    // 创建凭证（先不设置 email）
    let mut credentials = KiroCredentials {
        access_token,
        refresh_token: Some(refresh_token),
        csrf_token,
        profile_arn,
        expires_at,
        auth_method: Some(auth_method),
        provider,
        region,
        client_id,
        client_secret,
        start_url: None,
        email: None,
    };

    // 保存凭证文件
    let file_path = state.credentials_dir.join(format!("{}.json", name));

    if let Err(e) = credentials.save(&file_path) {
        return Json(ApiResponse::error(format!("保存凭证文件失败: {}", e)));
    }

    // 尝试获取邮箱
    let mut email: Option<String> = None;
    if add_to_pool {
        let token_manager = TokenManager::new(
            state.config.clone(),
            credentials.clone(),
            file_path.clone(),
        );

        let account_state = Arc::new(AccountState::new(name.clone(), token_manager));

        // 尝试刷新 token 并获取邮箱
        if let Ok(_) = account_state.ensure_valid_token().await {
            // 获取刷新后的 access_token
            let tm = account_state.token_manager.read().await;
            if let Some(access_token) = tm.credentials().access_token.as_ref() {
                // 调用 API 获取邮箱
                if let Ok((fetched_email, _, _, _)) = get_user_usage(access_token).await {
                    if fetched_email.is_some() {
                        email = fetched_email.clone();
                        // 更新凭证中的邮箱
                        let mut creds = tm.credentials().clone();
                        creds.email = fetched_email;
                        drop(tm);
                        // 保存更新后的凭证
                        if let Err(e) = creds.save(&file_path) {
                            tracing::warn!("保存邮箱到凭证文件失败: {}", e);
                        } else {
                            credentials.email = creds.email;
                        }
                    }
                }
            }
        }

        // 添加到池中
        let mut pool = state.account_pool.write().await;
        pool.add_account(account_state);

        tracing::info!("添加账号到轮换池: {}", name);
    }

    let account_info = AccountInfo {
        name,
        healthy: true,
        request_count: 0,
        failure_count: 0,
        in_pool: add_to_pool,
        profile_arn: credentials.profile_arn,
        auth_method: credentials.auth_method,
        provider: credentials.provider,
        email,
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

/// 检查单个账号（获取使用额度和订阅信息）
pub async fn check_account(
    State(state): State<AdminState>,
    Json(req): Json<CheckAccountRequest>,
) -> Json<ApiResponse<CheckAccountResponse>> {
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

    // 获取使用额度
    let mut tm = account.token_manager.write().await;
    match tm.get_usage_limits().await {
        Ok(usage) => {
            let current_usage = usage.current_usage();
            let usage_limit = usage.usage_limit();
            let usage_ratio = if usage_limit > 0.0 {
                current_usage / usage_limit
            } else {
                f64::NAN
            };

            // 更新 usage_ratio 缓存
            account.set_usage_ratio(usage_ratio);

            let usage_percent = if usage_ratio.is_finite() {
                (usage_ratio * 100.0).min(100.0)
            } else {
                0.0
            };

            let response = CheckAccountResponse {
                name: req.name,
                healthy: account.is_healthy(),
                subscription: usage.subscription_title().map(|s| s.to_string()),
                current_usage,
                usage_limit,
                usage_percent,
                next_reset_date: usage.next_date_reset,
                error: None,
            };

            Json(ApiResponse::success(response))
        }
        Err(e) => {
            // 标记账号为不健康
            account.mark_unhealthy().await;

            let response = CheckAccountResponse {
                name: req.name,
                healthy: false,
                subscription: None,
                current_usage: 0.0,
                usage_limit: 0.0,
                usage_percent: 0.0,
                next_reset_date: None,
                error: Some(e.to_string()),
            };

            Json(ApiResponse::success(response))
        }
    }
}

/// 批量检查账号
pub async fn batch_check_accounts(
    State(state): State<AdminState>,
    Json(req): Json<BatchCheckAccountRequest>,
) -> Json<ApiResponse<BatchCheckAccountResponse>> {
    let pool = state.account_pool.read().await;
    let all_accounts = pool.get_all_accounts();

    // 过滤出请求的账号
    let accounts: Vec<_> = req.names.iter()
        .filter_map(|name| all_accounts.iter().find(|a| &a.name == name).cloned())
        .collect();

    drop(pool);

    let mut results = Vec::new();
    let mut success_count = 0;
    let mut failed_count = 0;

    for account in accounts {
        let mut tm = account.token_manager.write().await;
        match tm.get_usage_limits().await {
            Ok(usage) => {
                let current_usage = usage.current_usage();
                let usage_limit = usage.usage_limit();
                let usage_ratio = if usage_limit > 0.0 {
                    current_usage / usage_limit
                } else {
                    f64::NAN
                };

                // 更新 usage_ratio 缓存
                account.set_usage_ratio(usage_ratio);

                let usage_percent = if usage_ratio.is_finite() {
                    (usage_ratio * 100.0).min(100.0)
                } else {
                    0.0
                };

                results.push(CheckAccountResponse {
                    name: account.name.clone(),
                    healthy: account.is_healthy(),
                    subscription: usage.subscription_title().map(|s| s.to_string()),
                    current_usage,
                    usage_limit,
                    usage_percent,
                    next_reset_date: usage.next_date_reset,
                    error: None,
                });
                success_count += 1;
            }
            Err(e) => {
                account.mark_unhealthy().await;
                results.push(CheckAccountResponse {
                    name: account.name.clone(),
                    healthy: false,
                    subscription: None,
                    current_usage: 0.0,
                    usage_limit: 0.0,
                    usage_percent: 0.0,
                    next_reset_date: None,
                    error: Some(e.to_string()),
                });
                failed_count += 1;
            }
        }
    }

    // 添加未找到的账号
    for name in &req.names {
        if !results.iter().any(|r| &r.name == name) {
            results.push(CheckAccountResponse {
                name: name.clone(),
                healthy: false,
                subscription: None,
                current_usage: 0.0,
                usage_limit: 0.0,
                usage_percent: 0.0,
                next_reset_date: None,
                error: Some("账号不存在".to_string()),
            });
            failed_count += 1;
        }
    }

    Json(ApiResponse::success(BatchCheckAccountResponse {
        results,
        success_count,
        failed_count,
    }))
}

// ============ SSO Token 导入 ============

/// OIDC 客户端注册响应
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OidcRegisterResponse {
    client_id: String,
    client_secret: String,
}

/// 设备授权响应
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DeviceAuthResponse {
    device_code: String,
    user_code: String,
    #[serde(default)]
    interval: u64,
}

/// 设备会话响应
#[derive(Debug, Deserialize)]
struct DeviceSessionResponse {
    token: String,
}

/// 接受用户代码响应
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AcceptUserCodeResponse {
    device_context: Option<DeviceContext>,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeviceContext {
    device_context_id: Option<String>,
    client_id: Option<String>,
    client_type: Option<String>,
}

/// Token 响应
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    expires_in: Option<i64>,
}

/// Token 错误响应
#[derive(Debug, Deserialize)]
struct TokenErrorResponse {
    error: Option<String>,
}

/// 用户使用量 API 响应
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageApiResponse {
    user_info: Option<UsageUserInfo>,
    subscription_info: Option<SubscriptionInfo>,
    usage_breakdown_list: Option<Vec<UsageBreakdown>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageUserInfo {
    email: Option<String>,
    user_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SubscriptionInfo {
    subscription_title: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UsageBreakdown {
    resource_type: Option<String>,
    current_usage: Option<f64>,
    current_usage_with_precision: Option<f64>,
    usage_limit: Option<f64>,
    usage_limit_with_precision: Option<f64>,
}

/// 从 SSO Token 导入账号
pub async fn import_sso_token(
    State(state): State<AdminState>,
    Json(req): Json<ImportSsoTokenRequest>,
) -> Json<ApiResponse<ImportSsoTokenResponse>> {
    let ImportSsoTokenRequest {
        name,
        sso_token,
        region,
        add_to_pool,
    } = req;

    // 验证输入
    if name.is_empty() {
        return Json(ApiResponse::error("账号名称不能为空"));
    }
    if sso_token.is_empty() {
        return Json(ApiResponse::error("SSO Token 不能为空"));
    }

    // 执行 SSO 设备授权流程
    match sso_device_auth(&sso_token, &region).await {
        Ok(auth_result) => {
            // 获取用户使用量信息
            let (email, subscription, current_usage, usage_limit) =
                get_user_usage(&auth_result.access_token).await.unwrap_or((None, None, 0.0, 0.0));

            // 创建凭证
            let credentials = KiroCredentials {
                access_token: Some(auth_result.access_token),
                refresh_token: Some(auth_result.refresh_token),
                csrf_token: None,
                profile_arn: None,
                expires_at: auth_result.expires_in.map(|secs| {
                    (chrono::Utc::now() + chrono::Duration::seconds(secs)).to_rfc3339()
                }),
                auth_method: Some("IdC".to_string()),
                provider: Some("BuilderId".to_string()),
                region: Some(region),
                client_id: Some(auth_result.client_id),
                client_secret: Some(auth_result.client_secret),
                start_url: None,
                email: email.clone(),
            };

            // 保存凭证文件
            let file_path = state.credentials_dir.join(format!("{}.json", name));
            if let Err(e) = credentials.save(&file_path) {
                return Json(ApiResponse::error(format!("保存凭证文件失败: {}", e)));
            }

            // 如果需要加入轮换池
            if add_to_pool {
                let token_manager = TokenManager::new(
                    state.config.clone(),
                    credentials.clone(),
                    file_path,
                );

                let account_state = Arc::new(AccountState::new(name.clone(), token_manager));

                let mut pool = state.account_pool.write().await;
                pool.add_account(account_state);

                tracing::info!("SSO Token 导入成功，添加账号到轮换池: {}", name);
            }

            let account_info = AccountInfo {
                name,
                healthy: true,
                request_count: 0,
                failure_count: 0,
                in_pool: add_to_pool,
                profile_arn: None,
                auth_method: Some("IdC".to_string()),
                provider: Some("BuilderId".to_string()),
                email: email.clone(),
            };

            Json(ApiResponse::success(ImportSsoTokenResponse {
                account: account_info,
                email,
                subscription,
                current_usage,
                usage_limit,
            }))
        }
        Err(e) => Json(ApiResponse::error(e)),
    }
}

/// SSO 设备授权结果
struct SsoAuthResult {
    access_token: String,
    refresh_token: String,
    client_id: String,
    client_secret: String,
    expires_in: Option<i64>,
}

/// 执行 SSO 设备授权流程
async fn sso_device_auth(bearer_token: &str, region: &str) -> Result<SsoAuthResult, String> {
    let oidc_base = format!("https://oidc.{}.amazonaws.com", region);
    let portal_base = "https://portal.sso.us-east-1.amazonaws.com";
    let start_url = "https://view.awsapps.com/start";
    let scopes = vec![
        "codewhisperer:analysis",
        "codewhisperer:completions",
        "codewhisperer:conversations",
        "codewhisperer:taskassist",
        "codewhisperer:transformations",
    ];

    let client = reqwest::Client::new();

    // Step 1: 注册 OIDC 客户端
    tracing::info!("[SSO] Step 1: 注册 OIDC 客户端...");
    let reg_body = serde_json::json!({
        "clientName": "Kiro.rs Account Manager",
        "clientType": "public",
        "scopes": scopes,
        "grantTypes": ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
        "issuerUrl": start_url
    });

    let reg_res = client
        .post(format!("{}/client/register", oidc_base))
        .header("Content-Type", "application/json")
        .json(&reg_body)
        .send()
        .await
        .map_err(|e| format!("注册客户端请求失败: {}", e))?;

    if !reg_res.status().is_success() {
        return Err(format!("注册客户端失败: HTTP {}", reg_res.status()));
    }

    let reg_data: OidcRegisterResponse = reg_res
        .json()
        .await
        .map_err(|e| format!("解析注册响应失败: {}", e))?;

    let client_id = reg_data.client_id;
    let client_secret = reg_data.client_secret;
    tracing::info!("[SSO] 客户端注册成功");

    // Step 2: 发起设备授权
    tracing::info!("[SSO] Step 2: 发起设备授权...");
    let dev_body = serde_json::json!({
        "clientId": client_id,
        "clientSecret": client_secret,
        "startUrl": start_url
    });

    let dev_res = client
        .post(format!("{}/device_authorization", oidc_base))
        .header("Content-Type", "application/json")
        .json(&dev_body)
        .send()
        .await
        .map_err(|e| format!("设备授权请求失败: {}", e))?;

    if !dev_res.status().is_success() {
        return Err(format!("设备授权失败: HTTP {}", dev_res.status()));
    }

    let dev_data: DeviceAuthResponse = dev_res
        .json()
        .await
        .map_err(|e| format!("解析设备授权响应失败: {}", e))?;

    let device_code = dev_data.device_code;
    let user_code = dev_data.user_code;
    let mut interval = dev_data.interval.max(1);
    tracing::info!("[SSO] 设备授权成功，user_code: {}", user_code);

    // Step 3: 验证 Bearer Token (whoAmI)
    tracing::info!("[SSO] Step 3: 验证 Bearer Token...");
    let who_res = client
        .get(format!("{}/token/whoAmI", portal_base))
        .header("Authorization", format!("Bearer {}", bearer_token))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("Token 验证请求失败: {}", e))?;

    if !who_res.status().is_success() {
        return Err(format!("Token 验证失败: HTTP {} - 请确保 SSO Token 有效", who_res.status()));
    }
    tracing::info!("[SSO] Bearer Token 验证成功");

    // Step 4: 获取设备会话令牌
    tracing::info!("[SSO] Step 4: 获取设备会话令牌...");
    let sess_res = client
        .post(format!("{}/session/device", portal_base))
        .header("Authorization", format!("Bearer {}", bearer_token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({}))
        .send()
        .await
        .map_err(|e| format!("获取设备会话请求失败: {}", e))?;

    if !sess_res.status().is_success() {
        return Err(format!("获取设备会话失败: HTTP {}", sess_res.status()));
    }

    let sess_data: DeviceSessionResponse = sess_res
        .json()
        .await
        .map_err(|e| format!("解析设备会话响应失败: {}", e))?;

    let device_session_token = sess_data.token;
    tracing::info!("[SSO] 设备会话令牌获取成功");

    // Step 5: 接受用户代码
    tracing::info!("[SSO] Step 5: 接受用户代码...");
    let accept_body = serde_json::json!({
        "userCode": user_code,
        "userSessionId": device_session_token
    });

    let accept_res = client
        .post(format!("{}/device_authorization/accept_user_code", oidc_base))
        .header("Content-Type", "application/json")
        .header("Referer", "https://view.awsapps.com/")
        .json(&accept_body)
        .send()
        .await
        .map_err(|e| format!("接受用户代码请求失败: {}", e))?;

    if !accept_res.status().is_success() {
        return Err(format!("接受用户代码失败: HTTP {}", accept_res.status()));
    }

    let accept_data: AcceptUserCodeResponse = accept_res
        .json()
        .await
        .map_err(|e| format!("解析接受用户代码响应失败: {}", e))?;

    tracing::info!("[SSO] 用户代码接受成功");

    // Step 6: 批准授权
    if let Some(ref device_context) = accept_data.device_context {
        if device_context.device_context_id.is_some() {
            tracing::info!("[SSO] Step 6: 批准授权...");
            let approve_body = serde_json::json!({
                "deviceContext": {
                    "deviceContextId": device_context.device_context_id,
                    "clientId": device_context.client_id.as_ref().unwrap_or(&client_id),
                    "clientType": device_context.client_type.as_ref().unwrap_or(&"public".to_string())
                },
                "userSessionId": device_session_token
            });

            let approve_res = client
                .post(format!("{}/device_authorization/associate_token", oidc_base))
                .header("Content-Type", "application/json")
                .header("Referer", "https://view.awsapps.com/")
                .json(&approve_body)
                .send()
                .await
                .map_err(|e| format!("批准授权请求失败: {}", e))?;

            if !approve_res.status().is_success() {
                return Err(format!("批准授权失败: HTTP {}", approve_res.status()));
            }
            tracing::info!("[SSO] 授权批准成功");
        }
    }

    // Step 7: 轮询获取 Token
    tracing::info!("[SSO] Step 7: 轮询获取 Token...");
    let start_time = std::time::Instant::now();
    let timeout = std::time::Duration::from_secs(120);

    loop {
        if start_time.elapsed() > timeout {
            return Err("授权超时，请重试".to_string());
        }

        tokio::time::sleep(std::time::Duration::from_secs(interval)).await;

        let token_body = serde_json::json!({
            "clientId": client_id,
            "clientSecret": client_secret,
            "grantType": "urn:ietf:params:oauth:grant-type:device_code",
            "deviceCode": device_code
        });

        let token_res = client
            .post(format!("{}/token", oidc_base))
            .header("Content-Type", "application/json")
            .json(&token_body)
            .send()
            .await
            .map_err(|e| format!("获取 Token 请求失败: {}", e))?;

        if token_res.status().is_success() {
            let token_data: TokenResponse = token_res
                .json()
                .await
                .map_err(|e| format!("解析 Token 响应失败: {}", e))?;

            tracing::info!("[SSO] Token 获取成功!");
            return Ok(SsoAuthResult {
                access_token: token_data.access_token,
                refresh_token: token_data.refresh_token,
                client_id,
                client_secret,
                expires_in: token_data.expires_in,
            });
        }

        if token_res.status().as_u16() == 400 {
            let err_data: TokenErrorResponse = token_res
                .json()
                .await
                .unwrap_or(TokenErrorResponse { error: None });

            match err_data.error.as_deref() {
                Some("authorization_pending") => continue,
                Some("slow_down") => {
                    interval += 5;
                    continue;
                }
                Some(err) => return Err(format!("Token 获取失败: {}", err)),
                None => continue,
            }
        }
    }
}

/// 获取用户使用量信息
async fn get_user_usage(access_token: &str) -> Result<(Option<String>, Option<String>, f64, f64), String> {
    let client = reqwest::Client::new();

    // 使用 CBOR 格式调用 Kiro API
    let body = serde_json::json!({
        "isEmailRequired": true,
        "origin": "KIRO_IDE"
    });

    // 将 JSON 转换为 CBOR
    let cbor_body = serde_cbor::to_vec(&body).map_err(|e| format!("CBOR 编码失败: {}", e))?;

    let res = client
        .post("https://kiro.amazon.dev/GetUserUsageAndLimits")
        .header("accept", "application/cbor")
        .header("content-type", "application/cbor")
        .header("smithy-protocol", "rpc-v2-cbor")
        .header("authorization", format!("Bearer {}", access_token))
        .header("cookie", format!("Idp=BuilderId; AccessToken={}", access_token))
        .body(cbor_body)
        .send()
        .await
        .map_err(|e| format!("获取使用量请求失败: {}", e))?;

    if !res.status().is_success() {
        return Err(format!("获取使用量失败: HTTP {}", res.status()));
    }

    let cbor_data = res.bytes().await.map_err(|e| format!("读取响应失败: {}", e))?;
    let usage_data: UsageApiResponse = serde_cbor::from_slice(&cbor_data)
        .map_err(|e| format!("解析 CBOR 响应失败: {}", e))?;

    let email = usage_data.user_info.and_then(|u| u.email);
    let subscription = usage_data.subscription_info.and_then(|s| s.subscription_title);

    let (current_usage, usage_limit) = usage_data
        .usage_breakdown_list
        .and_then(|list| {
            list.into_iter()
                .find(|b| b.resource_type.as_deref() == Some("CREDIT"))
                .map(|b| {
                    let current = b.current_usage_with_precision.or(b.current_usage).unwrap_or(0.0);
                    let limit = b.usage_limit_with_precision.or(b.usage_limit).unwrap_or(0.0);
                    (current, limit)
                })
        })
        .unwrap_or((0.0, 0.0));

    Ok((email, subscription, current_usage, usage_limit))
}

/// 获取账号完整凭证（用于导出）
pub async fn get_credentials(
    State(state): State<AdminState>,
    Json(req): Json<GetCredentialsRequest>,
) -> Json<ApiResponse<Vec<AccountCredentialsExport>>> {
    let pool = state.account_pool.read().await;
    let all_accounts = pool.get_all_accounts();

    // 过滤账号
    let accounts: Vec<Arc<AccountState>> = if req.names.is_empty() {
        all_accounts.to_vec()
    } else {
        all_accounts.iter()
            .filter(|a| req.names.contains(&a.name))
            .cloned()
            .collect()
    };

    drop(pool);

    let mut results = Vec::new();

    for account in accounts {
        let profile_arn = account.get_profile_arn().await;
        let tm = account.token_manager.read().await;
        let creds = tm.credentials();

        results.push(AccountCredentialsExport {
            name: account.name.clone(),
            healthy: account.is_healthy(),
            request_count: account.get_request_count(),
            failure_count: account.failure_count.load(std::sync::atomic::Ordering::Relaxed),
            in_pool: true,
            profile_arn,
            auth_method: creds.auth_method.clone(),
            provider: creds.provider.clone(),
            region: creds.region.clone(),
            access_token: creds.access_token.clone(),
            refresh_token: creds.refresh_token.clone(),
            csrf_token: creds.csrf_token.clone(),
            client_id: creds.client_id.clone(),
            client_secret: creds.client_secret.clone(),
            expires_at: creds.expires_at.clone(),
        });
    }

    Json(ApiResponse::success(results))
}

// ============ API Key 管理 ============

/// 创建新的 API Key
pub async fn create_api_key(
    State(state): State<AdminState>,
    Json(req): Json<CreateApiKeyRequest>,
) -> Json<ApiResponse<CreateApiKeyResponse>> {
    // 检查数据库是否存在
    let Some(db) = &state.database else {
        return Json(ApiResponse::error("数据库未配置"));
    };

    // 验证名称
    if req.name.is_empty() {
        return Json(ApiResponse::error("API Key 名称不能为空"));
    }

    // 解析过期时间
    let expires_at = if let Some(expires_str) = req.expires_at {
        match chrono::DateTime::parse_from_rfc3339(&expires_str) {
            Ok(dt) => Some(dt.with_timezone(&chrono::Utc)),
            Err(_) => {
                return Json(ApiResponse::error("过期时间格式无效，请使用 ISO 8601 格式"));
            }
        }
    } else {
        None
    };

    // 创建 API Key
    match crate::db::api_keys::create_api_key(db, req.name.clone(), expires_at, req.rate_limit) {
        Ok((id, full_key)) => {
            // 获取创建的 Key 信息
            match crate::db::api_keys::get_api_key_by_id(db, id) {
                Ok(Some(key_info)) => {
                    let response = CreateApiKeyResponse {
                        id: key_info.id,
                        key: full_key,
                        name: key_info.name,
                        created_at: key_info.created_at.to_rfc3339(),
                        expires_at: key_info.expires_at.map(|dt| dt.to_rfc3339()),
                        rate_limit: key_info.rate_limit,
                    };
                    Json(ApiResponse::success(response))
                }
                Ok(None) => Json(ApiResponse::error("创建成功但无法获取 Key 信息")),
                Err(e) => Json(ApiResponse::error(format!("获取 Key 信息失败: {}", e))),
            }
        }
        Err(e) => Json(ApiResponse::error(format!("创建 API Key 失败: {}", e))),
    }
}

/// 获取所有 API Key 列表
pub async fn list_api_keys(
    State(state): State<AdminState>,
) -> Json<ApiResponse<Vec<ApiKeyListItem>>> {
    // 检查数据库是否存在
    let Some(db) = &state.database else {
        return Json(ApiResponse::error("数据库未配置"));
    };

    match crate::db::api_keys::list_api_keys(db) {
        Ok(keys) => {
            let items: Vec<ApiKeyListItem> = keys
                .into_iter()
                .map(|key| ApiKeyListItem {
                    id: key.id,
                    key_prefix: key.key_prefix,
                    name: key.name,
                    enabled: key.enabled,
                    created_at: key.created_at.to_rfc3339(),
                    expires_at: key.expires_at.map(|dt| dt.to_rfc3339()),
                    rate_limit: key.rate_limit,
                })
                .collect();
            Json(ApiResponse::success(items))
        }
        Err(e) => Json(ApiResponse::error(format!("获取 API Key 列表失败: {}", e))),
    }
}

/// 更新 API Key
pub async fn update_api_key(
    State(state): State<AdminState>,
    axum::extract::Path(id): axum::extract::Path<i64>,
    Json(req): Json<UpdateApiKeyRequest>,
) -> Json<ApiResponse<ApiKeyListItem>> {
    // 检查数据库是否存在
    let Some(db) = &state.database else {
        return Json(ApiResponse::error("数据库未配置"));
    };

    // 构建更新参数
    let updates = crate::db::api_keys::ApiKeyUpdate {
        name: req.name,
        enabled: req.enabled,
        rate_limit: req.rate_limit.map(Some),
        expires_at: None,
    };

    // 更新 API Key
    match crate::db::api_keys::update_api_key(db, id, updates) {
        Ok(true) => {
            // 获取更新后的信息
            match crate::db::api_keys::get_api_key_by_id(db, id) {
                Ok(Some(key_info)) => {
                    let item = ApiKeyListItem {
                        id: key_info.id,
                        key_prefix: key_info.key_prefix,
                        name: key_info.name,
                        enabled: key_info.enabled,
                        created_at: key_info.created_at.to_rfc3339(),
                        expires_at: key_info.expires_at.map(|dt| dt.to_rfc3339()),
                        rate_limit: key_info.rate_limit,
                    };
                    Json(ApiResponse::success(item))
                }
                Ok(None) => Json(ApiResponse::error("更新成功但无法获取 Key 信息")),
                Err(e) => Json(ApiResponse::error(format!("获取 Key 信息失败: {}", e))),
            }
        }
        Ok(false) => Json(ApiResponse::error("API Key 不存在")),
        Err(e) => Json(ApiResponse::error(format!("更新 API Key 失败: {}", e))),
    }
}

/// 删除 API Key（软删除）
pub async fn delete_api_key(
    State(state): State<AdminState>,
    axum::extract::Path(id): axum::extract::Path<i64>,
) -> Json<ApiResponse<()>> {
    // 检查数据库是否存在
    let Some(db) = &state.database else {
        return Json(ApiResponse::error("数据库未配置"));
    };

    match crate::db::api_keys::delete_api_key(db, id) {
        Ok(true) => {
            tracing::info!("软删除 API Key: {} (用量记录已保留)", id);
            Json(ApiResponse::success(()))
        }
        Ok(false) => Json(ApiResponse::error("API Key 不存在或已删除")),
        Err(e) => Json(ApiResponse::error(format!("删除 API Key 失败: {}", e))),
    }
}

// ============ 用量查询 ============

/// 查询用量统计
pub async fn query_usage(
    State(state): State<AdminState>,
    axum::extract::Query(params): axum::extract::Query<UsageQueryParams>,
) -> Json<ApiResponse<UsageResponse>> {
    // 检查数据库是否存在
    let Some(db) = &state.database else {
        return Json(ApiResponse::error("数据库未配置"));
    };

    // 解析时间参数
    let start_time = if let Some(start_str) = params.start_time {
        match chrono::DateTime::parse_from_rfc3339(&start_str) {
            Ok(dt) => Some(dt.with_timezone(&chrono::Utc)),
            Err(_) => {
                return Json(ApiResponse::error("开始时间格式无效，请使用 ISO 8601 格式"));
            }
        }
    } else {
        None
    };

    let end_time = if let Some(end_str) = params.end_time {
        match chrono::DateTime::parse_from_rfc3339(&end_str) {
            Ok(dt) => Some(dt.with_timezone(&chrono::Utc)),
            Err(_) => {
                return Json(ApiResponse::error("结束时间格式无效，请使用 ISO 8601 格式"));
            }
        }
    } else {
        None
    };

    // 解析分组方式
    let group_by = match params.group_by.as_deref() {
        Some("model") => crate::db::usage::GroupBy::Model,
        Some("day") => crate::db::usage::GroupBy::Day,
        Some("hour") => crate::db::usage::GroupBy::Hour,
        Some("none") | None => crate::db::usage::GroupBy::None,
        Some(other) => {
            return Json(ApiResponse::error(format!(
                "无效的分组方式: {}，支持的值: none, model, day, hour",
                other
            )));
        }
    };

    // 加载价格配置
    let price_config = match crate::model::price::PriceConfig::load("price.json") {
        Ok(config) => config,
        Err(e) => {
            tracing::warn!("加载价格配置失败，使用默认配置: {}", e);
            crate::model::price::PriceConfig::default()
        }
    };

    // 查询用量统计
    match crate::db::usage::aggregate_usage(
        db,
        params.api_key_id,
        params.model.clone(),
        start_time,
        end_time,
        group_by,
    ) {
        Ok(summary) => {
            // 使用带模型信息的查询来计算费用
            let groups_with_model = crate::db::usage::aggregate_usage_with_model(
                db,
                params.api_key_id,
                params.model,
                start_time,
                end_time,
                group_by,
            ).unwrap_or_default();

            // 计算每个分组的费用（按 key 汇总）
            use std::collections::HashMap;
            let mut cost_by_key: HashMap<String, f64> = HashMap::new();
            let mut total_cost = 0.0;

            for group in &groups_with_model {
                let cost = price_config
                    .calculate_cost(&group.model, group.input_tokens as u64, group.output_tokens as u64)
                    .unwrap_or(0.0);
                *cost_by_key.entry(group.key.clone()).or_insert(0.0) += cost;
                total_cost += cost;
            }

            // 构建分组数据
            let groups: Vec<UsageGroupData> = summary
                .groups
                .into_iter()
                .map(|group| {
                    let cost = cost_by_key.get(&group.key).copied().unwrap_or(0.0);
                    UsageGroupData {
                        key: group.key,
                        requests: group.requests,
                        input_tokens: group.input_tokens,
                        output_tokens: group.output_tokens,
                        total_tokens: group.total_tokens,
                        cost,
                    }
                })
                .collect();

            let response = UsageResponse {
                summary: UsageSummaryData {
                    total_requests: summary.total_requests,
                    total_input_tokens: summary.total_input_tokens,
                    total_output_tokens: summary.total_output_tokens,
                    total_tokens: summary.total_tokens,
                    total_cost,
                },
                groups,
            };

            Json(ApiResponse::success(response))
        }
        Err(e) => Json(ApiResponse::error(format!("查询用量统计失败: {}", e))),
    }
}

// ============ 用量导出 ============

use axum::{
    http::{header, StatusCode},
    response::{IntoResponse, Response},
};
use rust_xlsxwriter::{Workbook, Format};

/// 导出用量记录为 XLSX 文件
pub async fn export_usage(
    State(state): State<AdminState>,
    axum::extract::Query(params): axum::extract::Query<UsageQueryParams>,
) -> Response {
    // 检查数据库是否存在
    let Some(db) = &state.database else {
        return (StatusCode::INTERNAL_SERVER_ERROR, "数据库未配置").into_response();
    };

    // 解析时间参数
    let start_time = if let Some(start_str) = params.start_time {
        match chrono::DateTime::parse_from_rfc3339(&start_str) {
            Ok(dt) => Some(dt.with_timezone(&chrono::Utc)),
            Err(_) => {
                return (StatusCode::BAD_REQUEST, "开始时间格式无效").into_response();
            }
        }
    } else {
        None
    };

    let end_time = if let Some(end_str) = params.end_time {
        match chrono::DateTime::parse_from_rfc3339(&end_str) {
            Ok(dt) => Some(dt.with_timezone(&chrono::Utc)),
            Err(_) => {
                return (StatusCode::BAD_REQUEST, "结束时间格式无效").into_response();
            }
        }
    } else {
        None
    };

    // 构建查询过滤器
    let filters = crate::db::usage::UsageFilters {
        api_key_id: params.api_key_id,
        model: params.model,
        start_time,
        end_time,
        limit: None,
        offset: None,
    };

    // 查询用量记录
    let records = match crate::db::usage::query_usage_for_export(db, filters) {
        Ok(records) => records,
        Err(e) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, format!("查询失败: {}", e)).into_response();
        }
    };

    // 加载价格配置
    let price_config = match crate::model::price::PriceConfig::load("price.json") {
        Ok(config) => config,
        Err(_) => crate::model::price::PriceConfig::default(),
    };

    // 创建 XLSX 工作簿
    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();

    // 设置表头格式
    let header_format = Format::new()
        .set_bold()
        .set_background_color(rust_xlsxwriter::Color::RGB(0x4472C4))
        .set_font_color(rust_xlsxwriter::Color::White);

    // 设置费用列格式（6位小数）
    let cost_format = Format::new().set_num_format("0.000000");

    // 写入表头
    let headers = ["请求时间", "Key名称", "模型", "输入Token", "输出Token", "总Token", "费用($)", "请求ID"];
    for (col, header) in headers.iter().enumerate() {
        if let Err(e) = worksheet.write_string_with_format(0, col as u16, *header, &header_format) {
            tracing::error!("写入表头失败: {}", e);
        }
    }

    // 写入数据
    for (row, record) in records.iter().enumerate() {
        let row = (row + 1) as u32;
        let total_tokens = record.input_tokens + record.output_tokens;
        let cost = price_config
            .calculate_cost(&record.model, record.input_tokens as u64, record.output_tokens as u64)
            .unwrap_or(0.0);

        let _ = worksheet.write_string(row, 0, record.request_time.format("%Y-%m-%d %H:%M:%S").to_string());
        let _ = worksheet.write_string(row, 1, &record.key_name);
        let _ = worksheet.write_string(row, 2, &record.model);
        let _ = worksheet.write_number(row, 3, record.input_tokens as f64);
        let _ = worksheet.write_number(row, 4, record.output_tokens as f64);
        let _ = worksheet.write_number(row, 5, total_tokens as f64);
        let _ = worksheet.write_number_with_format(row, 6, cost, &cost_format);
        let _ = worksheet.write_string(row, 7, record.request_id.as_deref().unwrap_or(""));
    }

    // 设置列宽
    let _ = worksheet.set_column_width(0, 20.0); // 请求时间
    let _ = worksheet.set_column_width(1, 15.0); // Key名称
    let _ = worksheet.set_column_width(2, 30.0); // 模型
    let _ = worksheet.set_column_width(3, 12.0); // 输入Token
    let _ = worksheet.set_column_width(4, 12.0); // 输出Token
    let _ = worksheet.set_column_width(5, 12.0); // 总Token
    let _ = worksheet.set_column_width(6, 12.0); // 费用
    let _ = worksheet.set_column_width(7, 40.0); // 请求ID

    // 保存到内存缓冲区
    let buffer = match workbook.save_to_buffer() {
        Ok(buf) => buf,
        Err(e) => {
            return (StatusCode::INTERNAL_SERVER_ERROR, format!("生成文件失败: {}", e)).into_response();
        }
    };

    // 生成文件名
    let filename = format!("usage-{}.xlsx", chrono::Utc::now().format("%Y%m%d-%H%M%S"));

    // 返回文件
    (
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
            (header::CONTENT_DISPOSITION, &format!("attachment; filename=\"{}\"", filename)),
        ],
        buffer,
    ).into_response()
}

// ============ 错误日志 ============

/// 获取错误日志列表
pub async fn get_error_logs(
    State(state): State<AdminState>,
) -> Json<ApiResponse<Vec<ApiErrorLogEntry>>> {
    let store = state.error_log_store.read().await;
    let logs = store.get_logs();
    Json(ApiResponse::success(logs))
}

/// 清空错误日志
pub async fn clear_error_logs(
    State(state): State<AdminState>,
) -> Json<ApiResponse<()>> {
    let mut store = state.error_log_store.write().await;
    store.clear();

    // 保存到文件
    if let Err(e) = store.save_to_file() {
        tracing::warn!("保存错误日志失败: {}", e);
    }

    Json(ApiResponse::success(()))
}

