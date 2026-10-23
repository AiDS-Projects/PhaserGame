文件已生成于 `build/smoke-test.mjs`，完整内容如下：

#!/usr/bin/env node
/**
 * build/smoke-test.mjs
 *
 * Smoke test for the Vite + Phaser 3 + TypeScript scaffold. Verifies the
 * project (1) type-checks, (2) bundles, and (3) serves a page whose bundle
 * contains both the Phaser library and our game wiring.
 *
 * Usage: node build/smoke-test.mjs
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Paths & constants
// ---------------------------------------------------------------------------
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;
const TSC = path.join(ROOT, 'node_modules', 'typescript', 'lib', 'tsc.js');
const VITE = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

const PORT = Number(process.env.SMOKE_TEST_PORT ?? 4173);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const READY_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fail(message) {
  throw new Error(`SMOKE TEST FAILED: ${message}`);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`"${command} ${args.join(' ')}" exited with code ${code}`));
    });
  });
}

async function waitForServer() {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/`, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return res;
      lastError = new Error(`HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `preview server did not respond within ${READY_TIMEOUT_MS}ms (last error: ${lastError})`,
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!existsSync(TSC)) fail(`typescript not found at ${TSC}; run "npm install" first`);
  if (!existsSync(VITE)) fail(`vite not found at ${VITE}; run "npm install" first`);

  console.log('[smoke] 1/3 type-checking (tsc --noEmit)');
  await run(NODE, [TSC, '--noEmit']);

  console.log('[smoke] 2/3 bundling (vite build)');
  await run(NODE, [VITE, 'build']);

  console.log(`[smoke] 3/3 serving dist and probing (${BASE_URL})`);
  let server = null;
  let serverOutput = '';
  try {
    server = spawn(
      NODE,
      [VITE, 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
      { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    server.stdout.on('data', (chunk) => {
      serverOutput += chunk.toString();
    });
    server.stderr.on('data', (chunk) => {
      serverOutput += chunk.toString();
    });

    const response = await waitForServer();
    const html = await response.text();
    if (!html.includes('id="game-container"')) {
      fail('built index.html is missing the #game-container mount element');
    }

    const scriptSrc = html.match(/<script[^>]*\bsrc="([^"]+\.js)"[^>]*>/i)?.[1];
    if (!scriptSrc) fail('built index.html contains no <script src="*.js"> bundle');

    const assetUrl = new URL(scriptSrc, `${BASE_URL}/`).href;
    const bundleResponse = await fetch(assetUrl);
    if (!bundleResponse.ok) fail(`bundle ${assetUrl} returned HTTP ${bundleResponse.status}`);
    const bundle = await bundleResponse.text();
    if (!bundle.includes('Phaser')) fail('bundle does not include the Phaser library');
    if (!bundle.includes('game-container')) fail('bundle does not include game config wiring');

    console.log('[smoke] PASS: scaffold builds, serves, and loads a Phaser game shell');
  } catch (error) {
    if (serverOutput.trim()) {
      console.error('[smoke] preview server output:\n' + serverOutput.trim());
    }
    throw error;
  } finally {
    if (server) server.kill();
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