# 开发笔记 — 可玩原型验收自测

> 2026-10-24 12:25 | LLM

## 产出文件
- [src/acceptance/acceptanceProbe.ts](/app#repo?file=src/acceptance/acceptanceProbe.ts) (20231 chars)
- [src/main.ts](/app#repo?file=src/main.ts) (10848 chars)
- [src/scenes/GameScene.ts](/app#repo?file=src/scenes/GameScene.ts) (10244 chars)

## 自测: 自测 7/7 通过 ✅

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 文件产出 | ✅ | 3 个文件 |
| 入口文件 | ✅ | 存在 |
| 代码非空 | ✅ | 通过 |
| 语法检查 | ✅ | 通过 |
| 文件名规范 | ✅ | 全英文 |
| 磁盘落地 | ✅ | 3 个文件已落盘 |
| 页面截图 | ✅ | 1 张截图 |

## 代码变更 (Diff)

### src/acceptance/acceptanceProbe.ts (修改)
```diff
--- a/src/acceptance/acceptanceProbe.ts
+++ b/src/acceptance/acceptanceProbe.ts
@@ -25,8 +25,8 @@
  */

 

 import { chromium, type Browser, type Page } from 'playwright';

-import { PNG } from 'pngjs';

 import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

+import { createRequire } from 'node:module';

 import { dirname, join, resolve } from 'node:path';

 import { fileURLToPath } from 'node:url';

 

@@ -38,6 +38,13 @@
   TOUCH_QUERY_PARAM,

 } from '../constants';

 import { getLevelSummary, type LevelSummary } from '../level/levelLayout';

+

+// pngjs 是 playwright 的 Node-only 传递依赖，主项目（浏览器）tsc 编译面无法解析其类型；

+// 改为运行时 require 并以内联最小结构声明返回类型，规避 TS2307 且不影响像素比对逻辑。

+const require = createRequire(import.meta.url);

+const { PNG } = require('pngjs') as {

+  sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } };

+};

 

 // ---------------------------------------------------------------------------

 // 运行时钩子类型（与 index.html / main.ts 的 window.__game、BootScene 的

@@ -479,6 +486,162 @@
       const jumped = await page

         .waitForFunction(

           () => (window as unknown as ProbeWindow).__game!.getState()!.jumpCount >= 1,

-

-

-/* ... [文件截断显示：原文 19925 字符，当前只显示前 15000；代码本身完整，保留未显示部分] ... */
+          undefined,

+          { timeout: 3000 },

+        )

+        .then(() => true)

+        .catch(() => false);

+      checks.push({

+        name: 'touch-jump',

+        passed: tappedJump && jumped,

+        detail: `tapped=${tappedJump} jumpCount=${(await this.getState(page))?.jumpCount}`,

+      });

+

+      const tappedDash = await tapControl(page, 'btn-dash', TOUCH_BUTTONS.dash);

+      const dashed = await page

+        .waitForFunction(

+          () => (window as unknown as ProbeWindow).__game!.getState()!.dashCooldownRemaining > 0,

+          undefined,

+          { timeout: 3000 },

... (共 192 行变更)
```

### src/main.ts (新建, 10848 chars)
```
+ import Phaser from 'phaser';
+ 
+ // ---- Tunables (acceptance baseline) ----
+ const GAME_W = 960;
+ const GAME_H = 540;
+ const GROUND_TOP = 480;
+ const GRAVITY = 1500;
+ const MOVE_SPEED = 360;
+ const JUMP_VELOCITY = -620;
+ const MAX_JUMPS = 2;
+ const DASH_SPEED = 1100;
+ const DASH_DURATION = 150;
+ const DASH_COOLDOWN = 800;
+ const INVINCIBLE_MS = 250;
+ 
+ // ---- Shared input state (keyboard + touch) ----
+ const inputState = { left: false, right: false };
+ const pendingActions = { jump: false, dash: false };
+ 
+ // ---- Touch fallback detection ----
+ ... (更多)
```

### src/scenes/GameScene.ts (新建, 10244 chars)
```
+ import Phaser from 'phaser';
+ 
+ import {
+   GAME_WIDTH,
+   GROUND_TOP,
+   GROUND_HEIGHT,
+   GRAVITY_Y,
+   MAX_FALL_SPEED,
+   PLAYER_WIDTH,
+   PLAYER_HEIGHT,
+   MOVE_SPEED,
+   JUMP_VELOCITY,
+   MAX_JUMPS,
+   DASH_SPEED,
+   DASH_DURATION_MS,
+   DASH_COOLDOWN_MS,
+   INVINCIBLE_MS,
+   COLORS,
+   shouldShowTouchControls,
+   TOUCH_BUTTONS,
+ ... (更多)
```

## 页面预览截图

![开发自测 — 可玩原型验收自测](screenshots/dev_1792815927.png)

