import Phaser from 'phaser';

import {
  GAME_WIDTH,
  GROUND_TOP,
  GROUND_HEIGHT,
  PLAYER_HEIGHT,
  COLORS,
} from '../constants';

/**
 * 关卡构建器 —— 可玩原型验收自测的关卡数据模型与构建逻辑。
 *
 * 职责：
 *  1. 以「数据驱动」的方式描述关卡（出生点 / 平台 / 危险物 / 终点），
 *     使关卡结构确定性、可序列化，供 Playwright 截图自测断言。
 *  2. 依据 LevelDefinition 在场景中构建物理静态体，并打上 role 标记
 *     （isPlatform / isHazard / isGoal），供 GameScene 做碰撞 / 伤害判定。
 *  3. 暴露 describe() 快照，返回可 JSON 化的关卡信息，作为验收断言的
 *     唯一事实来源（结构确定 → 截图稳定、断言稳定）。
 */

// ---------------------------------------------------------------------------
// 关卡数据模型
// ---------------------------------------------------------------------------

/** 出生点（玩家脚底所在位置） */
export interface SpawnPoint {
  x: number;
  y: number;
}

/** 平台定义（y 为平台顶边，宽高为碰撞体尺寸） */
export interface PlatformDef {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 危险物定义（如尖刺，y 为底边，即坐落于地面上） */
export interface HazardDef {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 终点定义（y 为顶边） */
export interface GoalDef {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 完整关卡定义 */
export interface LevelDefinition {
  id: string;
  name: string;
  spawn: SpawnPoint;
  platforms: PlatformDef[];
  hazards: HazardDef[];
  goal: GoalDef;
}

// ---------------------------------------------------------------------------
// 构建产物 / 快照
// ---------------------------------------------------------------------------

/** 可 JSON 化的关卡快照（Playwright 断言面） */
export interface LevelSnapshot {
  id: string;
  name: string;
  spawn: { x: number; y: number };
  platformCount: number;
  hazardCount: number;
  platforms: PlatformDef[];
  hazards: HazardDef[];
  goal: GoalDef;
  builtAt: number;
}

/** 关卡构建结果句柄 */
export interface BuiltLevel {
  readonly definition: LevelDefinition;
  /** 平台静态物理组（供 scene.physics.add.collider 使用） */
  readonly platformGroup: Phaser.Physics.Arcade.StaticGroup;
  /** 危险物静态物理组（供 overlap 伤害判定使用） */
  readonly hazardGroup: Phaser.Physics.Arcade.StaticGroup;
  /** 终点物体 */
  readonly goal: Phaser.GameObjects.Rectangle;
  /** 出生点（Phaser 向量） */
  readonly spawnPoint: Phaser.Math.Vector2;
  /** 生成可序列化快照 */
  describe(): LevelSnapshot;
}

// ---------------------------------------------------------------------------
// 默认验收关卡
// ---------------------------------------------------------------------------

/** 验收关卡配色（与 constants.COLORS 一致的 tailwind 色板） */
const LEVEL_COLORS = {
  platform: 0x475569,
  platformEdge: 0x94a3b8,
  hazard: 0xef4444,
  goal: 0x22c55e,
  goalEdge: 0x4ade80,
} as const;

/**
 * 默认验收关卡：完整覆盖「跑动 → 跳跃 → 二段跳 → 越障 → 到达终点」的
 * 核心手感路径，用于 Playwright 截图自测与手感确认。
 *
 * 路径示意（地面顶边 y = GROUND_TOP）：
 *   出生点 → 跳过 h1 → 平台 p1 → 二段跳到 p2 → 落到 p3 → 跳过 h2 → 终点
 */
export const LEVEL_ACCEPTANCE: LevelDefinition = {
  id: 'acceptance',
  name: 'Acceptance Prototype',
  spawn: { x: 90, y: GROUND_TOP - PLAYER_HEIGHT },
  platforms: [
    { id: 'p1', x: 300, y: 390, width: 110, height: 18 },
    { id: 'p2', x: 460, y: 310, width: 110, height: 18 },
    { id: 'p3', x: 620, y: 390, width: 110, height: 18 },
  ],
  hazards: [
    { id: 'h1', x: 370, y: GROUND_TOP, width: 26, height: 30 },
    { id: 'h2', x: 700, y: GROUND_TOP, width: 26, height: 30 },
  ],
  goal: { x: 880, y: GROUND_TOP - 60, width: 22, height: 60 },
};

// ---------------------------------------------------------------------------
// 构建器
// ---------------------------------------------------------------------------

export class LevelBuilder {
  /** 已注册关卡（id → 定义），供关卡选择 / 重开使用 */
  private static readonly registry = new Map<string, LevelDefinition>();

  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /** 注册关卡定义 */
  static register(def: LevelDefinition): void {
    LevelBuilder.registry.set(def.id, def);
  }

  /** 获取已注册的关卡定义 */
  static get(id: string): LevelDefinition | undefined {
    return LevelBuilder.registry.get(id);
  }

  /** 列出所有已注册关卡 */
  static list(): LevelDefinition[] {
    return Array.from(LevelBuilder.registry.values());
  }

  /** 在场景中构建关卡并返回句柄 */
  build(def: LevelDefinition): BuiltLevel {
    const { width: sceneW } = this.scene.scale;
    const levelW = GAME_WIDTH || sceneW;

    // 地面：全宽静态体，保证原型始终可站立（与 main.ts 的 ground 一致）
    const ground = this.scene.add.rectangle(
      levelW / 2,
      GROUND_TOP + GROUND_HEIGHT / 2,
      levelW,
      GROUND_HEIGHT,
      COLORS.ground,
    );
    this.scene.physics.add.existing(ground, true);

    // 地面顶边高亮线
    this.scene.add.rectangle(levelW / 2, GROUND_TOP + 2, levelW, 4, COLORS.groundEdge);

    // 平台静态组
    const platformGroup = this.scene.physics.add.staticGroup();
    for (const p of def.platforms) {
      const rect = this.scene.add.rectangle(
        p.x,
        p.y + p.height / 2,
        p.width,
        p.height,
        LEVEL_COLORS.platform,
      );
      rect.setStrokeStyle(2, LEVEL_COLORS.platformEdge);
      rect.setData('isPlatform', true);
      rect.setData('platformId', p.id);
      platformGroup.add(rect);
    }

    // 危险物静态组（尖刺，底边坐落于 y）
    const hazardGroup = this.scene.physics.add.staticGroup();
    for (const h of def.hazards) {
      const rect = this.scene.add.rectangle(
        h.x,
        h.y - h.height / 2,
        h.width,
        h.height,
        LEVEL_COLORS.hazard,
      );
      rect.setData('isHazard', true);
      rect.setData('hazardId', h.id);
      hazardGroup.add(rect);
    }

    // 终点
    const goal = this.scene.add.rectangle(
      def.goal.x,
      def.goal.y + def.goal.height / 2,
      def.goal.width,
      def.goal.height,
      LEVEL_COLORS.goal,
    );
    goal.setStrokeStyle(2, LEVEL_COLORS.goalEdge);
    goal.setData('isGoal', true);
    this.scene.physics.add.existing(goal, true);

    const spawnPoint = new Phaser.Math.Vector2(def.spawn.x, def.spawn.y);
    const builtAt = performance.now();

    const built: BuiltLevel = {
      definition: def,
      platformGroup,
      hazardGroup,
      goal,
      spawnPoint,
      describe: () => ({
        id: def.id,
        name: def.name,
        spawn: { x: def.spawn.x, y: def.spawn.y },
        platformCount: def.platforms.length,
        hazardCount: def.hazards.length,
        platforms: def.platforms.map((p) => ({ ...p })),
        hazards: def.hazards.map((h) => ({ ...h })),
        goal: { ...def.goal },
        builtAt,
      }),
    };

    this.exposeForAcceptance(built);
    return built;
  }

  /** 将最近构建的关卡快照暴露到 window，供 Playwright 断言 */
  private exposeForAcceptance(built: BuiltLevel): void {
    if (typeof window === 'undefined') return;

    window.__LEVEL__ = {
      describe: () => built.describe(),
      spawn: () => ({ x: built.spawnPoint.x, y: built.spawnPoint.y }),
      platformCount: () => built.definition.platforms.length,
      hazardCount: () => built.definition.hazards.length,
    };
  }
}

// ---------------------------------------------------------------------------
// 全局声明（验收自测钩子）
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __LEVEL__?: {
      describe: () => LevelSnapshot;
      spawn: () => { x: number; y: number };
      platformCount: () => number;
      hazardCount: () => number;
    };
  }
}

// 注册默认验收关卡
LevelBuilder.register(LEVEL_ACCEPTANCE);