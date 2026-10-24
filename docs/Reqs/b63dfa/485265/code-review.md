# 代码审查 — 实现冲刺、无敌帧与冷却反馈

## 评分: 4/10 🚫 需修复

## 🔴 严重问题（必须修复）
- DashCooldownBar 与 Player 各自维护一套冲刺/冷却/无敌帧状态机，且语义不一致：DashCooldownBar.cooldownMs 表示'两次冲刺总间隔'（triggerDash() 即开始冷却，冷却包含冲刺时长），而 Player.dashCooldown 表示'冲刺结束后的冷却'（cooldownEndTime = now + dashDuration + dashCooldown）。同时 DashCooldownBar.triggerDash() 从未被 Player.startDash() 调用，UI 冷却条与真实游戏状态完全解耦，两套计时必然漂移——冷却条显示的 READY/冷却与实际可冲刺状态会不一致。

## 🟡 警告（建议修复）
- 缺失配置校验：cooldownMs/dashDurationMs/invincibleDurationMs 为必填且无默认值、无合法性检查。当 cooldownMs <= 0 时，triggerDash() 将 cooldownRemaining 置 0 并调用 setCoolingVisuals(1)，随后 onSceneTick 中 `if (cooldownRemaining > 0)` 分支被跳过，setReadyVisuals() 永远不会再被调用，UI 永久卡在'冷却中'状态。
- 配置关系未约束：若 invincibleDurationMs < dashDurationMs，冲刺尚未结束就已失去无敌帧；若 cooldownMs < dashDurationMs，冲刺期间冷却先归零，isDashReady() 在冲刺进行中返回 true，允许在冲刺内再次 triggerDash() 重置计时。
- 双时钟源漂移：DashCooldownBar 通过 scene UPDATE 事件的 delta 手工累减计时，而 Player 使用 scene.time.now 时间戳判断冲刺/冷却/无敌结束。二者在 timeScale 改变或场景暂停时会产生不同的计时结果。
- 事件监听清理仅依赖 GameObject DESTROY 事件（this.once(DESTROY, ...)），未注册 scene SHUTDOWN 兜底。若场景重启时对象销毁顺序异常，或对象在场景事件已 shutdown 后才触发 DESTROY，this.scene.events.off(UPDATE, ...) 存在失效风险，UPDATE 监听可能泄漏。
- 魔法值硬编码：height - 4、width / 2 + 6、fontSize '12px'、setStrokeStyle(2, ...)、label 颜色 '#e2e8f0' 均未提取为配置或常量，与其余可配置颜色（backgroundColor/borderColor/fillColor/readyColor）风格不一致。

## 🟢 建议（可选优化）
- 多个 public 方法（triggerDash、isDashReady、isDashing、isInvincible、getCooldownFraction）缺少 @param/@return 文档注释，违反全局编码准则中'所有 public API 必须含文档注释'的要求。
- 冷却条仅用数字倒计时区分状态，建议增加独立的 'DASHING' 视觉态（冲刺进行中 vs 冲刺后冷却），当前冲刺期间与冷却期间显示完全相同的橙色倒计时，无法区分。
- Player.setControlled(false) 仅将 velocityX 置 0，不会取消进行中的冲刺（isDashing 状态与 dashEndTime 时间戳保留）；endDash() 也无对冲刺被外部中断场景的处理，建议补充取消冲刺的收尾逻辑。
- 建议将默认颜色、尺寸偏移、字体等字面量抽取到 constants 或统一配置对象，避免魔法值散落。

## 审查的代码
- src/gameobjects/DashCooldownBar.ts
- docs/Reqs/b63dfa/485265/dev-notes.md
