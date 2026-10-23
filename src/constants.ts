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
} as const;
