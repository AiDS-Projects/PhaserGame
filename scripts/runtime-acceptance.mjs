#!/usr/bin/env node
/**
 * scripts/runtime-acceptance.mjs
 *
 * Runtime acceptance for the "ground & platforms" level ticket
 * (docs/Reqs/b63dfa/6ea9b5/PRD.md). Unlike scripts/acceptance-probe.mjs
 * (build-free source checks) and scripts/capture-acceptance.mjs (a screenshot
 * for human review), this script boots the *built* game in a headless
 * Chromium and inspects the actual rendered pixels to prove the level draws
 * correctly at runtime:
 *
 *   1. Boot       — a Phaser <canvas> mounts inside #game-container.
 *   2. Background — the sky pixels match the bg token (#0F172A), i.e. the
 *                   GameScene's setBackgroundColor(COLORS.bg) actually ran and
 *                   rendered (not just the CSS page fallback).
 *   3. Ground     — the ground band renders the ground_fill color across the
 *                   full visible width, with a ground_surface accent line
 *                   along its top edge.
 *   4. Platforms  — every platform rect declared in levelLayout.ts that lands
 *                   inside the initial viewport renders its platform_fill body
 *                   and platform_surface accent line at the declared position.
 *
 * Expected geometry is read from docs/Reqs/b63dfa/6ea9b5/design_tokens.json
 * (colors + level metrics) and src/level/levelLayout.ts (platform rects), so
 * the sample points stay in sync with the single source of truth rather than
 * hard-coding coordinates.
 *
 * Renderer-agnostic: pixels are sampled from a full-page screenshot, decoded
 * in-process with zlib (no image/PNG dependencies), so it works whether Phaser
 * picked the WebGL or the Canvas renderer. The initial camera view (960px of
 * the 1920px world) is the runtime-visible window; full world/bounds/physics
 * coverage is scripts/acceptance-probe.mjs's job — this script proves the
 * visible level actually renders.
 *
 * Usage:
 *   node scripts/runtime-acceptance.mjs
 *   node scripts/runtime-acceptance.mjs --skip-build
 *   RUNTIME_BROWSER=/path/to/chrome node scripts/runtime-acceptance.mjs
 *
 * Options:
 *   --port <n>      preview server port           (default: 4175)
 *   --skip-build    reuse the existing dist/ dir instead of rebuilding
 *
 * Environment:
 *   RUNTIME_BROWSER   absolute path to a Chromium binary (Chrome/Edge)
 *   CAPTURE_BROWSER    fallback if RUNTIME_BROWSER is unset
 *   RUNTIME_PORT       alias for --port
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// Paths & constants
// ---------------------------------------------------------------------------
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;
const VITE = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

// Window sized to exactly 2x the 960x540 design resolution, so Scale.FIT fills
// the window with an integer 2:1 pixel scale (no letterboxing, no fractional
// sampling). The mapping helper still tolerates any size Chrome actually
// produces.
const VIEWPORT = { width: 1920, height: 1080 };
const READY_TIMEOUT_MS = 15_000;
const VIRTUAL_TIME_BUDGET_MS = 3_000;

// Source of truth for expected colors/metrics (same file acceptance-probe reads).
const TOKENS_REL = path.join('docs', 'Reqs', 'b63dfa', '6ea9b5', 'design_tokens.json');
const LAYOUT_REL = 'src/level/levelLayout.ts';

// Per-channel tolerance when comparing sampled pixels to expected hex colors
// (guards against color-management rounding in the screenshot).
const COLOR_TOLERANCE = 6;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fail(message) {
  throw new Error(`RUNTIME ACCEPTANCE FAILED: ${message}`);
}

function readText(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!existsSync(abs)) fail(`required file missing: ${relPath}`);
  return readFileSync(abs, 'utf8');
}

function readJson(relPath) {
  try {
    return JSON.parse(readText(relPath));
  } catch {
    fail(`${relPath} is not valid JSON`);
  }
}

function parseArgs(argv) {
  const opts = {
    port: Number(process.env.RUNTIME_PORT ?? 4175),
    skipBuild: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port') opts.port = Number(argv[++i]);
    else if (arg === '--skip-build') opts.skipBuild = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
  }
  return opts;
}

function findBrowser() {
  const candidates = [
    process.env.RUNTIME_BROWSER,
    process.env.CAPTURE_BROWSER,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function run(command, args, { capture = true } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      command,
      args,
      { cwd: ROOT, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' },
    );
    let stdout = '';
    let stderr = '';
    if (capture) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }
    child.on('error', reject);
    child.on('exit', (code) => resolve({ code, stdout, stderr }));
  });
}

async function waitForServer(port) {
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  fail(`preview server did not respond within ${READY_TIMEOUT_MS}ms (last error: ${lastError})`);
}

// ---------------------------------------------------------------------------
// Level-layout source extraction (platform rects)
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
  return constants.has(trimmed) ? constants.get(trimmed) : null;
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

// ---------------------------------------------------------------------------
// PNG decode (minimal 8-bit RGB/RGBA, non-interlaced)
// ---------------------------------------------------------------------------
function decodePng(buf) {
  if (buf.length < 24 || buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    fail('screenshot is not a valid PNG');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (bitDepth !== 8) fail(`unsupported PNG bit depth ${bitDepth}`);
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : null;
  if (channels === null) fail(`unsupported PNG color type ${colorType}`);
  if (interlace !== 0) fail('interlaced PNG not supported');

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);

  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  };

  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    const line = raw.subarray(rowStart + 1, rowStart + 1 + stride);
    const cur = Buffer.alloc(stride);
    for (let i = 0; i < stride; i++) {
      const rawByte = line[i];
      const left = i >= channels ? cur[i - channels] : 0;
      const up = prev[i];
      const upLeft = i >= channels ? prev[i - channels] : 0;
      let val;
      switch (filter) {
        case 0:
          val = rawByte;
          break;
        case 1:
          val = rawByte + left;
          break;
        case 2:
          val = rawByte + up;
          break;
        case 3:
          val = rawByte + Math.floor((left + up) / 2);
          break;
        case 4:
          val = rawByte + paeth(left, up, upLeft);
          break;
        default:
          fail(`unknown PNG filter type ${filter}`);
      }
      cur[i] = val & 0xff;
    }
    for (let x = 0; x < width; x++) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      out[dst] = cur[src];
      out[dst + 1] = cur[src + 1];
      out[dst + 2] = cur[src + 2];
      out[dst + 3] = channels === 4 ? cur[src + 3] : 255;
    }
    prev = cur;
  }

  return { width, height, data: out };
}

// ---------------------------------------------------------------------------
// Color & sampling helpers
// ---------------------------------------------------------------------------
function hexToRgb(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) fail(`not a hex color: ${hex}`);
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function matches(actual, expected, tolerance = COLOR_TOLERANCE) {
  return (
    Math.abs(actual[0] - expected[0]) <= tolerance &&
    Math.abs(actual[1] - expected[1]) <= tolerance &&
    Math.abs(actual[2] - expected[2]) <= tolerance
  );
}

function rgbString(rgb) {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

/**
 * Build a function mapping design-space coordinates (dx, dy) into the
 * screenshot pixel buffer, accounting for Scale.FIT letterboxing/centering.
 */
function makeSampler(png, designWidth, designHeight) {
  const scale = Math.min(png.width / designWidth, png.height / designHeight);
  const canvasWidth = designWidth * scale;
  const canvasHeight = designHeight * scale;
  const left = (png.width - canvasWidth) / 2;
  const top = (png.height - canvasHeight) / 2;

  return (dx, dy) => {
    const x = Math.round(left + dx * scale);
    const y = Math.round(top + dy * scale);
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return null;
    const i = (y * png.width + x) * 4;
    return [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
  };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const results = [];

function check(name, ok, detail = '') {
  results.push(ok);
  console.log(`[runtime] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8'));
    return;
  }

  const browser = findBrowser();
  if (!browser) {
    fail('no Chromium binary found; install Chrome/Edge or set RUNTIME_BROWSER to its path');
  }

  // --- Expected geometry (design tokens + level layout) --------------------
  const tokens = readJson(TOKENS_REL);
  const colors = tokens.colors ?? {};
  const level = tokens.level ?? {};

  const designWidth = level.viewport_width;
  const designHeight = level.viewport_height;
  const groundTopY = level.ground_top_y;
  const groundHeight = level.ground_height;
  const surfaceLine = level.ground_surface_line;
  const minPlatforms = level.min_platforms;
  const requiredColors = ['bg', 'ground_fill', 'ground_surface', 'platform_fill', 'platform_surface'];
  const missingColors = requiredColors.filter((key) => typeof colors[key] !== 'string');
  check('design tokens define all level colors', missingColors.length === 0, missingColors.join(', '));

  const layoutSrc = readText(LAYOUT_REL);
  const constants = extractConstants(layoutSrc);
  const platforms = extractPlatforms(layoutSrc, constants);
  const invalidPlatforms = platforms.filter(
    (p) => p.x === null || p.y === null || p.width === null || p.height === null,
  );
  check(
    `levelLayout.ts parses ${platforms.length} platform rect(s)`,
    platforms.length > 0 && invalidPlatforms.length === 0,
    invalidPlatforms.map((p) => p.id).join(', '),
  );
  check(`platform count >= ${minPlatforms}`, platforms.length >= minPlatforms, `found ${platforms.length}`);

  // --- Build ---------------------------------------------------------------
  if (!opts.skipBuild) {
    console.log('[runtime] 1/4 bundling (vite build)');
    const build = await run(NODE, [VITE, 'build'], { capture: false });
    if (build.code !== 0) fail(`vite build exited with code ${build.code}`);
  } else {
    console.log('[runtime] 1/4 skipping build (--skip-build)');
  }

  // --- Serve ---------------------------------------------------------------
  console.log(`[runtime] 2/4 serving dist (http://127.0.0.1:${opts.port})`);
  const tmp = mkdtempSync(path.join(tmpdir(), 'phaser-runtime-'));
  const userDataDir = path.join(tmp, 'profile');
  const shotPath = path.join(tmp, 'shot.png');
  const browserBase = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--force-color-profile=srgb',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
  ];

  let server = null;
  let serverOutput = '';
  try {
    server = spawn(
      NODE,
      [VITE, 'preview', '--host', '127.0.0.1', '--port', String(opts.port), '--strictPort'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    server.stdout.on('data', (chunk) => {
      serverOutput += chunk.toString();
    });
    server.stderr.on('data', (chunk) => {
      serverOutput += chunk.toString();
    });

    await waitForServer(opts.port);
    const url = `http://127.0.0.1:${opts.port}/`;

    // --- 3. Boot check (canvas mount) -------------------------------------
    console.log('[runtime] 3/4 verifying a Phaser canvas is mounted');
    const dom = await run(browser, [...browserBase, `--virtual-time-budget=${VIRTUAL_TIME_BUDGET_MS}`, '--dump-dom', url]);
    if (dom.code !== 0) fail(`--dump-dom exited with code ${dom.code}`);
    check('page mounts #game-container', dom.stdout.includes('id="game-container"'));
    check('page mounts a Phaser <canvas>', dom.stdout.includes('<canvas'));

    // --- 4. Render check (pixel sampling) ---------------------------------
    console.log('[runtime] 4/4 sampling rendered pixels');
    const startedAt = Date.now();
    const shot = await run(
      browser,
      [...browserBase, `--virtual-time-budget=${VIRTUAL_TIME_BUDGET_MS}`, `--screenshot=${shotPath}`, url],
    );
    const elapsedMs = Date.now() - startedAt;
    if (shot.code !== 0) {
      if (shot.stderr.trim()) console.error('[runtime] browser stderr:\n' + shot.stderr.trim());
      fail(`--screenshot exited with code ${shot.code}`);
    }
    if (!existsSync(shotPath)) fail('screenshot was not written');

    const png = decodePng(readFileSync(shotPath));
    check(
      `screenshot captured (${png.width}x${png.height})`,
      png.width > 0 && png.height > 0,
      `headless render completed in ${elapsedMs}ms wall time`,
    );

    const sample = makeSampler(png, designWidth, designHeight);

    // Background: clear-sky points (all above the highest platform top).
    const bg = hexToRgb(colors.bg);
    const bgPoints = [
      [240, 60],
      [480, 120],
      [720, 60],
    ];
    const bgSamples = bgPoints.map(([x, y]) => sample(x, y));
    check(
      `background renders ${colors.bg} in clear sky`,
      bgSamples.every((px) => px && matches(px, bg)),
      bgSamples.map((px) => (px ? rgbString(px) : 'out-of-bounds')).join(', '),
    );

    // Ground: fill band + surface line across the visible width.
    const groundFill = hexToRgb(colors.ground_fill);
    const groundSurface = hexToRgb(colors.ground_surface);
    const groundX = [10, 480, 950];
    const groundFillY = groundTopY + Math.floor(groundHeight / 2);
    const groundSurfaceY = groundTopY + Math.max(1, Math.floor(surfaceLine / 2));
    const groundFillSamples = groundX.map((x) => sample(x, groundFillY));
    const groundSurfaceSamples = groundX.map((x) => sample(x, groundSurfaceY));
    check(
      `ground fill renders ${colors.ground_fill} across visible width`,
      groundFillSamples.every((px) => px && matches(px, groundFill)),
      groundFillSamples.map((px) => (px ? rgbString(px) : 'out-of-bounds')).join(', '),
    );
    check(
      `ground surface line renders ${colors.ground_surface}`,
      groundSurfaceSamples.every((px) => px && matches(px, groundSurface)),
      groundSurfaceSamples.map((px) => (px ? rgbString(px) : 'out-of-bounds')).join(', '),
    );

    // Platforms: render-check every rect inside the initial 960px viewport.
    const platformFill = hexToRgb(colors.platform_fill);
    const platformSurface = hexToRgb(colors.platform_surface);
    const visible = platforms.filter((p) => p.x < designWidth && p.x + p.width > 0);
    const offscreen = platforms.filter((p) => !(p.x < designWidth && p.x + p.width > 0));
    if (offscreen.length > 0) {
      console.log(`[runtime] info  ${offscreen.map((p) => p.id).join(', ')} off-screen (outside initial viewport)`);
    }
    check(`at least one platform inside the initial viewport`, visible.length > 0, `visible: ${visible.length}`);

    for (const p of visible) {
      const cx = p.x + Math.floor(p.width / 2);
      const body = sample(cx, p.y + Math.floor(p.height / 2));
      const edge = sample(cx, p.y + Math.max(1, Math.floor(surfaceLine / 2)));
      check(`${p.id} body renders ${colors.platform_fill}`, !!body && matches(body, platformFill), body ? rgbString(body) : 'out-of-bounds');
      check(`${p.id} surface renders ${colors.platform_surface}`, !!edge && matches(edge, platformSurface), edge ? rgbString(edge) : 'out-of-bounds');
    }
  } catch (error) {
    if (serverOutput.trim()) {
      console.error('[runtime] preview server output:\n' + serverOutput.trim());
    }
    throw error;
  } finally {
    if (server) server.kill();
    rmSync(tmp, { recursive: true, force: true });
  }

  const failed = results.filter((ok) => !ok).length;
  if (failed > 0) {
    console.error(`\n[runtime] ${failed} check(s) failed`);
    process.exitCode = 1;
  } else {
    console.log('\n[runtime] PASS: level renders correctly at runtime');
    process.exitCode = 0;
  }
}

main().catch((error) => {
  console.error(error?.message ?? error);
  process.exitCode = 1;
});