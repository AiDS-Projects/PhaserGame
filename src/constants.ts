/**
 * 全局常量（单一事实来源）。
 *
 * 汇总 main.ts / state/PlayerState.ts / gameobjects/DashCooldownBar.ts 中的
 * 魔法数字，供游戏主体、状态管理与 UI 组件共用，避免多处硬编码漂移。
 * 时间类常量一律以毫秒（ms）为单位。
 */

// ---------------------------------------------------------------------------
// 画布 / 世界
// ---------------------------------------------------------------------------

/** 逻辑画布宽度（px） */
export const GAME_WIDTH = 960;

/** 逻辑画布高度（px） */
export const GAME_HEIGHT = 540;

/** 地面顶边 Y 坐标（px） */
export const GROUND_TOP = 480;

/** 地面厚度（px） */
export const GROUND_HEIGHT = 80;

/** 画布背景色（CSS 色值，与 index.html 保持一致） */
export const BACKGROUND_COLOR = '#0f172a';

// ---------------------------------------------------------------------------
// 物理
// ---------------------------------------------------------------------------

/** 重力加速度（px/s²） */
export const GRAVITY_Y = 1500;

/** 竖直方向最大速度（px/s） */
export const MAX_FALL_SPEED = 1400;

// ---------------------------------------------------------------------------
// 玩家
// ---------------------------------------------------------------------------

/** 玩家碰撞体宽度（px） */
export const PLAYER_WIDTH = 40;

/** 玩家碰撞体高度（px） */
export const PLAYER_HEIGHT = 52;

/** 水平移动速度（px/s） */
export const MOVE_SPEED = 360;

/** 起跳初速度（px/s，向上为负） */
export const JUMP_VELOCITY = -620;

/** 允许的最大跳跃次数（跳跃 + 二段跳） */
export const MAX_JUMPS = 2;

// ---------------------------------------------------------------------------
// 冲刺 / 无敌帧
// ---------------------------------------------------------------------------

/** 冲刺水平速度（px/s） */
export const DASH_SPEED = 1100;

/** 单次冲刺持续时间（ms） */
export const DASH_DURATION_MS = 150;

/** 冲刺冷却时间（ms） */
export const DASH_COOLDOWN_MS = 800;

/** 冲刺后无敌帧时长（ms） */
export const INVINCIBLE_MS = 250;

// ---------------------------------------------------------------------------
// 配色（0xRRGGBB / CSS）
// ---------------------------------------------------------------------------

export const COLORS = {
  background: BACKGROUND_COLOR,
  ground: 0x1e293b,
  groundEdge: 0x334155,
  player: 0x38bdf8,
  playerInvincible: 0xfde047,
  uiBackground: 0x1e293b,
  uiBorder: 0x94a3b8,
  uiReady: 0x22c55e,
  uiCooling: 0xf59e0b,
  textPrimary: '#e2e8f0',
  textMuted: '#94a3b8',
  textDim: '#64748b',
} as const;

// ---------------------------------------------------------------------------
// 触控兜底
// ---------------------------------------------------------------------------

/** 强制启用触控按钮的 URL 查询参数（如 ?touch=1） */
export const TOUCH_QUERY_PARAM = 'touch';

/**
 * 是否需要显示触控按钮：
 * 真实触屏设备（ontouchstart / maxTouchPoints）或显式 ?touch=1 时启用。
 */
export function shouldShowTouchControls(): boolean {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    new RegExp(`[?&]${TOUCH_QUERY_PARAM}=1`).test(window.location.search)
  );
}

/** 触控按钮布局描述（坐标均为屏幕绝对坐标，Y 自画布底部倒数） */
export interface TouchButtonLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  fontSize: number;
}

export type TouchButtonId = 'left' | 'right' | 'dash' | 'jump';

export const TOUCH_BUTTONS: Record<TouchButtonId, TouchButtonLayout> = {
  left: { x: 52, y: GAME_HEIGHT - 52, width: 72, height: 72, label: '\u25C4', fontSize: 26 },
  right: { x: 136, y: GAME_HEIGHT - 52, width: 72, height: 72, label: '\u25BA', fontSize: 26 },
  dash: { x: GAME_WIDTH - 148, y: GAME_HEIGHT - 52, width: 84, height: 84, label: 'DASH', fontSize: 15 },
  jump: { x: GAME_WIDTH - 52, y: GAME_HEIGHT - 52, width: 84, height: 84, label: 'JUMP', fontSize: 15 },
};

// ---------------------------------------------------------------------------
// 验收自测（Playwright 截图 / 手感确认）
// ---------------------------------------------------------------------------

export const ACCEPTANCE = {
  /** 桌面截图基准视口（与逻辑画布一致） */
  viewport: { width: GAME_WIDTH, height: GAME_HEIGHT },

  /** 移动端触控视口（用于触控兜底手感确认） */
  touchViewport: { width: 390, height: 844 },

  /** 截图输出目录 */
  screenshotDir: 'test/screenshots',

  /** 基线截图目录 */
  baselineDir: 'test/baselines',

  /** 像素差异容忍阈值（比例 0~1，超出即判定回归） */
  maxPixelDiff: 0.02,

  /** 页面加载超时（ms） */
  loadTimeoutMs: 5000,

  /** 截图前等待画面稳定时间（ms） */
  settleDelayMs: 500,
} as const;