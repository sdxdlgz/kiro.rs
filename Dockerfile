# 构建后端
FROM rust:latest as backend-builder

WORKDIR /app
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

COPY Cargo.toml Cargo.lock ./
COPY src ./src

RUN cargo build --release

# 构建前端
FROM node:22-slim as frontend-builder

WORKDIR /app
COPY web/package*.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

# 运行时镜像
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 复制后端二进制
COPY --from=backend-builder /app/target/release/kiro-rs .

# 复制前端静态文件
COPY --from=frontend-builder /app/dist ./web/dist

# 创建凭证目录
RUN mkdir -p credentials

EXPOSE 8990

CMD ["./kiro-rs"]
