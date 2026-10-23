# 开发笔记 — 初始化 Vite + Phaser 3 + TypeScript 脚手架

> 2026-10-23 18:08 | LLM

## 产出文件
- [scripts/capture-acceptance.mjs](/app#repo?file=scripts/capture-acceptance.mjs) (10998 chars)
- [scripts/generate-scaffold.mjs](/app#repo?file=scripts/generate-scaffold.mjs) (5852 chars)

## 自测: 自测 7/7 通过 ✅

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 文件产出 | ✅ | 2 个文件 |
| 入口文件 | ✅ | 存在 |
| 代码非空 | ✅ | 通过 |
| 语法检查 | ✅ | 通过 |
| 文件名规范 | ✅ | 全英文 |
| 磁盘落地 | ✅ | 2 个文件已落盘 |
| 页面截图 | ✅ | 1 张截图 |

## 代码变更 (Diff)

### scripts/capture-acceptance.mjs (新建, 10998 chars)
```
+ #!/usr/bin/env node
+ /**
+  * scripts/capture-acceptance.mjs
+  *
+  * Acceptance-evidence capturer for the Vite + Phaser 3 + TypeScript scaffold.
+  *
+  * Builds the production bundle, serves it with `vite preview`, then drives a
+  * headless Chromium (Chrome or Edge) to (1) confirm the live page mounts a
+  * Phaser-created <canvas> inside #game-container and (2) write a screenshot of
+  * the running game shell into the requirement's screenshots dir as
+  * `dev_<epoch-seconds>.png`, matching the existing dev-screenshot naming.
+  *
+  * This is the visual acceptance artifact: it proves the scaffold "runs" (a
+  * canvas is mounted) and records what it looks like, complementing the static
+  * checks in scripts/verify-files.mjs and build/integrity-gate.mjs and the
+  * type-check / build / serve pipeline in build/smoke-test.mjs.
+  *
+  * Usage:
+  *   node scripts/capture-acceptance.mjs
+  *   node scripts/capture-acceptance.mjs --skip-build
+ ... (更多)
```

### scripts/generate-scaffold.mjs (新建, 5852 chars)
```
+ #!/usr/bin/env node
+ /**
+  * scripts/generate-scaffold.mjs
+  *
+  * Idempotent scaffold generator for the Vite + Phaser 3 + TypeScript project.
+  * Writes every scaffold file in the architecture doc's module layout
+  * (EntryPoint / Constants / GameConfig / GameScene) plus tooling config.
+  *
+  * Deterministic: re-running it reproduces identical files, so it doubles as a
+  * "reset to known-good" step. Pair with scripts/verify-files.mjs (static
+  * presence check) and the build/ pipeline (type-check / build / serve) for the
+  * full confidence ladder.
+  *
+  * Usage: node scripts/generate-scaffold.mjs
+  */
+ 
+ import { mkdirSync, writeFileSync } from 'node:fs';
+ import { fileURLToPath } from 'node:url';
+ import path from 'node:path';
+ 
+ ... (更多)
```

## 页面预览截图

![开发自测 — 初始化 Vite + Phaser 3 + TypeScri](screenshots/dev_1792750079.png)

