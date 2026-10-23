# 开发笔记 — 搭建关卡场景：地面与平台

> 2026-10-23 21:18 | LLM

## 产出文件
- [src/level/levelLayout.ts](/app#repo?file=src/level/levelLayout.ts) (3286 chars)
- [src/level/levelBuilder.ts](/app#repo?file=src/level/levelBuilder.ts) (3866 chars)
- [src/constants.ts](/app#repo?file=src/constants.ts) (815 chars)
- [src/scenes/GameScene.ts](/app#repo?file=src/scenes/GameScene.ts) (1034 chars)

## 自测: 自测 7/7 通过 ✅

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 文件产出 | ✅ | 4 个文件 |
| 入口文件 | ✅ | 存在 |
| 代码非空 | ✅ | 通过 |
| 语法检查 | ✅ | 通过 |
| 文件名规范 | ✅ | 全英文 |
| 磁盘落地 | ✅ | 4 个文件已落盘 |
| 页面截图 | ✅ | 1 张截图 |

## 代码变更 (Diff)

### src/level/levelLayout.ts (新建, 3286 chars)
```
+ // Pure, typed, data-driven level definition for the "ground & platforms" ticket.
+ // Deliberately free of any Phaser import: the layout is plain data so it can be
+ // tuned and unit-tested independently of rendering. LevelBuilder consumes this
+ // data and turns each rect into an Arcade static physics body.
+ 
+ // ---------------------------------------------------------------------------
+ // World geometry tokens — single source of truth for level sizing.
+ // Values mirror the "level" section of the design tokens (docs/Reqs/.../design_tokens.json).
+ // ---------------------------------------------------------------------------
+ 
+ /** Total world width. Wider than the 960px viewport to allow horizontal scroll. */
+ export const WORLD_WIDTH = 1920;
+ 
+ /** Total world height (matches the 540px design height). */
+ export const WORLD_HEIGHT = 540;
+ 
+ /** Y of the ground's top surface. */
+ export const GROUND_TOP_Y = 480;
+ 
+ /** Ground slab thickness. */
+ ... (更多)
```

### src/level/levelBuilder.ts (新建, 3866 chars)
```
+ // Renders the static level (ground, floating platforms, world boundaries) into
+ // a Phaser scene. Layout data lives in levelLayout.ts as plain, Phaser-free
+ // data; this builder is the single place that turns each rect into a visible
+ // game object plus an Arcade static body.
+ //
+ // "Boundaries" are implemented as the Arcade world bounds + camera clamp: the
+ // playable area is exactly the world rect from levelLayout.worldBounds, so the
+ // camera never pans past the edges and bodies are kept inside it.
+ 
+ import Phaser from 'phaser';
+ import { LevelLayout, Platform, Rect, levelLayout } from './levelLayout';
+ 
+ // Level-specific fill/surface tones sourced from the "colors" section of
+ // docs/Reqs/b63dfa/6ea9b5/design_tokens.json (ground_fill, ground_surface,
+ // platform_fill, platform_surface). Kept local because these extend the base
+ // COLORS palette in constants.ts and are only used by the level renderer.
+ const LEVEL_COLORS = {
+   groundFill: '#1E293B',
+   groundSurface: '#22D3EE',
+   platformFill: '#4F46E5',
+ ... (更多)
```

### src/constants.ts (修改)
```diff
--- a/src/constants.ts
+++ b/src/constants.ts
@@ -11,6 +11,7 @@
 export const DESIGN_HEIGHT = 540;

 

 // Color tokens sourced from docs/Reqs/b63dfa/982770/design_tokens.json.

+// Ground/platform tones extend the palette (docs/Reqs/b63dfa/6ea9b5/design_tokens.json).

 export const COLORS = {

   bg: '#0F172A',

   bgAlt: '#1E293B',

@@ -21,4 +22,8 @@
   success: '#22C55E',

   warning: '#F59E0B',

   error: '#EF4444',

+  groundFill: '#1E293B',

+  groundSurface: '#22D3EE',

+  platformFill: '#4F46E5',

+  platformSurface: '#22D3EE',

 } as const;
```

### src/scenes/GameScene.ts (修改)
```diff
--- a/src/scenes/GameScene.ts
+++ b/src/scenes/GameScene.ts
@@ -1,11 +1,15 @@
 import Phaser from 'phaser';

 import { COLORS, SceneKey } from '../constants';

+import { LevelBuilder } from '../level/levelBuilder';

 

-// Empty shell scene: solid background + lifecycle hooks, ready for the

+// Solid background + static level geometry (ground & platforms), ready for the

 // movement / double-jump / dash tickets to build on.

 export class GameScene extends Phaser.Scene {

+  private readonly levelBuilder: LevelBuilder;

+

   constructor() {

     super({ key: SceneKey.Game });

+    this.levelBuilder = new LevelBuilder();

   }

 

   create(): void {

@@ -15,6 +19,10 @@
     // Solid-color background (no texture), per the visual spec.

     this.cameras.main.setBackgroundColor(COLORS.bg);

 

+    // Build the static level (ground + floating platforms) and apply the

+    // world + camera bounds, per the "ground & platforms" ticket.

+    this.levelBuilder.build(this);

+

     // TODO(platformer): future tickets extend here.

     // - player sprite: double jump + dash

     // - HUD: score / lives / key hints

```

## 页面预览截图

![开发自测 — 搭建关卡场景：地面与平台](screenshots/dev_1792761501.png)

