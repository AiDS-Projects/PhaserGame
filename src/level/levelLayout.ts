/**
 * 关卡布局（可玩原型验收自测）。
 *
 * 以纯数据方式描述原型关卡的静态布局 —— 出生点、地面、浮空平台、危险区与终点，
 * 供 GameScene 直接消费渲染，并作为 Playwright 截图自测与手感确认的验收基准。
 *
 * 设计约定：
 *  - 所有坐标均为「逻辑画布坐标」（元素中心点），单位 px，与 constants.ts 单一事实来源对齐；
 *  - 布局为只读数据（readonly + Object.freeze），渲染层只读取、不修改；
 *  - 提供 validateLevelLayout / getLevelSummary，供验收脚本断言布局自洽与可玩性。
 */

import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GROUND_TOP,
  GROUND_HEIGHT,
  COLORS,
} from '../constants';

// ---------------------------------------------------------------------------
// 关卡专属配色（constants.ts 未覆盖的元素）
// ---------------------------------------------------------------------------

const LEVEL_COLORS = {
  platform: 0x334155,
  platformEdge: 0x475569,
  hazard: 0xef4444,
  goal: 0x22c55e,
} as const;

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

/** 关卡元素类型 */
export type LevelElementType =
  | 'ground'
  | 'platform'
  | 'hazard'
  | 'spawn'
  | 'goal';

/** 轴对齐矩形区域（坐标为中心点，单位 px，逻辑画布坐标） */
export interface LevelRect {
  /** 中心 X */
  x: number;
  /** 中心 Y */
  y: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
}

/** 可站立的地面 / 浮空平台 */
export interface LevelSolid extends LevelRect {
  readonly id: string;
  readonly type: 'ground' | 'platform';
  /** 单向平台：可从下方穿过，仅顶部可站立（原型默认 false） */
  readonly oneWay?: boolean;
  /** 填充色（0xRRGGBB），缺省使用 LEVEL_COLORS.platform */
  readonly color?: number;
}

/** 危险区（用于自测冲刺无敌帧是否生效） */
export interface LevelHazard extends LevelRect {
  readonly id: string;
  readonly type: 'hazard';
  /** 接触伤害（原型仅用于验收标记，默认 0 不致死） */
  readonly damage?: number;
}

/** 出生点（点坐标，无宽高） */
export interface LevelSpawn {
  readonly id: string;
  readonly type: 'spawn';
  /** 出生中心 X */
  readonly x: number;
  /** 出生中心 Y（应保证脚底贴合地面顶边） */
  readonly y: number;
  /** 初始朝向：1 = 右，-1 = 左 */
  readonly facing: 1 | -1;
}

/** 终点 / 检查点 */
export interface LevelGoal extends LevelRect {
  readonly id: string;
  readonly type: 'goal';
}

/** 关卡元素联合类型 */
export type LevelElement = LevelSolid | LevelHazard | LevelSpawn | LevelGoal;

/** 完整关卡布局 */
export interface LevelLayout {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** 可玩世界边界（中心点坐标） */
  readonly bounds: LevelRect;
  /** 出生点 */
  readonly spawn: LevelSpawn;
  /** 地面与浮空平台 */
  readonly solids: readonly LevelSolid[];
  /** 危险区 */
  readonly hazards: readonly LevelHazard[];
  /** 终点 / 检查点（可空） */
  readonly goal: LevelGoal | null;
}

// ---------------------------------------------------------------------------
// 原型关卡数据（验收基准布局）
//
// 布局意图（覆盖自测验收点）：
//  - 出生点 → 地面：校验落地与移动；
//  - platform-1（y=400）：单段跳可及，校验基础跳跃；
//  - platform-2（y=320）：需二段跳，校验 double jump；
//  - platform-3（y=400）：跨过危险区后的落点，校验空中位移；
//  - hazard-1：地面危险区，校验冲刺无敌帧（dash 穿过不受伤）；
//  - goal：终点点位，校验完整通关路径。
// ---------------------------------------------------------------------------

export const LEVEL_LAYOUT: LevelLayout = Object.freeze<LevelLayout>({
  name: 'prototype-acceptance',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  bounds: {
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT / 2,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  spawn: {
    id: 'spawn',
    type: 'spawn',
    x: 160,
    y: GROUND_TOP - 26,
    facing: 1,
  },
  solids: Object.freeze([
    {
      id: 'ground',
      type: 'ground',
      x: GAME_WIDTH / 2,
      y: GROUND_TOP + GROUND_HEIGHT / 2,
      width: GAME_WIDTH,
      height: GROUND_HEIGHT,
      color: COLORS.ground,
    },
    {
      id: 'platform-1',
      type: 'platform',
      x: 320,
      y: 400,
      width: 110,
      height: 20,
      color: LEVEL_COLORS.platform,
    },
    {
      id: 'platform-2',
      type: 'platform',
      x: 500,
      y: 320,
      width: 110,
      height: 20,
      color: LEVEL_COLORS.platform,
    },
    {
      id: 'platform-3',
      type: 'platform',
      x: 680,
      y: 400,
      width: 130,
      height: 20,
      color: LEVEL_COLORS.platform,
    },
  ]),
  hazards: Object.freeze([
    {
      id: 'hazard-1',
      type: 'hazard',
      x: 820,
      y: GROUND_TOP - 6,
      width: 90,
      height: 12,
      damage: 1,
    },
  ]),
  goal: {
    id: 'goal',
    type: 'goal',
    x: 900,
    y: 360,
    width: 40,
    height: 40,
  },
});

// ---------------------------------------------------------------------------
// 查询辅助
// ---------------------------------------------------------------------------

/** 获取出生点 */
export function getSpawn(layout: LevelLayout = LEVEL_LAYOUT): LevelSpawn {
  return layout.spawn;
}

/** 获取终点 / 检查点（可空） */
export function getGoal(layout: LevelLayout = LEVEL_LAYOUT): LevelGoal | null {
  return layout.goal;
}

/** 获取所有地面与平台 */
export function getSolids(
  layout: LevelLayout = LEVEL_LAYOUT,
): readonly LevelSolid[] {
  return layout.solids;
}

/** 获取所有危险区 */
export function getHazards(
  layout: LevelLayout = LEVEL_LAYOUT,
): readonly LevelHazard[] {
  return layout.hazards;
}

/** 获取主地面（约定 solids 中首个 type === 'ground' 的元素） */
export function getGround(layout: LevelLayout = LEVEL_LAYOUT): LevelSolid {
  const ground = layout.solids.find((s) => s.type === 'ground');
  if (!ground) {
    throw new Error('[levelLayout] 关卡缺少 ground 元素');
  }
  return ground;
}

/** 按 id 查找元素 */
export function getElementById(
  id: string,
  layout: LevelLayout = LEVEL_LAYOUT,
): LevelElement | undefined {
  return collectElements(layout).find((el) => el.id === id);
}

/** 按类型过滤元素 */
export function getElementsByType(
  type: LevelElementType,
  layout: LevelLayout = LEVEL_LAYOUT,
): LevelElement[] {
  return collectElements(layout).filter((el) => el.type === type);
}

/** 汇总布局中的所有元素 */
function collectElements(layout: LevelLayout): LevelElement[] {
  return [
    layout.spawn,
    ...layout.solids,
    ...layout.hazards,
    ...(layout.goal ? [layout.goal] : []),
  ];
}

// ---------------------------------------------------------------------------
// 验收自测：布局自洽校验
// ---------------------------------------------------------------------------

/** 判断 inner 矩形是否完整落在 outer 矩形内（中心点坐标） */
export function containsRect(outer: LevelRect, inner: LevelRect): boolean {
  const outerLeft = outer.x - outer.width / 2;
  const outerRight = outer.x + outer.width / 2;
  const outerTop = outer.y - outer.height / 2;
  const outerBottom = outer.y + outer.height / 2;
  const innerLeft = inner.x - inner.width / 2;
  const innerRight = inner.x + inner.width / 2;
  const innerTop = inner.y - inner.height / 2;
  const innerBottom = inner.y + inner.height / 2;
  return (
    innerLeft >= outerLeft &&
    innerRight <= outerRight &&
    innerTop >= outerTop &&
    innerBottom <= outerBottom
  );
}

/**
 * 校验关卡布局是否自洽（供 Playwright 截图自测 / 手感确认前断言）。
 * 返回问题列表，空数组表示通过验收基线。
 */
export function validateLevelLayout(
  layout: LevelLayout = LEVEL_LAYOUT,
): string[] {
  const issues: string[] = [];
  const { bounds, spawn, solids, hazards, goal } = layout;

  if (bounds.width <= 0 || bounds.height <= 0) {
    issues.push('bounds 尺寸必须为正');
  }

  // 出生点落在可玩边界内，且不沉入地面
  const spawnLeft = bounds.x - bounds.width / 2;
  const spawnRight = bounds.x + bounds.width / 2;
  const spawnTop = bounds.y - bounds.height / 2;
  const spawnBottom = bounds.y + bounds.height / 2;
  if (
    spawn.x < spawnLeft ||
    spawn.x > spawnRight ||
    spawn.y < spawnTop ||
    spawn.y > spawnBottom
  ) {
    issues.push(`出生点 ${spawn.id} 越界`);
  }
  if (spawn.y > GROUND_TOP) {
    issues.push(
      `出生点 ${spawn.id} 沉入地面（y=${spawn.y} > GROUND_TOP=${GROUND_TOP}）`,
    );
  }

  // 地面与平台完整落在边界内
  for (const solid of solids) {
    if (solid.width <= 0 || solid.height <= 0) {
      issues.push(`平台 ${solid.id} 尺寸必须为正`);
    }
    if (!containsRect(bounds, solid)) {
      issues.push(`平台 ${solid.id} 越界`);
    }
  }

  // 危险区完整落在边界内
  for (const hazard of hazards) {
    if (hazard.width <= 0 || hazard.height <= 0) {
      issues.push(`危险区 ${hazard.id} 尺寸必须为正`);
    }
    if (!containsRect(bounds, hazard)) {
      issues.push(`危险区 ${hazard.id} 越界`);
    }
  }

  // 终点完整落在边界内
  if (goal && !containsRect(bounds, goal)) {
    issues.push(`终点 ${goal.id} 越界`);
  }

  // 必须存在主地面
  if (!solids.some((s) => s.type === 'ground')) {
    issues.push('关卡缺少 ground 元素');
  }

  return issues;
}

// ---------------------------------------------------------------------------
// 验收自测：关卡摘要
// ---------------------------------------------------------------------------

/** 关卡验收摘要（供 window.__ACCEPTANCE__ 类钩子对外暴露） */
export interface LevelSummary {
  name: string;
  width: number;
  height: number;
  spawn: { x: number; y: number; facing: 1 | -1 };
  groundTop: number;
  solidCount: number;
  hazardCount: number;
  goalCount: number;
  /** 布局自洽校验问题，空数组表示通过 */
  issues: string[];
}

/** 生成关卡验收摘要 */
export function getLevelSummary(
  layout: LevelLayout = LEVEL_LAYOUT,
): LevelSummary {
  return {
    name: layout.name,
    width: layout.width,
    height: layout.height,
    spawn: { x: layout.spawn.x, y: layout.spawn.y, facing: layout.spawn.facing },
    groundTop: GROUND_TOP,
    solidCount: layout.solids.length,
    hazardCount: layout.hazards.length,
    goalCount: layout.goal ? 1 : 0,
    issues: validateLevelLayout(layout),
  };
}