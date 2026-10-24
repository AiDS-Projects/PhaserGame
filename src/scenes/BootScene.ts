import Phaser from 'phaser';

/**
 * BootScene —— 可玩原型验收自测入口
 *
 * 职责：
 *  1. 启动加载：渲染进度条并加载最小占位资源，保证原型无外部素材依赖即可运行。
 *  2. 触控兜底：自动识别触屏设备，统一 pointer 输入（鼠标/触屏行为一致），触屏显示操作提示。
 *  3. 验收自测：暴露 window.__ACCEPTANCE__ 钩子，供 Playwright 截图自测与手感确认读取运行时状态。
 */

export interface AcceptanceReport {
  /** 原型是否已完成启动并可交互 */
  ready: boolean;
  /** 当前场景 key */
  sceneKey: string;
  /** 输入模式 */
  inputMode: 'touch' | 'desktop';
  /** 是否为触屏设备 */
  isTouchDevice: boolean;
  /** 触控兜底是否已激活 */
  touchFallbackActive: boolean;
  /** 实时帧率（用于手感确认） */
  fps: number;
  /** Phaser 缩放模式名 */
  scaleMode: string;
  /** 画布逻辑尺寸 */
  width: number;
  height: number;
  /** 启动时间戳（performance.now()） */
  bootedAt: number;
}

declare global {
  interface Window {
    __ACCEPTANCE__?: {
      report: () => AcceptanceReport;
      isTouchFallbackActive: () => boolean;
    };
  }
}

export default class BootScene extends Phaser.Scene {
  public static readonly KEY = 'BootScene';

  private isTouchDevice = false;
  private touchFallbackActive = false;
  private ready = false;
  private bootedAt = 0;
  private fps = 0;

  constructor() {
    super(BootScene.KEY);
  }

  preload(): void {
    this.createLoadingBar();

    // 挂载后续场景所需素材（示例，无外部素材也能运行）：
    // this.load.image('player', 'assets/player.png');
    // this.load.spritesheet('hero', 'assets/hero.png', { frameWidth: 32, frameHeight: 32 });
  }

  create(): void {
    this.bootedAt = performance.now();
    this.isTouchDevice = this.game.device.input.touch;

    this.ensurePlaceholderTextures();
    this.setupTouchFallback();

    this.ready = true;
    this.exposeAcceptanceHooks();

    const next = this.scene.get('GameScene');
    if (next) {
      this.scene.start('GameScene');
    } else {
      console.warn('[BootScene] 未注册 GameScene，停留自测待机（window.__ACCEPTANCE__ 可用）');
    }
  }

  update(): void {
    this.fps = Math.round(this.game.loop.actualFps);
  }

  /** 渲染加载进度条 */
  private createLoadingBar(): void {
    const { width, height } = this.scale;
    const barWidth = Math.min(width * 0.6, 420);
    const barHeight = 12;
    const cx = width / 2;
    const cy = height / 2;

    this.add
      .rectangle(cx, cy, barWidth + 8, barHeight + 8, 0x1e293b)
      .setStrokeStyle(1, 0x334155);

    const fill = this.add
      .rectangle(cx - barWidth / 2, cy, 0, barHeight, 0x38bdf8)
      .setOrigin(0, 0.5);

    const label = this.add
      .text(cx, cy - 28, 'Loading...', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: '#94a3b8',
      })
      .setOrigin(0.5);

    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      fill.width = barWidth * value;
    });

    this.load.on(Phaser.Loader.Events.COMPLETE, () => {
      fill.width = barWidth;
      label.setText('Ready');
    });
  }

  /** 触控兜底：统一 pointer 输入，触屏设备显示操作提示 */
  private setupTouchFallback(): void {
    // pointer 事件在鼠标与触屏上行为一致，天然构成触控兜底
    this.input.on('pointerdown', () => {
      this.touchFallbackActive = true;
    });

    if (this.isTouchDevice) {
      this.touchFallbackActive = true;
      this.add
        .text(this.scale.width / 2, this.scale.height - 40, '触控模式：点按 / 拖拽操作', {
          fontFamily: 'system-ui, sans-serif',
          fontSize: '14px',
          color: '#38bdf8',
        })
        .setOrigin(0.5)
        .setAlpha(0.8);
    }
  }

  /** 生成占位纹理，避免外部素材缺失导致黑屏 */
  private ensurePlaceholderTextures(): void {
    if (this.textures.exists('pixel')) {
      return;
    }
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture('pixel', 2, 2);
    g.destroy();
  }

  /** 暴露验收自测钩子 */
  private exposeAcceptanceHooks(): void {
    window.__ACCEPTANCE__ = {
      report: () => this.report(),
      isTouchFallbackActive: () => this.touchFallbackActive,
    };
  }

  private report(): AcceptanceReport {
    return {
      ready: this.ready,
      sceneKey: this.scene.key,
      inputMode: this.isTouchDevice ? 'touch' : 'desktop',
      isTouchDevice: this.isTouchDevice,
      touchFallbackActive: this.touchFallbackActive,
      fps: this.fps,
      scaleMode: this.getScaleModeName(),
      width: this.scale.width,
      height: this.scale.height,
      bootedAt: this.bootedAt,
    };
  }

  private getScaleModeName(): string {
    const modes: Record<number, string> = {
      [Phaser.Scale.ScaleModes.NONE]: 'NONE',
      [Phaser.Scale.ScaleModes.WIDTH_CONTROLS_HEIGHT]: 'WIDTH_CONTROLS_HEIGHT',
      [Phaser.Scale.ScaleModes.HEIGHT_CONTROLS_WIDTH]: 'HEIGHT_CONTROLS_WIDTH',
      [Phaser.Scale.ScaleModes.FIT]: 'FIT',
      [Phaser.Scale.ScaleModes.ENVELOP]: 'ENVELOP',
      [Phaser.Scale.ScaleModes.RESIZE]: 'RESIZE',
    };
    return modes[this.scale.scaleMode] ?? String(this.scale.scaleMode);
  }
}