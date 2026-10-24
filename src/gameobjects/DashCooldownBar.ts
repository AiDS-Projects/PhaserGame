import Phaser from 'phaser';

export interface DashCooldownBarConfig {
  /** Total time between dashes, in milliseconds. */
  cooldownMs: number;
  /** How long a single dash lasts, in milliseconds. */
  dashDurationMs: number;
  /** How long the player stays invincible after dashing, in milliseconds. */
  invincibleDurationMs: number;
  /** Bar width in pixels. */
  width?: number;
  /** Bar height in pixels. */
  height?: number;
  /** Bar position in the scene. */
  x?: number;
  y?: number;
  /** Background fill color (0xRRGGBB). */
  backgroundColor?: number;
  /** Border color (0xRRGGBB). */
  borderColor?: number;
  /** Fill color while cooling down (0xRRGGBB). */
  fillColor?: number;
  /** Fill color when the dash is ready (0xRRGGBB). */
  readyColor?: number;
}

/**
 * UI bar that shows dash cooldown state and tracks the dash / invincibility
 * timers so a player (or scene) can query whether a dash is allowed and
 * whether the player currently has i-frames.
 */
export class DashCooldownBar extends Phaser.GameObjects.Container {
  private readonly cooldownMs: number;
  private readonly dashDurationMs: number;
  private readonly invincibleDurationMs: number;

  private readonly readyColor: number;
  private readonly fillColor: number;

  private cooldownRemaining = 0;
  private dashRemaining = 0;
  private invincibleRemaining = 0;

  private readonly background: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, config: DashCooldownBarConfig) {
    const {
      cooldownMs,
      dashDurationMs,
      invincibleDurationMs,
      width = 160,
      height = 16,
      x = 0,
      y = 0,
      backgroundColor = 0x1e293b,
      borderColor = 0x94a3b8,
      fillColor = 0xf59e0b,
      readyColor = 0x22c55e,
    } = config;

    super(scene, x, y);

    this.cooldownMs = cooldownMs;
    this.dashDurationMs = dashDurationMs;
    this.invincibleDurationMs = invincibleDurationMs;
    this.fillColor = fillColor;
    this.readyColor = readyColor;

    this.background = new Phaser.GameObjects.Rectangle(
      scene,
      0,
      0,
      width,
      height,
      backgroundColor,
    ).setStrokeStyle(2, borderColor);

    this.fill = new Phaser.GameObjects.Rectangle(
      scene,
      -width / 2,
      0,
      width,
      height - 4,
      readyColor,
    ).setOrigin(0, 0.5);

    this.label = new Phaser.GameObjects.Text(scene, width / 2 + 6, 0, 'READY', {
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#e2e8f0',
    }).setOrigin(0, 0.5);

    this.add([this.background, this.fill, this.label]);
    this.scene.add.existing(this);

    this.setReadyVisuals();

    // Self-driving: tick the timers on every scene update.
    this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.once(Phaser.GameObjects.Events.DESTROY, this.handleDestroy, this);
  }

  /** Attempt to dash. Returns false (and does nothing) if still cooling down. */
  public triggerDash(): boolean {
    if (!this.isDashReady()) {
      return false;
    }

    this.cooldownRemaining = this.cooldownMs;
    this.dashRemaining = this.dashDurationMs;
    this.invincibleRemaining = this.invincibleDurationMs;
    this.setCoolingVisuals(1);
    return true;
  }

  public isDashReady(): boolean {
    return this.cooldownRemaining <= 0;
  }

  public isDashing(): boolean {
    return this.dashRemaining > 0;
  }

  public isInvincible(): boolean {
    return this.invincibleRemaining > 0;
  }

  /** Cooldown fraction remaining: 1 = just dashed, 0 = ready. */
  public getCooldownFraction(): number {
    if (this.cooldownMs <= 0) {
      return 0;
    }
    return this.cooldownRemaining / this.cooldownMs;
  }

  private update(_time: number, delta: number): void {
    if (this.cooldownRemaining > 0) {
      this.cooldownRemaining = Math.max(0, this.cooldownRemaining - delta);
      this.setCoolingVisuals(this.getCooldownFraction());

      if (this.cooldownRemaining === 0) {
        this.setReadyVisuals();
      }
    }

    if (this.dashRemaining > 0) {
      this.dashRemaining = Math.max(0, this.dashRemaining - delta);
    }

    if (this.invincibleRemaining > 0) {
      this.invincibleRemaining = Math.max(0, this.invincibleRemaining - delta);
    }
  }

  private setCoolingVisuals(fraction: number): void {
    this.fill.setFillStyle(this.fillColor);
    this.fill.setScale(Phaser.Math.Clamp(fraction, 0, 1), 1);
    this.label.setText(`${(this.cooldownRemaining / 1000).toFixed(1)}s`);
  }

  private setReadyVisuals(): void {
    this.fill.setFillStyle(this.readyColor);
    this.fill.setScale(1, 1);
    this.label.setText('READY');
  }

  private handleDestroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
  }
}