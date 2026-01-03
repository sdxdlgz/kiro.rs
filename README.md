# kiro-rs

一个用 Rust 编写的 Anthropic Claude API 兼容代理服务，将 Anthropic API 请求转换为 Kiro API 请求。

## 功能特性

- **Anthropic API 兼容**: 完整支持 Anthropic Claude API 格式
- **流式响应**: 支持 SSE (Server-Sent Events) 流式输出
- **Token 自动刷新**: 自动管理和刷新 OAuth Token，刷新后自动持久化到文件
- **多账号轮询**: 支持多账号负载均衡，自动故障转移和恢复
- **Web 管理界面**: 现代化的 Web UI，支持账号管理、额度监控、批量操作
- **Admin API**: RESTful API 用于程序化管理账号和监控状态
- **Thinking 模式**: 支持 Claude 的 extended thinking 功能
- **工具调用**: 完整支持 function calling / tool use
- **多模型支持**: 支持 Sonnet、Opus、Haiku 系列模型

## 支持的 API 端点

### Anthropic 兼容 API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/v1/models` | GET | 获取可用模型列表 |
| `/v1/messages` | POST | 创建消息（对话） |
| `/v1/messages/count_tokens` | POST | 估算 Token 数量 |

### Admin API

| 端点 | 方法 | 描述 |
|------|------|------|
| `/admin/pool/status` | GET | 获取轮换池状态 |
| `/admin/accounts` | GET | 获取所有账号列表 |
| `/admin/accounts` | POST | 添加新账号 |
| `/admin/accounts/remove` | POST | 删除账号 |
| `/admin/accounts/refresh` | POST | 刷新账号 Token |
| `/admin/accounts/reset` | POST | 重置账号状态 |
| `/admin/accounts/check` | POST | 检查账号额度 |
| `/admin/accounts/batch-check` | POST | 批量检查账号额度 |
| `/admin/accounts/import-sso` | POST | 从 SSO Token 导入账号 |
| `/admin/accounts/credentials` | POST | 获取账号凭证（用于导出） |
| `/admin/config` | GET | 获取服务配置 |

## 快速开始

### 1. 编译项目

```bash
# 编译后端
cargo build --release

# 编译前端（可选，用于 Web 管理界面）
cd web && npm install && npm run build
```

### 2. 配置文件

创建 `config.json` 配置文件：

```json
{
   "host": "127.0.0.1",
   "port": 8990,
   "apiKey": "sk-kiro-rs-qazWSXedcRFV123456",
   "region": "us-east-1",
   "kiroVersion": "0.8.0",
   "machineId": "如果你需要自定义机器码请将64位机器码填到这里",
   "systemVersion": "darwin#24.6.0",
   "nodeVersion": "22.21.1",
   "credentialsDir": "credentials",
   "failureCooldownSecs": 60,
   "maxFailures": 5,
   "countTokensApiUrl": "https://api.example.com/v1/messages/count_tokens",
   "countTokensApiKey": "sk-your-count-tokens-api-key",
   "countTokensAuthType": "x-api-key"
}
```

### 3. 凭证文件

#### 单账号模式

创建 `credentials.json` 凭证文件（从 Kiro IDE 获取）：

```json
{
  "accessToken": "your-access-token",
  "refreshToken": "your-refresh-token",
  "profileArn": "arn:aws:codewhisperer:us-east-1:{12位数字}:profile/{12位大写字母数字字符串}",
  "expiresAt": "2024-01-01T00:00:00Z",
  "authMethod": "social",
  "provider": "Google"
}
```

#### 多账号模式

创建 `credentials/` 目录，每个账号一个 JSON 文件：

```
credentials/
├── account1.json
├── account2.json
└── account3.json
```

每个文件格式与单账号相同。在 `config.json` 中设置 `credentialsDir` 启用多账号模式：

```json
{
  "credentialsDir": "credentials"
}
```

### 4. 启动服务

```bash
./target/release/kiro-rs
```

或指定配置文件路径：

```bash
./target/release/kiro-rs -c /path/to/config.json --credentials /path/to/credentials.json
```

### 5. 访问 Web 管理界面

启动服务后，访问 `http://127.0.0.1:8990` 即可打开 Web 管理界面。

功能包括：
- **仪表盘**: 查看轮换池状态、账号健康度、额度统计
- **账号管理**: 添加/删除账号、检查额度、刷新 Token、导入导出
- **分组和标签**: 对账号进行分组和标签管理（本地存储）

### 6. 使用 API

```bash
curl http://127.0.0.1:8990/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk-your-custom-api-key" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello, Claude!"}
    ]
  }'
```

## 部署指南

### 方式一：Docker 部署（推荐）

创建 `Dockerfile`：

```dockerfile
FROM rust:1.83-slim as builder

WORKDIR /app
COPY . .
RUN cargo build --release

FROM node:22-slim as frontend
WORKDIR /app
COPY web/ .
RUN npm ci && npm run build

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/target/release/kiro-rs .
COPY --from=frontend /app/dist ./web/dist

EXPOSE 8990
CMD ["./kiro-rs"]
```

创建 `docker-compose.yml`：

```yaml
version: '3.8'
services:
  kiro-rs:
    build: .
    ports:
      - "8990:8990"
    volumes:
      - ./config.json:/app/config.json:ro
      - ./credentials:/app/credentials
    restart: unless-stopped
    environment:
      - RUST_LOG=info
```

启动：

```bash
docker-compose up -d
```

### 方式二：直接部署

#### 1. 安装依赖

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y build-essential pkg-config libssl-dev

# 安装 Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# 安装 Node.js (用于编译前端)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

#### 2. 编译

```bash
# 克隆代码
git clone https://github.com/sdxdlgz/kiro.rs.git
cd kiro.rs

# 编译后端
cargo build --release

# 编译前端
cd web && npm ci && npm run build && cd ..
```

#### 3. 配置

```bash
# 创建配置文件
cp config.example.json config.json
vim config.json

# 创建凭证目录
mkdir -p credentials
# 将凭证文件放入 credentials/ 目录
```

#### 4. 使用 systemd 管理服务

创建 `/etc/systemd/system/kiro-rs.service`：

```ini
[Unit]
Description=Kiro.rs API Proxy
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/kiro-rs
ExecStart=/opt/kiro-rs/kiro-rs
Restart=always
RestartSec=5
Environment=RUST_LOG=info

[Install]
WantedBy=multi-user.target
```

启动服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable kiro-rs
sudo systemctl start kiro-rs
sudo systemctl status kiro-rs
```

#### 5. 配置 Nginx 反向代理（可选）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:8990;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;

        # SSE 支持
        proxy_buffering off;
        proxy_read_timeout 86400;
    }
}
```

## 配置说明

### config.json

| 字段 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `host` | string | `127.0.0.1` | 服务监听地址 |
| `port` | number | `8080` | 服务监听端口 |
| `apiKey` | string | - | 自定义 API Key（用于客户端认证） |
| `region` | string | `us-east-1` | AWS 区域 |
| `kiroVersion` | string | `0.8.0` | Kiro 版本号 |
| `machineId` | string | - | 自定义机器码（64位十六进制）不定义则自动生成 |
| `systemVersion` | string | 随机 | 系统版本标识 |
| `nodeVersion` | string | `22.21.1` | Node.js 版本标识 |
| `countTokensApiUrl` | string | - | 外部 count_tokens API 地址（可选） |
| `countTokensApiKey` | string | - | 外部 count_tokens API 密钥（可选） |
| `countTokensAuthType` | string | `x-api-key` | 外部 API 认证类型：`x-api-key` 或 `bearer` |
| `credentialsDir` | string | - | 多账号凭证目录路径（可选，设置后启用多账号模式） |
| `failureCooldownSecs` | number | `60` | 账号失败后冷却时间（秒） |
| `maxFailures` | number | `5` | 最大连续失败次数，超过后永久禁用账号 |

### credentials.json

| 字段 | 类型 | 描述 |
|------|------|------|
| `accessToken` | string | OAuth 访问令牌 |
| `refreshToken` | string | OAuth 刷新令牌 |
| `profileArn` | string | AWS Profile ARN (登录时返回) |
| `expiresAt` | string | Token 过期时间 (RFC3339) |
| `authMethod` | string | 认证方式 |
| `provider` | string | 认证提供者 |

## 模型映射

| Anthropic 模型 | Kiro 模型 |
|----------------|-----------|
| `*sonnet*` | `claude-sonnet-4.5` |
| `*opus*` | `claude-opus-4.5` |
| `*haiku*` | `claude-haiku-4.5` |

## 项目结构

```
kiro-rs/
├── src/
│   ├── main.rs                 # 程序入口
│   ├── model/                  # 配置和参数模型
│   │   ├── config.rs           # 应用配置
│   │   └── arg.rs              # 命令行参数
│   ├── anthropic/              # Anthropic API 兼容层
│   │   ├── router.rs           # 路由配置
│   │   ├── handlers.rs         # 请求处理器
│   │   ├── middleware.rs       # 认证中间件
│   │   ├── types.rs            # 类型定义
│   │   ├── converter.rs        # 协议转换器
│   │   ├── stream.rs           # 流式响应处理
│   │   └── token.rs            # Token 估算
│   ├── admin/                  # Admin API
│   │   ├── router.rs           # Admin 路由
│   │   ├── handlers.rs         # Admin 处理器
│   │   └── types.rs            # Admin 类型定义
│   └── kiro/                   # Kiro API 客户端
│       ├── provider.rs         # API 提供者
│       ├── token_manager.rs    # Token 管理
│       ├── account_pool.rs     # 多账号池管理
│       ├── machine_id.rs       # 设备指纹生成
│       ├── model/              # 数据模型
│       │   ├── credentials.rs  # OAuth 凭证
│       │   ├── usage_limits.rs # 额度查询
│       │   ├── events/         # 响应事件类型
│       │   ├── requests/       # 请求类型
│       │   └── common/         # 共享类型
│       └── parser/             # AWS Event Stream 解析器
│           ├── decoder.rs      # 流式解码器
│           ├── frame.rs        # 帧解析
│           ├── header.rs       # 头部解析
│           └── crc.rs          # CRC 校验
├── web/                        # Web 管理界面
│   ├── src/
│   │   ├── pages/              # 页面组件
│   │   │   ├── Dashboard.tsx   # 仪表盘
│   │   │   └── Accounts.tsx    # 账号管理
│   │   ├── components/         # UI 组件
│   │   ├── hooks/              # React Hooks
│   │   ├── api/                # API 客户端
│   │   └── types/              # TypeScript 类型
│   └── dist/                   # 编译输出
├── Cargo.toml                  # Rust 项目配置
├── config.example.json         # 配置示例
└── credentials.json            # 凭证文件
```

## 技术栈

### 后端
- **Web 框架**: [Axum](https://github.com/tokio-rs/axum) 0.8
- **异步运行时**: [Tokio](https://tokio.rs/)
- **HTTP 客户端**: [Reqwest](https://github.com/seanmonstar/reqwest)
- **序列化**: [Serde](https://serde.rs/)
- **日志**: [tracing](https://github.com/tokio-rs/tracing)
- **命令行**: [Clap](https://github.com/clap-rs/clap)

### 前端
- **框架**: [React](https://react.dev/) 19
- **构建工具**: [Vite](https://vitejs.dev/)
- **样式**: [Tailwind CSS](https://tailwindcss.com/)
- **UI 组件**: [shadcn/ui](https://ui.shadcn.com/)
- **图标**: [Lucide](https://lucide.dev/)
- **虚拟列表**: [@tanstack/react-virtual](https://tanstack.com/virtual)

## 高级功能

### Thinking 模式

支持 Claude 的 extended thinking 功能：

```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 16000,
  "thinking": {
    "type": "enabled",
    "budget_tokens": 10000
  },
  "messages": [...]
}
```

### 工具调用

完整支持 Anthropic 的 tool use 功能：

```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 1024,
  "tools": [
    {
      "name": "get_weather",
      "description": "获取指定城市的天气",
      "input_schema": {
        "type": "object",
        "properties": {
          "city": {"type": "string"}
        },
        "required": ["city"]
      }
    }
  ],
  "messages": [...]
}
```

### 流式响应

设置 `stream: true` 启用 SSE 流式响应：

```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 1024,
  "stream": true,
  "messages": [...]
}
```

### 多账号轮询

支持多账号负载均衡和故障转移：

**特性：**
- **最少使用策略**: 自动选择请求次数最少的账号，实现负载均衡
- **自动故障转移**: 账号请求失败时自动标记为不健康，切换到其他账号
- **自动恢复**: 不健康账号在冷却期后自动恢复
- **凭证持久化**: Token 刷新后自动保存到对应的凭证文件

**配置示例：**

```json
{
  "credentialsDir": "credentials",
  "failureCooldownSecs": 60,
  "maxFailures": 5
}
```

**目录结构：**

```
credentials/
├── google-account.json
├── github-account.json
└── aws-account.json
```

**运行日志示例：**

```
账号池初始化完成，共 3 个账号
账号池状态: 3 个账号, 3 个健康
使用账号: google-account (请求次数: 1)
使用账号: github-account (请求次数: 1)
使用账号: aws-account (请求次数: 1)
使用账号: google-account (请求次数: 2)
```

## 认证方式

支持两种 API Key 认证方式：

1. **x-api-key Header**
   ```
   x-api-key: sk-your-api-key
   ```

2. **Authorization Bearer**
   ```
   Authorization: Bearer sk-your-api-key
   ```

## 环境变量

可通过环境变量配置日志级别：

```bash
RUST_LOG=debug ./target/release/kiro-rs
```

## 注意事项

1. **凭证安全**: 请妥善保管 `credentials.json` 文件，不要提交到版本控制
2. **Token 刷新**: 服务会自动刷新过期的 Token，无需手动干预
3. **不支持的工具**: `web_search` 和 `websearch` 工具会被自动过滤
4. **Web 界面**: 生产环境建议配置 Nginx 反向代理并启用 HTTPS

## License

MIT

## 致谢

本项目的实现离不开前辈的努力:
 - [kiro2api](https://github.com/caidaoli/kiro2api)
 - [proxycast](https://github.com/aiclientproxy/proxycast)

本项目部分逻辑参考了以上的项目, 再次由衷的感谢!
