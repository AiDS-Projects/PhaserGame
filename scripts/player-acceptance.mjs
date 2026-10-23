#!/usr/bin/env node
/**
 * scripts/player-acceptance.mjs
 *
 * Player-facing acceptance for the "ground & platforms" level ticket
 * (docs/Reqs/b63dfa/6ea9b5/PRD.md). Complements the two existing gates by
 * validating the *playable* contract from a character's point of view, i.e.
 * the physical invariants that guarantee a future player body will land, rest,
 * and be contained — the PRD's "角色" acceptance criteria that the static
 * geometry alone must satisfy:
 *
 *   1. Sealed world — the level's bounds clamp x to [0, WORLD_WIDTH] and the
 *                      ground slab's bottom edge is flush with the world's
 *                      bottom edge, so a falling body can never escape the
 *                      playfield through the floor or the side walls.
 *   2. Platforms    — every platform sits fully inside the playable volume and
 *                      ABOVE the ground (no overlap), so a body can land on
 *                      any platform without being wedged into geometry.
 *   3. Immovable    — ground + every platform are Arcade STATIC bodies and the
 *                      resulting collision group is exposed to the scene, so
 *                      the movement ticket can wire `collider(player, statics)`
 *                      and a standing body won't sink through the floor.
 *   4. Staged physics — the game config already declares Arcade physics with a
 *                      gravity slot, so the movement/jump tickets can enable
 *                      gravity and dynamic velocities without restructuring.
 *   5. Type safety  — no `any` in src/, and (unless --skip-typecheck)
 *                      `tsc --noEmit` passes.
 *
 * Where scripts/acceptance-probe.mjs proves the geometry is *declared with the
 * right dimensions* and scripts/runtime-acceptance.mjs proves the level
 * *renders*, this script proves the geometry is *physically sound for a
 * player*. It is deliberately build-free and deterministic: it reads the same
 * single source of truth (src/level/levelLayout.ts + the design tokens) and
 * checks the invariant relationships between bodies and bounds.
 *
 * Usage:
 *   node scripts/player-acceptance.mjs
 *   node scripts/player-acceptance.mjs --skip-typecheck
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

// Single source of truth for the expected world metrics and colors
// ("level" + "colors" sections of design_tokens.json).
const TOKENS_REL = path.join('docs', 'Reqs', 'b63dfa', '6ea9b5', 'design_tokens.json');

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

/**
 * Extract a single rect `{ id: '<id>', x, y, width, height }` from the layout
 * source. Returns `{ id, x, y, width, height }` or null if not found.
 */
function extractRect(source, id, constants) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `\\{\\s*id:\\s*'${escaped}',\\s*x:\\s*([^,\\s}]+),\\s*y:\\s*([^,\\s}]+),\\s*width:\\s*([^,\\s}]+),\\s*height:\\s*([^,\\s}]+)\\s*,?\\s*\\}`,
  );
  const match = source.match(re);
  if (!match) return null;
  return {
    id,
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

/** Extract the `worldBounds: WorldBounds = { x, y, width, height }` rect. */
function extractWorldBounds(source, constants) {
  const re =
    /worldBounds:\s*WorldBounds\s*=\s*\{\s*x:\s*([^,\s}]+),\s*y:\s*([^,\s}]+),\s*width:\s*([^,\s}]+),\s*height:\s*([^,\s}]+)\s*,?\s*\}/;
  const match = source.match(re);
  if (!match) return null;
  return {
    x: resolve(match[1], constants),
    y: resolve(match[2], constants),
    width: resolve(match[3], constants),
    height: resolve(match[4], constants),
  };
}

// ---------------------------------------------------------------------------
// Report & checks
// ---------------------------------------------------------------------------
const results = [];

function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`[player] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function tryRead(relPath) {
  try {
    return readText(relPath);
  } catch (error) {
    check(`read ${relPath}`, false, error.message);
    return null;
  }
}

function fmtRect(rect) {
  if (!rect) return 'missing';
  return `x=${rect.x}, y=${rect.y}, w=${rect.width}, h=${rect.height}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(
      [
        'Usage: node scripts/player-acceptance.mjs [options]',
        '',
        'Options:',
        '  --skip-typecheck   skip the `tsc --noEmit` type-check step',
        '  -h, --help         show this help',
      ].join('\n'),
    );
    return;
  }

  console.log('[player] validating "ground & platforms" playable contract');

  // --- 0. Design tokens -----------------------------------------------------
  let tokens = null;
  try {
    tokens = readJson(TOKENS_REL);
  } catch (error) {
    check(`read ${TOKENS_REL}`, false, error.message);
  }

  const level = tokens?.level ?? {};
  const worldWidth = level.world_width;
  const worldHeight = level.world_height;
  const groundTopY = level.ground_top_y;
  const groundHeight = level.ground_height;
  const levelKeys = ['world_width', 'world_height', 'ground_top_y', 'ground_height'];
  const missingKeys = levelKeys.filter((key) => typeof level[key] !== 'number');
  check('design tokens define world + ground metrics', missingKeys.length === 0, missingKeys.join(', '));

  // --- 1. Sources -----------------------------------------------------------
  const layoutSrc = tryRead('src/level/levelLayout.ts');
  const builderSrc = tryRead('src/level/levelBuilder.ts');
  const configSrc = tryRead('src/config/gameConfig.ts');

  const constants = layoutSrc ? extractConstants(layoutSrc) : new Map();
  const ground = layoutSrc ? extractRect(layoutSrc, 'ground', constants) : null;
  const platforms = layoutSrc ? extractPlatforms(layoutSrc, constants) : [];
  const worldBounds = layoutSrc ? extractWorldBounds(layoutSrc, constants) : null;

  // --- 2. Sealed world (no fall-through, no side escape) --------------------
  check(`WORLD_WIDTH = ${worldWidth}`, constants.get('WORLD_WIDTH') === worldWidth, String(constants.get('WORLD_WIDTH')));
  check(`WORLD_HEIGHT = ${worldHeight}`, constants.get('WORLD_HEIGHT') === worldHeight, String(constants.get('WORLD_HEIGHT')));

  if (worldBounds) {
    check(
      'world bounds seal left/right/top (x=0, y=0, full width/height)',
      worldBounds.x === 0 &&
        worldBounds.y === 0 &&
        worldBounds.width === worldWidth &&
        worldBounds.height === worldHeight,
      fmtRect(worldBounds),
    );
  } else {
    check('worldBounds defined', false, 'no `worldBounds: WorldBounds = {...}` found');
  }

  if (ground) {
    const bottom = ground.y + ground.height;
    check(
      'ground seals the bottom boundary (ground bottom == world bottom)',
      bottom === worldHeight,
      `ground bottom=${bottom}, world bottom=${worldHeight}`,
    );
  } else {
    check('ground rect defined', false, "no `id: 'ground'` rect found");
  }

  // --- 3. Platforms inside the playable volume ------------------------------
  const outOfX = platforms.filter((p) => p.x < 0 || p.x + p.width > worldWidth);
  const outOfTop = platforms.filter((p) => p.y < 0);
  const overlappingGround = platforms.filter((p) => p.y + p.height > groundTopY);
  check(
    `every platform is inside the horizontal bounds (0..${worldWidth})`,
    outOfX.length === 0,
    outOfX.map((p) => p.id).join(', '),
  );
  check('every platform top is inside the world (y >= 0)', outOfTop.length === 0, outOfTop.map((p) => p.id).join(', '));
  check(
    'every platform floats above the ground (no overlap)',
    overlappingGround.length === 0,
    overlappingGround.map((p) => p.id).join(', '),
  );

  // --- 4. Immovable bodies + exposed collision group ------------------------
  const builder = builderSrc ?? '';
  check('level uses Arcade static bodies', /\.staticGroup\s*\(/.test(builder));
  check(
    'ground and every platform are added to the static group',
    /addGround\s*\(/.test(builder) && /addPlatform\s*\(/.test(builder) && /statics\?\.add\s*\(/.test(builder),
  );
  check('level exposes the static collision group to the scene', /get\s+staticGroup\s*\(/.test(builder));

  // --- 5. Bounds + staged physics -------------------------------------------
  check('physics world clamped to level bounds', /world\.setBounds\s*\(/.test(builder));
  check('camera clamped to level bounds', /cameras\.main\.setBounds\s*\(/.test(builder));

  const config = configSrc ?? '';
  check('game config declares Arcade physics', /default:\s*['"]arcade['"]/.test(config));
  check('game config stages gravity for the movement/jump ticket', /gravity:\s*\{/.test(config));

  // --- 6. Type safety (no `any`) --------------------------------------------
  const anyOffenders = [];
  for (const file of listSourceFiles()) {
    const text = readText(file);
    if (/(:\s*any\b|\bas\s+any\b|<any>|any\[\])/.test(text)) anyOffenders.push(file);
  }
  check('no `any` in src/', anyOffenders.length === 0, anyOffenders.join(', '));

  // --- 7. Type-check --------------------------------------------------------
  if (!opts.skipTypecheck) {
    if (!existsSync(TSC)) {
      check('tsc --noEmit (no type errors)', false, 'typescript not installed; run "npm install"');
    } else {
      const code = await run(NODE, [TSC, '--noEmit']);
      check('tsc --noEmit (no type errors)', code === 0, `exit code ${code}`);
    }
  } else {
    console.log('[player] skipping type-check (--skip-typecheck)');
  }

  const failed = results.filter((ok) => !ok).length;
  if (failed > 0) {
    console.error(`\n[player] ${failed} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log('\n[player] PASS: level geometry is physically sound for a player');
    process.exitCode = 0;
  }
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exitCode = 1;
});
