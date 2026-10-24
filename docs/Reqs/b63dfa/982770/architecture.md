# 架构设计 - 初始化 Vite + Phaser 3 + TypeScript 脚手架

## 架构模式
phaser3-vite-typescript-frontend-scaffold

## 技术栈

- **runtime**: Phaser 3 (>= 3.60)
- **language**: TypeScript (strict, no any)
- **bundler**: Vite
- **physics**: Phaser.Physics.Arcade (built-in)
- **package_manager**: npm
- **typecheck**: tsc --noEmit
- **backend**: none (static H5, no API)

## 模块设计

### entry_and_game_config
职责: 唯一入口，直接 new Phaser.Game（不包 DOMContentLoaded），集中声明 scale/physics/scene 配置

### constants
职责: 集中管理 SceneKey 枚举、设计分辨率、颜色 token，避免魔法值散落

### game_scene_shell
职责: 空壳 GameScene：相机纯色背景 + 生命周期钩子占位，为后续移动/跳跃/冲刺工单预留扩展点

### static_host
职责: 提供 canvas 挂载点与兜底底色，避免加载期白屏

### toolchain
职责: 定义依赖、TS 编译与 Vite 构建/预览脚本，支撑 h5_typecheck 与 h5_playtest

## 关键决策
- 设计分辨率采用现有 UX 文档已定的 960×540（16:9 横屏），匹配「横版平台跳跃」的横屏需求；与全局 Phaser 技能的 402×874 竖屏默认值冲突，建议以横屏为准并请用户确认
- 脚手架阶段采用扁平结构（constants.ts + scenes/* + main.ts，≤8 文件），后续移动/跳跃/冲刺工单再拆 core/、gameobjects/
- 本工单零资产，背景用 camera.setBackgroundColor 纯色填充，符合视觉规范「空壳可运行」边界，不引入图片资源
- 遵循 Phaser 3.60+ 规范：禁用 TimerEvent.on()、禁用 createEmitter()、import Phaser from 'phaser' 不带 .ts 后缀
- 采用 strict TS + 禁止 any；本工单无外部数据，暂不引入 Zod，但保持类型守卫式边界以备后续 API/localStorage
- npm 作为包管理器，typecheck 用 tsc --noEmit，预览走 vite build 产物而非常驻 dev server
