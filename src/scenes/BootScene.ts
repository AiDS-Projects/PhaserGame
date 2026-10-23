import Phaser from 'phaser';
import { COLORS, SceneKey } from '../constants';

// Bootstrap scene: runs first, loads shared assets and global setup,
// then hands off to the game scene. Kept as an empty shell for now.
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKey.Boot });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);

    // TODO(boot): load shared assets / global state here before handoff.

    this.scene.start(SceneKey.Game);
  }
}