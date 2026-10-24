# 开发笔记 — 实现冲刺、无敌帧与冷却反馈

> 2026-10-24 11:00 | LLM

## 产出文件
- [src/gameobjects/DashCooldownBar.ts](/app#repo?file=src/gameobjects/DashCooldownBar.ts) (4854 chars)
- [src/gameobjects/Player.ts](/app#repo?file=src/gameobjects/Player.ts) (6471 chars)
- [src/state/PlayerState.ts](/app#repo?file=src/state/PlayerState.ts) (6141 chars)
- [src/scenes/GameScene.ts](/app#repo?file=src/scenes/GameScene.ts) (4797 chars)
- [src/constants.ts](/app#repo?file=src/constants.ts) (1836 chars)
- [src/config/gameConfig.ts](/app#repo?file=src/config/gameConfig.ts) (823 chars)

## 自测: 自测 7/7 通过 ✅

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 文件产出 | ✅ | 6 个文件 |
| 入口文件 | ✅ | 存在 |
| 代码非空 | ✅ | 通过 |
| 语法检查 | ✅ | 通过 |
| 文件名规范 | ✅ | 全英文 |
| 磁盘落地 | ✅ | 6 个文件已落盘 |
| 页面截图 | ✅ | 1 张截图 |

## 代码变更 (Diff)

### src/gameobjects/DashCooldownBar.ts (新建, 4854 chars)
```
+ import Phaser from 'phaser';
+ 
+ export interface DashCooldownBarConfig {
+   /** Total time between dashes, in milliseconds. */
+   cooldownMs: number;
+   /** How long a single dash lasts, in milliseconds. */
+   dashDurationMs: number;
+   /** How long the player stays invincible after dashing, in milliseconds. */
+   invincibleDurationMs: number;
+   /** Bar width in pixels. */
+   width?: number;
+   /** Bar height in pixels. */
+   height?: number;
+   /** Bar position in the scene. */
+   x?: number;
+   y?: number;
+   /** Background fill color (0xRRGGBB). */
+   backgroundColor?: number;
+   /** Border color (0xRRGGBB). */
+   borderColor?: number;
+ ... (更多)
```

### src/gameobjects/Player.ts (修改)
```diff
--- a/src/gameobjects/Player.ts
+++ b/src/gameobjects/Player.ts
@@ -6,6 +6,8 @@
  *

  * - 重力由场景的 Arcade Physics 配置提供（如 `physics.arcade.gravity.y`），

  *   本类作为物理体自然参与重力与碰撞（与地面 / 平台 / 边界的 collider 由场景建立）。

+ * - 冲刺（Dash）：按下 Shift 向当前朝向冲刺，期间禁用重力并进入无敌帧。

+ * - 冷却反馈：冲刺冷却期间角色以灰色染色提示，冷却结束后恢复。

  */

 export class Player extends Phaser.Physics.Arcade.Sprite {

   /** 水平移动速度（px/s） */

@@ -14,24 +16,54 @@
   private readonly jumpVelocity: number;

   /** 最大跳跃次数（支持二段跳） */

   private readonly maxJumps: number;

+  /** 冲刺速度（px/s） */

+  private readonly dashSpeed: number;

+  /** 冲刺持续时间（ms） */

+  private readonly dashDuration: number;

+  /** 冲刺冷却时间（ms，从冲刺结束后开始计算） */

+  private readonly dashCooldown: number;

+  /** 冲刺结束后的无敌帧缓冲时间（ms） */

+  private readonly dashInvincibilityBuffer: number;

 

   private cursors: Phaser.Types.Input.Keyboard.CursorKeys;

   private keyA: Phaser.Input.Keyboard.Key;

   private keyD: Phaser.Input.Keyboard.Key;

   private keyW: Phaser.Input.Keyboard.Key;

   private keySpace: Phaser.Input.Keyboard.Key;

+  private keyShift: Phaser.Input.Keyboard.Key;

 

   /** 已使用的跳跃次数（触地时重置为 0） */

   private jumpsUsed = 0;

   /** 是否受玩家控制；为 false 时忽略所有输入 */

   private isControlled = true;

+

+  /** 是否正在冲刺 */

+  private isDashing = false;

+  /** 冲刺方向（1 = 右，-1 = 左） */

+  private dashDirection = 1;

+  /** 冲刺结束时间戳（ms） */

+  private dashEndTime = 0;

+  /** 冲刺冷却结束时间戳（ms） */

+  private cooldownEndTime = 0;

+  /** 无敌帧结束时间戳（ms） */

+  private invincibleEndTime = 0;

+  /** 冷却染色是否已激活 */

+  private cooldownTintActive = false;

 

   constructor(

... (共 182 行变更)
```

### src/state/PlayerState.ts (修改)
```diff
--- a/src/state/PlayerState.ts
+++ b/src/state/PlayerState.ts
@@ -1,16 +1,23 @@
 /**

- * 玩家跳跃状态管理（受控 action 驱动）。

+ * 玩家跳跃与冲刺状态管理（受控 action 驱动）。

  *

  * 支持「跳跃 + 二段跳」：

  *  - 跳跃次数（jumpCount）只能通过 dispatch(action) 更新，外部不可直接修改；

  *  - 起跳消耗一次跳跃次数，落地（LAND）时重置跳跃次数；

  *  - 默认 maxJumps = 2，即允许一次跳跃 + 一次二段跳。

+ *

+ * 支持「冲刺 + 无敌帧 + 冷却反馈」：

+ *  - 冲刺（DASH）消耗冷却，冲刺期间与冲刺后一段时间内处于无敌帧（invincible）；

+ *  - 冷却 / 无敌帧 / 冲刺时长均为时间驱动，通过 TICK action 推进；

+ *  - 冷却结束前再次冲刺会被忽略，可查询剩余冷却比例用于 UI 反馈。

  */

 

 export type PlayerAction =

   | { type: 'JUMP' }

   | { type: 'LAND' }

-  | { type: 'RESET' };

+  | { type: 'RESET' }

+  | { type: 'DASH' }

+  | { type: 'TICK'; deltaMs: number };

 

 export interface PlayerStateSnapshot {

   /** 已使用的跳跃次数 */

@@ -19,17 +26,44 @@
   readonly maxJumps: number;

   /** 是否处于落地状态 */

   readonly isGrounded: boolean;

+  /** 冲刺冷却剩余时间（ms），0 = 就绪 */

+  readonly dashCooldownRemaining: number;

+  /** 冲刺总冷却时间（ms） */

+  readonly dashCooldownMs: number;

+  /** 本次冲刺剩余持续时间（ms），0 = 未在冲刺 */

+  readonly dashRemaining: number;

+  /** 单次冲刺持续时间（ms） */

+  readonly dashDurationMs: number;

+  /** 无敌帧剩余时间（ms），0 = 无无敌帧 */

+  readonly invincibleRemaining: number;

+  /** 无敌帧总时长（ms） */

+  readonly invincibleDurationMs: number;

+}

+

+export interface DashConfig {

+  /** 冲刺总冷却时间（ms） */

+  cooldownMs: number;

+  /** 单次冲刺持续时间（ms） */

... (共 236 行变更)
```

### src/scenes/GameScene.ts (修改)
```diff
--- a/src/scenes/GameScene.ts
+++ b/src/scenes/GameScene.ts
@@ -2,6 +2,8 @@
 import { COLORS, SceneKey } from '../constants';

 import { LevelBuilder } from '../level/levelBuilder';

 import { Player } from '../gameobjects/Player';

+import { PlayerStateManager } from '../state/PlayerState';

+import { DashCooldownBar } from '../gameobjects/DashCooldownBar';

 

 // Solid background + static level geometry (ground & platforms), plus a player

 // that can move left/right, jump, and is affected by gravity — ready for the

@@ -9,6 +11,18 @@
 export class GameScene extends Phaser.Scene {

   private readonly levelBuilder: LevelBuilder;

   private player?: Player;

+

+  // Dash / invincibility / cooldown state (single source of truth).

+  private readonly playerState = new PlayerStateManager();

+  // HUD element that renders the dash cooldown feedback.

+  private dashBar?: DashCooldownBar;

+  // Key that triggers a dash.

+  private dashKey?: Phaser.Input.Keyboard.Key;

+

+  /** Horizontal speed applied while dashing (px/s). */

+  private readonly dashSpeed = 480;

+  /** Direction the player is facing: 1 = right, -1 = left. */

+  private facing: 1 | -1 = 1;

 

   constructor() {

     super({ key: SceneKey.Game });

@@ -44,10 +58,86 @@
 

     // Collide the player against the static level geometry (ground, platforms, bounds).

     this.physics.add.collider(this.player, this.levelBuilder.staticGroup!);

+

+    // Reset dash / invincibility timers (scene.start() reuses this instance).

+    this.playerState.reset();

+

+    // Dash input (Shift).

+    this.dashKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

+

+    // Cooldown feedback HUD. Values mirror the player state so they stay in sync.

+    const snap = this.playerState.snapshot;

+    this.dashBar = new DashCooldownBar(this, {

+      cooldownMs: snap.dashCooldownMs,

+      dashDurationMs: snap.dashDurationMs,

+      invincibleDurationMs: snap.invincibleDurationMs,

+      x: 100,

+      y: 24,

+    }).setScrollFactor(0);

... (共 118 行变更)
```

### src/constants.ts (修改)
```diff
--- a/src/constants.ts
+++ b/src/constants.ts
@@ -44,6 +44,17 @@
   controlledDuration: 400,

 } as const;

 

+// Dash, invincibility frames, and cooldown feedback tuning.

+// Shared by Player.ts, the level scene, and the dash cooldown UI.

+export const DASH = {

+  // Total time between dashes (cooldown feedback), in milliseconds.

+  cooldownMs: 800,

+  // How long a single dash lasts, in milliseconds.

+  durationMs: 150,

+  // How long the player stays invincible after dashing, in milliseconds.

+  invincibleMs: 250,

+} as const;

+

 // Player state machine for jump/fall/controlled-state management.

 export enum PlayerState {

   Idle = 'Idle',

```

### src/config/gameConfig.ts (修改)
```diff
--- a/src/config/gameConfig.ts
+++ b/src/config/gameConfig.ts
@@ -17,7 +17,8 @@
   physics: {

     default: 'arcade',

     arcade: {

-      // No gravity yet: this ticket spawns no character; the jump ticket will set it.

+      // The player character now dashes with i-frames and cooldown feedback.

+      // Gravity stays at 0 for now: the jump ticket will set it.

       gravity: { x: 0, y: 0 },

       debug: false,

     },

```

## 页面预览截图

![开发自测 — 实现冲刺、无敌帧与冷却反馈](screenshots/dev_1792810805.png)

