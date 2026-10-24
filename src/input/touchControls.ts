import Phaser from 'phaser';

import {
  COLORS,
  TOUCH_BUTTONS,
  shouldShowTouchControls,
  type TouchButtonId,
} from '../constants';

/**
 * 触控输入只读快照（供 GameScene 每帧读取 / 验收自测断言）。
 */
export interface TouchInputSnapshot {
  /** 左移按钮是否被按住（电平触发） */
  readonly left: boolean;
  /** 右移按钮是否被按住（电平触发） */
  readonly right: boolean;
  /** 跳跃是否处于待处理队列（边沿触发，读取后应清除） */
  readonly jumpQueued: boolean;
  /** 冲刺是否处于待处理队列（边沿触发，读取后应清除） */
  readonly dashQueued: boolean;
}

/** 按钮组合的视觉对象（用于按压反馈与销毁清理） */
interface TouchButtonVisuals {
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

/** 触控按钮渲染层级（保证覆盖在玩法画面上方） */
const TOUCH_DEPTH = 1000;
const BUTTON_IDLE_ALPHA = 0.7;
const BUTTON_PRESSED_ALPHA = 0.35;
const BUTTON_BORDER_WIDTH = 2;

/**
 * TouchControls —— 触控兜底输入层。
 *
 * 职责：
 *  1. 自动识别触屏设备（含 ?touch=1 显式开关，见 constants.shouldShowTouchControls），
 *     仅在需要时激活；桌面端不渲染任何按钮。
 *  2. 按 constants.ts 的 TOUCH_BUTTONS 布局在画布上渲染「左 / 右 / 冲刺 / 跳跃」四个按钮，
 *     统一采用 pointer 事件，保证鼠标与触屏行为一致（天然构成触控兜底）。
 *  3. 维护共享输入状态：左右为电平触发（按住），跳跃 / 冲刺为边沿触发（排队），
 *     由 GameScene 在 update 中通过 moveAxis / consumeJump / consumeDash 轮询消费。
 *  4. 供 Playwright 验收自测通过真实 tap 驱动按钮，验证 pointer / touch 事件链路可用。
 */
export class TouchControls {
  private readonly scene: Phaser.Scene;
  private readonly _isActive: boolean;
  private readonly buttons = new Map<TouchButtonId, TouchButtonVisuals>();

  private _left = false;
  private _right = false;
  private _jumpQueued = false;
  private _dashQueued = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this._isActive = shouldShowTouchControls();
    if (this._isActive) {
      this.buildButtons();
    }
  }

  /** 触控兜底是否已激活（真实触屏或 ?touch=1） */
  get isActive(): boolean {
    return this._isActive;
  }

  /** 左移是否被按住 */
  get left(): boolean {
    return this._left;
  }

  /** 右移是否被按住 */
  get right(): boolean {
    return this._right;
  }

  /** 水平移动轴：-1 = 左，0 = 静止，1 = 右 */
  get moveAxis(): number {
    return (this._right ? 1 : 0) - (this._left ? 1 : 0);
  }

  /** 当前输入状态只读快照 */
  get snapshot(): TouchInputSnapshot {
    return {
      left: this._left,
      right: this._right,
      jumpQueued: this._jumpQueued,
      dashQueued: this._dashQueued,
    };
  }

  /** 消费一次跳跃（边沿触发）：返回 true 表示本次读取到跳跃请求 */
  consumeJump(): boolean {
    const queued = this._jumpQueued;
    this._jumpQueued = false;
    return queued;
  }

  /** 消费一次冲刺（边沿触发）：返回 true 表示本次读取到冲刺请求 */
  consumeDash(): boolean {
    const queued = this._dashQueued;
    this._dashQueued = false;
    return queued;
  }

  /** 清空瞬时输入状态并复位按钮视觉（场景重启 / 重生时调用） */
  reset(): void {
    this._left = false;
    this._right = false;
    this._jumpQueued = false;
    this._dashQueued = false;
    for (const { rect } of this.buttons.values()) {
      this.applyIdleVisual(rect);
    }
  }

  /** 销毁所有按钮并释放事件监听 */
  destroy(): void {
    for (const { rect, label } of this.buttons.values()) {
      rect.removeAllListeners();
      label.destroy();
      rect.destroy();
    }
    this.buttons.clear();
    this._left = false;
    this._right = false;
    this._jumpQueued = false;
    this._dashQueued = false;
  }

  // -------------------------------------------------------------------------
  // 内部实现
  // -------------------------------------------------------------------------

  private buildButtons(): void {
    (Object.keys(TOUCH_BUTTONS) as TouchButtonId[]).forEach((id) => {
      this.createButton(id);
    });
  }

  private createButton(id: TouchButtonId): void {
    const layout = TOUCH_BUTTONS[id];

    const rect = this.scene.add
      .rectangle(
        layout.x,
        layout.y,
        layout.width,
        layout.height,
        COLORS.uiBackground,
        BUTTON_IDLE_ALPHA,
      )
      .setStrokeStyle(BUTTON_BORDER_WIDTH, COLORS.uiBorder)
      .setScrollFactor(0)
      .setDepth(TOUCH_DEPTH);
    rect.setInteractive({ useHandCursor: true });

    const label = this.scene.add
      .text(layout.x, layout.y, layout.label, {
        fontFamily: 'monospace',
        fontStyle: 'bold',
        fontSize: `${layout.fontSize}px`,
        color: COLORS.textPrimary,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(TOUCH_DEPTH + 1);

    rect.on('pointerdown', () => this.onDown(id, rect));
    rect.on('pointerup', () => this.onUp(id, rect));
    rect.on('pointerout', () => this.onUp(id, rect));
    rect.on('pointerupoutside', () => this.onUp(id, rect));
    rect.on('pointercancel', () => this.onUp(id, rect));

    this.buttons.set(id, { rect, label });
  }

  private onDown(id: TouchButtonId, rect: Phaser.GameObjects.Rectangle): void {
    this.applyPressedVisual(rect);
    switch (id) {
      case 'left':
        this._left = true;
        break;
      case 'right':
        this._right = true;
        break;
      case 'jump':
        this._jumpQueued = true;
        break;
      case 'dash':
        this._dashQueued = true;
        break;
    }
  }

  private onUp(id: TouchButtonId, rect: Phaser.GameObjects.Rectangle): void {
    this.applyIdleVisual(rect);
    if (id === 'left') {
      this._left = false;
    } else if (id === 'right') {
      this._right = false;
    }
  }

  private applyPressedVisual(rect: Phaser.GameObjects.Rectangle): void {
    rect.setFillStyle(COLORS.player, BUTTON_PRESSED_ALPHA);
    rect.setStrokeStyle(BUTTON_BORDER_WIDTH, COLORS.player);
  }

  private applyIdleVisual(rect: Phaser.GameObjects.Rectangle): void {
    rect.setFillStyle(COLORS.uiBackground, BUTTON_IDLE_ALPHA);
    rect.setStrokeStyle(BUTTON_BORDER_WIDTH, COLORS.uiBorder);
  }
}