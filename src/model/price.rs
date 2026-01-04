use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::Path;

/// 价格配置结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PriceConfig {
    pub models: HashMap<String, ModelPrice>,
    pub currency: String,
}

/// 模型价格信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelPrice {
    pub display_name: String,
    pub input_price_per_million: f64,
    pub output_price_per_million: f64,
}

impl Default for PriceConfig {
    fn default() -> Self {
        let mut models = HashMap::new();

        // Claude 4 系列
        models.insert(
            "claude-sonnet-4-20250514".to_string(),
            ModelPrice {
                display_name: "Claude Sonnet 4".to_string(),
                input_price_per_million: 3.0,
                output_price_per_million: 15.0,
            },
        );

        models.insert(
            "claude-opus-4-20250514".to_string(),
            ModelPrice {
                display_name: "Claude Opus 4".to_string(),
                input_price_per_million: 15.0,
                output_price_per_million: 75.0,
            },
        );

        // Claude 4.5 系列
        models.insert(
            "claude-opus-4-5-20251101".to_string(),
            ModelPrice {
                display_name: "Claude Opus 4.5".to_string(),
                input_price_per_million: 15.0,
                output_price_per_million: 75.0,
            },
        );

        models.insert(
            "claude-sonnet-4-5-20250929".to_string(),
            ModelPrice {
                display_name: "Claude Sonnet 4.5".to_string(),
                input_price_per_million: 3.0,
                output_price_per_million: 15.0,
            },
        );

        models.insert(
            "claude-haiku-4-5-20251001".to_string(),
            ModelPrice {
                display_name: "Claude Haiku 4.5".to_string(),
                input_price_per_million: 0.8,
                output_price_per_million: 4.0,
            },
        );

        // Claude 4.5 系列（简短名称，用点号分隔）
        models.insert(
            "claude-sonnet-4.5".to_string(),
            ModelPrice {
                display_name: "Claude Sonnet 4.5".to_string(),
                input_price_per_million: 3.0,
                output_price_per_million: 15.0,
            },
        );

        models.insert(
            "claude-opus-4.5".to_string(),
            ModelPrice {
                display_name: "Claude Opus 4.5".to_string(),
                input_price_per_million: 15.0,
                output_price_per_million: 75.0,
            },
        );

        models.insert(
            "claude-haiku-4.5".to_string(),
            ModelPrice {
                display_name: "Claude Haiku 4.5".to_string(),
                input_price_per_million: 0.8,
                output_price_per_million: 4.0,
            },
        );

        // Claude 3.5 系列
        models.insert(
            "claude-3-5-sonnet".to_string(),
            ModelPrice {
                display_name: "Claude 3.5 Sonnet".to_string(),
                input_price_per_million: 3.0,
                output_price_per_million: 15.0,
            },
        );

        models.insert(
            "claude-3-5-haiku".to_string(),
            ModelPrice {
                display_name: "Claude 3.5 Haiku".to_string(),
                input_price_per_million: 0.8,
                output_price_per_million: 4.0,
            },
        );

        // Claude 3 系列
        models.insert(
            "claude-3-opus".to_string(),
            ModelPrice {
                display_name: "Claude 3 Opus".to_string(),
                input_price_per_million: 15.0,
                output_price_per_million: 75.0,
            },
        );

        models.insert(
            "claude-3-sonnet".to_string(),
            ModelPrice {
                display_name: "Claude 3 Sonnet".to_string(),
                input_price_per_million: 3.0,
                output_price_per_million: 15.0,
            },
        );

        models.insert(
            "claude-3-haiku".to_string(),
            ModelPrice {
                display_name: "Claude 3 Haiku".to_string(),
                input_price_per_million: 0.25,
                output_price_per_million: 1.25,
            },
        );

        Self {
            models,
            currency: "USD".to_string(),
        }
    }
}

impl PriceConfig {
    /// 从文件加载配置
    ///
    /// # Arguments
    /// * `path` - 配置文件路径
    ///
    /// # Returns
    /// * `Ok(PriceConfig)` - 成功加载的配置
    /// * `Err(anyhow::Error)` - 加载失败时的错误
    ///
    /// # Examples
    /// ```
    /// use kiro_rs::model::price::PriceConfig;
    ///
    /// let config = PriceConfig::load("price.json").unwrap();
    /// ```
    pub fn load<P: AsRef<Path>>(path: P) -> anyhow::Result<Self> {
        let path = path.as_ref();
        if !path.exists() {
            // 配置文件不存在，返回默认配置
            return Ok(Self::default());
        }

        let content = fs::read_to_string(path)?;
        let config: PriceConfig = serde_json::from_str(&content)?;
        Ok(config)
    }

    /// 计算单次请求费用
    ///
    /// # Arguments
    /// * `model` - 模型名称（支持模糊匹配）
    /// * `input_tokens` - 输入 token 数量
    /// * `output_tokens` - 输出 token 数量
    ///
    /// # Returns
    /// * `Some(f64)` - 计算出的费用
    /// * `None` - 模型不存在
    ///
    /// # Examples
    /// ```
    /// use kiro_rs::model::price::PriceConfig;
    ///
    /// let config = PriceConfig::default();
    /// let cost = config.calculate_cost("claude-opus-4-5", 1000, 500).unwrap();
    /// assert_eq!(cost, 0.0525); // (1000 * 15 + 500 * 75) / 1_000_000
    /// ```
    pub fn calculate_cost(&self, model: &str, input_tokens: u64, output_tokens: u64) -> Option<f64> {
        let price = self.get_model_price(model)?;

        let input_cost = (input_tokens as f64) * price.input_price_per_million;
        let output_cost = (output_tokens as f64) * price.output_price_per_million;
        let total_cost = (input_cost + output_cost) / 1_000_000.0;

        Some(total_cost)
    }

    /// 获取模型价格信息（支持模糊匹配）
    ///
    /// # Arguments
    /// * `model` - 模型名称
    ///
    /// # Returns
    /// * `Some(&ModelPrice)` - 模型价格信息
    /// * `None` - 模型不存在
    ///
    /// # Examples
    /// ```
    /// use kiro_rs::model::price::PriceConfig;
    ///
    /// let config = PriceConfig::default();
    ///
    /// // 精确匹配
    /// let price = config.get_model_price("claude-opus-4-5-20251101").unwrap();
    /// assert_eq!(price.display_name, "Claude Opus 4.5");
    ///
    /// // 模糊匹配
    /// let price = config.get_model_price("claude-opus-4-5").unwrap();
    /// assert_eq!(price.display_name, "Claude Opus 4.5");
    /// ```
    pub fn get_model_price(&self, model: &str) -> Option<&ModelPrice> {
        // 首先尝试精确匹配
        if let Some(price) = self.models.get(model) {
            return Some(price);
        }

        // 如果精确匹配失败，尝试模糊匹配
        // 查找以给定模型名称开头的模型
        for (key, value) in &self.models {
            if key.starts_with(model) {
                return Some(value);
            }
        }

        None
    }

    /// 获取所有支持的模型
    ///
    /// # Returns
    /// * `Vec<&str>` - 所有支持的模型名称列表
    ///
    /// # Examples
    /// ```
    /// use kiro_rs::model::price::PriceConfig;
    ///
    /// let config = PriceConfig::default();
    /// let models = config.supported_models();
    /// assert!(models.contains(&"claude-opus-4-5-20251101"));
    /// ```
    pub fn supported_models(&self) -> Vec<&str> {
        self.models.keys().map(|s| s.as_str()).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_default_config() {
        let config = PriceConfig::default();

        assert_eq!(config.currency, "USD");
        assert_eq!(config.models.len(), 13);

        // 验证 Claude Sonnet 4 价格
        let sonnet4 = config.models.get("claude-sonnet-4-20250514").unwrap();
        assert_eq!(sonnet4.display_name, "Claude Sonnet 4");
        assert_eq!(sonnet4.input_price_per_million, 3.0);
        assert_eq!(sonnet4.output_price_per_million, 15.0);

        // 验证 Opus 4.5 价格
        let opus = config.models.get("claude-opus-4-5-20251101").unwrap();
        assert_eq!(opus.display_name, "Claude Opus 4.5");
        assert_eq!(opus.input_price_per_million, 15.0);
        assert_eq!(opus.output_price_per_million, 75.0);

        // 验证 Sonnet 4.5 价格
        let sonnet = config.models.get("claude-sonnet-4-5-20250929").unwrap();
        assert_eq!(sonnet.display_name, "Claude Sonnet 4.5");
        assert_eq!(sonnet.input_price_per_million, 3.0);
        assert_eq!(sonnet.output_price_per_million, 15.0);

        // 验证 Haiku 4.5 价格
        let haiku = config.models.get("claude-haiku-4-5-20251001").unwrap();
        assert_eq!(haiku.display_name, "Claude Haiku 4.5");
        assert_eq!(haiku.input_price_per_million, 0.8);
        assert_eq!(haiku.output_price_per_million, 4.0);
    }

    #[test]
    fn test_load_from_file() {
        let json_content = r#"{
            "models": {
                "test-model": {
                    "display_name": "Test Model",
                    "input_price_per_million": 1.0,
                    "output_price_per_million": 2.0
                }
            },
            "currency": "EUR"
        }"#;

        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(json_content.as_bytes()).unwrap();
        temp_file.flush().unwrap();

        let config = PriceConfig::load(temp_file.path()).unwrap();

        assert_eq!(config.currency, "EUR");
        assert_eq!(config.models.len(), 1);

        let model = config.models.get("test-model").unwrap();
        assert_eq!(model.display_name, "Test Model");
        assert_eq!(model.input_price_per_million, 1.0);
        assert_eq!(model.output_price_per_million, 2.0);
    }

    #[test]
    fn test_load_nonexistent_file() {
        let config = PriceConfig::load("nonexistent_file.json").unwrap();

        // 应该返回默认配置
        assert_eq!(config.currency, "USD");
        assert_eq!(config.models.len(), 13);
    }

    #[test]
    fn test_calculate_cost_exact_match() {
        let config = PriceConfig::default();

        // Opus 4.5: input=15, output=75
        // 1000 tokens input, 500 tokens output
        // (1000 * 15 + 500 * 75) / 1_000_000 = 52500 / 1_000_000 = 0.0525
        let cost = config.calculate_cost("claude-opus-4-5-20251101", 1000, 500).unwrap();
        assert_eq!(cost, 0.0525);

        // Sonnet 4.5: input=3, output=15
        // 2000 tokens input, 1000 tokens output
        // (2000 * 3 + 1000 * 15) / 1_000_000 = 21000 / 1_000_000 = 0.021
        let cost = config.calculate_cost("claude-sonnet-4-5-20250929", 2000, 1000).unwrap();
        assert_eq!(cost, 0.021);

        // Haiku 4.5: input=0.8, output=4
        // 5000 tokens input, 2000 tokens output
        // (5000 * 0.8 + 2000 * 4) / 1_000_000 = 12000 / 1_000_000 = 0.012
        let cost = config.calculate_cost("claude-haiku-4-5-20251001", 5000, 2000).unwrap();
        assert_eq!(cost, 0.012);
    }

    #[test]
    fn test_calculate_cost_fuzzy_match() {
        let config = PriceConfig::default();

        // 模糊匹配 Opus
        let cost = config.calculate_cost("claude-opus-4-5", 1000, 500).unwrap();
        assert_eq!(cost, 0.0525);

        // 模糊匹配 Sonnet
        let cost = config.calculate_cost("claude-sonnet-4-5", 2000, 1000).unwrap();
        assert_eq!(cost, 0.021);

        // 模糊匹配 Haiku
        let cost = config.calculate_cost("claude-haiku-4-5", 5000, 2000).unwrap();
        assert_eq!(cost, 0.012);
    }

    #[test]
    fn test_calculate_cost_zero_tokens() {
        let config = PriceConfig::default();

        // 0 tokens 应该返回 0 费用
        let cost = config.calculate_cost("claude-opus-4-5-20251101", 0, 0).unwrap();
        assert_eq!(cost, 0.0);

        // 只有输入 tokens
        let cost = config.calculate_cost("claude-opus-4-5-20251101", 1000, 0).unwrap();
        assert_eq!(cost, 0.015);

        // 只有输出 tokens
        let cost = config.calculate_cost("claude-opus-4-5-20251101", 0, 1000).unwrap();
        assert_eq!(cost, 0.075);
    }

    #[test]
    fn test_calculate_cost_unknown_model() {
        let config = PriceConfig::default();

        let cost = config.calculate_cost("unknown-model", 1000, 500);
        assert!(cost.is_none());
    }

    #[test]
    fn test_get_model_price_exact_match() {
        let config = PriceConfig::default();

        let price = config.get_model_price("claude-opus-4-5-20251101").unwrap();
        assert_eq!(price.display_name, "Claude Opus 4.5");
        assert_eq!(price.input_price_per_million, 15.0);
        assert_eq!(price.output_price_per_million, 75.0);
    }

    #[test]
    fn test_get_model_price_fuzzy_match() {
        let config = PriceConfig::default();

        // 模糊匹配应该找到完整的模型名称
        let price = config.get_model_price("claude-opus-4-5").unwrap();
        assert_eq!(price.display_name, "Claude Opus 4.5");

        let price = config.get_model_price("claude-sonnet-4-5").unwrap();
        assert_eq!(price.display_name, "Claude Sonnet 4.5");

        let price = config.get_model_price("claude-haiku-4-5").unwrap();
        assert_eq!(price.display_name, "Claude Haiku 4.5");
    }

    #[test]
    fn test_get_model_price_unknown_model() {
        let config = PriceConfig::default();

        let price = config.get_model_price("unknown-model");
        assert!(price.is_none());
    }

    #[test]
    fn test_supported_models() {
        let config = PriceConfig::default();

        let models = config.supported_models();
        assert_eq!(models.len(), 13);
        assert!(models.contains(&"claude-sonnet-4-20250514"));
        assert!(models.contains(&"claude-opus-4-20250514"));
        assert!(models.contains(&"claude-opus-4-5-20251101"));
        assert!(models.contains(&"claude-sonnet-4-5-20250929"));
        assert!(models.contains(&"claude-haiku-4-5-20251001"));
        assert!(models.contains(&"claude-sonnet-4.5"));
        assert!(models.contains(&"claude-opus-4.5"));
        assert!(models.contains(&"claude-haiku-4.5"));
    }

    #[test]
    fn test_large_token_counts() {
        let config = PriceConfig::default();

        // 测试大量 tokens
        let cost = config.calculate_cost("claude-opus-4-5-20251101", 1_000_000, 500_000).unwrap();
        // (1_000_000 * 15 + 500_000 * 75) / 1_000_000 = 52_500_000 / 1_000_000 = 52.5
        assert_eq!(cost, 52.5);
    }

    #[test]
    fn test_precision() {
        let config = PriceConfig::default();

        // 测试小数精度
        let cost = config.calculate_cost("claude-haiku-4-5-20251001", 123, 456).unwrap();
        // (123 * 0.8 + 456 * 4) / 1_000_000 = 1922.4 / 1_000_000 = 0.0019224
        assert!((cost - 0.0019224).abs() < 1e-10);
    }

    #[test]
    fn test_serialization() {
        let config = PriceConfig::default();

        // 测试序列化
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("claude-opus-4-5-20251101"));
        assert!(json.contains("USD"));

        // 测试反序列化
        let deserialized: PriceConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.currency, config.currency);
        assert_eq!(deserialized.models.len(), config.models.len());
    }

    #[test]
    fn test_invalid_json() {
        let invalid_json = r#"{ invalid json }"#;

        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(invalid_json.as_bytes()).unwrap();
        temp_file.flush().unwrap();

        let result = PriceConfig::load(temp_file.path());
        assert!(result.is_err());
    }

    #[test]
    fn test_empty_models() {
        let json_content = r#"{
            "models": {},
            "currency": "USD"
        }"#;

        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(json_content.as_bytes()).unwrap();
        temp_file.flush().unwrap();

        let config = PriceConfig::load(temp_file.path()).unwrap();

        assert_eq!(config.models.len(), 0);
        assert!(config.get_model_price("any-model").is_none());
        assert_eq!(config.supported_models().len(), 0);
    }

    #[test]
    fn test_custom_currency() {
        let json_content = r#"{
            "models": {
                "test-model": {
                    "display_name": "Test Model",
                    "input_price_per_million": 1.0,
                    "output_price_per_million": 2.0
                }
            },
            "currency": "CNY"
        }"#;

        let mut temp_file = NamedTempFile::new().unwrap();
        temp_file.write_all(json_content.as_bytes()).unwrap();
        temp_file.flush().unwrap();

        let config = PriceConfig::load(temp_file.path()).unwrap();
        assert_eq!(config.currency, "CNY");
    }
}
