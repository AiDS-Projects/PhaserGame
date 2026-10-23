# 代码审查 — 实现二段跳与受控状态管理

## 评分: 4/10 🚫 需修复

## 🔴 严重问题（必须修复）
- {'id': 'CRIT-01', 'file': 'src/config/gameConfig.ts', 'location': 'physics.arcade.gravity', 'title': '重力仍为 0，玩家起跳后永不落地，二段跳计数永不重置', 'description': "gameConfig.ts 中 gravity 仍为 { x: 0, y: 0 }，注释甚至写着 'No gravity yet: this ticket spawns no character; the jump ticket will set it'。但本任务正是跳跃/二段跳任务，Player.update() 依赖 body.blocked.down 来重置 jumpsUsed。无重力时 body 永远悬空，blocked.down 永远为 false，jumpsUsed 不会归零，玩家会无限上飘且再也无法正常起跳。constants.ts 里已定义的 PHYSICS.gravityY=1200 也从未被引用。", 'suggestion': '将 gameConfig 的 gravity.y 改为引用 PHYSICS.gravityY（1200），并删除过时注释，确保 PHYSICS 常量被实际消费。'}
- {'id': 'CRIT-02', 'file': 'src/state/PlayerState.ts / src/gameobjects/Player.ts', 'location': 'PlayerStateManager vs Player.jumpsUsed', 'title': '跳跃状态存在两套互相独立的真源，未接线导致状态漂移', 'description': '任务目标是『受控状态管理』，为此实现了 PlayerStateManager + reducer。但 Player.ts 完全没有使用它，而是在类内部用独立的 jumpsUsed / maxJumps 字段自行维护跳跃计数，并直接在 update() 里自增自复位。两套逻辑同时存在且互不同步：即使外部通过 dispatch 修改 manager，Player 的实际跳跃行为也不会随之改变；反之亦然。这是典型的双源真值（two sources of truth）架构缺陷，后续任何一处改动都会导致两边不一致。', 'suggestion': '让 Player 持有 PlayerStateManager 实例作为唯一真源，update() 中通过 tryJump()/land() 等受控 action 驱动状态，删除类内重复的 jumpsUsed 字段，或在文档中明确二者职责边界并保证同步。'}

## 🟡 警告（建议修复）
- {'id': 'WARN-01', 'file': 'src/constants.ts / src/gameobjects/Player.ts', 'location': 'doubleJumpVelocity / update() 起跳逻辑', 'title': 'doubleJumpVelocity 常量被定义却从未使用，二段跳与一段跳速度相同', 'description': 'constants.ts 明确定义了 doubleJumpVelocity=-420 以区分一段跳(-480)与二段跳，但 Player.update() 中无论第几次起跳都统一使用 this.jumpVelocity。二段跳应有的差异化手感（更低初速）没有实现，常量沦为死代码。', 'suggestion': '在 update() 中根据 jumpsUsed 次数选择 jumpVelocity 或 doubleJumpVelocity，例如首次跳用 jumpVelocity、空中二段跳用 doubleJumpVelocity。'}
- {'id': 'WARN-02', 'file': 'src/gameobjects/Player.ts', 'location': '构造函数与 update()', 'title': '魔法值硬编码，与 constants.ts 重复', 'description': 'moveSpeed 默认 260、jumpVelocity 默认 -480、maxJumps 默认 2、body.setMaxVelocity(800,1600) 全部硬编码，而 PLAYER.moveSpeed / PLAYER.jumpVelocity / PLAYER.maxJumps / PLAYER.maxVelocityX / PLAYER.maxVelocityY 已在 constants.ts 定义。同一数值两处维护，改一处漏一处即产生不一致。', 'suggestion': '构造函数默认值直接引用 PLAYER 常量（config.moveSpeed ?? PLAYER.moveSpeed 等），setMaxVelocity 使用 PLAYER.maxVelocityX/maxVelocityY。'}
- {'id': 'WARN-03', 'file': 'src/constants.ts', 'location': 'PlayerState 枚举', 'title': 'PlayerState 枚举为死代码，且命名与 isControlled 语义冲突', 'description': 'PlayerState 枚举（Idle/Run/Jump/DoubleJump/Fall/Controlled）从未被任何文件引用。同时 Player.ts 用布尔 isControlled 表示『是否受玩家控制』，而 PlayerState.Controlled 看起来像『处于受控状态』，两者语义易混淆，进一步说明枚举未被真正纳入状态机。', 'suggestion': '要么删除未使用的 PlayerState 枚举，要么将 PlayerStateManager 扩展为真正的状态机（Idle/Run/Jump/DoubleJump/Fall）并让 Player 消费它，避免遗留误导性死代码。'}
- {'id': 'WARN-04', 'file': 'src/gameobjects/Player.ts', 'location': '构造函数 keyboard 访问', 'title': 'scene.input.keyboard 使用非空断言，存在空指针风险', 'description': 'this.cursors = keyboard!.createCursorKeys() 等使用非空断言。若 InputPlugin 未启用键盘（或键盘被禁用），keyboard 为 null 会在运行时抛 TypeError。项目规范明确禁止对可能为空的对象盲目断言。', 'suggestion': '对 keyboard 做空值判断并抛出可读错误或提前返回，避免运行时崩溃且便于定位。'}
- {'id': 'WARN-05', 'file': 'src/state/PlayerState.ts', 'location': 'playerStateReducer LAND/RESET 分支', 'title': 'LAND 与 RESET 两个 action 逻辑完全相同，冗余分支', 'description': "case 'LAND' 与 case 'RESET' 返回完全相同的状态对象，属于重复代码。若未来 LAND 需额外逻辑（如触地特效标志）而只改一处，极易遗漏另一处，埋下维护隐患。", 'suggestion': "合并为单一分支（case 'LAND': case 'RESET': return ...），或在注释中明确二者将来会分化，当前建议合并。"}

## 🟢 建议（可选优化）
- {'id': 'SUG-01', 'file': 'src/gameobjects/Player.ts', 'location': 'setControlled / update', 'title': 'setControlled 与 update 中重复 setVelocityX(0)', 'description': 'setControlled(false) 里 body.setVelocityX(0)，update() 里未受控分支又执行一次 body.setVelocityX(0)，逻辑重复。若未来受控语义变化需维护两处。', 'suggestion': '统一只在一处清零水平速度，例如仅保留 update() 中的处理，setControlled 只负责切换标志位。'}
- {'id': 'SUG-02', 'file': 'src/state/PlayerState.ts', 'location': 'PlayerStateManager 方法签名', 'title': 'tryJump/land/reset 返回类型不一致，API 不统一', 'description': 'tryJump() 返回 boolean，land()/reset() 返回 void。调用方无法从 land/reset 拿到最新快照，语义不对称。', 'suggestion': '统一让这些方法返回 PlayerStateSnapshot（内部 dispatch 已返回快照），保持 API 一致性。'}
- {'id': 'SUG-03', 'file': 'src/state/PlayerState.ts', 'location': 'playerStateReducer default 分支', 'title': 'reducer 缺少穷尽性检查', 'description': 'PlayerAction 是有限的联合类型，default: return state 会静默吞掉未知 action，掩盖拼写错误或未来新增 action 未处理的情况。', 'suggestion': '利用 TS 的 never 穷尽性检查（default 分支对 action 做 assertNever），让编译器在新增 action 未处理时报错。'}
- {'id': 'SUG-04', 'file': 'src/gameobjects/Player.ts', 'location': 'enableCameraFollow', 'title': '相机跟随参数为魔法值', 'description': 'setDeadzone(64,64) 与 startFollow 的 0.1 平滑系数均为硬编码，缺少语义化命名与注释。', 'suggestion': '抽为具名常量（如 CAMERA_DEADZONE、CAMERA_FOLLOW_LERP）并补充注释说明取值依据。'}

## 审查的代码
- src/state/PlayerState.ts
- src/constants.ts
- src/gameobjects/Player.ts
- docs/Reqs/b63dfa/31feca/dev-notes.md
