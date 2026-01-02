//! 多账号池管理模块
//!
//! 支持多账号轮询、负载均衡、故障转移

use std::path::Path;
use std::sync::atomic::{AtomicU64, AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

use crate::kiro::model::credentials::KiroCredentials;
use crate::kiro::token_manager::TokenManager;
use crate::model::config::Config;

/// 账号状态
pub struct AccountState {
    /// 账号名称（文件名）
    pub name: String,
    /// Token 管理器（使用 RwLock 支持并发刷新）
    pub token_manager: RwLock<TokenManager>,
    /// 请求计数
    pub request_count: AtomicU64,
    /// 是否健康
    pub healthy: AtomicBool,
    /// 上次失败时间
    pub last_failure: RwLock<Option<Instant>>,
    /// 连续失败次数
    pub failure_count: AtomicU64,
}

impl AccountState {
    /// 创建新的账号状态
    pub fn new(name: String, token_manager: TokenManager) -> Self {
        Self {
            name,
            token_manager: RwLock::new(token_manager),
            request_count: AtomicU64::new(0),
            healthy: AtomicBool::new(true),
            last_failure: RwLock::new(None),
            failure_count: AtomicU64::new(0),
        }
    }

    /// 获取有效的 token（自动刷新）
    pub async fn ensure_valid_token(&self) -> anyhow::Result<String> {
        let mut tm = self.token_manager.write().await;
        tm.ensure_valid_token().await
    }

    /// 获取凭证的 profile_arn
    pub async fn get_profile_arn(&self) -> Option<String> {
        let tm = self.token_manager.read().await;
        tm.credentials().profile_arn.clone()
    }

    /// 获取配置
    pub async fn get_config(&self) -> Config {
        let tm = self.token_manager.read().await;
        tm.config().clone()
    }

    /// 增加请求计数
    pub fn increment_request(&self) {
        self.request_count.fetch_add(1, Ordering::Relaxed);
    }

    /// 获取请求计数
    pub fn get_request_count(&self) -> u64 {
        self.request_count.load(Ordering::Relaxed)
    }

    /// 标记为健康
    pub fn mark_healthy(&self) {
        self.healthy.store(true, Ordering::Relaxed);
        self.failure_count.store(0, Ordering::Relaxed);
    }

    /// 标记为不健康
    pub async fn mark_unhealthy(&self) {
        self.healthy.store(false, Ordering::Relaxed);
        self.failure_count.fetch_add(1, Ordering::Relaxed);
        *self.last_failure.write().await = Some(Instant::now());
    }

    /// 检查是否健康
    pub fn is_healthy(&self) -> bool {
        self.healthy.load(Ordering::Relaxed)
    }

    /// 检查是否应该重试（故障后一段时间自动恢复）
    pub async fn should_retry(&self, cooldown: Duration) -> bool {
        if self.is_healthy() {
            return true;
        }

        let last_failure = self.last_failure.read().await;
        match *last_failure {
            Some(time) => time.elapsed() >= cooldown,
            None => true,
        }
    }
}

/// 账号池配置
#[derive(Debug, Clone)]
pub struct AccountPoolConfig {
    /// 故障冷却时间（秒）
    pub failure_cooldown_secs: u64,
    /// 最大连续失败次数（超过后永久禁用直到重启）
    pub max_failures: u64,
}

impl Default for AccountPoolConfig {
    fn default() -> Self {
        Self {
            failure_cooldown_secs: 60,  // 1 分钟后重试
            max_failures: 5,             // 连续失败 5 次后禁用
        }
    }
}

/// 多账号池
pub struct AccountPool {
    /// 账号列表
    accounts: Vec<Arc<AccountState>>,
    /// 池配置
    pool_config: AccountPoolConfig,
    /// 应用配置
    config: Config,
}

impl AccountPool {
    /// 从目录加载所有凭证文件创建账号池
    pub fn from_directory<P: AsRef<Path>>(
        dir: P,
        config: Config,
        pool_config: AccountPoolConfig,
    ) -> anyhow::Result<Self> {
        let dir = dir.as_ref();

        if !dir.exists() {
            anyhow::bail!("凭证目录不存在: {:?}", dir);
        }

        if !dir.is_dir() {
            anyhow::bail!("路径不是目录: {:?}", dir);
        }

        let mut accounts = Vec::new();

        for entry in std::fs::read_dir(dir)? {
            let entry = entry?;
            let path = entry.path();

            // 只处理 .json 文件
            if path.extension().map_or(false, |ext| ext == "json") {
                match Self::load_account(&path, &config) {
                    Ok(account) => {
                        tracing::info!("加载账号: {} ({:?})", account.name, path);
                        accounts.push(Arc::new(account));
                    }
                    Err(e) => {
                        tracing::warn!("加载凭证文件失败 {:?}: {}", path, e);
                    }
                }
            }
        }

        if accounts.is_empty() {
            anyhow::bail!("凭证目录中没有有效的凭证文件: {:?}", dir);
        }

        tracing::info!("账号池初始化完成，共 {} 个账号", accounts.len());

        Ok(Self {
            accounts,
            pool_config,
            config,
        })
    }

    /// 从单个凭证文件创建账号池（兼容旧配置）
    pub fn from_single_file<P: AsRef<Path>>(
        path: P,
        config: Config,
        pool_config: AccountPoolConfig,
    ) -> anyhow::Result<Self> {
        let path = path.as_ref();
        let account = Self::load_account(path, &config)?;

        tracing::info!("单账号模式: {}", account.name);

        Ok(Self {
            accounts: vec![Arc::new(account)],
            pool_config,
            config,
        })
    }

    /// 加载单个账号
    fn load_account(path: &Path, config: &Config) -> anyhow::Result<AccountState> {
        let credentials = KiroCredentials::load(path)?;
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("unknown")
            .to_string();

        let token_manager = TokenManager::new(
            config.clone(),
            credentials,
            path.to_path_buf(),
        );

        Ok(AccountState::new(name, token_manager))
    }

    /// 获取最少使用的健康账号
    pub async fn get_least_used_account(&self) -> Option<Arc<AccountState>> {
        let cooldown = Duration::from_secs(self.pool_config.failure_cooldown_secs);
        let max_failures = self.pool_config.max_failures;

        // 筛选可用账号（健康或冷却期已过）
        let mut available: Vec<_> = Vec::new();

        for account in &self.accounts {
            // 跳过永久禁用的账号
            if account.failure_count.load(Ordering::Relaxed) >= max_failures {
                continue;
            }

            if account.should_retry(cooldown).await {
                available.push(account.clone());
            }
        }

        if available.is_empty() {
            return None;
        }

        // 选择请求次数最少的账号
        available.into_iter().min_by_key(|a| a.get_request_count())
    }

    /// 获取所有账号状态（用于监控）
    pub fn get_all_accounts(&self) -> &[Arc<AccountState>] {
        &self.accounts
    }

    /// 获取账号数量
    pub fn account_count(&self) -> usize {
        self.accounts.len()
    }

    /// 获取健康账号数量
    pub fn healthy_count(&self) -> usize {
        self.accounts.iter().filter(|a| a.is_healthy()).count()
    }

    /// 获取配置引用
    pub fn config(&self) -> &Config {
        &self.config
    }

    /// 添加账号到池中
    pub fn add_account(&mut self, account: Arc<AccountState>) {
        tracing::info!("添加账号到池: {}", account.name);
        self.accounts.push(account);
    }

    /// 从池中移除账号
    pub fn remove_account(&mut self, name: &str) -> bool {
        let initial_len = self.accounts.len();
        self.accounts.retain(|a| a.name != name);
        let removed = self.accounts.len() < initial_len;
        if removed {
            tracing::info!("从池中移除账号: {}", name);
        }
        removed
    }

    /// 获取池配置
    pub fn pool_config(&self) -> &AccountPoolConfig {
        &self.pool_config
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_account_state_new() {
        let config = Config::default();
        let credentials = KiroCredentials::default();
        let tm = TokenManager::new(config, credentials, "test.json");
        let state = AccountState::new("test".to_string(), tm);

        assert_eq!(state.name, "test");
        assert_eq!(state.get_request_count(), 0);
        assert!(state.is_healthy());
    }

    #[test]
    fn test_account_state_increment() {
        let config = Config::default();
        let credentials = KiroCredentials::default();
        let tm = TokenManager::new(config, credentials, "test.json");
        let state = AccountState::new("test".to_string(), tm);

        state.increment_request();
        state.increment_request();
        assert_eq!(state.get_request_count(), 2);
    }

    #[tokio::test]
    async fn test_account_state_health() {
        let config = Config::default();
        let credentials = KiroCredentials::default();
        let tm = TokenManager::new(config, credentials, "test.json");
        let state = AccountState::new("test".to_string(), tm);

        assert!(state.is_healthy());

        state.mark_unhealthy().await;
        assert!(!state.is_healthy());

        state.mark_healthy();
        assert!(state.is_healthy());
    }

    #[test]
    fn test_pool_config_default() {
        let config = AccountPoolConfig::default();
        assert_eq!(config.failure_cooldown_secs, 60);
        assert_eq!(config.max_failures, 5);
    }
}
