# 架构设计 - 初始化 Vite + Phaser 3 + TypeScript 脚手架

## 架构模式
phaser3-vite-typescript-frontend-scaffold

## 技术栈

- **runtime**: Web (H5)
- **engine**: Phaser 3.80.1
- **language**: TypeScript 5.5 (strict, noEmit)
- **bundler**: Vite 5.4.8 (base './', outDir dist)
- **physics**: Phaser.Physics.Arcade
- **package_manager**: npm
- **design_resolution**: 960x540 (16:9 landscape)
- **scene_lifecycle**: constructor -> init -> preload -> create -> update

## 模块设计

### EntryPoint
职责: 唯一入口，直接 new Phaser.Game(gameConfig)，不包 DOMContentLoaded

### Constants
职责: 集中登记 SceneKey enum、设计分辨率 DESIGN_WIDTH/DESIGN_HEIGHT、颜色 token COLORS，避免魔法值散落

### GameConfig
职责: Phaser.Game 引导配置唯一来源：AUTO 渲染、game-container 挂载、Scale.FIT + CENTER_BOTH、Arcade 物理（gravity 0,0，等待角色 ticket 开启重力）

### GameScene
职责: 空壳场景：super({ key: SceneKey.Game })、create() 开头 removeAllListeners 防泄漏、纯色背景，预留平台跳跃 TODO 扩展点

### Player
职责: （后续 ticket）矩形/精灵角色：重力、左右移动、二段跳、冲刺 + 无敌帧/冷却，声明 body!: Phaser.Physics.Arcade.Body

### Platforms
职责: （后续 ticket）地面 + 若干平台静态组，相机跟随与边界限制

## 关键决策
- 保留现有 960x540 横屏设计分辨率，不推翻（横版平台跳跃需横屏，符合已有 UX doc/visual spec 注释）。phaser-dev 规范里的 402x874 竖屏不适用于本横版玩法。
- 保留 scene: [GameScene] 空壳，不额外引入 Boot/Preloader（原型阶段纯 Graphics 绘制，无资产加载管线）。SceneKey 已预留 Boot 枚举值供未来扩展。
- Arcade 物理已在 gameConfig 预配置但 gravity 保持 {x:0,y:0}，由角色 ticket 统一开启重力并设 debug 开关，避免空壳期出现无意义的物理对象。
- 沿用既有分层：constants.ts（enum/常量）-> config/gameConfig.ts（引导）-> scenes/GameScene.ts（场景），后续新增 gameobjects/ 目录放自定义 Sprite，符合项目结构规范。
- TS strict 模式（noUnusedLocals/noUnusedParameters/noFallthroughCasesInSwitch）+ 禁止 any，脚手架期即建立类型安全边界，公共工具下沉 utils/ 或 services/。
- 原型阶段角色/平台/背景一律用 Graphics 代码绘制，不出图；仅角色艺术字/道具才考虑 gen_image，降低资产依赖。
