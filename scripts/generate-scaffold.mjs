#!/usr/bin/env node
/**
 * scripts/generate-scaffold.mjs
 *
 * Idempotent scaffold generator for the Vite + Phaser 3 + TypeScript project.
 * Writes every scaffold file in the architecture doc's module layout
 * (EntryPoint / Constants / GameConfig / GameScene) plus tooling config.
 *
 * Deterministic: re-running it reproduces identical files, so it doubles as a
 * "reset to known-good" step. Pair with scripts/verify-files.mjs (static
 * presence check) and the build/ pipeline (type-check / build / serve) for the
 * full confidence ladder.
 *
 * Usage: node scripts/generate-scaffold.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Single source of truth: relPath -> complete final file contents (trailing
// newline included). Keeping the whole scaffold in one map makes it
// reproducible and reviewable in a single place.
const FILES = {
  'package.json': `{
  "name": "phaser-game",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "phaser": "^3.80.1"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vite": "^5.4.8"
  }
}
`,

  'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noEmit": true
  },
  "include": ["src"]
}
`,

  'vite.config.ts': `import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: 'dist',
  },
});
`,

  'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
    />
    <title>Phaser Game</title>
    <style>
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      html,
      body {
        width: 100%;
        height: 100%;
        overflow: hidden;
        background: #0f172a;
      }
      #game-container {
        position: relative;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        background: #0f172a;
      }
      #game-container canvas {
        display: block;
        margin: 0 auto;
      }
    </style>
  </head>
  <body>
    <div id="game-container"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
`,

  '.gitignore': `node_modules
dist
*.local
.DS_Store
`,

  'src/main.ts': `import Phaser from 'phaser';
import { gameConfig } from './config/gameConfig';

// Single entry point: build the game immediately (no DOMContentLoaded wrapper).
new Phaser.Game(gameConfig);
`,

  'src/constants.ts': `// Central registry for scene keys, design resolution, and color tokens.
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
`,

  'src/config/gameConfig.ts': `import Phaser from 'phaser';
import { COLORS, DESIGN_WIDTH, DESIGN_HEIGHT } from '../constants';
import { GameScene } from '../scenes/GameScene';

// Single source of truth for the Phaser.Game bootstrap config.
export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  backgroundColor: COLORS.bg,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      // No gravity yet: this ticket spawns no character; the jump ticket will set it.
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [GameScene],
};
`,

  'src/scenes/GameScene.ts': `import Phaser from 'phaser';
import { COLORS, SceneKey } from '../constants';

// Empty shell scene: solid background + lifecycle hooks, ready for the
// movement / double-jump / dash tickets to build on.
export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: SceneKey.Game });
  }

  create(): void {
    // scene.start() reuses the instance, so clear listeners to avoid leaks.
    this.input.removeAllListeners();

    // Solid-color background (no texture), per the visual spec.
    this.cameras.main.setBackgroundColor(COLORS.bg);

    // TODO(platformer): future tickets extend here.
    // - player sprite: double jump + dash
    // - HUD: score / lives / key hints
  }
}
`,
};

function abs(relPath) {
  return path.join(ROOT, relPath);
}

function main() {
  let written = 0;
  for (const [relPath, content] of Object.entries(FILES)) {
    const file = abs(relPath);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, 'utf8');
    console.log(`[scaffold] wrote ${relPath}`);
    written += 1;
  }
  console.log(`\n[scaffold] done: ${written} files generated under ${ROOT}`);
}

main();