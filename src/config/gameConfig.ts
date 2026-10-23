import Phaser from 'phaser';
import { COLORS, DESIGN_WIDTH, DESIGN_HEIGHT } from '../constants';
import { BootScene } from '../scenes/BootScene';
import { GameScene } from '../scenes/GameScene';

// Single source of truth for the Phaser.Game bootstrap config.
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  backgroundColor: COLORS.bg,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      // No gravity yet: this ticket spawns no character; the jump ticket will set it.
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, GameScene],
};