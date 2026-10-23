#!/usr/bin/env node
/**
 * scaffold.mjs — Vite + Phaser 3 + TypeScript 脚手架
 *
 * 用法：
 *   node scripts/scaffold.mjs [目标目录]
 *
 * 默认在项目根目录（process.cwd()）生成工程基础文件：
 *   index.html / package.json / tsconfig.json / vite.config.ts
 *   src/main.ts / src/scenes/BootScene.ts / .gitignore
 *
 * 生成后运行：
 *   npm install
 *   npm run dev
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

/** 目标根目录（默认当前目录，可通过命令行参数覆盖） */
const root = path.resolve(process.cwd(), process.argv[2] ?? '.');

/** 所有需要写入的文件：相对 root 的路径 -> 文件内容 */
const files = new Map([
  [
    'index.html',
    `<!DOCTYPE html>
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
  ],
  [
    'package.json',
    `{
  "name": "phaser-game",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "phaser": "^3.87.0"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vite": "^6.0.5"
  }
}
`,
  ],
  [
    'tsconfig.json',
    `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
`,
  ],
  [
    'vite.config.ts',
    `import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 1600,
  },
});
`,
  ],
  [
    'src/main.ts',
    `import Phaser from 'phaser';

import { BootScene } from './scenes/BootScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  backgroundColor: '#0f172a',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene],
};

new Phaser.Game(config);
`,
  ],
  [
    'src/scenes/BootScene.ts',
    `import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Phaser Game', {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '48px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
  }
}
`,
  ],
  [
    '.gitignore',
    `node_modules
dist
.DS_Store
*.local
`,
  ],
]);

/** 判断文件/目录是否存在 */
async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** 写入单个文件（已存在则跳过，避免覆盖用户修改） */
async function write(rel, content) {
  const abs = path.join(root, rel);
  if (await exists(abs)) {
    console.log(`  skip（已存在）  ${rel}`);
    return;
  }
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf8');
  console.log(`  create         ${rel}`);
}

async function main() {
  console.log(`Scaffolding 到 ${root}\n`);
  for (const [rel, content] of files) {
    await write(rel, content);
  }
  console.log('\n完成。下一步：');
  console.log('  npm install');
  console.log('  npm run dev');
}

main().catch((err) => {
  console.error('脚手架失败：', err);
  process.exit(1);
});