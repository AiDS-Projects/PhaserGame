# PRD — 初始化 Vite + Phaser 3 + TypeScript 脚手架

> 所属需求：平台跳跃可玩原型：主角二段跳 + 冲刺

## 用户故事
As a 开发者, I want 一个用 Vite + Phaser 3 + TypeScript 搭建的可运行项目脚手架, So that 后续能在此基础上快速迭代横版平台跳跃的核心玩法（移动/二段跳/冲刺），并保证工程可开发、可构建、可部署。

## 功能需求
- 工程初始化：使用 Vite 作为构建工具，Phaser 3 作为游戏引擎，TypeScript 作为开发语言，package.json 声明 type=module 并提供 dev/build/preview 脚本。
- 空壳游戏场景：src 下包含入口 main.ts 与 Phaser.Game 配置，创建一个最小可渲染的 Scene（含纯色背景与一个占位矩形/文本），启动后画面非黑屏、非白屏、不报运行时错误。
- 配置落地：vite.config.ts 提供可用的 base 与 server 配置；tsconfig.json 开启 strict 模式（含 noUnusedLocals、noUnusedParameters 或等价严格项）；index.html 正确挂载 #game 容器与入口脚本。
- 类型安全：源码中禁用 any，Phaser 对象通过显式类型声明，构建流程包含 tsc --noEmit 类型检查。
- 环境变量约束：不硬编码 API base URL（本工单无网络请求，但保留环境变量约定）。
- 忽略文件：.gitignore 覆盖 node_modules、dist、.env 等生成物与凭证文件。

## 验收标准
- [ ] 在项目根目录执行 `npm install` 后退出码为 0，node_modules 内包含 phaser、vite、typescript 依赖。
- [ ] 执行 `npm run dev` 后，浏览器访问本地地址（默认 5173 端口），1 次加载内渲染出非空白画面（存在可辨识的背景色或占位元素），DevTools 控制台无未捕获异常。
- [ ] 执行 `npm run build` 退出码为 0，产出 dist 目录且包含 index.html 与打包后的 JS/CSS 产物；`tsc --noEmit` 类型检查通过，报 0 个类型错误。
- [ ] 执行 `npm run preview` 后，访问预览地址能加载出与 dev 一致的画面，无 404 资源加载错误。
- [ ] 源代码 grep 无 `: any`、`as any` 出现；公共逻辑（如场景尺寸、颜色常量）沉淀到独立模块而非内联散落。
- [ ] `git status` 确认 node_modules、dist、.env 未被跟踪（被 .gitignore 排除）。

## 边界条件（不做的事）
- 不包含：任何具体玩法逻辑（移动、跳跃、二段跳、冲刺、平台碰撞、相机跟随）。
- 不包含：敌人、关卡系统、音效、美术资源、触控/虚拟摇杆适配。
- 不包含：状态管理库或复杂全局 store 架构（仅保留空壳工程的目录与入口约定，供后续工单扩展）。
- 不包含：后端服务、API 接口、数据持久化。
- 暂不支持：对 IE 等非现代浏览器的兼容；SSR/服务端渲染。

## 资产需求线索
暂无
