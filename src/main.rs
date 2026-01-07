mod admin;
mod anthropic;
mod db;
mod kiro;
mod model;
pub mod token;

use std::path::{Path, PathBuf};
use std::sync::Arc;

use axum::Router;
use clap::Parser;
use kiro::account_pool::{AccountPool, AccountPoolConfig};
use kiro::model::credentials::KiroCredentials;
use kiro::provider::KiroProvider;
use model::config::Config;
use model::arg::Args;
use tokio::sync::RwLock;
use tower_http::services::{ServeDir, ServeFile};

#[tokio::main]
async fn main() {
    // 解析命令行参数
    let args = Args::parse();

    // 初始化日志（默认 DEBUG 级别）
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::DEBUG.into()),
        )
        .init();

    // 加载配置
    let config_path = args.config.unwrap_or_else(|| Config::default_config_path().to_string());
    let config = Config::load(&config_path).unwrap_or_else(|e| {
        tracing::error!("加载配置失败: {}", e);
        std::process::exit(1);
    });

    // 获取 API Key
    let api_key = config.api_key.clone().unwrap_or_else(|| {
        tracing::error!("配置文件中未设置 apiKey");
        std::process::exit(1);
    });

    // 初始化数据库（用于多Key分发和用量统计）
    let database = match db::Database::new("kiro.db") {
        Ok(db) => {
            tracing::info!("数据库初始化成功: kiro.db");
            Some(Arc::new(db))
        }
        Err(e) => {
            tracing::warn!("数据库初始化失败，多Key分发功能将不可用: {}", e);
            None
        }
    };

    // 创建账号池配置
    let pool_config = AccountPoolConfig {
        failure_cooldown_secs: config.failure_cooldown_secs,
        max_failures: config.max_failures,
    };

    // 创建账号池（支持多账号或单账号模式）
    let account_pool = if let Some(ref credentials_dir) = config.credentials_dir {
        // 多账号模式：从目录加载
        let dir_path = Path::new(credentials_dir);
        AccountPool::from_directory(dir_path, config.clone(), pool_config).unwrap_or_else(|e| {
            tracing::error!("加载凭证目录失败: {}", e);
            std::process::exit(1);
        })
    } else {
        // 单账号模式：从单个文件加载（兼容旧配置）
        let credentials_path = args.credentials.unwrap_or_else(|| KiroCredentials::default_credentials_path().to_string());
        AccountPool::from_single_file(&credentials_path, config.clone(), pool_config).unwrap_or_else(|e| {
            tracing::error!("加载凭证文件失败: {}", e);
            std::process::exit(1);
        })
    };

    // 获取 profile_arn（用于路由）
    let profile_arn = {
        if let Some(account) = account_pool.get_all_accounts().first() {
            account.get_profile_arn().await
        } else {
            None
        }
    };

    // 创建 KiroProvider
    let kiro_provider = KiroProvider::new(account_pool);

    // 获取账号池的 Arc 引用（用于 Admin API）
    let account_pool_arc = kiro_provider.get_account_pool();

    // 获取错误日志存储的 Arc 引用（用于 Admin API 共享）
    let error_log_store = kiro_provider.get_error_log_store();

    // 尝试从文件加载历史错误日志
    if let Ok(loaded_store) = admin::error_logs::ApiErrorLogStore::load_from_file() {
        let mut store = error_log_store.write().await;
        *store = loaded_store;
        tracing::info!("加载历史错误日志: {} 条", store.len());
    }

    // 打印账号池状态
    let status = kiro_provider.get_pool_status().await;
    tracing::info!("账号池状态: {} 个账号, {} 个健康", status.total, status.healthy);

    // 初始化 count_tokens 配置
    token::init_config(token::CountTokensConfig {
        api_url: config.count_tokens_api_url.clone(),
        api_key: config.count_tokens_api_key.clone(),
        auth_type: config.count_tokens_auth_type.clone(),
    });

    // 确定凭证目录
    let credentials_dir = if let Some(ref dir) = config.credentials_dir {
        PathBuf::from(dir)
    } else {
        PathBuf::from("credentials")
    };

    // 确保凭证目录存在
    if !credentials_dir.exists() {
        std::fs::create_dir_all(&credentials_dir).ok();
    }

    // 创建 Admin API 状态
    let admin_state = admin::handlers::AdminState::new(
        account_pool_arc,
        config.clone(),
        credentials_dir,
        database.clone(),
        api_key.clone(),
    ).with_error_log_store(error_log_store);

    // 构建路由
    let anthropic_router = anthropic::create_router_with_provider_and_db(
        &api_key,
        Some(kiro_provider),
        profile_arn,
        database,
    );
    let admin_router = admin::router::create_admin_router(admin_state);

    // 静态文件服务（Web 管理界面）
    let web_dist_path = PathBuf::from("web/dist");
    let serve_web = if web_dist_path.exists() {
        tracing::info!("启用 Web 管理界面: {}", web_dist_path.display());
        Some(
            ServeDir::new(&web_dist_path)
                .not_found_service(ServeFile::new(web_dist_path.join("index.html")))
        )
    } else {
        tracing::warn!("Web 管理界面未找到: {}，跳过静态文件服务", web_dist_path.display());
        None
    };

    let app = Router::new()
        .merge(anthropic_router)
        .nest("/admin", admin_router);

    // 如果有 Web 界面，添加静态文件服务
    let app = if let Some(serve_dir) = serve_web {
        app.fallback_service(serve_dir)
    } else {
        app
    };

    // 启动服务器
    let addr = format!("{}:{}", config.host, config.port);
    tracing::info!("启动 Anthropic API 端点: {}", addr);
    tracing::info!("API Key: {}***", &api_key[..(api_key.len()/2)]);
    tracing::info!("可用 API:");
    tracing::info!("  GET  /v1/models");
    tracing::info!("  POST /v1/messages");
    tracing::info!("  POST /v1/messages/count_tokens");
    tracing::info!("Admin API:");
    tracing::info!("  GET  /admin/pool/status");
    tracing::info!("  GET  /admin/accounts");
    tracing::info!("  POST /admin/accounts");
    tracing::info!("  POST /admin/accounts/remove");
    tracing::info!("  POST /admin/accounts/refresh");
    tracing::info!("  POST /admin/accounts/reset");
    tracing::info!("  GET  /admin/config");
    tracing::info!("API Key 管理:");
    tracing::info!("  POST /admin/api-keys");
    tracing::info!("  GET  /admin/api-keys");
    tracing::info!("  PUT  /admin/api-keys/:id");
    tracing::info!("  DELETE /admin/api-keys/:id");
    tracing::info!("用量统计:");
    tracing::info!("  GET  /admin/usage");
    if web_dist_path.exists() {
        tracing::info!("Web 管理界面: http://{}", addr);
    }

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
