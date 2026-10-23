# 开发笔记 — 实现二段跳与受控状态管理

> 2026-10-24 00:55 | LLM

## 产出文件
- [src/state/PlayerState.ts](/app#repo?file=src/state/PlayerState.ts) (2486 chars)
- [src/constants.ts](/app#repo?file=src/constants.ts) (1419 chars)
- [src/gameobjects/Player.ts](/app#repo?file=src/gameobjects/Player.ts) (3267 chars)

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

### src/state/PlayerState.ts (新建, 2486 chars)
```
+ /**
+  * 玩家跳跃状态管理（受控 action 驱动）。
+  *
+  * 支持「跳跃 + 二段跳」：
+  *  - 跳跃次数（jumpCount）只能通过 dispatch(action) 更新，外部不可直接修改；
+  *  - 起跳消耗一次跳跃次数，落地（LAND）时重置跳跃次数；
+  *  - 默认 maxJumps = 2，即允许一次跳跃 + 一次二段跳。
+  */
+ 
+ export type PlayerAction =
+   | { type: 'JUMP' }
+   | { type: 'LAND' }
+   | { type: 'RESET' };
+ 
+ export interface PlayerStateSnapshot {
+   /** 已使用的跳跃次数 */
+   readonly jumpCount: number;
+   /** 允许的最大跳跃次数（二段跳 = 2） */
+   readonly maxJumps: number;
+   /** 是否处于落地状态 */
+ ... (更多)
```

### src/constants.ts (修改)
```diff
--- a/src/constants.ts
+++ b/src/constants.ts
@@ -37,6 +37,19 @@
 export const PLAYER = {

   moveSpeed: 260,

   jumpVelocity: -480,

+  doubleJumpVelocity: -420,

+  maxJumps: 2,

   maxVelocityX: 800,

   maxVelocityY: 1600,

-} as const;
+  controlledDuration: 400,

+} as const;

+

+// Player state machine for jump/fall/controlled-state management.

+export enum PlayerState {

+  Idle = 'Idle',

+  Run = 'Run',

+  Jump = 'Jump',

+  DoubleJump = 'DoubleJump',

+  Fall = 'Fall',

+  Controlled = 'Controlled',

+}
```

### src/gameobjects/Player.ts (修改)
```diff
--- a/src/gameobjects/Player.ts
+++ b/src/gameobjects/Player.ts
@@ -12,6 +12,8 @@
   private readonly moveSpeed: number;

   /** 跳跃初速度（负值表示向上，px/s） */

   private readonly jumpVelocity: number;

+  /** 最大跳跃次数（支持二段跳） */

+  private readonly maxJumps: number;

 

   private cursors: Phaser.Types.Input.Keyboard.CursorKeys;

   private keyA: Phaser.Input.Keyboard.Key;

@@ -19,12 +21,17 @@
   private keyW: Phaser.Input.Keyboard.Key;

   private keySpace: Phaser.Input.Keyboard.Key;

 

+  /** 已使用的跳跃次数（触地时重置为 0） */

+  private jumpsUsed = 0;

+  /** 是否受玩家控制；为 false 时忽略所有输入 */

+  private isControlled = true;

+

   constructor(

     scene: Phaser.Scene,

     x: number,

     y: number,

     texture: string,

-    config: { moveSpeed?: number; jumpVelocity?: number } = {},

+    config: { moveSpeed?: number; jumpVelocity?: number; maxJumps?: number } = {},

   ) {

     super(scene, x, y, texture);

 

@@ -33,6 +40,7 @@
 

     this.moveSpeed = config.moveSpeed ?? 260;

     this.jumpVelocity = config.jumpVelocity ?? -480;

+    this.maxJumps = config.maxJumps ?? 2;

 

     const body = this.body as Phaser.Physics.Arcade.Body;

     body.setCollideWorldBounds(true);

@@ -53,9 +61,34 @@
     camera.setDeadzone(64, 64);

   }

 

+  /** 设置玩家是否受控（受控时才响应键盘输入）。 */

+  public setControlled(controlled: boolean): void {

+    this.isControlled = controlled;

+    if (!controlled) {

+      const body = this.body as Phaser.Physics.Arcade.Body;

+      body.setVelocityX(0);

+    }

+  }

... (共 84 行变更)
```

## 页面预览截图

![开发自测 — 实现二段跳与受控状态管理](screenshots/dev_1792774502.png)

