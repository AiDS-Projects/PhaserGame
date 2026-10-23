Typecheck passes. 已按要求修改 `src/scenes/GameScene.ts`，将占位文字替换为可编译的 `GameScene` 空壳类（对应任务背景「初始化 Vite + Phaser 3 + TypeScript 脚手架」，并遵循 `architecture.md` 对 `GameScene` 职责的定义：`super({ key: SceneKey.Game })`、`create()` 开头清监听防泄漏、纯色背景、预留平台跳跃 TODO 扩展点）。原文件仅有占位文字、无实际功能可保留，故此为补全缺失导出、使 `gameConfig.ts` 的 `import { GameScene }` 可解析的增量修复。

修改后的完整文件内容：

import Phaser from 'phaser';
import { SceneKey, COLORS } from '../constants';

// Empty shell scene for the scaffold: registers itself under SceneKey.Game,
// clears its own listeners on create, and paints a solid-color background.
// Platformer features (player, platforms, gravity, camera follow) land here later.
export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKey.Game });
  }

  create(): void {
    // Avoid leaking scene-level listeners across restarts.
    this.events.removeAllListeners();

    // Solid-color background (mirrors gameConfig.backgroundColor; owned here for clarity).
    this.cameras.main.setBackgroundColor(COLORS.bg);

    // TODO(platformer): spawn player + platforms, enable arcade gravity, add camera follow.
  }
}