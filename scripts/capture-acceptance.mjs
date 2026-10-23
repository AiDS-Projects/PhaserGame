#!/usr/bin/env node
/**
 * scripts/capture-acceptance.mjs
 *
 * Acceptance-evidence capturer for the Vite + Phaser 3 + TypeScript scaffold.
 *
 * Builds the production bundle, serves it with `vite preview`, then drives a
 * headless Chromium (Chrome or Edge) to (1) confirm the live page mounts a
 * Phaser-created <canvas> inside #game-container and (2) write a screenshot of
 * the running game shell into the requirement's screenshots dir as
 * `dev_<epoch-seconds>.png`, matching the existing dev-screenshot naming.
 *
 * This is the visual acceptance artifact: it proves the scaffold "runs" (a
 * canvas is mounted) and records what it looks like, complementing the static
 * checks in scripts/verify-files.mjs and build/integrity-gate.mjs and the
 * type-check / build / serve pipeline in build/smoke-test.mjs.
 *
 * Usage:
 *   node scripts/capture-acceptance.mjs
 *   node scripts/capture-acceptance.mjs --skip-build
 *   CAPTURE_BROWSER=/path/to/chrome node scripts/capture-acceptance.mjs
 *   node scripts/capture-acceptance.mjs --out-dir docs/screenshots
 *   node scripts/capture-acceptance.mjs --out docs/screenshots/my-shot.png
 *
 * Options:
 *   --port <n>       preview server port            (default: 4174)
 *   --out-dir <dir>  screenshot output directory    (default: auto-detect)
 *   --out <file>     exact screenshot path          (default: dev_<epoch>.png)
 *   --skip-build     reuse the existing dist/ dir instead of rebuilding
 *
 * Environment:
 *   CAPTURE_BROWSER  absolute path to a Chromium binary (Chrome/Edge)
 *   CAPTURE_PORT     alias for --port
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Paths & constants
// ---------------------------------------------------------------------------
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;
const VITE = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

const VIEWPORT = { width: 1280, height: 800 };
const READY_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fail(message) {
  throw new Error(`CAPTURE FAILED: ${message}`);
}

function parseArgs(argv) {
  const opts = {
    port: Number(process.env.CAPTURE_PORT ?? 4174),
    skipBuild: false,
    outDir: null,
    out: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port') opts.port = Number(argv[++i]);
    else if (arg === '--out-dir') opts.outDir = argv[++i];
    else if (arg === '--out') opts.out = argv[++i];
    else if (arg === '--skip-build') opts.skipBuild = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
  }
  return opts;
}

function listDir(absDir) {
  try {
    return readdirSync(absDir);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Browser discovery
// ---------------------------------------------------------------------------
function findBrowser() {
  const candidates = [
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

// ---------------------------------------------------------------------------
// Output destination
// ---------------------------------------------------------------------------
function findScreenshotsDir() {
  const reqsDir = path.join(ROOT, 'docs', 'Reqs');
  if (!existsSync(reqsDir)) return null;

  const candidates = [];
  for (const first of listDir(reqsDir)) {
    const firstDir = path.join(reqsDir, first);
    let isDir = false;
    try {
      isDir = statSync(firstDir).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) continue;
    for (const second of listDir(firstDir)) {
      const shotsDir = path.join(firstDir, second, 'screenshots');
      try {
        if (statSync(shotsDir).isDirectory()) candidates.push(shotsDir);
      } catch {
        // no screenshots dir for this requirement
      }
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return candidates[0];
}

function resolveOutPath(opts) {
  if (opts.out) {
    const abs = path.isAbsolute(opts.out) ? opts.out : path.join(ROOT, opts.out);
    mkdirSync(path.dirname(abs), { recursive: true });
    return abs;
  }
  const dir = opts.outDir
    ? (path.isAbsolute(opts.outDir) ? opts.outDir : path.join(ROOT, opts.outDir))
    : findScreenshotsDir() ?? path.join(ROOT, 'docs', 'screenshots');
  mkdirSync(dir, { recursive: true });
  return path.join(dir, `dev_${Math.floor(Date.now() / 1000)}.png`);
}

// ---------------------------------------------------------------------------
// Process / server helpers
// ---------------------------------------------------------------------------
function run(command, args, { capture = false } = {}) {
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

function readPngSize(file) {
  const buf = readFileSync(file);
  if (buf.length < 24) return null;
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
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
    fail(
      'no Chromium binary found; install Chrome/Edge or set CAPTURE_BROWSER to its absolute path',
    );
  }
  console.log(`[capture] browser: ${browser}`);

  const outPath = resolveOutPath(opts);
  console.log(`[capture] output: ${outPath}`);

  if (!opts.skipBuild) {
    console.log('[capture] 1/4 bundling (vite build)');
    const build = await run(NODE, [VITE, 'build']);
    if (build.code !== 0) fail('vite build exited with a non-zero code');
  } else {
    console.log('[capture] 1/4 skipping build (--skip-build)');
  }

  console.log(`[capture] 2/4 serving dist (http://127.0.0.1:${opts.port})`);
  let server = null;
  let serverOutput = '';
  const userDataDir = mkdtempSync(path.join(tmpdir(), 'phaser-capture-'));
  const browserBase = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${userDataDir}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
  ];

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

    console.log('[capture] 3/4 verifying a Phaser canvas is mounted');
    const dom = await run(browser, [...browserBase, '--virtual-time-budget=5000', '--dump-dom', url], {
      capture: true,
    });
    if (dom.code !== 0) fail(`--dump-dom exited with code ${dom.code}`);
    if (!dom.stdout.includes('<canvas')) {
      fail('rendered DOM contains no <canvas>; Phaser did not mount its game surface');
    }
    if (!dom.stdout.includes('id="game-container"')) {
      fail('rendered DOM is missing the #game-container mount element');
    }

    console.log('[capture] 4/4 screenshotting the running game shell');
    const shot = await run(
      browser,
      [...browserBase, '--virtual-time-budget=5000', `--screenshot=${outPath}`, url],
      { capture: true },
    );
    if (shot.code !== 0) {
      if (shot.stderr.trim()) console.error('[capture] browser stderr:\n' + shot.stderr.trim());
      fail(`--screenshot exited with code ${shot.code}`);
    }

    if (!existsSync(outPath)) fail(`screenshot was not written to ${outPath}`);
    const dims = readPngSize(outPath);
    if (!dims) fail(`screenshot at ${outPath} is not a valid PNG`);
    if (dims.width !== VIEWPORT.width || dims.height !== VIEWPORT.height) {
      fail(`screenshot is ${dims.width}x${dims.height}, expected ${VIEWPORT.width}x${VIEWPORT.height}`);
    }

    console.log(
      `[capture] PASS: canvas mounted and ${dims.width}x${dims.height} screenshot saved to ${outPath}`,
    );
  } catch (error) {
    if (serverOutput.trim()) {
      console.error('[capture] preview server output:\n' + serverOutput.trim());
    }
    throw error;
  } finally {
    if (server) server.kill();
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

main().then(
  () => {
    process.exitCode = 0;
  },
  (error) => {
    console.error(error?.message ?? error);
    process.exitCode = 1;
  },
);