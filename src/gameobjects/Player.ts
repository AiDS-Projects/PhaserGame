import Phaser from 'phaser';

/**
 * 玩家角色：基于 Arcade Physics 实现左右移动、跳跃、重力与碰撞，
 * 并提供相机跟随能力。
 *
 * - 重力由场景的 Arcade Physics 配置提供（如 `physics.arcade.gravity.y`），
 *   本类作为物理体自然参与重力与碰撞（与地面 / 平台 / 边界的 collider 由场景建立）。
 * - 冲刺（Dash）：按下 Shift 向当前朝向冲刺，期间禁用重力并进入无敌帧。
 * - 冷却反馈：冲刺冷却期间角色以灰色染色提示，冷却结束后恢复。
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  /** 水平移动速度（px/s） */
  private readonly moveSpeed: number;
  /** 跳跃初速度（负值表示向上，px/s） */
  private readonly jumpVelocity: number;
  /** 最大跳跃次数（支持二段跳） */
  private readonly maxJumps: number;
  /** 冲刺速度（px/s） */
  private readonly dashSpeed: number;
  /** 冲刺持续时间（ms） */
  private readonly dashDuration: number;
  /** 冲刺冷却时间（ms，从冲刺结束后开始计算） */
  private readonly dashCooldown: number;
  /** 冲刺结束后的无敌帧缓冲时间（ms） */
  private readonly dashInvincibilityBuffer: number;

  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private keyA: Phaser.Input.Keyboard.Key;
  private keyD: Phaser.Input.Keyboard.Key;
  private keyW: Phaser.Input.Keyboard.Key;
  private keySpace: Phaser.Input.Keyboard.Key;
  private keyShift: Phaser.Input.Keyboard.Key;

  /** 已使用的跳跃次数（触地时重置为 0） */
  private jumpsUsed = 0;
  /** 是否受玩家控制；为 false 时忽略所有输入 */
  private isControlled = true;

  /** 是否正在冲刺 */
  private isDashing = false;
  /** 冲刺方向（1 = 右，-1 = 左） */
  private dashDirection = 1;
  /** 冲刺结束时间戳（ms） */
  private dashEndTime = 0;
  /** 冲刺冷却结束时间戳（ms） */
  private cooldownEndTime = 0;
  /** 无敌帧结束时间戳（ms） */
  private invincibleEndTime = 0;
  /** 冷却染色是否已激活 */
  private cooldownTintActive = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    config: {
      moveSpeed?: number;
      jumpVelocity?: number;
      maxJumps?: number;
      dashSpeed?: number;
      dashDuration?: number;
      dashCooldown?: number;
      dashInvincibilityBuffer?: number;
    } = {},
  ) {
    super(scene, x, y, texture);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.moveSpeed = config.moveSpeed ?? 260;
    this.jumpVelocity = config.jumpVelocity ?? -480;
    this.maxJumps = config.maxJumps ?? 2;
    this.dashSpeed = config.dashSpeed ?? 600;
    this.dashDuration = config.dashDuration ?? 200;
    this.dashCooldown = config.dashCooldown ?? 1000;
    this.dashInvincibilityBuffer = config.dashInvincibilityBuffer ?? 100;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    body.setMaxVelocity(800, 1600);

    const keyboard = scene.input.keyboard;
    this.cursors = keyboard!.createCursorKeys();
    this.keyA = keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);
    this.keyD = keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);
    this.keyW = keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);
    this.keySpace = keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.keyShift = keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
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

  /** 返回玩家当前是否处于冲刺状态。 */
  public isCurrentlyDashing(): boolean {
    return this.isDashing;
  }

  /** 返回玩家当前是否处于无敌帧（冲刺期间及冲刺后的短暂缓冲）。 */
  public isCurrentlyInvincible(): boolean {
    return this.scene.time.now < this.invincibleEndTime;
  }

  /** 返回冲刺冷却剩余时间（ms），无冷却时为 0。 */
  public getDashCooldownRemaining(): number {
    const remaining = this.cooldownEndTime - this.scene.time.now;
    return Math.max(0, remaining);
  }

  /** 每帧更新：处理左右移动、跳跃与冲刺。 */
  public update(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const now = this.scene.time.now;

    // 触地时重置二段跳计数
    if (body.blocked.down) {
      this.jumpsUsed = 0;
    }

    // 冷却反馈：冲刺结束进入冷却后以灰色染色提示
    this.updateCooldownFeedback(now);

    // 冲刺期间锁定速度，直到冲刺结束
    if (this.isDashing) {
      if (now >= this.dashEndTime) {
        this.endDash();
      } else {
        return;
      }
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

    // 冲刺：冷却结束后按下 Shift 触发
    if (Phaser.Input.Keyboard.JustDown(this.keyShift) && now >= this.cooldownEndTime) {
      this.startDash();
    }
  }

  /** 开始冲刺：向当前朝向加速，禁用重力并进入无敌帧。 */
  private startDash(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const now = this.scene.time.now;

    this.dashDirection = this.flipX ? -1 : 1;
    this.isDashing = true;
    this.dashEndTime = now + this.dashDuration;
    this.cooldownEndTime = now + this.dashDuration + this.dashCooldown;
    this.invincibleEndTime = now + this.dashDuration + this.dashInvincibilityBuffer;

    body.setAllowGravity(false);
    body.setVelocityY(0);
    body.setVelocityX(this.dashDirection * this.dashSpeed);
  }

  /** 结束冲刺：恢复重力。 */
  private endDash(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;

    this.isDashing = false;
    body.setAllowGravity(true);

    if (!this.isControlled) {
      body.setVelocityX(0);
    }
  }

  /** 更新冲刺冷却的染色反馈。 */
  private updateCooldownFeedback(now: number): void {
    const onCooldown = now >= this.dashEndTime && now < this.cooldownEndTime;

    if (onCooldown && !this.cooldownTintActive) {
      this.setTint(0x999999);
      this.cooldownTintActive = true;
    } else if (!onCooldown && this.cooldownTintActive) {
      this.clearTint();
      this.cooldownTintActive = false;
    }
  }
}