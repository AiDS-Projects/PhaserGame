import Phaser from 'phaser';
import { COLORS, SceneKey } from '../constants';
import { LevelBuilder } from '../level/levelBuilder';
import { Player } from '../gameobjects/Player';
import { PlayerStateManager } from '../state/PlayerState';
import { DashCooldownBar } from '../gameobjects/DashCooldownBar';

// Solid background + static level geometry (ground & platforms), plus a player
// that can move left/right, jump, and is affected by gravity — ready for the
// double-jump / dash tickets to build on.
export class GameScene extends Phaser.Scene {
  private readonly levelBuilder: LevelBuilder;
  private player?: Player;

  // Dash / invincibility / cooldown state (single source of truth).
  private readonly playerState = new PlayerStateManager();
  // HUD element that renders the dash cooldown feedback.
  private dashBar?: DashCooldownBar;
  // Key that triggers a dash.
  private dashKey?: Phaser.Input.Keyboard.Key;

  /** Horizontal speed applied while dashing (px/s). */
  private readonly dashSpeed = 480;
  /** Direction the player is facing: 1 = right, -1 = left. */
  private facing: 1 | -1 = 1;

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
      const g = this.make.graphics({}, false);
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, 24, 32);
      g.generateTexture('player', 24, 32);
      g.destroy();
    }

    // Spawn the player and make the camera follow them.
    this.player = new Player(this, 100, 100, 'player');
    this.player.enableCameraFollow();

    // Collide the player against the static level geometry (ground, platforms, bounds).
    this.physics.add.collider(this.player, this.levelBuilder.staticGroup!);

    // Reset dash / invincibility timers (scene.start() reuses this instance).
    this.playerState.reset();

    // Dash input (Shift).
    this.dashKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    // Cooldown feedback HUD. Values mirror the player state so they stay in sync.
    const snap = this.playerState.snapshot;
    this.dashBar = new DashCooldownBar(this, {
      cooldownMs: snap.dashCooldownMs,
      dashDurationMs: snap.dashDurationMs,
      invincibleDurationMs: snap.invincibleDurationMs,
      x: 100,
      y: 24,
    }).setScrollFactor(0);
  }

  update(time: number, delta: number): void {
    // Advance dash cooldown / invincibility timers.
    this.playerState.tick(delta);

    // Run the player's per-frame movement / jump logic.
    this.player?.update();

    this.updateFacing();
    this.handleDash();
    this.applyDashMotion();
    this.applyInvincibilityVisuals(time);
  }

  /** Track which way the player is facing so dashes move in that direction. */
  private updateFacing(): void {
    const body = this.player?.body as Phaser.Physics.Arcade.Body | undefined;
    if (!body) {
      return;
    }
    if (body.velocity.x > 0) {
      this.facing = 1;
    } else if (body.velocity.x < 0) {
      this.facing = -1;
    }
  }

  /** Trigger a dash when the dash key is pressed and the cooldown has ended. */
  private handleDash(): void {
    if (!this.player || !this.dashKey) {
      return;
    }
    if (!Phaser.Input.Keyboard.JustDown(this.dashKey)) {
      return;
    }
    if (!this.playerState.tryDash()) {
      return;
    }
    // Start the HUD cooldown animation (kept in sync with player state).
    this.dashBar?.triggerDash();
  }

  /** While dashing, lock the player's horizontal velocity to the dash speed. */
  private applyDashMotion(): void {
    if (!this.player || !this.playerState.isDashing) {
      return;
    }
    const body = this.player.body as Phaser.Physics.Arcade.Body | undefined;
    if (!body) {
      return;
    }
    body.velocity.x = this.dashSpeed * this.facing;
  }

  /** Flicker the player sprite while invincible to signal i-frames. */
  private applyInvincibilityVisuals(time: number): void {
    if (!this.player) {
      return;
    }
    if (this.playerState.isInvincible) {
      this.player.alpha = Math.floor(time / 60) % 2 === 0 ? 1 : 0.4;
    } else {
      this.player.alpha = 1;
    }
  }
}