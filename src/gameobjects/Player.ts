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
  /** 最大跳跃次数（支持二段跳） */
  private readonly maxJumps: number;

  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA: Phaser.Input.Keyboard.Key;
  private keyD: Phaser.Input.Keyboard.Key;
  private keyW: Phaser.Input.Keyboard.Key;
  private keySpace: Phaser.Input.Keyboard.Key;

  /** 已使用的跳跃次数（触地时重置为 0） */
  private jumpsUsed = 0;
  /** 是否受玩家控制；为 false 时忽略所有输入 */
  private isControlled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    config: { moveSpeed?: number; jumpVelocity?: number; maxJumps?: number } = {},
  ) {
    super(scene, x, y, texture);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.moveSpeed = config.moveSpeed ?? 260;
    this.jumpVelocity = config.jumpVelocity ?? -480;
    this.maxJumps = config.maxJumps ?? 2;

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

  /** 设置玩家是否受控（受控时才响应键盘输入）。 */
  public setControlled(controlled: boolean): void {
    this.isControlled = controlled;
    if (!controlled) {
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.setVelocityX(0);
    }
  }

  /** 返回玩家当前是否受控。 */
  public isPlayerControlled(): boolean {
    return this.isControlled;
  }

  /** 每帧更新：处理左右移动与跳跃。 */
  public update(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;

    // 触地时重置二段跳计数
    if (body.blocked.down) {
      this.jumpsUsed = 0;
    }

    // 未受控时忽略输入，并停止水平移动
    if (!this.isControlled) {
      body.setVelocityX(0);
      return;
    }

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

    if (wantJump && this.jumpsUsed < this.maxJumps) {
      body.setVelocityY(this.jumpVelocity);
      this.jumpsUsed++;
    }
  }
}