# 代码审查 — 初始化 Vite + Phaser 3 + TypeScript 脚手架

## 评分: 5/10 🚫 需修复

## 🔴 严重问题（必须修复）
- {'file': 'src/scenes/GameScene.ts', 'line': 'create(): this.input.removeAllListeners()', 'title': 'Blanket removal of all input listeners', 'detail': "this.input.removeAllListeners() wipes every listener registered on the scene's InputPlugin, including internal Phaser wiring and any pointer/keyboard handlers that other code registered before create() re-runs. The stated rationale ('scene.start() reuses the instance, so clear listeners to avoid leaks') is incorrect — Phaser's scene lifecycle (shutdown/start events) already tears down and re-registers input. This will silently break input handling for the upcoming movement/double-jump/dash tickets.", 'suggestion': 'Delete the call. If targeted cleanup is truly needed, use this.input.off(...) for specific handlers or rely on scene shutdown events.'}

## 🟡 警告（建议修复）
- {'file': 'src/main.ts', 'line': 'new Phaser.Game(gameConfig)', 'title': 'No HMR guard -> duplicate game instances', 'detail': 'Under Vite dev HMR, main.ts re-executes on hot update and creates a fresh Phaser.Game without destroying the previous one, stacking multiple canvases and RAF loops inside #game-container.', 'suggestion': 'Retain the game instance and add import.meta.hot.dispose(() => game.destroy(true)) or guard against re-instantiation.'}
- {'file': 'index.html', 'line': 'html,body / #game-container background', 'title': 'Hardcoded background color violates single source of truth', 'detail': '#0f172a is duplicated three times and its lowercase form does not match constants.ts COLORS.bg (#0F172A). constants.ts claims to be the central registry for color tokens, but the HTML re-hardcodes the same value.', 'suggestion': 'Drive the background from the JS config (the canvas already fills the viewport) and remove the duplicated CSS literals, or expose the token via CSS variable.'}
- {'file': 'package.json', 'line': 'scripts.build / scripts.typecheck', 'title': 'Build depends on missing tsconfig.json', 'detail': "Both 'build' and 'typecheck' invoke 'tsc --noEmit', but no tsconfig.json is present in the scaffold files. npm run build will fail with 'Cannot find tsconfig.json'.", 'suggestion': "Add tsconfig.json (with strict, noUnusedLocals, moduleResolution compatible with 'type': 'module') and verify the build actually runs."}
- {'file': 'src/main.ts', 'line': 'new Phaser.Game(gameConfig)', 'title': 'Game instance not retained / no teardown', 'detail': 'The constructed Phaser.Game is discarded; there is no reference for programmatic shutdown and no cleanup on page unload, making testing, resizing, or route teardown impossible.', 'suggestion': 'Store the instance (export const game = new Phaser.Game(gameConfig)) and expose a destroy path.'}

## 🟢 建议（可选优化）
- {'file': 'src/constants.ts', 'line': 'enum SceneKey', 'title': 'Consider string literal union over enum', 'detail': "A TS enum is acceptable but a string literal union or 'as const' object tree-shakes better and avoids runtime enum overhead in a small scaffold.", 'suggestion': "Prefer: export const SceneKey = { Boot: 'Boot', Game: 'Game' } as const; export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];"}
- {'file': 'src/scenes/BootScene.ts / GameScene.ts', 'line': 'cameras.main.setBackgroundColor(COLORS.bg)', 'title': 'Redundant background color assignment', 'detail': 'gameConfig already sets backgroundColor, and both scenes independently call setBackgroundColor, which is duplicated and could drift apart.', 'suggestion': 'Set it once in the config (or once in BootScene) and drop the redundant calls.'}
- {'file': 'src/config/gameConfig.ts', 'line': 'gameConfig object', 'title': 'Missing game metadata fields', 'detail': 'No title/version fields are set, which makes debugging and multi-build identification harder.', 'suggestion': 'Add title and version (or render.pixelArt if the platformer art will be pixel-based).'}
- {'file': 'src/scenes/GameScene.ts', 'line': 'comment on scene.start() reuse', 'title': 'Misleading comment', 'detail': "The comment 'scene.start() reuses the instance, so clear listeners to avoid leaks' is factually wrong and will mislead future contributors.", 'suggestion': 'Remove or correct the comment once the removeAllListeners call is deleted.'}
- {'file': 'src/config/gameConfig.ts', 'line': 'arcade.debug', 'title': 'Hardcoded debug flag', 'detail': 'debug: false is hardcoded; toggling physics debug requires editing source.', 'suggestion': 'Drive it from an env var or URL query param (e.g. import.meta.env.DEV) for a better dev workflow.'}

## 审查的代码
- src/config/gameConfig.ts
- src/scenes/BootScene.ts
- src/scenes/GameScene.ts
- src/constants.ts
- src/main.ts
- index.html
- package.json
- docs/Reqs/b63dfa/982770/dev-notes.md
