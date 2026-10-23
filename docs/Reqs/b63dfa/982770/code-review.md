# 代码审查 — 初始化 Vite + Phaser 3 + TypeScript 脚手架

## 评分: 5/10 🚫 需修复

## 🔴 严重问题（必须修复）
- {'severity': 'critical', 'file': 'src/scenes/GameScene.ts', 'line': 13, 'title': 'this.input.removeAllListeners() 过度清理输入监听器，且前提错误', 'description': "create() 开头无条件调用 this.input.removeAllListeners()，会移除 InputPlugin 上全部事件监听器。当前场景虽未注册任何监听器（实为死代码），但注释声称 'scene.start() reuses the instance, so clear listeners to avoid leaks' 这个前提是错的——Phaser 的 InputPlugin.shutdown() 在场景关闭时已经会调用 removeAllListeners() 自动清理，手动清理纯属冗余。更危险的是：后续 double-jump / dash ticket 若通过 this.input.on('pointerdown', ...) 注册输入处理，这条兜底清理会静默吞掉其它场景或全局注册的输入监听，导致输入失效且极难排查。", 'suggestion': '删除该行；若确需防重复注册，应使用 this.events.once(Phaser.Scenes.Events.SHUTDOWN, handler) 在注册处配对清理，而非在 create 开头粗暴 removeAllListeners()。'}

## 🟡 警告（建议修复）
- {'severity': 'warning', 'file': 'docs/Reqs/b63dfa/982770/testagent-output.log', 'line': 0, 'title': '提交到仓库的 agent 产物日志与实际源码严重不一致', 'description': "该日志描述的脚手架（内联 MainScene、super('MainScene') 魔法字符串、1280x720 分辨率、无 physics、无 constants/config/scenes 模块）与仓库实际实现（SceneKey 枚举、960x540、arcade physics、模块化场景）相矛盾。任何开发者/后续 agent 以此为规范重建或校验项目，都会得到与真实架构冲突的结果。", 'suggestion': '删除该生成日志，或将其移出仓库（加入 .gitignore），文档应以真实源码为准。'}
- {'severity': 'warning', 'file': 'src/main.ts', 'line': 4, 'title': '无 DOM 就绪保护，依赖 ES module defer 语义，且注释主动鼓励去掉防护', 'description': "注释 'no DOMContentLoaded wrapper' 表明有意移除了防护。当前能工作仅因 <script type=module> 会延迟到 DOM 解析完成才执行。一旦该入口改为普通 script、被内联、或被其它打包方式引用，new Phaser.Game(gameConfig) 会因找不到 parent 'game-container' 直接抛错，页面白屏且无用户可见错误。", 'suggestion': "保留轻量守卫（如判断 document.getElementById('game-container') 存在），或至少改为 defer 显式声明，不要以注释形式固化脆弱假设。"}
- {'severity': 'warning', 'file': 'index.html', 'line': 27, 'title': '背景色 #0f172a 在 HTML 中硬编码 3 处，与 COLORS.bg 重复且会漂移', 'description': "html/body 与 #game-container 三处硬编码 #0f172a，与 constants.ts 的 COLORS.bg='#0F172A' 语义重复。修改 COLORS.bg 时 HTML 不会同步，Scale.FIT 模式下的 letterbox 边框区域会显示旧色，产生视觉不一致。", 'suggestion': '将背景色收敛到单一来源；HTML 中改为 CSS 变量或直接引用同一 token，消除魔法值重复。'}
- {'severity': 'warning', 'file': 'src/config/gameConfig.ts', 'line': 10, 'title': '背景色被设置三次（config.backgroundColor + BootScene/GameScene 各 setBackgroundColor）', 'description': 'gameConfig 的 backgroundColor: COLORS.bg 与两个场景 create() 里 this.cameras.main.setBackgroundColor(COLORS.bg) 三重冗余。setBackgroundColor 会覆盖 config 的 backgroundColor，config 中的值实际被架空，语义混乱。', 'suggestion': '保留 config 的 backgroundColor 即可，删除场景内的 setBackgroundColor，或在注释中说明职责归属。'}
- {'severity': 'warning', 'file': 'index.html', 'line': 7, 'title': 'maximum-scale=1.0, user-scalable=no 造成可访问性退化', 'description': '禁用缩放是移动端反模式，剥夺低视力用户放大页面的能力，也不符合 WCAG 无障碍要求。对 Phaser 游戏而言，通常用 touch 事件而非 viewport 缩放来防抖动，无需 user-scalable=no。', 'suggestion': '移除 maximum-scale 与 user-scalable=no，通过 Phaser 的输入处理（如 preventDefault 于 touch）解决手势问题。'}

## 🟢 建议（可选优化）
- {'severity': 'suggestion', 'file': 'src/scenes/BootScene.ts', 'line': 16, 'title': 'BootScene 文档承诺加载共享资产，却无 preload() 方法', 'description': "类注释与 TODO 声称 'load shared assets and global setup here before handoff'，但既无 preload() 也无任何加载逻辑，create() 直接同步 scene.start(Game)。这提供了虚假的加载脚手架，后续 ticket 若把 this.load 写进 create() 而非 preload()，会在资产加载完成前就切换到 GameScene。", 'suggestion': "补一个空 preload(): void {} 占位，明确 'boot → preload → create(handoff)' 契约，或直接删掉误导性的加载承诺注释。"}
- {'severity': 'suggestion', 'file': 'package.json', 'line': 0, 'title': '缺少 lint/format 与运行环境约束', 'description': '项目无 ESLint/Prettier 配置，且 package.json 未声明 engines 或 packageManager，协作时 Node/Vite 版本漂移可能导致构建差异。', 'suggestion': '补充 eslint/prettier 与 engines 字段（如 "node": ">=18"），并考虑加入 husky + lint-staged。'}
- {'severity': 'suggestion', 'file': 'vite.config.ts', 'line': 6, 'title': '端口 5173 硬编码', 'description': 'server.port 硬编码 5173，与 Vite 默认值一致，无配置价值且限制了多实例并行开发（端口占用后需手动改）。', 'suggestion': '省略 port 使用默认值，或改为 process.env.PORT 读取。'}
- {'severity': 'suggestion', 'file': 'index.html', 'line': 32, 'title': '#game-container canvas 的 margin:0 auto 与 CENTER_BOTH 重复', 'description': 'Phaser Scale.CENTER_BOTH 已在 JS 层负责画布居中，CSS 的 margin:0 auto 是冗余且可能在窗口 resize 时产生双重居中抖动。', 'suggestion': '移除该冗余 CSS 规则，居中统一交给 Phaser。'}
- {'severity': 'suggestion', 'file': 'index.html', 'line': 8, 'title': '缺少 theme-color meta，移动端浏览器地址栏颜色与主题不一致', 'description': '未提供 <meta name="theme-color">，移动端 Chrome 地址栏会显示默认色，与深色主题 #0f172a 不协调。', 'suggestion': '新增 <meta name="theme-color" content="#0f172a" />。'}

## 审查的代码
- src/scenes/BootScene.ts
- docs/Reqs/b63dfa/982770/testagent-output.log
- src/main.ts
- src/config/gameConfig.ts
- docs/Reqs/b63dfa/982770/dev-notes.md
