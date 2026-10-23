# 开发笔记 — 初始化 Vite + Phaser 3 + TypeScript 脚手架

> 2026-10-23 15:35 | LLM

## 产出文件
- [build/smoke-test.mjs](/app#repo?file=build/smoke-test.mjs) (4486 chars)
- [build/Dockerfile](/app#repo?file=build/Dockerfile) (400 chars)
- [build/docker-compose.yml](/app#repo?file=build/docker-compose.yml) (153 chars)

## 自测: 自测 6/6 通过 ✅

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 文件产出 | ✅ | 3 个文件 |
| 入口文件 | ✅ | 存在 |
| 代码非空 | ✅ | 通过 |
| 语法检查 | ✅ | 通过 |
| 文件名规范 | ✅ | 全英文 |
| 磁盘落地 | ✅ | 3 个文件已落盘 |

## 代码变更 (Diff)

### build/smoke-test.mjs (新建, 4486 chars)
```
+ #!/usr/bin/env node
+ /**
+  * build/smoke-test.mjs
+  *
+  * Smoke test for the Vite + Phaser 3 + TypeScript scaffold. Verifies the
+  * project (1) type-checks, (2) bundles, and (3) serves a page whose bundle
+  * contains both the Phaser library and our game wiring.
+  *
+  * Usage: node build/smoke-test.mjs
+  */
+ 
+ import { spawn } from 'node:child_process';
+ import { existsSync } from 'node:fs';
+ import { fileURLToPath } from 'node:url';
+ import path from 'node:path';
+ 
+ // ---------------------------------------------------------------------------
+ // Paths & constants
+ // ---------------------------------------------------------------------------
+ const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
+ ... (更多)
```

### build/Dockerfile (新建, 400 chars)
```
+ # ---------- Stage 1: build the static bundle ----------
+ FROM node:20-alpine AS build
+ WORKDIR /app
+ COPY package.json package-lock.json ./
+ RUN npm ci
+ COPY index.html tsconfig.json vite.config.ts ./
+ COPY src ./src
+ RUN npm run build
+ 
+ # ---------- Stage 2: serve dist/ with nginx ----------
+ FROM nginx:alpine
+ COPY --from=build /app/dist /usr/share/nginx/html
+ EXPOSE 80
+ CMD ["nginx", "-g", "daemon off;"]
+ 
```

### build/docker-compose.yml (新建, 153 chars)
```
+ version: '3.8'
+ services:
+   app:
+     build:
+       context: ..
+       dockerfile: build/Dockerfile
+     ports:
+       - "8080:80"
+     restart: unless-stopped
+ 
```
