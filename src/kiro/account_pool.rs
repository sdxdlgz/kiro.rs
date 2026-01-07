//! 多账号池管理模块
//!
//! 支持多账号轮询、负载均衡、故障转移

use std::path::Path;
use std::sync::atomic::{AtomicU64, AtomicBool, Ordering};
use std::sync::{Arc, RwLock as StdRwLock};
use std::time::{Duration, Instant};
use chrono::{DateTime, Utc};
use tokio::sync::RwLock;

use crate::kiro::model::credentials::KiroCredentials;
use crate::kiro::token_manager::TokenManager;
use crate::model::config::Config;

/// 表示 usage_ratio 为 None 的特殊值
const USAGE_RATIO_NONE_BITS: u64 = u64::MAX;

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
    /// 使用量比例（current_usage / usage_limit），以 f64 bits 形式缓存
    usage_ratio: AtomicU64,
    /// 使用量检查时间
    usage_checked_at: StdRwLock<Option<DateTime<Utc>>>,
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
            usage_ratio: AtomicU64::new(USAGE_RATIO_NONE_BITS),
            usage_checked_at: StdRwLock::new(None),
        }
    }

    /// 设置使用量比例
    pub fn set_usage_ratio(&self, ratio: f64) {
        let bits = if ratio.is_finite() {
            ratio.to_bits()
        } else {
            USAGE_RATIO_NONE_BITS
        };
        self.usage_ratio.store(bits, Ordering::Relaxed);
        *self.usage_checked_at.write().unwrap() = Some(Utc::now());
    }

    /// 获取使用量比例
    pub fn get_usage_ratio(&self) -> Option<f64> {
        let bits = self.usage_ratio.load(Ordering::Relaxed);
        if bits == USAGE_RATIO_NONE_BITS {
            return None;
        }
        let ratio = f64::from_bits(bits);
        ratio.is_finite().then_some(ratio)
    }

    /// 获取使用量检查时间
    pub fn get_usage_checked_at(&self) -> Option<DateTime<Utc>> {
        *self.usage_checked_at.read().unwrap()
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

    /// 获取使用量最低的健康账号
    ///
    /// 优先选择 usage_ratio 最低的账号，None 排在最后
    /// 相同 usage_ratio 时用 request_count 作为 tie-break
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

        // 优先选择 usage_ratio 最低的账号（None 排在最后），相同时用 request_count 做 tie-break
        available.into_iter().min_by(|a, b| {
            let a_ratio = a.get_usage_ratio();
            let b_ratio = b.get_usage_ratio();

            match (a_ratio, b_ratio) {
                (Some(ar), Some(br)) => match ar.partial_cmp(&br) {
                    Some(std::cmp::Ordering::Equal) => {
                        a.get_request_count().cmp(&b.get_request_count())
                    }
                    Some(ordering) => ordering,
                    None => a.get_request_count().cmp(&b.get_request_count()),
                },
                (Some(_), None) => std::cmp::Ordering::Less,
                (None, Some(_)) => std::cmp::Ordering::Greater,
                (None, None) => a.get_request_count().cmp(&b.get_request_count()),
            }
        })
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
        assert_eq!(state.get_usage_ratio(), None);
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

    #[test]
    fn test_usage_ratio_set_and_get() {
        let config = Config::default();
        let credentials = KiroCredentials::default();
        let tm = TokenManager::new(config, credentials, "test.json");
        let state = AccountState::new("test".to_string(), tm);

        assert_eq!(state.get_usage_ratio(), None);

        state.set_usage_ratio(0.5);
        assert_eq!(state.get_usage_ratio(), Some(0.5));

        state.set_usage_ratio(0.0);
        assert_eq!(state.get_usage_ratio(), Some(0.0));

        state.set_usage_ratio(1.0);
        assert_eq!(state.get_usage_ratio(), Some(1.0));

        // NaN 应该被视为 None
        state.set_usage_ratio(f64::NAN);
        assert_eq!(state.get_usage_ratio(), None);
    }

    #[tokio::test]
    async fn test_get_least_used_account_prefers_lowest_usage_ratio() {
        let config = Config::default();
        let pool_config = AccountPoolConfig::default();

        let a = Arc::new(AccountState::new(
            "a".to_string(),
            TokenManager::new(config.clone(), KiroCredentials::default(), "a.json"),
        ));
        let b = Arc::new(AccountState::new(
            "b".to_string(),
            TokenManager::new(config.clone(), KiroCredentials::default(), "b.json"),
        ));

        a.set_usage_ratio(0.2);
        b.set_usage_ratio(0.1);

        // 即使 b 的 request_count 更高，也应该选择 b（ratio 更低）
        for _ in 0..10 {
            b.increment_request();
        }

        let pool = AccountPool {
            accounts: vec![a, b.clone()],
            pool_config,
            config,
        };

        let selected = pool.get_least_used_account().await.unwrap();
        assert_eq!(selected.name, "b");
    }

    #[tokio::test]
    async fn test_get_least_used_account_usage_ratio_none_is_last() {
        let config = Config::default();
        let pool_config = AccountPoolConfig::default();

        let none_ratio = Arc::new(AccountState::new(
            "none".to_string(),
            TokenManager::new(config.clone(), KiroCredentials::default(), "none.json"),
        ));
        let some_ratio = Arc::new(AccountState::new(
            "some".to_string(),
            TokenManager::new(config.clone(), KiroCredentials::default(), "some.json"),
        ));

        some_ratio.set_usage_ratio(0.5);

        // none_ratio request_count 更低，但 None 应排在最后
        for _ in 0..5 {
            some_ratio.increment_request();
        }

        let pool = AccountPool {
            accounts: vec![none_ratio, some_ratio.clone()],
            pool_config,
            config,
        };

        let selected = pool.get_least_used_account().await.unwrap();
        assert_eq!(selected.name, "some");
    }

    #[tokio::test]
    async fn test_get_least_used_account_tiebreak_by_request_count() {
        let config = Config::default();
        let pool_config = AccountPoolConfig::default();

        let higher_requests = Arc::new(AccountState::new(
            "a".to_string(),
            TokenManager::new(config.clone(), KiroCredentials::default(), "a.json"),
        ));
        let lower_requests = Arc::new(AccountState::new(
            "b".to_string(),
            TokenManager::new(config.clone(), KiroCredentials::default(), "b.json"),
        ));

        higher_requests.set_usage_ratio(0.3);
        lower_requests.set_usage_ratio(0.3);

        for _ in 0..3 {
            higher_requests.increment_request();
        }

        let pool = AccountPool {
            accounts: vec![higher_requests, lower_requests.clone()],
            pool_config,
            config,
        };

        let selected = pool.get_least_used_account().await.unwrap();
        assert_eq!(selected.name, "b");
    }
}
