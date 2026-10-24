# 开发笔记 — 实现冲刺、无敌帧与冷却反馈

> 2026-10-24 11:02 | LLM

## 产出文件
- [src/gameobjects/DashCooldownBar.ts](/app#repo?file=src/gameobjects/DashCooldownBar.ts) (4869 chars)

## 自测: 自测 7/7 通过 ✅

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 文件产出 | ✅ | 1 个文件 |
| 入口文件 | ✅ | 存在 |
| 代码非空 | ✅ | 通过 |
| 语法检查 | ✅ | 通过 |
| 文件名规范 | ✅ | 全英文 |
| 磁盘落地 | ✅ | 1 个文件已落盘 |
| 页面截图 | ✅ | 1 张截图 |

## 代码变更 (Diff)

### src/gameobjects/DashCooldownBar.ts (修改)
```diff
--- a/src/gameobjects/DashCooldownBar.ts
+++ b/src/gameobjects/DashCooldownBar.ts
@@ -98,7 +98,7 @@
     this.setReadyVisuals();

 

     // Self-driving: tick the timers on every scene update.

-    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);

+    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.onSceneTick, this);

     this.once(Phaser.GameObjects.Events.DESTROY, this.handleDestroy, this);

   }

 

@@ -135,7 +135,7 @@
     return this.cooldownRemaining / this.cooldownMs;

   }

 

-  private update(_time: number, delta: number): void {

+  private onSceneTick(_time: number, delta: number): void {

     if (this.cooldownRemaining > 0) {

       this.cooldownRemaining = Math.max(0, this.cooldownRemaining - delta);

       this.setCoolingVisuals(this.getCooldownFraction());

@@ -167,6 +167,6 @@
   }

 

   private handleDestroy(): void {

-    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);

+    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onSceneTick, this);

   }

 }
```

## 页面预览截图

![开发自测 — 实现冲刺、无敌帧与冷却反馈](screenshots/dev_1792810934.png)

