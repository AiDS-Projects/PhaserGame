# 架构设计 - 实现二段跳与受控状态管理

## 架构模式
phaser3-vite-typescript-double-jump-controlled-player-state-arcade-physics

## 技术栈

- **runtime**: Web (H5)
- **language**: TypeScript
- **framework**: Phaser 3
- **bundler**: Vite
- **physics**: Phaser.Physics.Arcade
- **state_pattern**: controlled-action (lightweight, no external store)
- **input**: keyboard (desktop-first, touch deferred)

## 模块设计

### 
职责: 集中管理跳跃/移动相关物理常量，避免魔法数字散落。

### 
职责: 玩家跳跃状态唯一事实来源，跳跃次数只通过受控 action 变更，落地通过 action 重置。

### 
职责: 角色物理体与输入映射，把输入事件翻译为受控 action 调用，保持碰撞与相机跟随能力不变。

### 
职责: 场景装配：实例化 Player、建立 collider、调用 player.update()，保证重入时状态干净。

### 
职责: 验证二段跳与落地重置的可玩性回归。

## 关键决策
- 采用受控 action 而非引入外部 store（Redux/Zustand）：本项目规模小，PlayerState 类内封装足够，满足『跳跃次数通过受控 action 更新』且不引入额外依赖。
- 落地检测采用『上一帧接地标志 + body.blocked.down』边缘检测，而非仅判断 blocked.down：避免每帧重复调用 resetJump 造成状态抖动。
- 跳跃输入保持 JustDown 边缘触发（不重复扣次）：防止一次按键在连续帧内触发多次跳跃。
- 二段跳复用与一段跳相同的 JUMP_VELOCITY（原型阶段先验证手感，高度差异留到后续调参）。
- MAX_JUMPS 用常量而非硬编码 2：便于后续扩展三段跳或冲刺跳跃叠加。
- 状态重置放 Player.reset() 并在 GameScene.create() 开头调用：适配 scene.start() 复用实例的机制，避免重入后残留空中跳跃次数。
- 本工单不做 coyote time 与 jump buffering，保持范围最小，作为后续手感调优项记录。
