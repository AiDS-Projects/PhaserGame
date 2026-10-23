// Pure, typed, data-driven level definition for the "ground & platforms" ticket.
// Deliberately free of any Phaser import: the layout is plain data so it can be
// tuned and unit-tested independently of rendering. LevelBuilder consumes this
// data and turns each rect into an Arcade static physics body.

// ---------------------------------------------------------------------------
// World geometry tokens — single source of truth for level sizing.
// Values mirror the "level" section of the design tokens (docs/Reqs/.../design_tokens.json).
// ---------------------------------------------------------------------------

/** Total world width. Wider than the 960px viewport to allow horizontal scroll. */
export const WORLD_WIDTH = 1920;

/** Total world height (matches the 540px design height). */
export const WORLD_HEIGHT = 540;

/** Y of the ground's top surface. */
export const GROUND_TOP_Y = 480;

/** Ground slab thickness. */
export const GROUND_HEIGHT = 60;

/** Uniform thickness of every floating platform. */
export const PLATFORM_HEIGHT = 24;

// ---------------------------------------------------------------------------
// Geometry types
// ---------------------------------------------------------------------------

/**
 * Axis-aligned rectangle. `x`/`y` are the TOP-LEFT corner in world
 * coordinates (matching Phaser.Geom.Rectangle), not the center. A physics
 * body for this rect uses center `(x + width / 2, y + height / 2)`.
 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A static platform the player can stand on. */
export interface Platform extends Rect {
  id: string;
}

/** The single static ground slab spanning the full world width. */
export interface Ground extends Rect {
  id: string;
}

/** World boundary box; also the camera clamp region. */
export interface WorldBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Complete static level layout: ground + floating platforms + world bounds. */
export interface LevelLayout {
  worldBounds: WorldBounds;
  ground: Ground;
  platforms: Platform[];
}

// ---------------------------------------------------------------------------
// Layout data
// ---------------------------------------------------------------------------

export const worldBounds: WorldBounds = {
  x: 0,
  y: 0,
  width: WORLD_WIDTH,
  height: WORLD_HEIGHT,
};

export const ground: Ground = {
  id: 'ground',
  x: 0,
  y: GROUND_TOP_Y,
  width: WORLD_WIDTH,
  height: GROUND_HEIGHT,
};

/**
 * Four platforms with staggered x/y so jumps form a vertical ladder.
 * Count and spacing satisfy the acceptance criteria (>= 3 platforms,
 * horizontal/vertical gap >= 60px between any pair). Sizes follow the
 * visual spec: 160–180px wide, 24px tall.
 */
export const platforms: Platform[] = [
  { id: 'platform-1', x: 280, y: 380, width: 180, height: PLATFORM_HEIGHT },
  { id: 'platform-2', x: 640, y: 300, width: 160, height: PLATFORM_HEIGHT },
  { id: 'platform-3', x: 980, y: 360, width: 180, height: PLATFORM_HEIGHT },
  { id: 'platform-4', x: 1350, y: 240, width: 160, height: PLATFORM_HEIGHT },
];

/** The complete level layout, consumed by LevelBuilder. */
export const levelLayout: LevelLayout = {
  worldBounds,
  ground,
  platforms,
};