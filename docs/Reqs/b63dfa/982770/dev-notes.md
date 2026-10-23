# 开发笔记 — 初始化 Vite + Phaser 3 + TypeScript 脚手架

> 2026-10-23 14:58 | LLM

## 产出文件
- [package.json](/app#repo?file=package.json) (360 chars)
- [tsconfig.json](/app#repo?file=tsconfig.json) (519 chars)
- [vite.config.ts](/app#repo?file=vite.config.ts) (171 chars)
- [index.html](/app#repo?file=index.html) (852 chars)
- [.gitignore](/app#repo?file=.gitignore) (36 chars)
- [src/constants.ts](/app#repo?file=src/constants.ts) (616 chars)
- [src/config/gameConfig.ts](/app#repo?file=src/config/gameConfig.ts) (707 chars)
- [src/scenes/GameScene.ts](/app#repo?file=src/scenes/GameScene.ts) (704 chars)
- [src/main.ts](/app#repo?file=src/main.ts) (190 chars)

## 自测: 自测 6/6 通过 ✅

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 文件产出 | ✅ | 9 个文件 |
| 入口文件 | ✅ | 存在 |
| 代码非空 | ✅ | 通过 |
| 语法检查 | ✅ | 通过 |
| 文件名规范 | ✅ | 全英文 |
| 磁盘落地 | ✅ | 9 个文件已落盘 |

## 代码变更 (Diff)

### package.json (新建, 360 chars)
```
+ {
+   "name": "phaser-game",
+   "private": true,
+   "version": "0.1.0",
+   "type": "module",
+   "scripts": {
+     "dev": "vite",
+     "build": "tsc --noEmit && vite build",
+     "preview": "vite preview",
+     "typecheck": "tsc --noEmit"
+   },
+   "dependencies": {
+     "phaser": "^3.80.1"
+   },
+   "devDependencies": {
+     "typescript": "^5.5.4",
+     "vite": "^5.4.8"
+   }
+ }
+ 
```

### tsconfig.json (新建, 519 chars)
```
+ {
+   "compilerOptions": {
+     "target": "ES2020",
+     "useDefineForClassFields": true,
+     "module": "ESNext",
+     "lib": ["ES2020", "DOM", "DOM.Iterable"],
+     "moduleResolution": "bundler",
+     "resolveJsonModule": true,
+     "isolatedModules": true,
+     "esModuleInterop": true,
+     "strict": true,
+     "noUnusedLocals": true,
+     "noUnusedParameters": true,
+     "noFallthroughCasesInSwitch": true,
+     "skipLibCheck": true,
+     "forceConsistentCasingInFileNames": true,
+     "noEmit": true
+   },
+   "include": ["src"]
+ }
+ ... (更多)
```

### vite.config.ts (新建, 171 chars)
```
+ import { defineConfig } from 'vite';
+ 
+ export default defineConfig({
+   base: './',
+   server: {
+     host: true,
+     port: 5173,
+   },
+   build: {
+     outDir: 'dist',
+   },
+ });
+ 
```

### index.html (新建, 852 chars)
```
+ <!DOCTYPE html>
+ <html lang="en">
+   <head>
+     <meta charset="UTF-8" />
+     <meta
+       name="viewport"
+       content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"
+     />
+     <title>Phaser Game</title>
+     <style>
+       * {
+         box-sizing: border-box;
+         margin: 0;
+         padding: 0;
+       }
+       html,
+       body {
+         width: 100%;
+         height: 100%;
+         overflow: hidden;
+ ... (更多)
```

### .gitignore (新建, 36 chars)
```
+ node_modules
+ dist
+ *.local
+ .DS_Store
+ 
```

### src/constants.ts (新建, 616 chars)
```
+ // Central registry for scene keys, design resolution, and color tokens.
+ // Avoid scattering magic values across scenes/config.
+ 
+ export enum SceneKey {
+   Boot = 'Boot',
+   Game = 'Game',
+ }
+ 
+ // 16:9 landscape design resolution, per UX doc + visual spec.
+ export const DESIGN_WIDTH = 960;
+ export const DESIGN_HEIGHT = 540;
+ 
+ // Color tokens sourced from docs/Reqs/b63dfa/982770/design_tokens.json.
+ export const COLORS = {
+   bg: '#0F172A',
+   bgAlt: '#1E293B',
+   text: '#F8FAFC',
+   textMuted: '#94A3B8',
+   primary: '#4F46E5',
+   accent: '#22D3EE',
+ ... (更多)
```

### src/config/gameConfig.ts (新建, 707 chars)
```
+ import Phaser from 'phaser';
+ import { COLORS, DESIGN_WIDTH, DESIGN_HEIGHT } from '../constants';
+ import { GameScene } from '../scenes/GameScene';
+ 
+ // Single source of truth for the Phaser.Game bootstrap config.
+ export const gameConfig: Phaser.Types.Core.GameConfig = {
+   type: Phaser.AUTO,
+   parent: 'game-container',
+   width: DESIGN_WIDTH,
+   height: DESIGN_HEIGHT,
+   backgroundColor: COLORS.bg,
+   scale: {
+     mode: Phaser.Scale.FIT,
+     autoCenter: Phaser.Scale.CENTER_BOTH,
+   },
+   physics: {
+     default: 'arcade',
+     arcade: {
+       // No gravity yet: this ticket spawns no character; the jump ticket will set it.
+       gravity: { x: 0, y: 0 },
+ ... (更多)
```

### src/scenes/GameScene.ts (新建, 704 chars)
```
+ import Phaser from 'phaser';
+ import { COLORS, SceneKey } from '../constants';
+ 
+ // Empty shell scene: solid background + lifecycle hooks, ready for the
+ // movement / double-jump / dash tickets to build on.
+ export class GameScene extends Phaser.Scene {
+   constructor() {
+     super({ key: SceneKey.Game });
+   }
+ 
+   create(): void {
+     // scene.start() reuses the instance, so clear listeners to avoid leaks.
+     this.input.removeAllListeners();
+ 
+     // Solid-color background (no texture), per the visual spec.
+     this.cameras.main.setBackgroundColor(COLORS.bg);
+ 
+     // TODO(platformer): future tickets extend here.
+     // - player sprite: double jump + dash
+     // - HUD: score / lives / key hints
+ ... (更多)
```

### src/main.ts (新建, 190 chars)
```
+ import Phaser from 'phaser';
+ import { gameConfig } from './config/gameConfig';
+ 
+ // Single entry point: build the game immediately (no DOMContentLoaded wrapper).
+ new Phaser.Game(gameConfig);
+ 
```
