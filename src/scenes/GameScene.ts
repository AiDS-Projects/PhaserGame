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
