# 开发笔记 — 可玩原型验收自测

> 2026-10-24 12:49 | LLM

## 产出文件
- [src/acceptance/acceptanceProbe.ts](/app#repo?file=src/acceptance/acceptanceProbe.ts) (20227 chars)

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

### src/acceptance/acceptanceProbe.ts (修改)
```diff
--- a/src/acceptance/acceptanceProbe.ts
+++ b/src/acceptance/acceptanceProbe.ts
@@ -479,8 +479,169 @@
         detail: `showTouch=${showTouch} domVisible=${ui.domVisible} fallbackActive=${ui.fallbackActive}`,

       });

 

-      await page.waitForTimeout(ACCEPTA

-

-/*

-

-/* ... [文件截断显示：原文 15060 字符，当前只显示前 15000；代码本身完整，保留未显示部分] ... */
+      await page.waitForTimeout(ACCEPTANCE.settleDelayMs);

+      screenshots.push(await this.capture(page, 'touch'));

+

+      const tappedJump = await tapControl(page, 'btn-jump', TOUCH_BUTTONS.jump);

+      const jumped = await page

+        .waitForFunction(

+          () => (window as unknown as ProbeWindow).__game!.getState()!.jumpCount >= 1,

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

... (共 177 行变更)
```

## 页面预览截图

![开发自测 — 可玩原型验收自测](screenshots/dev_1792817373.png)

