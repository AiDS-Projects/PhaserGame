# 开发笔记 — 实现玩家移动与重力物理

> 2026-10-24 00:41 | LLM

## 产出文件
- [src/gameobjects/Player.ts](/app#repo?file=src/gameobjects/Player.ts) (2470 chars)
- [src/scenes/GameScene.ts](/app#repo?file=src/scenes/GameScene.ts) (1893 chars)
- [src/constants.ts](/app#repo?file=src/constants.ts) (1129 chars)

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

### src/gameobjects/Player.ts (新建, 2470 chars)
```
+ import Phaser from 'phaser';
+ 
+ /**
+  * 玩家角色：基于 Arcade Physics 实现左右移动、跳跃、重力与碰撞，
+  * 并提供相机跟随能力。
+  *
+  * - 重力由场景的 Arcade Physics 配置提供（如 `physics.arcade.gravity.y`），
+  *   本类作为物理体自然参与重力与碰撞（与地面 / 平台 / 边界的 collider 由场景建立）。
+  */
+ export class Player extends Phaser.Physics.Arcade.Sprite {
+   /** 水平移动速度（px/s） */
+   private readonly moveSpeed: number;
+   /** 跳跃初速度（负值表示向上，px/s） */
+   private readonly jumpVelocity: number;
+ 
+   private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
+   private keyA: Phaser.Input.Keyboard.Key;
+   private keyD: Phaser.Input.Keyboard.Key;
+   private keyW: Phaser.Input.Keyboard.Key;
+   private keySpace: Phaser.Input.Keyboard.Key;
+ ... (更多)
```

### src/scenes/GameScene.ts (修改)
```diff
--- a/src/scenes/GameScene.ts
+++ b/src/scenes/GameScene.ts
@@ -1,11 +1,14 @@
 import Phaser from 'phaser';

 import { COLORS, SceneKey } from '../constants';

 import { LevelBuilder } from '../level/levelBuilder';

+import { Player } from '../gameobjects/Player';

 

-// Solid background + static level geometry (ground & platforms), ready for the

-// movement / double-jump / dash tickets to build on.

+// Solid background + static level geometry (ground & platforms), plus a player

+// that can move left/right, jump, and is affected by gravity — ready for the

+// double-jump / dash tickets to build on.

 export class GameScene extends Phaser.Scene {

   private readonly levelBuilder: LevelBuilder;

+  private player?: Player;

 

   constructor() {

     super({ key: SceneKey.Game });

@@ -23,8 +26,28 @@
     // world + camera bounds, per the "ground & platforms" ticket.

     this.levelBuilder.build(this);

 

-    // TODO(platformer): future tickets extend here.

-    // - player sprite: double jump + dash

-    // - HUD: score / lives / key hints

+    // Gravity: pull the player down so they fall back to the ground and can jump.

+    this.physics.world.gravity.y = 900;

+

+    // Placeholder player texture (visual art comes in a later ticket).

+    if (!this.textures.exists('player')) {

+      const g = this.make.graphics({ add: false });

+      g.fillStyle(0xffffff, 1);

+      g.fillRect(0, 0, 24, 32);

+      g.generateTexture('player', 24, 32);

+      g.destroy();

+    }

+

+    // Spawn the player and make the camera follow them.

+    this.player = new Player(this, 100, 100, 'player');

+    this.player.enableCameraFollow();

+

+    // Collide the player against the static level geometry (ground, platforms, bounds).

+    this.physics.add.collider(this.player, this.levelBuilder.getStaticGroup());

+  }

+

+  update(): void {

+    // Run the player's per-frame movement / jump logic.

+    this.player?.update();

   }

... (共 51 行变更)
```

### src/constants.ts (修改)
```diff
--- a/src/constants.ts
+++ b/src/constants.ts
@@ -26,4 +26,17 @@
   groundSurface: '#22D3EE',

   platformFill: '#4F46E5',

   platformSurface: '#22D3EE',

+} as const;

+

+// Physics tuning for player movement & gravity (Arcade Physics).

+export const PHYSICS = {

+  gravityY: 1200,

+} as const;

+

+// Player movement parameters, shared by Player.ts and the level scene.

+export const PLAYER = {

+  moveSpeed: 260,

+  jumpVelocity: -480,

+  maxVelocityX: 800,

+  maxVelocityY: 1600,

 } as const;
```

## 页面预览截图

![开发自测 — 实现玩家移动与重力物理](screenshots/dev_1792773698.png)

