import Phaser from 'phaser';
import { COLORS, SceneKey } from '../constants';
import { LevelBuilder } from '../level/levelBuilder';

// Solid background + static level geometry (ground & platforms), ready for the
// movement / double-jump / dash tickets to build on.
export class GameScene extends Phaser.Scene {
  private readonly levelBuilder: LevelBuilder;

  constructor() {
    super({ key: SceneKey.Game });
    this.levelBuilder = new LevelBuilder();
  }

  create(): void {
    // scene.start() reuses the instance, so clear listeners to avoid leaks.
    this.input.removeAllListeners();

    // Solid-color background (no texture), per the visual spec.
    this.cameras.main.setBackgroundColor(COLORS.bg);

    // Build the static level (ground + floating platforms) and apply the
    // world + camera bounds, per the "ground & platforms" ticket.
    this.levelBuilder.build(this);

    // TODO(platformer): future tickets extend here.
    // - player sprite: double jump + dash
    // - HUD: score / lives / key hints
  }
}