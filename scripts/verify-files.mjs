#!/usr/bin/env node
/**
 * scripts/verify-files.mjs
 *
 * File-presence verifier for the Vite + Phaser 3 + TypeScript scaffold.
 *
 * Confirms every scaffold file declared in the architecture doc exists, is a
 * non-empty regular file, and (where applicable) parses as valid JSON. This is
 * the fast, static "did scaffolding complete" check that runs before the
 * deeper semantic gate (build/integrity-gate.mjs) and the full type-check /
 * build / serve pipeline (build/smoke-test.mjs).
 *
 * Usage: node scripts/verify-files.mjs
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Every file the scaffold must ship with, per the architecture doc's module
// layout (EntryPoint / Constants / GameConfig / GameScene) plus tooling config.
const REQUIRED_FILES = [
  'package.json',
  'index.html',
  'tsconfig.json',
  'vite.config.ts',
  '.gitignore',
  'src/main.ts',
  'src/constants.ts',
  'src/config/gameConfig.ts',
  'src/scenes/GameScene.ts',
];

// Files that must parse as valid JSON (beyond just existing and non-empty).
const JSON_FILES = ['package.json', 'tsconfig.json'];

const results = [];

function abs(relPath) {
  return path.join(ROOT, relPath);
}

function isNonEmptyFile(relPath) {
  const file = abs(relPath);
  if (!existsSync(file)) return { ok: false, detail: 'missing' };
  const stats = statSync(file);
  if (!stats.isFile()) return { ok: false, detail: 'not a regular file' };
  if (stats.size === 0) return { ok: false, detail: 'empty' };
  return { ok: true, detail: `${stats.size} bytes` };
}

function isValidJson(relPath) {
  const file = abs(relPath);
  if (!existsSync(file)) return false;
  try {
    JSON.parse(readFileSync(file, 'utf8'));
    return true;
  } catch {
    return false;
  }
}

function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`[verify] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function main() {
  for (const rel of REQUIRED_FILES) {
    const { ok, detail } = isNonEmptyFile(rel);
    check(rel, ok, detail);
  }

  for (const rel of JSON_FILES) {
    check(`${rel} is valid JSON`, isValidJson(rel));
  }

  if (existsSync(abs('index.html'))) {
    const html = readFileSync(abs('index.html'), 'utf8');
    check('index.html mounts #game-container', html.includes('id="game-container"'));
    check('index.html loads /src/main.ts', html.includes('src="/src/main.ts"'));
  }

  const failed = results.filter((ok) => !ok);
  if (failed.length > 0) {
    console.error(`\n[verify] ${failed.length} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log('\n[verify] PASS: all scaffold files present and valid');
    process.exitCode = 0;
  }
}

main();