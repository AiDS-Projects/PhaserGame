#!/usr/bin/env node
/**
 * scripts/acceptance-probe.mjs
 *
 * Acceptance probe for the "ground & platforms" level ticket
 * (docs/Reqs/b63dfa/6ea9b5/PRD.md). Deterministic, build-free checks that
 * validate the level implementation against the PRD acceptance criteria and
 * the shared design tokens (docs/Reqs/b63dfa/6ea9b5/design_tokens.json):
 *
 *   1. Ground     — a static Arcade body spanning the full world width (1920px).
 *   2. Platforms  — >= 3 static bodies, 160–180px wide / 24px tall, with every
 *                   pair separated by >= 60px horizontally or vertically.
 *   3. Boundaries — physics world + camera clamped to the 1920x540 world.
 *   4. Background — GameScene fills #0F172A via the shared COLORS.bg token.
 *   5. Type safety — the level layout stays Phaser-free data, no `any` in
 *                    src/, and (unless --skip-typecheck) `tsc --noEmit` passes.
 *
 * Sits between scripts/verify-files.mjs (file presence) and
 * scripts/capture-acceptance.mjs (visual evidence): this script is the
 * acceptance-criteria gate for the level ticket, complementing the structural
 * checks in build/integrity-gate.mjs and the build/serve pipeline in
 * build/smoke-test.mjs.
 *
 * Usage:
 *   node scripts/acceptance-probe.mjs
 *   node scripts/acceptance-probe.mjs --skip-typecheck
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Paths & constants
// ---------------------------------------------------------------------------
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;
const TSC = path.join(ROOT, 'node_modules', 'typescript', 'lib', 'tsc.js');

// Design tokens for this ticket: single source of truth for expected level
// metrics and colors ("level" + "colors" sections of design_tokens.json).
const TOKENS_REL = path.join('docs', 'Reqs', 'b63dfa', '6ea9b5', 'design_tokens.json');

// Platform width bounds from docs/Reqs/b63dfa/6ea9b5/视觉规范.md ("宽 160–180px");
// not present in the tokens file, so kept as named probe constants.
const PLATFORM_MIN_WIDTH = 160;
const PLATFORM_MAX_WIDTH = 180;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function readText(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!existsSync(abs)) throw new Error(`required file missing: ${relPath}`);
  return readFileSync(abs, 'utf8');
}

function readJson(relPath) {
  try {
    return JSON.parse(readText(relPath));
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

function parseArgs(argv) {
  const opts = { skipTypecheck: false, help: false };
  for (const arg of argv) {
    if (arg === '--skip-typecheck') opts.skipTypecheck = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
  }
  return opts;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code));
  });
}

// ---------------------------------------------------------------------------
// Level-layout source extraction
// ---------------------------------------------------------------------------

/** Map of `export const NAME = <number>` numeric tokens in a source file. */
function extractConstants(source) {
  const constants = new Map();
  const re = /export\s+const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-?[0-9]+(?:\.[0-9]+)?)/g;
  let match;
  while ((match = re.exec(source))) constants.set(match[1], Number(match[2]));
  return constants;
}

/** Resolve a field token to a number (literal or a named constant). */
function resolve(value, constants) {
  const trimmed = value.trim();
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if (constants.has(trimmed)) return constants.get(trimmed);
  return null;
}

/** Extract the single ground rect `{ id: 'ground', x, y, width, height }`. */
function extractGround(source, constants) {
  const re =
    /\{\s*id:\s*'ground',\s*x:\s*([^,\s}]+),\s*y:\s*([^,\s}]+),\s*width:\s*([^,\s}]+),\s*height:\s*([^,\s}]+)\s*,?\s*\}/;
  const match = source.match(re);
  if (!match) return null;
  return {
    id: 'ground',
    x: resolve(match[1], constants),
    y: resolve(match[2], constants),
    width: resolve(match[3], constants),
    height: resolve(match[4], constants),
  };
}

/** Extract every platform rect `{ id: 'platform-*', x, y, width, height }`. */
function extractPlatforms(source, constants) {
  const out = [];
  const re =
    /\{\s*id:\s*'platform-([^']*)',\s*x:\s*([^,\s}]+),\s*y:\s*([^,\s}]+),\s*width:\s*([^,\s}]+),\s*height:\s*([^,\s}]+)\s*,?\s*\}/g;
  let match;
  while ((match = re.exec(source))) {
    out.push({
      id: `platform-${match[1]}`,
      x: resolve(match[2], constants),
      y: resolve(match[3], constants),
      width: resolve(match[4], constants),
      height: resolve(match[5], constants),
    });
  }
  return out;
}

/** Horizontal gap between two axis-aligned rects (0 when overlapping). */
function horizontalGap(a, b) {
  return Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), 0);
}

/** Vertical gap between two axis-aligned rects (0 when overlapping). */
function verticalGap(a, b) {
  return Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height), 0);
}

// ---------------------------------------------------------------------------
// Report & checks
// ---------------------------------------------------------------------------
const results = [];

function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`[probe] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function tryRead(relPath) {
  try {
    return readText(relPath);
  } catch (error) {
    check(`read ${relPath}`, false, error.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      [
        'Usage: node scripts/acceptance-probe.mjs [options]',
        '',
        'Options:',
        '  --skip-typecheck   skip the `tsc --noEmit` type-check step',
        '  -h, --help         show this help',
      ].join('\n'),
    );
    return;
  }

  console.log('[probe] validating "ground & platforms" level against acceptance criteria');

  // --- 0. Design tokens -----------------------------------------------------
  let tokens = null;
  try {
    tokens = readJson(TOKENS_REL);
  } catch (error) {
    check(`read ${TOKENS_REL}`, false, error.message);
  }

  const level = tokens?.level ?? {};
  const colors = tokens?.colors ?? {};
  const levelKeys = [
    'world_width',
    'world_height',
    'ground_top_y',
    'ground_height',
    'platform_height',
    'platform_min_gap',
    'min_platforms',
  ];
  const missingKeys = levelKeys.filter((key) => typeof level[key] !== 'number');
  check('design tokens define all level metrics', missingKeys.length === 0, missingKeys.join(', '));
  check('design tokens define background color', typeof colors.bg === 'string', colors.bg ?? 'missing');

  const worldWidth = level.world_width;
  const worldHeight = level.world_height;
  const groundTopY = level.ground_top_y;
  const groundHeight = level.ground_height;
  const platformHeight = level.platform_height;
  const minGap = level.platform_min_gap;
  const minPlatforms = level.min_platforms;
  const bg = colors.bg;

  // --- 1. Sources -----------------------------------------------------------
  const layoutSrc = tryRead('src/level/levelLayout.ts');
  const builderSrc = tryRead('src/level/levelBuilder.ts');
  const sceneSrc = tryRead('src/scenes/GameScene.ts');
  const constantsSrc = tryRead('src/constants.ts');

  const constants = layoutSrc ? extractConstants(layoutSrc) : new Map();

  // --- 2. Geometry tokens (levelLayout.ts) ----------------------------------
  check(`WORLD_WIDTH = ${worldWidth}`, constants.get('WORLD_WIDTH') === worldWidth, String(constants.get('WORLD_WIDTH')));
  check(`WORLD_HEIGHT = ${worldHeight}`, constants.get('WORLD_HEIGHT') === worldHeight, String(constants.get('WORLD_HEIGHT')));
  check(`GROUND_TOP_Y = ${groundTopY}`, constants.get('GROUND_TOP_Y') === groundTopY, String(constants.get('GROUND_TOP_Y')));
  check(`GROUND_HEIGHT = ${groundHeight}`, constants.get('GROUND_HEIGHT') === groundHeight, String(constants.get('GROUND_HEIGHT')));
  check(`PLATFORM_HEIGHT = ${platformHeight}`, constants.get('PLATFORM_HEIGHT') === platformHeight, String(constants.get('PLATFORM_HEIGHT')));

  // --- 3. Ground ------------------------------------------------------------
  const ground = layoutSrc ? extractGround(layoutSrc, constants) : null;
  if (!ground) {
    check('ground rect defined', false, 'no `id: \'ground\'` rect found');
  } else {
    check(`ground width spans full world (${worldWidth}px)`, ground.width === worldWidth, `${ground.width}px`);
    check(`ground top y = ${groundTopY}`, ground.y === groundTopY, `${ground.y}`);
    check(`ground height = ${groundHeight}`, ground.height === groundHeight, `${ground.height}`);
  }

  // --- 4. Platforms ---------------------------------------------------------
  const platforms = layoutSrc ? extractPlatforms(layoutSrc, constants) : [];
  check(`platform count >= ${minPlatforms}`, platforms.length >= minPlatforms, `found ${platforms.length}`);

  if (platforms.length > 0) {
    const badHeight = platforms.filter((p) => p.height !== platformHeight);
    check(
      `every platform height = ${platformHeight}px`,
      badHeight.length === 0,
      badHeight.map((p) => `${p.id}=${p.height}px`).join(', '),
    );
    const badWidth = platforms.filter((p) => p.width < PLATFORM_MIN_WIDTH || p.width > PLATFORM_MAX_WIDTH);
    check(
      `every platform width within ${PLATFORM_MIN_WIDTH}–${PLATFORM_MAX_WIDTH}px`,
      badWidth.length === 0,
      badWidth.map((p) => `${p.id}=${p.width}px`).join(', '),
    );

    const gapOffenders = [];
    for (let i = 0; i < platforms.length; i++) {
      for (let j = i + 1; j < platforms.length; j++) {
        const a = platforms[i];
        const b = platforms[j];
        const hGap = horizontalGap(a, b);
        const vGap = verticalGap(a, b);
        if (hGap < minGap && vGap < minGap) {
          gapOffenders.push(`${a.id}↔${b.id} (h=${hGap}px, v=${vGap}px)`);
        }
      }
    }
    check(
      `every platform pair separated by >= ${minGap}px (h or v)`,
      gapOffenders.length === 0,
      gapOffenders.join('; '),
    );
  }

  // --- 5. Pure data (no Phaser import in layout) ----------------------------
  const layoutUsesPhaser = layoutSrc ? /from\s+['"]phaser['"]/.test(layoutSrc) : false;
  check('levelLayout.ts is Phaser-free data', layoutSrc !== null && !layoutUsesPhaser);

  // --- 6. Static bodies + bounds (levelBuilder.ts) --------------------------
  const builder = builderSrc ?? '';
  check('levelBuilder uses Arcade static bodies', /\.staticGroup\s*\(/.test(builder));
  check('levelBuilder clamps physics world bounds', /world\.setBounds\s*\(/.test(builder));
  check('levelBuilder clamps camera bounds', /cameras\.main\.setBounds\s*\(/.test(builder));
  check('levelBuilder renders ground and platforms', /addGround\s*\(/.test(builder) && /addPlatform\s*\(/.test(builder));

  // --- 7. Background (GameScene.ts + constants.ts) --------------------------
  const scene = sceneSrc ?? '';
  check('GameScene fills COLORS.bg', /setBackgroundColor\s*\(\s*COLORS\.bg/.test(scene));
  check('GameScene builds the level', /\.build\s*\(\s*this\s*\)/.test(scene));
  const constantsText = constantsSrc ?? '';
  check(`COLORS.bg = ${bg}`, constantsText.includes(`bg: '${bg}'`) || constantsText.includes(`bg: "${bg}"`));

  // --- 8. Type safety (no `any`) -------------------------------------------
  const anyOffenders = [];
  for (const file of listSourceFiles()) {
    const text = readText(file);
    if (/(:\s*any\b|\bas\s+any\b|<any>|any\[\])/.test(text)) anyOffenders.push(file);
  }
  check('no `any` in src/', anyOffenders.length === 0, anyOffenders.join(', '));

  // --- 9. Type-check --------------------------------------------------------
  if (!opts.skipTypecheck) {
    if (!existsSync(TSC)) {
      check('tsc --noEmit (no type errors)', false, 'typescript not installed; run "npm install"');
    } else {
      const code = await run(NODE, [TSC, '--noEmit']);
      check('tsc --noEmit (no type errors)', code === 0, `exit code ${code}`);
    }
  } else {
    console.log('[probe] skipping type-check (--skip-typecheck)');
  }

  const failed = results.filter((ok) => !ok).length;
  if (failed > 0) {
    console.error(`\n[probe] ${failed} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log('\n[probe] PASS: level meets all acceptance criteria');
    process.exitCode = 0;
  }
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exitCode = 1;
});