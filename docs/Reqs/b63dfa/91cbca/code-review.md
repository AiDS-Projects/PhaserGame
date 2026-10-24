# 代码审查 — 可玩原型验收自测

## 评分: 5/10 🚫 需修复

## 🔴 严重问题（必须修复）
- {'file': 'src/config/gameConfig.ts', 'line': 42, 'severity': 'critical', 'title': 'arcade 重力被显式置零 (gravity.y = 0)，破坏跳跃/落地判定', 'description': 'physics.arcade.gravity = { x: 0, y: 0 } 会完全禁用重力。本原型是含 jump/dash/isGrounded 的平台动作玩法（acceptanceProbe 也专门验证 jump 与 isGrounded），重力为 0 会导致跳跃后角色永远悬浮、isGrounded 恒为 false，核心手感与验收逻辑全部失效。除非 GameScene 在场景内显式覆盖 gravity，否则这是确定性的逻辑错误，必须改为非零重力（如 y: 1200 或与设计文档一致的值），或在代码中明确注释说明覆盖点。'}
- {'file': 'src/acceptance/acceptanceProbe.ts', 'line': 130, 'severity': 'critical', 'title': '像素级回归对活动中的 Phaser 游戏做截图比对，结果本质不确定，验收必现 flaky', 'description': "对运行中（rAF 驱动、含动画/粒子/帧时序）的游戏做 '截图 vs 基线' 像素比对，同一份代码在不同时刻渲染结果不可能逐像素一致；叠加 Phaser.AUTO 在无头 CI 下 WebGL 上下文创建失败会回退 Canvas，而桌面/开发机用 WebGL，二者渲染输出天然不同。这会让核心验收自测在 CI 中稳定产生误报（false failure）或误报通过，作为交付物其可信度不成立。建议：改用确定性的逻辑断言（getState() 数值校验）为主，截图仅做尺寸/元素存在性等粗粒度校验，并固定渲染器为 CANVAS（或 WebGL）以避免跨环境差异。"}

## 🟡 警告（建议修复）
- {'file': 'src/config/gameConfig.ts', 'line': 29, 'severity': 'warning', 'title': "render.powerPreference: 'high-performance' 在无头/CI 环境可能创建 WebGL 失败", 'description': "无头 Chromium 通常无独立 GPU，'high-performance' 会强制请求高性能适配器，可能直接导致 WebGL 上下文创建失败并回退 Canvas，进而使截图基线在不同环境下不一致，加剧回归误报。建议降级为 'default' 或根据 HEADED/CI 环境动态配置。"}
- {'file': 'src/config/gameConfig.ts', 'line': 17, 'severity': 'warning', 'title': 'SceneKey 声明了 Preload/UI 但 scene 数组只注册 Boot 与 Game，存在死配置与悬挂引用', 'description': 'SceneKey 枚举包含 Preload 和 UI，但 scene: [BootScene, GameScene] 未注册二者，且注释显示 PreloadScene 已被 AutoFix 移除。若后续代码仍以 SceneKey.Preload / SceneKey.UI 启动场景将直接运行时崩溃。应同步删除未使用的枚举键，或在注释中说明其为预留项。'}
- {'file': 'src/config/gameConfig.ts', 'line': 7, 'severity': 'warning', 'title': 'GAME_WIDTH / GAME_HEIGHT 存在双份定义（gameConfig.ts 与 constants.ts），来源不唯一', 'description': 'acceptanceProbe 从 ../constants 导入 GAME_WIDTH/GAME_HEIGHT，而 gameConfig.ts 又独立定义同名常量。两处数值一旦漂移，游戏画布与验收探针的坐标换算、截图尺寸将不一致，产生隐蔽 bug。应收敛为单一来源（如 constants.ts 导出，gameConfig 引用）。'}
- {'file': 'src/acceptance/acceptanceProbe.ts', 'line': 150, 'severity': 'warning', 'title': 'measureFeel 的 rAF Promise 无超时保护，rAF 被节流时 CI 永久挂起', 'description': '采样用 requestAnimationFrame 循环等待 1000ms，无任何 timeout/竞速保护。无头浏览器后台节流、GPU 缺失或页面未就绪时 rAF 可能长时间不触发，导致 Promise 永不 resolve，整个验收进程卡死。建议用 Promise.race 加超时（如 5s）并返回失败标记。'}
- {'file': 'src/acceptance/acceptanceProbe.ts', 'line': 130, 'severity': 'warning', 'title': 'PNG.sync.read 未做异常防护，坏图/空截图直接抛异常中断整个流程', 'description': 'computePixelDiff 对 actual/baseline 直接 PNG.sync.read，若截图为空、基线文件损坏或内容非 PNG，会同步抛异常且无上下文，导致后续所有检查被连带终止。应在解码前校验文件存在性与 Buffer 非空，并用 try/catch 捕获解码错误并转为明确的检查失败。'}
- {'file': 'src/acceptance/acceptanceProbe.ts', 'line': 158, 'severity': 'warning', 'title': '混用 performance.now() 与 rAF 时间戳计算 elapsed/maxGap，首帧间隔被污染', 'description': 'start/last 初始为 performance.now()，循环内 last 被覆盖为 rAF 回调时间戳 t。首帧 gap = t - start 实际包含 evaluate 调用到首帧渲染的全部开销（含页面调度），会显著抬高 maxGapMs，造成 jank 误判；avgFps 的分母 elapsed 也受两种时钟源混用影响。建议统一用 rAF 时间戳作为唯一时间基准，并丢弃首帧 gap。'}
- {'file': 'src/acceptance/acceptanceProbe.ts', 'line': 145, 'severity': 'warning', 'title': '像素差异阈值 48 与 ACCEPTANCE.maxPixelDiff 的单位/语义未对齐，魔法值未收敛', 'description': 'computePixelDiff 返回 0~1 的差异占比，但判定用每通道差值和 > 48 的硬编码魔法值，且与 ACCEPTANCE.maxPixelDiff 的对比口径（是比例还是绝对像素数）在截断代码中不明确。二者单位不一致会导致阈值失效或误判。应将阈值提取为具名常量并统一量纲。'}
- {'file': 'src/gameobjects/DashCooldownBar.ts', 'line': 84, 'severity': 'warning', 'title': '场景 UPDATE 监听器依赖 handleDestroy 清理，未清理将产生悬挂引用/泄漏', 'description': '构造函数注册了 scene.events.on(UPDATE, onSceneTick)，仅靠 once(DESTROY, handleDestroy) 反注册。handleDestroy 实现未在截断代码中展示，若其未显式 off(UPDATE, ...)，销毁后场景仍持有对已销毁对象的回调引用，持续触发 onSceneTick 操作已销毁的 fill/label，引发运行时错误。需确认并补充事件移除逻辑。'}
- {'file': 'src/gameobjects/DashCooldownBar.ts', 'line': 93, 'severity': 'warning', 'title': '缺少 invincibleDurationMs <= cooldownMs 的不变式校验，可无限续无敌帧', 'description': 'triggerDash 同时启动 cooldown 与 invincible 计时，若 invincibleDurationMs > cooldownMs，玩家可在无敌未结束时再次冲刺，形成无敌帧无缝衔接，破坏手感与关卡平衡。应在构造时校验计时参数关系，或在逻辑上禁止无敌期间再次触发冲刺。'}
- {'file': 'src/gameobjects/DashCooldownBar.ts', 'line': 122, 'severity': 'warning', 'title': '计时器直接递减原始 delta，未处理暂停/时间缩放/大帧间隔', 'description': 'onSceneTick 用 scene 传入的 delta 直接递减三个计时器。若游戏被暂停、切后台或 timeScale 变化，delta 可能为 0（暂停不递减，行为合理）或异常放大（恢复时一次性扣掉大量时间），导致 cooldown/invincible 视觉瞬间跳变。建议对 delta 做上限钳制（如 Clamp(delta, 0, 100)）或使用累计时间。'}

## 🟢 建议（可选优化）
- {'file': 'src/acceptance/acceptanceProbe.ts', 'line': 30, 'severity': 'suggestion', 'title': '移除 @ts-ignore，正确使用 @types/pngjs 类型声明', 'description': '注释已说明 pngjs 类型用 @types/pngjs，却仍对 import 使用 @ts-ignore，等于屏蔽了真实类型错误。安装 @types/pngjs 后应删除 @ts-ignore，让类型检查生效。'}
- {'file': 'src/acceptance/acceptanceProbe.ts', 'line': 133, 'severity': 'suggestion', 'title': '变量名 dbDiff 易与 database 混淆，建议改为 bDiff/diffB', 'description': "db 通常被理解为 database，此处表示 baseline 像素差值，命名有歧义。改为 bDiff 或 diffB 更清晰，也符合 '变量名即含义' 的编码准则。"}
- {'file': 'src/acceptance/acceptanceProbe.ts', 'line': 42, 'severity': 'suggestion', 'title': 'GameStateSnapshot.facing: number 类型过宽，建议收窄为 -1 | 1 或枚举', 'description': 'facing 语义上是朝向（左/右），用 number 丢失了语义约束。收窄为字面量联合或枚举可让编译器在误赋值时尽早报错。'}
- {'file': 'src/acceptance/acceptanceProbe.ts', 'line': 52, 'severity': 'suggestion', 'title': 'ProbeWindow 的双重断言 window as unknown as ProbeWindow 可读性差', 'description': "as unknown as 双重断言虽常见但遮蔽了类型契约。可改用结构化类型守卫（isProbeWindow）在 evaluate 内运行时校验后窄化，既满足 '外部数据必须校验' 的规范，也消除断言异味。"}
- {'file': 'src/gameobjects/DashCooldownBar.ts', 'line': 110, 'severity': 'suggestion', 'title': '用 setScale 实现冷却条宽度动画语义不直观，建议直接设置 width 或 setDisplaySize', 'description': 'setScale(fraction, 1) 语义上是缩放而非宽度变化，且与未来可能的 Y 轴缩放耦合。改用 setDisplaySize(width * fraction, height) 或 setSize 更直观，避免误读。'}
- {'file': 'src/gameobjects/DashCooldownBar.ts', 'line': 122, 'severity': 'suggestion', 'title': '冷却剩余时间标签格式化逻辑内联，建议提取 formatSeconds 工具函数', 'description': 'label.setText 中对 cooldownRemaining/1000 的秒数格式化内联在视觉更新方法中，若后续 UI 复用（无敌帧、冲刺剩余）会重复。按共享逻辑优先原则沉淀为工具函数。'}
- {'file': 'src/config/gameConfig.ts', 'line': 46, 'severity': 'suggestion', 'title': 'input.activePointers: 3 为魔法数字，建议提取常量并说明含义', 'description': '3 指针（触摸点上限）无注释说明为何是 3，与触控兜底、双指操作需求的关系不明确。提取为具名常量并注释设计依据。'}

## 审查的代码
- src/acceptance/acceptanceProbe.ts
- docs/Reqs/b63dfa/91cbca/dev-notes.md
