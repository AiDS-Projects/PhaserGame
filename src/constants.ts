// Central registry for scene keys, design resolution, and color tokens.
// Avoid scattering magic values across scenes/config.

export enum SceneKey {
  Boot = 'Boot',
  Game = 'Game',
}

// 16:9 landscape design resolution, per UX doc + visual spec.
export const DESIGN_WIDTH = 960;
export const DESIGN_HEIGHT = 540;

// Color tokens sourced from docs/Reqs/b63dfa/982770/design_tokens.json.
// Ground/platform tones extend the palette (docs/Reqs/b63dfa/6ea9b5/design_tokens.json).
export const COLORS = {
  bg: '#0F172A',
  bgAlt: '#1E293B',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  primary: '#4F46E5',
  accent: '#22D3EE',
  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  groundFill: '#1E293B',
  groundSurface: '#22D3EE',
  platformFill: '#4F46E5',
  platformSurface: '#22D3EE',
} as const;

// Physics tuning for player movement & gravity (Arcade Physics).
export const PHYSICS = {
  gravityY: 1200,
} as const;

// Player movement parameters, shared by Player.ts and the level scene.
export const PLAYER = {
  moveSpeed: 260,
  jumpVelocity: -480,
  maxVelocityX: 800,
  maxVelocityY: 1600,
} as const;