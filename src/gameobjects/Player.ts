import Phaser from 'phaser';

/**
 * 玩家角色：基于 Arcade Physics 实现左右移动、跳跃、重力与碰撞，
 * 并提供相机跟随能力。
 *
 * - 重力由场景的 Arcade Physics 配置提供（如 `physics.arcade.gravity.y`），
 *   本类作为物理体自然参与重力与碰撞（与地面 / 平台 / 边界的 collider 由场景建立）。
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  /** 水平移动速度（px/s） */
  private readonly moveSpeed: number;
  /** 跳跃初速度（负值表示向上，px/s） */
  private readonly jumpVelocity: number;

  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA: Phaser.Input.Keyboard.Key;
  private keyD: Phaser.Input.Keyboard.Key;
  private keyW: Phaser.Input.Keyboard.Key;
  private keySpace: Phaser.Input.Keyboard.Key;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    config: { moveSpeed?: number; jumpVelocity?: number } = {},
  ) {
    super(scene, x, y, texture);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.moveSpeed = config.moveSpeed ?? 260;
    this.jumpVelocity = config.jumpVelocity ?? -480;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    body.setMaxVelocity(800, 1600);

    const keyboard = scene.input.keyboard;
    this.cursors = keyboard!.createCursorKeys();
    this.keyA = keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyW = keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keySpace = keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  /** 接入相机跟随：让主相机平滑跟随玩家。 */
  public enableCameraFollow(): void {
    const camera = this.scene.cameras.main;
    camera.startFollow(this, true, 0.1, 0.1);
    camera.setDeadzone(64, 64);
  }

  /** 每帧更新：处理左右移动与跳跃。 */
  public update(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;

    const left = this.cursors.left.isDown || this.keyA.isDown;
    const right = this.cursors.right.isDown || this.keyD.isDown;

    if (left && !right) {
      body.setVelocityX(-this.moveSpeed);
      this.setFlipX(true);
    } else if (right && !left) {
      body.setVelocityX(this.moveSpeed);
      this.setFlipX(false);
    } else {
      body.setVelocityX(0);
    }

    const wantJump =
      Phaser.Input.Keyboard.JustDown(this.cursors.up) ||
      Phaser.Input.Keyboard.JustDown(this.keyW) ||
      Phaser.Input.Keyboard.JustDown(this.keySpace);

    if (wantJump && body.blocked.down) {
      body.setVelocityY(this.jumpVelocity);
    }
  }
}