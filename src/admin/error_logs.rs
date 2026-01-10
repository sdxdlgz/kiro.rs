//! API 错误日志存储
//!
//! 支持内存态管理和 JSON 文件持久化，最多保留 500 条记录

use std::collections::VecDeque;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// 最大错误日志数量
const MAX_ERROR_LOGS: usize = 500;

/// API 错误类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum ApiErrorType {
    /// 400 Bad Request
    #[serde(rename = "400")]
    BadRequest,
    /// 429 Too Many Requests
    #[serde(rename = "429")]
    TooManyRequests,
    /// 其他错误
    #[serde(rename = "other")]
    Other,
}

impl ApiErrorType {
    /// 从状态码创建错误类型
    pub fn from_status_code(code: u16) -> Self {
        match code {
            400 => Self::BadRequest,
            429 => Self::TooManyRequests,
            _ => Self::Other,
        }
    }
}

/// API 错误日志条目
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ApiErrorLogEntry {
    /// 时间戳
    pub timestamp: DateTime<Utc>,
    /// 账号名称
    pub account_name: String,
    /// HTTP 状态码
    pub status_code: u16,
    /// 错误类型
    pub error_type: ApiErrorType,
    /// 错误消息
    pub message: String,
    /// 是否为流式请求
    pub is_stream: bool,
    /// 请求体（仅 400 错误时记录，截断到 10KB）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub request_body: Option<String>,
}

/// API 错误日志存储
#[derive(Debug, Default)]
pub struct ApiErrorLogStore {
    /// 日志队列（最新的在前面）
    logs: VecDeque<ApiErrorLogEntry>,
    /// 持久化文件路径
    file_path: Option<PathBuf>,
}

impl ApiErrorLogStore {
    /// 创建新的日志存储
    pub fn new() -> Self {
        Self {
            logs: VecDeque::new(),
            file_path: Some(Self::default_path()),
        }
    }

    /// 使用指定路径创建日志存储
    pub fn with_path(path: impl Into<PathBuf>) -> Self {
        Self {
            logs: VecDeque::new(),
            file_path: Some(path.into()),
        }
    }

    /// 添加日志条目
    pub fn add_log(&mut self, entry: ApiErrorLogEntry) {
        self.logs.push_front(entry);
        // 超过上限时移除最旧的
        while self.logs.len() > MAX_ERROR_LOGS {
            self.logs.pop_back();
        }
    }

    /// 获取所有日志（按时间倒序）
    pub fn get_logs(&self) -> Vec<ApiErrorLogEntry> {
        let mut logs: Vec<ApiErrorLogEntry> = self.logs.iter().cloned().collect();
        logs.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        logs
    }

    /// 获取日志数量
    pub fn len(&self) -> usize {
        self.logs.len()
    }

    /// 是否为空
    pub fn is_empty(&self) -> bool {
        self.logs.is_empty()
    }

    /// 清空日志
    pub fn clear(&mut self) {
        self.logs.clear();
    }

    /// 保存到文件
    pub fn save_to_file(&self) -> Result<()> {
        if let Some(ref path) = self.file_path {
            self.save_to_path(path)
        } else {
            Ok(())
        }
    }

    /// 从文件加载
    pub fn load_from_file() -> Result<Self> {
        Self::load_from_path(Self::default_path())
    }

    /// 保存到指定路径
    pub fn save_to_path(&self, path: impl AsRef<Path>) -> Result<()> {
        let path = path.as_ref();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("Failed to create directory: {}", parent.display()))?;
        }

        let json = serde_json::to_string_pretty(&self.get_logs())
            .context("Failed to serialize error logs")?;
        std::fs::write(path, json)
            .with_context(|| format!("Failed to write file: {}", path.display()))?;
        Ok(())
    }

    /// 从指定路径加载
    pub fn load_from_path(path: impl AsRef<Path>) -> Result<Self> {
        let path = path.as_ref();
        if !path.exists() {
            return Ok(Self::with_path(path));
        }

        let content = std::fs::read_to_string(path)
            .with_context(|| format!("Failed to read file: {}", path.display()))?;
        let mut logs: Vec<ApiErrorLogEntry> =
            serde_json::from_str(&content).context("Failed to deserialize error logs")?;

        // 按时间倒序排序并截断
        logs.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        logs.truncate(MAX_ERROR_LOGS);

        let logs: VecDeque<ApiErrorLogEntry> = logs.into_iter().collect();
        Ok(Self {
            logs,
            file_path: Some(path.to_path_buf()),
        })
    }

    /// 默认文件路径
    fn default_path() -> PathBuf {
        PathBuf::from("data").join("error_logs.json")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use tempfile::tempdir;

    fn fixed_ts(sec: i64) -> DateTime<Utc> {
        Utc.timestamp_opt(sec, 0).single().unwrap()
    }

    fn make_entry(ts: i64, name: &str, code: u16) -> ApiErrorLogEntry {
        ApiErrorLogEntry {
            timestamp: fixed_ts(ts),
            account_name: name.to_string(),
            status_code: code,
            error_type: ApiErrorType::from_status_code(code),
            message: format!("Error {}", code),
            is_stream: false,
            request_body: None,
        }
    }

    #[test]
    fn test_add_log_and_ordering() {
        let mut store = ApiErrorLogStore::new();
        store.add_log(make_entry(1, "a", 400));
        store.add_log(make_entry(2, "b", 429));

        let logs = store.get_logs();
        assert_eq!(logs.len(), 2);
        assert_eq!(logs[0].account_name, "b");
        assert_eq!(logs[1].account_name, "a");
    }

    #[test]
    fn test_caps_at_500_and_drops_oldest() {
        let mut store = ApiErrorLogStore::new();
        for i in 0..(MAX_ERROR_LOGS + 10) {
            store.add_log(make_entry(i as i64, &format!("acc-{}", i), 500));
        }

        assert_eq!(store.len(), MAX_ERROR_LOGS);
        let logs = store.get_logs();
        assert_eq!(logs[0].account_name, "acc-509");
        assert_eq!(logs[499].account_name, "acc-10");
    }

    #[test]
    fn test_json_persistence_roundtrip() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("error_logs.json");

        let mut store = ApiErrorLogStore::with_path(&path);
        store.add_log(make_entry(100, "acc", 400));
        store.save_to_path(&path).unwrap();

        let loaded = ApiErrorLogStore::load_from_path(&path).unwrap();
        assert_eq!(loaded.get_logs(), store.get_logs());
    }

    #[test]
    fn test_error_type_from_status_code() {
        assert_eq!(ApiErrorType::from_status_code(400), ApiErrorType::BadRequest);
        assert_eq!(ApiErrorType::from_status_code(429), ApiErrorType::TooManyRequests);
        assert_eq!(ApiErrorType::from_status_code(500), ApiErrorType::Other);
        assert_eq!(ApiErrorType::from_status_code(503), ApiErrorType::Other);
    }

    #[test]
    fn test_clear() {
        let mut store = ApiErrorLogStore::new();
        store.add_log(make_entry(1, "a", 400));
        store.add_log(make_entry(2, "b", 429));
        assert_eq!(store.len(), 2);

        store.clear();
        assert!(store.is_empty());
    }
}
