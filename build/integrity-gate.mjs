#!/usr/bin/env node
/**
 * build/integrity-gate.mjs
 *
 * Static integrity gate for the Vite + Phaser 3 + TypeScript scaffold.
 *
 * Fast, build-free checks over source and config files only (no node_modules,
 * no bundler) that confirm the scaffold's structural and configuration
 * invariants are intact before the heavier type-check / build / serve
 * pipeline (see build/smoke-test.mjs) runs.
 *
 * Checks:
 *   1. package.json             — valid JSON; declares phaser / typescript /
 *                                 vite and the dev / build / preview /
 *                                 typecheck scripts.
 *   2. index.html               — mounts #game-container and loads
 *                                 /src/main.ts as an ES module.
 *   3. src/main.ts              — boots Phaser with the shared gameConfig.
 *   4. src/config/gameConfig.ts — exports gameConfig targeting #game-container.
 *   5. src/constants.ts         — exports the shared design tokens.
 *   6. src/scenes/GameScene.ts  — defines a Phaser.Scene referenced by the config.
 *   7. tsconfig.json            — strict, noEmit, bundler module resolution.
 *   8. vite.config.ts           — present.
 *   9. TypeScript rules         — no `any`, no hardcoded http(s) base URLs.
 *
 * Usage: node build/integrity-gate.mjs
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readText(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!existsSync(abs)) throw new Error(`required file missing: ${relPath}`);
  return readFileSync(abs, 'utf8');
}

function readJson(relPath) {
  const raw = readText(relPath);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${relPath} is not valid JSON`);
  }
}

function listSourceFiles(dir = 'src') {
  const abs = path.join(ROOT, dir);
  if (!existsSync(abs)) return [];
  const out = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(rel));
    else if (entry.isFile() && rel.endsWith('.ts')) out.push(rel.replaceAll('\\', '/'));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const results = [];

function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`[gate] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function section(name, fn) {
  try {
    fn();
  } catch (error) {
    check(name, false, error.message);
  }
}

function main() {
  // 1. package.json
  section('package.json', () => {
    const pkg = readJson('package.json');
    const isObject = typeof pkg === 'object' && pkg !== null && !Array.isArray(pkg);
    check('package.json is a JSON object', isObject);
    if (!isObject) return;
    const scripts = pkg.scripts ?? {};
    for (const script of ['dev', 'build', 'preview', 'typecheck']) {
      check(`package.json script "${script}"`, typeof scripts[script] === 'string');
    }
    check('package.json dependency "phaser"', typeof pkg.dependencies?.phaser === 'string');
    check('package.json devDependency "typescript"', typeof pkg.devDependencies?.typescript === 'string');
    check('package.json devDependency "vite"', typeof pkg.devDependencies?.vite === 'string');
  });

  // 2. index.html
  section('index.html', () => {
    const html = readText('index.html');
    check('index.html mounts #game-container', html.includes('id="game-container"'));
    check('index.html loads /src/main.ts', html.includes('src="/src/main.ts"'));
    check('index.html uses a module script', /<script[^>]*\btype="module"[^>]*>/.test(html));
  });

  // 3. src/main.ts
  section('src/main.ts', () => {
    const main = readText('src/main.ts');
    check('src/main.ts imports phaser', /from\s+['"]phaser['"]/.test(main));
    check('src/main.ts boots Phaser.Game', /new\s+Phaser\.Game\(/.test(main));
  });

  // 4. src/config/gameConfig.ts
  section('src/config/gameConfig.ts', () => {
    const cfg = readText('src/config/gameConfig.ts');
    check('src/config/gameConfig.ts exports gameConfig', /export\s+(const|function)\s+gameConfig/.test(cfg));
    check('src/config/gameConfig.ts targets #game-container', cfg.includes("parent: 'game-container'"));
  });

  // 5. src/constants.ts
  section('src/constants.ts', () => {
    const constants = readText('src/constants.ts');
    check('src/constants.ts exports design width', /export\s+const\s+DESIGN_WIDTH/.test(constants));
    check('src/constants.ts exports design height', /export\s+const\s+DESIGN_HEIGHT/.test(constants));
  });

  // 6. src/scenes/GameScene.ts
  section('src/scenes/GameScene.ts', () => {
    const scene = readText('src/scenes/GameScene.ts');
    check('src/scenes/GameScene.ts defines a Phaser.Scene', /Phaser\.Scene/.test(scene));
  });

  // 7. tsconfig.json
  section('tsconfig.json', () => {
    const tsconfig = readJson('tsconfig.json');
    const opts = tsconfig.compilerOptions ?? {};
    check('tsconfig.json is strict', opts.strict === true);
    check('tsconfig.json sets noEmit', opts.noEmit === true);
    check('tsconfig.json uses bundler resolution', opts.moduleResolution === 'bundler');
  });

  // 8. vite.config.ts
  section('vite.config.ts', () => {
    const vite = readText('vite.config.ts');
    check('vite.config.ts defines config', /defineConfig\(/.test(vite));
  });

  // 9. TypeScript rules over src/
  section('TypeScript rules (src/)', () => {
    const files = listSourceFiles();
    const anyOffenders = [];
    const urlOffenders = [];
    for (const file of files) {
      const text = readText(file);
      if (/(:\s*any\b|\bas\s+any\b|<any>|any\[\])/.test(text)) anyOffenders.push(file);
      if (/https?:\/\//.test(text)) urlOffenders.push(file);
    }
    check('no `any` in src/', anyOffenders.length === 0, anyOffenders.join(', '));
    check('no hardcoded http(s) URLs in src/', urlOffenders.length === 0, urlOffenders.join(', '));
  });

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.error(`\n[gate] ${failed.length} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log('\n[gate] PASS: scaffold integrity verified');
    process.exitCode = 0;
  }
}

main();
