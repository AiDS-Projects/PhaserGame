import Phaser from "phaser";

import BootScene from "../scenes/BootScene";
// [AutoFix: removed missing module ../scenes/PreloadScene]
import { GameScene } from "../scenes/GameScene";
// [AutoFix: removed missing module ../scenes/UIScene]

/** 设计分辨率（竖屏原型） */
export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

/** 与 index.html 保持一致的背景色 */
export const GAME_BG_COLOR = "#0f172a";

/** 场景 key 统一管理 */
export const SceneKey = {
  Boot: "Boot",
  Preload: "Preload",
  Game: "Game",
  UI: "UI",
} as const;

export type SceneKey = (typeof SceneKey)[keyof typeof SceneKey];

/**
 * Phaser 游戏全局配置。
 * - FIT + CENTER_BOTH：自适应缩放并居中，适配移动端与桌面自测
 * - input.touch + activePointers：触控为主，鼠标作为桌面/Playwright 兜底
 */
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-container",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: GAME_BG_COLOR,
  render: {
    antialias: true,
    pixelArt: false,
    roundPixels: false,
    powerPreference: "high-performance",
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  physics: {
    default: "arcade",
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  input: {
    activePointers: 3,
    touch: true,
  },
  scene: [BootScene, GameScene],
};