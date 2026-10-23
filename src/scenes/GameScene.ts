import Phaser from 'phaser';
import { COLORS, SceneKey } from '../constants';

// Empty shell scene: solid background + lifecycle hooks, ready for the
// movement / double-jump / dash tickets to build on.
export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKey.Game });
  }

  create(): void {
    // scene.start() reuses the instance, so clear listeners to avoid leaks.
    this.input.removeAllListeners();

    // Solid-color background (no texture), per the visual spec.
    this.cameras.main.setBackgroundColor(COLORS.bg);

    // TODO(platformer): future tickets extend here.
    // - player sprite: double jump + dash
    // - HUD: score / lives / key hints
  }
}