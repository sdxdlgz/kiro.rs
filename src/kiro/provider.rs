//! Kiro API Provider
//!
//! 核心组件，负责与 Kiro API 通信
//! 支持流式和非流式请求，支持多账号轮询

use std::sync::Arc;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONNECTION, CONTENT_TYPE, HOST};
use reqwest::Client;
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::kiro::account_pool::AccountPool;
use crate::kiro::machine_id;
use crate::kiro::model::credentials::KiroCredentials;
use crate::model::config::Config;

/// Kiro API Provider
///
/// 核心组件，负责与 Kiro API 通信
/// 支持多账号轮询和故障转移
pub struct KiroProvider {
    account_pool: Arc<RwLock<AccountPool>>,
    client: Client,
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

    /// 获取一个可用账号并执行请求
    async fn execute_with_account<F, Fut>(
        &self,
        request_body: &str,
        execute_fn: F,
    ) -> anyhow::Result<reqwest::Response>
    where
        F: Fn(Client, String, HeaderMap, String) -> Fut,
        Fut: std::future::Future<Output = anyhow::Result<reqwest::Response>>,
    {
        let pool = self.account_pool.read().await;
        let account = pool
            .get_least_used_account()
            .await
            .ok_or_else(|| anyhow::anyhow!("没有可用的账号"))?;
        let config = pool.config().clone();
        drop(pool); // 释放读锁

        // 增加请求计数
        account.increment_request();

        tracing::debug!(
            "使用账号: {} (请求次数: {})",
            account.name,
            account.get_request_count()
        );

        // 获取 token（通过 RwLock 安全地刷新）
        let token = account.ensure_valid_token().await;

        match token {
            Ok(token) => {
                // 获取凭证信息用于构建请求头
                let credentials = {
                    let tm = account.token_manager.read().await;
                    tm.credentials().clone()
                };

                let headers = self.build_headers(&token, &credentials, &config)?;
                let url = self.base_url(&config);

                match execute_fn(self.client.clone(), url, headers, request_body.to_string()).await
                {
                    Ok(response) => {
                        account.mark_healthy();
                        Ok(response)
                    }
                    Err(e) => {
                        tracing::warn!("账号 {} 请求失败: {}", account.name, e);
                        account.mark_unhealthy().await;
                        Err(e)
                    }
                }
            }
            Err(e) => {
                tracing::warn!("账号 {} Token 刷新失败: {}", account.name, e);
                account.mark_unhealthy().await;
                Err(e)
            }
        }
    }

    /// 发送非流式 API 请求
    pub async fn call_api(&self, request_body: &str) -> anyhow::Result<reqwest::Response> {
        self.execute_with_account(request_body, |client, url, headers, body| async move {
            let response = client.post(&url).headers(headers).body(body).send().await?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                anyhow::bail!("API 请求失败: {} {}", status, body);
            }

            Ok(response)
        })
        .await
    }

    /// 发送流式 API 请求
    pub async fn call_api_stream(&self, request_body: &str) -> anyhow::Result<reqwest::Response> {
        self.execute_with_account(request_body, |client, url, headers, body| async move {
            let response = client.post(&url).headers(headers).body(body).send().await?;

            if !response.status().is_success() {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                anyhow::bail!("流式 API 请求失败: {} {}", status, body);
            }

            Ok(response)
        })
        .await
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
