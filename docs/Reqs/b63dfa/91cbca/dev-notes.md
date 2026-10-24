# 开发笔记 — 可玩原型验收自测

> 2026-10-24 12:13 | LLM

## 产出文件
- [src/acceptance/acceptanceProbe.ts](/app#repo?file=src/acceptance/acceptanceProbe.ts) (19925 chars)
- [src/config/gameConfig.ts](/app#repo?file=src/config/gameConfig.ts) (1368 chars)
- [src/input/touchControls.ts](/app#repo?file=src/input/touchControls.ts) (5581 chars)
- [src/level/levelBuilder.ts](/app#repo?file=src/level/levelBuilder.ts) (7300 chars)
- [src/level/levelLayout.ts](/app#repo?file=src/level/levelLayout.ts) (9202 chars)

## 自测: 自测 7/7 通过 ✅

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 文件产出 | ✅ | 5 个文件 |
| 入口文件 | ✅ | 存在 |
| 代码非空 | ✅ | 通过 |
| 语法检查 | ✅ | 通过 |
| 文件名规范 | ✅ | 全英文 |
| 磁盘落地 | ✅ | 5 个文件已落盘 |
| 页面截图 | ✅ | 1 张截图 |

## 代码变更 (Diff)

### src/acceptance/acceptanceProbe.ts (修改)
```diff
--- a/src/acceptance/acceptanceProbe.ts
+++ b/src/acceptance/acceptanceProbe.ts
@@ -479,6 +479,162 @@
       const jumped = await page

         .waitForFunction(

           () => (window as unknown as ProbeWindow).__game!.getState()!.jumpCount >= 1,

-

-

-/* ... [文件截断显示：原文 19897 字符，当前只显示前 15000；代码本身完整，保留未显示部分] ... */
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

+        )

+        .then(() => true)

+        .catch(() => false);

+      checks.push({

+        name: 'touch-dash',

+        passed: tappedDash && dashed,

+        detail: `tapped=${tappedDash} cd=${(await this.getState(page))?.dashCooldownRemaining}ms`,

+      });

+    } finally {

+      await ctx.close();

+    }

+    return screenshots;

+  }

+

+  /** 截屏 + 与基线比对（基线缺失时按 updateBaselines 决定建立或判失败） */

+  private async capture(page: Page, name: string): Promise<ScreenshotOutcome> {

+    const shotPath = join(this.opts.screenshotDir, `${name}.png`);

+    const basePath = join(this.opts.baselineDir, `${name}.png`);

+    mkdirSync(dirname(shotPath), { recursive: true });

+    const actual = await page.screenshot({ path: shotPath });

+

+    if (!existsSync(basePath)) {

+      if (this.opts.updateBaselines) {

+        mkdirSync(dirname(basePath), { recursive: true });

... (共 168 行变更)
```

### src/config/gameConfig.ts (修改)
```diff
--- a/src/config/gameConfig.ts
+++ b/src/config/gameConfig.ts
@@ -1,6 +1,6 @@
 import Phaser from "phaser";

 

-import { BootScene } from "../scenes/BootScene";

+import BootScene from "../scenes/BootScene";

 import { PreloadScene } from "../scenes/PreloadScene";

 import { GameScene } from "../scenes/GameScene";

 import { UIScene } from "../scenes/UIScene";

```

### src/input/touchControls.ts (修改)
```diff
--- a/src/input/touchControls.ts
+++ b/src/input/touchControls.ts
@@ -162,7 +162,7 @@
     const label = this.scene.add

       .text(layout.x, layout.y, layout.label, {

         fontFamily: 'monospace',

-        fontWeight: '700',

+        fontStyle: 'bold',

         fontSize: `${layout.fontSize}px`,

         color: COLORS.textPrimary,

       })

```

### src/level/levelBuilder.ts (修改)
```diff
--- a/src/level/levelBuilder.ts
+++ b/src/level/levelBuilder.ts
@@ -4,7 +4,6 @@
   GAME_WIDTH,

   GROUND_TOP,

   GROUND_HEIGHT,

-  PLAYER_WIDTH,

   PLAYER_HEIGHT,

   COLORS,

 } from '../constants';

@@ -166,9 +165,8 @@
 

   /** 在场景中构建关卡并返回句柄 */

   build(def: LevelDefinition): BuiltLevel {

-    const { width: sceneW, height: sceneH } = this.scene.scale;

+    const { width: sceneW } = this.scene.scale;

     const levelW = GAME_WIDTH || sceneW;

-    const levelH = Math.max(sceneH, GROUND_TOP + GROUND_HEIGHT);

 

     // 地面：全宽静态体，保证原型始终可站立（与 main.ts 的 ground 一致）

     const ground = this.scene.add.rectangle(

```

### src/level/levelLayout.ts (修改)
```diff
--- a/src/level/levelLayout.ts
+++ b/src/level/levelLayout.ts
@@ -121,7 +121,7 @@
 //  - goal：终点点位，校验完整通关路径。

 // ---------------------------------------------------------------------------

 

-export const LEVEL_LAYOUT: LevelLayout = Object.freeze({

+export const LEVEL_LAYOUT: LevelLayout = Object.freeze<LevelLayout>({

   name: 'prototype-acceptance',

   width: GAME_WIDTH,

   height: GAME_HEIGHT,

```

## 页面预览截图

![开发自测 — 可玩原型验收自测](screenshots/dev_1792815222.png)

