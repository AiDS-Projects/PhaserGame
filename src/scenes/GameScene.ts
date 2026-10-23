import Phaser from 'phaser';
import { COLORS, SceneKey } from '../constants';
import { LevelBuilder } from '../level/levelBuilder';
import { Player } from '../gameobjects/Player';

// Solid background + static level geometry (ground & platforms), plus a player
// that can move left/right, jump, and is affected by gravity — ready for the
// double-jump / dash tickets to build on.
export class GameScene extends Phaser.Scene {
  private readonly levelBuilder: LevelBuilder;
  private player?: Player;

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

    // Gravity: pull the player down so they fall back to the ground and can jump.
    this.physics.world.gravity.y = 900;

    // Placeholder player texture (visual art comes in a later ticket).
    if (!this.textures.exists('player')) {
      const g = this.make.graphics({ add: false });
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 24, 32);
      g.generateTexture('player', 24, 32);
      g.destroy();
    }

    // Spawn the player and make the camera follow them.
    this.player = new Player(this, 100, 100, 'player');
    this.player.enableCameraFollow();

    // Collide the player against the static level geometry (ground, platforms, bounds).
    this.physics.add.collider(this.player, this.levelBuilder.getStaticGroup());
  }

  update(): void {
    // Run the player's per-frame movement / jump logic.
    this.player?.update();
  }
}