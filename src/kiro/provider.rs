//! Kiro API Provider
//!
//! 核心组件，负责与 Kiro API 通信
//! 支持流式和非流式请求，支持多账号轮询

use std::sync::Arc;
use chrono::Utc;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONNECTION, CONTENT_TYPE, HOST};
use reqwest::Client;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::admin::error_logs::{ApiErrorLogEntry, ApiErrorLogStore, ApiErrorType};
use crate::kiro::account_pool::AccountPool;
use crate::kiro::machine_id;
use crate::kiro::model::credentials::KiroCredentials;
use crate::model::config::Config;

/// 每个凭据最大重试次数
const MAX_RETRIES_PER_CREDENTIAL: usize = 3;
/// 总重试次数硬上限
const MAX_TOTAL_RETRIES: usize = 9;

/// Kiro API Provider
///
/// 核心组件，负责与 Kiro API 通信
/// 支持多账号轮询和故障转移
pub struct KiroProvider {
    account_pool: Arc<RwLock<AccountPool>>,
    client: Client,
    error_log_store: Arc<RwLock<ApiErrorLogStore>>,
}

impl KiroProvider {
    /// 创建新的 KiroProvider 实例（多账号模式）
    pub fn new(account_pool: AccountPool) -> Self {
        Self {
            account_pool: Arc::new(RwLock::new(account_pool)),
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(720)) // 12 分钟超时
                .build()
                .expect("Failed to create HTTP client"),
            error_log_store: Arc::new(RwLock::new(ApiErrorLogStore::new())),
        }
    }

    /// 设置错误日志存储（用于共享）
    pub fn with_error_log_store(mut self, store: Arc<RwLock<ApiErrorLogStore>>) -> Self {
        self.error_log_store = store;
        self
    }

    /// 获取错误日志存储的引用
    pub fn get_error_log_store(&self) -> Arc<RwLock<ApiErrorLogStore>> {
        self.error_log_store.clone()
    }

    /// 记录 API 错误
    async fn record_api_error(
        &self,
        account_name: &str,
        status_code: u16,
        message: &str,
        is_stream: bool,
    ) {
        let entry = ApiErrorLogEntry {
            timestamp: Utc::now(),
            account_name: account_name.to_string(),
            status_code,
            error_type: ApiErrorType::from_status_code(status_code),
            message: message.to_string(),
            is_stream,
        };

        let mut store = self.error_log_store.write().await;
        store.add_log(entry);

        // 异步保存到文件（忽略错误）
        if let Err(e) = store.save_to_file() {
            tracing::warn!("保存错误日志失败: {}", e);
        }
    }

    /// 获取 API 基础 URL
    fn base_url(&self, config: &Config) -> String {
        format!(
            "https://q.{}.amazonaws.com/generateAssistantResponse",
            config.region
        )
    }

    /// 获取 API 基础域名
    fn base_domain(&self, config: &Config) -> String {
        format!("q.{}.amazonaws.com", config.region)
    }

    /// 构建请求头
    fn build_headers(
        &self,
        token: &str,
        credentials: &KiroCredentials,
        config: &Config,
    ) -> anyhow::Result<HeaderMap> {
        let machine_id = machine_id::generate_from_credentials(credentials, config)
            .ok_or_else(|| anyhow::anyhow!("无法生成 machine_id，请检查凭证配置"))?;

        let kiro_version = &config.kiro_version;
        let os_name = &config.system_version;
        let node_version = &config.node_version;

        let x_amz_user_agent = format!("aws-sdk-js/1.0.27 KiroIDE-{}-{}", kiro_version, machine_id);

        let user_agent = format!(
            "aws-sdk-js/1.0.27 ua/2.1 os/{} lang/js md/nodejs#{} api/codewhispererstreaming#1.0.27 m/E KiroIDE-{}-{}",
            os_name, node_version, kiro_version, machine_id
        );

        let mut headers = HeaderMap::new();

        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(
            "x-amzn-codewhisperer-optout",
            HeaderValue::from_static("true"),
        );
        headers.insert("x-amzn-kiro-agent-mode", HeaderValue::from_static("vibe"));
        headers.insert(
            "x-amz-user-agent",
            HeaderValue::from_str(&x_amz_user_agent).unwrap(),
        );
        headers.insert(
            reqwest::header::USER_AGENT,
            HeaderValue::from_str(&user_agent).unwrap(),
        );
        headers.insert(HOST, HeaderValue::from_str(&self.base_domain(config)).unwrap());
        headers.insert(
            "amz-sdk-invocation-id",
            HeaderValue::from_str(&Uuid::new_v4().to_string()).unwrap(),
        );
        headers.insert(
            "amz-sdk-request",
            HeaderValue::from_static("attempt=1; max=3"),
        );
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", token)).unwrap(),
        );
        headers.insert(CONNECTION, HeaderValue::from_static("close"));

        Ok(headers)
    }

    /// 获取一个可用账号并执行请求（带重试逻辑）
    ///
    /// 重试策略：
    /// - 每个凭据最多重试 3 次
    /// - 总重试次数上限 9 次
    /// - 429 错误不计入失败次数，继续重试
    /// - 400 错误直接返回，不重试
    async fn call_api_with_retry(
        &self,
        request_body: &str,
        is_stream: bool,
    ) -> anyhow::Result<reqwest::Response> {
        let pool = self.account_pool.read().await;
        let total_credentials = pool.account_count();
        let config = pool.config().clone();
        drop(pool); // 释放读锁

        let max_retries = (total_credentials * MAX_RETRIES_PER_CREDENTIAL).min(MAX_TOTAL_RETRIES);
        let mut last_error: Option<anyhow::Error> = None;

        for attempt in 0..max_retries {
            // 1. 获取可用账号
            let pool = self.account_pool.read().await;
            let account = match pool.get_least_used_account().await {
                Some(a) => a,
                None => {
                    drop(pool);
                    // 所有凭据都不可用
                    return Err(last_error.unwrap_or_else(|| {
                        anyhow::anyhow!("所有凭据均已禁用或不可用")
                    }));
                }
            };
            drop(pool); // 释放读锁

            account.increment_request();
            tracing::debug!(
                "使用账号: {} (尝试 {}/{}, 请求次数: {})",
                account.name,
                attempt + 1,
                max_retries,
                account.get_request_count()
            );

            // 2. 获取 token
            let token = match account.ensure_valid_token().await {
                Ok(t) => t,
                Err(e) => {
                    tracing::warn!(
                        "账号 {} Token 获取失败（尝试 {}/{}）: {}",
                        account.name,
                        attempt + 1,
                        max_retries,
                        e
                    );
                    account.mark_unhealthy().await;
                    last_error = Some(e);
                    continue;
                }
            };

            // 3. 获取凭证并构建请求
            let credentials = {
                let tm = account.token_manager.read().await;
                tm.credentials().clone()
            };

            let headers = match self.build_headers(&token, &credentials, &config) {
                Ok(h) => h,
                Err(e) => {
                    last_error = Some(e);
                    continue;
                }
            };

            let url = self.base_url(&config);

            // 4. 发送请求
            let response = match self
                .client
                .post(&url)
                .headers(headers)
                .body(request_body.to_string())
                .send()
                .await
            {
                Ok(resp) => resp,
                Err(e) => {
                    tracing::warn!(
                        "账号 {} 请求发送失败（尝试 {}/{}）: {}",
                        account.name,
                        attempt + 1,
                        max_retries,
                        e
                    );
                    account.mark_unhealthy().await;
                    last_error = Some(e.into());
                    continue;
                }
            };

            let status = response.status();

            // 5. 成功响应
            if status.is_success() {
                account.mark_healthy();
                return Ok(response);
            }

            // 6. 400 Bad Request - 客户端错误，不重试，直接返回
            if status.as_u16() == 400 {
                let body = response.text().await.unwrap_or_default();
                // 记录错误日志
                self.record_api_error(&account.name, 400, &body, is_stream).await;
                anyhow::bail!(
                    "{} API 请求失败 (400 Bad Request): {}",
                    if is_stream { "流式" } else { "非流式" },
                    body
                );
            }

            // 7. 429 Too Many Requests - 限流错误，不计入失败次数，继续重试
            if status.as_u16() == 429 {
                let body = response.text().await.unwrap_or_default();
                tracing::warn!(
                    "账号 {} API 请求被限流（尝试 {}/{}）: {} {}",
                    account.name,
                    attempt + 1,
                    max_retries,
                    status,
                    body
                );
                // 记录错误日志
                self.record_api_error(&account.name, 429, &body, is_stream).await;
                // 注意：429 不调用 mark_unhealthy()，不禁用凭据
                last_error = Some(anyhow::anyhow!(
                    "{} API 请求被限流: {} {}",
                    if is_stream { "流式" } else { "非流式" },
                    status,
                    body
                ));
                // 短暂等待后重试
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                continue;
            }

            // 8. 其他错误 - 记录失败并重试
            let body = response.text().await.unwrap_or_default();
            let status_code = status.as_u16();
            tracing::warn!(
                "账号 {} API 请求失败（尝试 {}/{}）: {} {}",
                account.name,
                attempt + 1,
                max_retries,
                status,
                body
            );
            // 记录错误日志
            self.record_api_error(&account.name, status_code, &body, is_stream).await;
            account.mark_unhealthy().await;
            last_error = Some(anyhow::anyhow!(
                "{} API 请求失败: {} {}",
                if is_stream { "流式" } else { "非流式" },
                status,
                body
            ));
        }

        // 所有重试都失败
        Err(last_error.unwrap_or_else(|| {
            anyhow::anyhow!(
                "{} API 请求失败：已达到最大重试次数（{}次）",
                if is_stream { "流式" } else { "非流式" },
                max_retries
            )
        }))
    }

    /// 发送非流式 API 请求
    pub async fn call_api(&self, request_body: &str) -> anyhow::Result<reqwest::Response> {
        self.call_api_with_retry(request_body, false).await
    }

    /// 发送流式 API 请求
    pub async fn call_api_stream(&self, request_body: &str) -> anyhow::Result<reqwest::Response> {
        self.call_api_with_retry(request_body, true).await
    }

    /// 获取账号池状态信息
    pub async fn get_pool_status(&self) -> PoolStatus {
        let pool = self.account_pool.read().await;
        PoolStatus {
            total: pool.account_count(),
            healthy: pool.healthy_count(),
        }
    }

    /// 获取第一个账号的 profile_arn（兼容旧接口）
    pub async fn get_profile_arn(&self) -> Option<String> {
        let pool = self.account_pool.read().await;
        if let Some(account) = pool.get_all_accounts().first() {
            account.get_profile_arn().await
        } else {
            None
        }
    }

    /// 获取账号池的 Arc 引用（用于 Admin API）
    pub fn get_account_pool(&self) -> Arc<RwLock<AccountPool>> {
        self.account_pool.clone()
    }
}

/// 账号池状态
#[derive(Debug, Clone)]
pub struct PoolStatus {
    pub total: usize,
    pub healthy: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::kiro::account_pool::AccountPoolConfig;
    use std::io::Write;
    use tempfile::tempdir;

    fn create_test_credentials_file(dir: &std::path::Path, name: &str) -> std::path::PathBuf {
        let path = dir.join(format!("{}.json", name));
        let mut file = std::fs::File::create(&path).unwrap();
        let creds = KiroCredentials {
            access_token: Some("test_token".to_string()),
            refresh_token: Some("a".repeat(150)),
            profile_arn: Some("arn:aws:test".to_string()),
            expires_at: Some("2099-01-01T00:00:00Z".to_string()),
            auth_method: Some("social".to_string()),
            ..Default::default()
        };
        file.write_all(creds.to_pretty_json().unwrap().as_bytes())
            .unwrap();
        path
    }

    #[tokio::test]
    async fn test_provider_creation() {
        let dir = tempdir().unwrap();
        create_test_credentials_file(dir.path(), "account1");

        let config = Config::default();
        let pool = AccountPool::from_directory(dir.path(), config, AccountPoolConfig::default())
            .unwrap();
        let provider = KiroProvider::new(pool);

        let status = provider.get_pool_status().await;
        assert_eq!(status.total, 1);
        assert_eq!(status.healthy, 1);
    }

    #[tokio::test]
    async fn test_get_profile_arn() {
        let dir = tempdir().unwrap();
        create_test_credentials_file(dir.path(), "account1");

        let config = Config::default();
        let pool = AccountPool::from_directory(dir.path(), config, AccountPoolConfig::default())
            .unwrap();
        let provider = KiroProvider::new(pool);

        let arn = provider.get_profile_arn().await;
        assert_eq!(arn, Some("arn:aws:test".to_string()));
    }
}
