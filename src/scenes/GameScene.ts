import Phaser from 'phaser';

import {
  GAME_WIDTH,
  GROUND_TOP,
  GROUND_HEIGHT,
  GRAVITY_Y,
  MAX_FALL_SPEED,
  PLAYER_WIDTH,
  PLAYER_HEIGHT,
  MOVE_SPEED,
  JUMP_VELOCITY,
  MAX_JUMPS,
  DASH_SPEED,
  DASH_DURATION_MS,
  DASH_COOLDOWN_MS,
  INVINCIBLE_MS,
  COLORS,
  shouldShowTouchControls,
  TOUCH_BUTTONS,
} from '../constants';
import type { TouchButtonLayout } from '../constants';
import { PlayerStateManager } from '../state/PlayerState';

/**
 * GameScene —— 可玩原型主场景
 *
 * 职责：
 *  1. 玩家操控：左右移动、跳跃（含二段跳）、冲刺（冷却 + 无敌帧）。
 *  2. 触控兜底：触屏设备（或 ?touch=1）下渲染屏幕内操作按钮，统一 pointer 输入。
 *  3. 验收自测：暴露 window.__game 钩子，供 Playwright 截图自测与手感确认读取运行时状态。
 *
 * 状态单一事实来源：PlayerStateManager（跳跃 / 落地 / 冲刺 / 无敌帧均为受控 action 驱动）。
 */

export interface GameStateSnapshot {
  jumpCount: number;
  maxJumps: number;
  isGrounded: boolean;
  dashCooldownRemaining: number;
  dashRemaining: number;
  invincibleRemaining: number;
  facing: number;
}

declare global {
  interface Window {
    __game: {
      getState: () => GameStateSnapshot | null;
      jump: () => boolean;
      dash: () => boolean;
      moveLeft: (on: boolean) => void;
      moveRight: (on: boolean) => void;
      showTouch: boolean;
    };
  }
}

let activeScene: GameScene | null = null;

const showTouch = shouldShowTouchControls();

export class GameScene extends Phaser.Scene {
  public static readonly KEY = 'GameScene';

  private ground!: Phaser.GameObjects.Rectangle;
  private player!: Phaser.GameObjects.Rectangle;
  private barFill!: Phaser.GameObjects.Rectangle;
  private barLabel!: Phaser.GameObjects.Text;
  private hud!: Phaser.GameObjects.Text;

  private state!: PlayerStateManager;
  private facing = 1;
  private dashDir = 1;
  private inputState = { left: false, right: false };
  private pendingActions = { jump: false, dash: false };

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private leftKeys!: Phaser.Input.Keyboard.Key[];
  private rightKeys!: Phaser.Input.Keyboard.Key[];
  private jumpKeys!: Phaser.Input.Keyboard.Key[];
  private dashKeys!: Phaser.Input.Keyboard.Key[];

  constructor() {
    super(GameScene.KEY);
  }

  create(): void {
    activeScene = this;

    // 地面（静态碰撞体）
    this.ground = this.add.rectangle(
      GAME_WIDTH / 2,
      GROUND_TOP + GROUND_HEIGHT / 2,
      GAME_WIDTH,
      GROUND_HEIGHT,
      COLORS.ground,
    );
    this.physics.add.existing(this.ground, true);
    this.add.rectangle(GAME_WIDTH / 2, GROUND_TOP + 2, GAME_WIDTH, 4, COLORS.groundEdge);

    // 玩家
    this.player = this.add.rectangle(
      GAME_WIDTH / 2,
      GROUND_TOP - PLAYER_HEIGHT / 2,
      PLAYER_WIDTH,
      PLAYER_HEIGHT,
      COLORS.player,
    );
    this.physics.add.existing(this.player);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    body.setGravityY(GRAVITY_Y);
    body.setMaxVelocity(DASH_SPEED + 100, MAX_FALL_SPEED);

    this.physics.add.collider(this.player, this.ground);

    // 玩家状态（单一事实来源）
    this.state = new PlayerStateManager(MAX_JUMPS, {
      cooldownMs: DASH_COOLDOWN_MS,
      durationMs: DASH_DURATION_MS,
      invincibleMs: INVINCIBLE_MS,
    });

    // 冲刺冷却条（屏幕空间）
    this.add
      .rectangle(16, 16, 200, 18, COLORS.uiBackground)
      .setOrigin(0, 0)
      .setStrokeStyle(2, COLORS.uiBorder)
      .setScrollFactor(0);
    this.barFill = this.add
      .rectangle(18, 25, 196, 14, COLORS.uiReady)
      .setOrigin(0, 0.5)
      .setScrollFactor(0);
    this.barLabel = this.add
      .text(224, 25, 'READY', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: COLORS.textPrimary,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0);

    // HUD（Playwright 断言表面）
    this.hud = this.add
      .text(16, 46, '', {
        fontFamily: 'monospace',
        fontSize: '12px',
        color: COLORS.textMuted,
      })
      .setScrollFactor(0);

    // 操作提示
    this.add
      .text(GAME_WIDTH / 2, 20, 'A/D or arrows move · SPACE jump (double) · SHIFT dash', {
        fontFamily: 'monospace',
        fontSize: '13px',
        color: COLORS.textDim,
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0);

    // 键盘
    this.cursors = this.input.keyboard!.createCursorKeys();
    const kb = this.input.keyboard!;
    this.leftKeys = [this.cursors.left, kb.addKey('A')];
    this.rightKeys = [this.cursors.right, kb.addKey('D')];
    this.jumpKeys = [this.cursors.space, this.cursors.up, kb.addKey('W'), kb.addKey('Z')];
    this.dashKeys = [this.cursors.shift, kb.addKey('X'), kb.addKey('K'), kb.addKey('J')];

    // 触控兜底
    if (showTouch) this.createTouchControls();

    this.renderBar();
    this.renderHud();
  }

  private createTouchControls(): void {
    this.makeTouchButton(TOUCH_BUTTONS.left, () => { this.inputState.left = true; }, () => { this.inputState.left = false; });
    this.makeTouchButton(TOUCH_BUTTONS.right, () => { this.inputState.right = true; }, () => { this.inputState.right = false; });
    this.makeTouchButton(TOUCH_BUTTONS.jump, () => { this.pendingActions.jump = true; }, () => {});
    this.makeTouchButton(TOUCH_BUTTONS.dash, () => { this.pendingActions.dash = true; }, () => {});
  }

  private makeTouchButton(
    layout: TouchButtonLayout,
    onDown: () => void,
    onUp: () => void,
  ): void {
    const rect = this.add
      .rectangle(layout.x, layout.y, layout.width, layout.height, COLORS.uiBackground, 0.7)
      .setStrokeStyle(2, COLORS.uiBorder)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(layout.x, layout.y, layout.label, {
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: `${layout.fontSize}px`,
        color: COLORS.textPrimary,
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    const press = () => {
      rect.setFillStyle(COLORS.player, 0.35);
      rect.setStrokeStyle(2, COLORS.player);
      onDown();
    };
    const release = () => {
      rect.setFillStyle(COLORS.uiBackground, 0.7);
      rect.setStrokeStyle(2, COLORS.uiBorder);
      onUp();
    };

    rect.on('pointerdown', press);
    rect.on('pointerup', release);
    rect.on('pointerout', release);
    rect.on('pointerupoutside', release);
  }

  private anyDown(keys: Phaser.Input.Keyboard.Key[]): boolean {
    return keys.some((k) => k.isDown);
  }

  private anyJustDown(keys: Phaser.Input.Keyboard.Key[]): boolean {
    return keys.some((k) => Phaser.Input.Keyboard.JustDown(k));
  }

  tryJump(): boolean {
    if (!this.state.tryJump()) return false;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocityY(JUMP_VELOCITY);
    return true;
  }

  tryDash(): boolean {
    if (!this.state.tryDash()) return false;
    const dir = (this.inputState.right ? 1 : 0) - (this.inputState.left ? 1 : 0);
    this.dashDir = dir !== 0 ? dir : this.facing;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setVelocityY(0);
    return true;
  }

  moveLeft(on: boolean): void {
    this.inputState.left = on;
  }

  moveRight(on: boolean): void {
    this.inputState.right = on;
  }

  getSnapshot(): GameStateSnapshot {
    return {
      jumpCount: this.state.jumpCount,
      maxJumps: MAX_JUMPS,
      isGrounded: this.state.isGrounded,
      dashCooldownRemaining: this.state.dashCooldownRemaining,
      dashRemaining: this.state.dashRemaining,
      invincibleRemaining: this.state.invincibleRemaining,
      facing: this.facing,
    };
  }

  update(_time: number, delta: number): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;

    // 消费排队的触控动作
    if (this.pendingActions.jump) {
      this.pendingActions.jump = false;
      this.tryJump();
    }
    if (this.pendingActions.dash) {
      this.pendingActions.dash = false;
      this.tryDash();
    }

    // 键盘动作
    if (this.anyJustDown(this.jumpKeys)) this.tryJump();
    if (this.anyJustDown(this.dashKeys)) this.tryDash();

    const left = this.inputState.left || this.anyDown(this.leftKeys);
    const right = this.inputState.right || this.anyDown(this.rightKeys);

    if (left && !right) this.facing = -1;
    else if (right && !left) this.facing = 1;

    // 水平移动
    if (this.state.isDashing) {
      body.setVelocityX(this.dashDir * DASH_SPEED);
    } else {
      let vx = 0;
      if (left) vx -= MOVE_SPEED;
      if (right) vx += MOVE_SPEED;
      body.setVelocityX(vx);
    }

    // 计时器推进（冷却 / 冲刺时长 / 无敌帧）
    const wasDashing = this.state.isDashing;
    this.state.tick(delta);
    if (wasDashing && !this.state.isDashing) {
      body.setAllowGravity(true);
    }

    // 落地检测
    if (body.blocked.down && !this.state.isGrounded) {
      this.state.land();
    }

    // 视觉（无敌帧闪烁）
    if (this.state.isInvincible) {
      const blink = Math.floor(this.state.invincibleRemaining / 40) % 2 === 0;
      this.player.setAlpha(blink ? 0.35 : 0.85);
      this.player.setFillStyle(COLORS.playerInvincible);
    } else {
      this.player.setAlpha(1);
      this.player.setFillStyle(COLORS.player);
    }

    this.renderBar();
    this.renderHud();
  }

  private renderBar(): void {
    if (this.state.dashCooldownRemaining > 0) {
      this.barFill.setFillStyle(COLORS.uiCooling).setScale(this.state.dashCooldownFraction, 1);
      this.barLabel.setText((this.state.dashCooldownRemaining / 1000).toFixed(1) + 's');
    } else {
      this.barFill.setFillStyle(COLORS.uiReady).setScale(1, 1);
      this.barLabel.setText('READY');
    }
  }

  private renderHud(): void {
    this.hud.setText(
      'JUMPS ' + this.state.jumpCount + '/' + MAX_JUMPS +
      '  GROUND ' + (this.state.isGrounded ? 'Y' : 'N') +
      '  DASH ' + (this.state.isDashing ? 'Y' : 'N') +
      '  CD ' + Math.ceil(this.state.dashCooldownRemaining) +
      '  INV ' + Math.ceil(this.state.invincibleRemaining),
    );
  }
}

function getState(): GameStateSnapshot | null {
  return activeScene ? activeScene.getSnapshot() : null;
}

window.__game = {
  getState,
  jump: () => (activeScene ? activeScene.tryJump() : false),
  dash: () => (activeScene ? activeScene.tryDash() : false),
  moveLeft: (on: boolean) => { activeScene?.moveLeft(on); },
  moveRight: (on: boolean) => { activeScene?.moveRight(on); },
  showTouch,
};