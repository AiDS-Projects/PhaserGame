#!/usr/bin/env node
/**
 * capture-acceptance.mjs —— 可玩原型验收自测（Playwright 截图自测 + 手感确认 + 触控兜底）
 *
 * 独立运行的验收脚本（无需 TS 工具链，直接 `node scripts/capture-acceptance.mjs`）。
 * 与 src/acceptance/acceptanceProbe.ts 保持同一套验收口径：
 *
 *   1. 截图自测：驱动 Chromium 打开原型，分别以桌面 / 触控两套视口截图，并与基线
 *      （test/baselines）做像素级回归比对（阈值 maxPixelDiff=0.02），超出即判失败；
 *      基线缺失时自动建立基线。
 *   2. 手感确认：在页面内采样 requestAnimationFrame，统计约 1 秒的平均 FPS 与最大帧
 *      间隔（jank 信号），并读取 Phaser 实际帧率（window.__ACCEPTANCE__）作为交叉信号。
 *   3. 触控兜底：以 hasTouch + isMobile + ?touch=1 模拟触屏，确认触控 UI 激活，并通过
 *      真实 tap 驱动跳跃 / 冲刺，验证 pointer / touch 事件链路可用。
 *
 * 运行时钩子契约（与 index.html / main.ts / BootScene 对齐）：
 *   - window.__game          由 index.html / main.ts 暴露（getState/jump/dash/moveLeft/moveRight/showTouch）
 *   - window.__ACCEPTANCE__  由 BootScene 暴露（report/isTouchFallbackActive）
 *
 * 运行依赖（devDependencies）：
 *   - playwright  提供 chromium 与截图能力
 *   - pngjs       像素级截图比对（playwright 的传递依赖）
 *
 * 用法：
 *   node scripts/capture-acceptance.mjs
 *   BASE_URL=http://127.0.0.1:8080 node scripts/capture-acceptance.mjs
 *   HEADED=1 node scripts/capture-acceptance.mjs
 *   SERVER_CMD="npx --yes http-server . -p 5173 -a 127.0.0.1 -c-1" node scripts/capture-acceptance.mjs
 */

import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 验收常量（与 src/constants.ts 的 ACCEPTANCE 对齐，作为运行时镜像）
// ---------------------------------------------------------------------------

const GAME_WIDTH = 960;
const GAME_HEIGHT = 540;

const ACCEPTANCE = {
  /** 桌面截图基准视口（与逻辑画布一致） */
  viewport: { width: GAME_WIDTH, height: GAME_HEIGHT },
  /** 移动端触控视口（用于触控兜底手感确认） */
  touchViewport: { width: 390, height: 844 },
  /** 截图输出目录 */
  screenshotDir: 'test/screenshots',
  /** 基线截图目录 */
  baselineDir: 'test/baselines',
  /** 像素差异容忍阈值（比例 0~1，超出即判定回归） */
  maxPixelDiff: 0.02,
  /** 页面加载超时（ms） */
  loadTimeoutMs: 5000,
  /** 截图前等待画面稳定时间（ms） */
  settleDelayMs: 500,
};

/** 强制启用触控按钮的 URL 查询参数 */
const TOUCH_QUERY_PARAM = 'touch';

/** 触控按钮逻辑坐标（当页面无 DOM 按钮时，用于把逻辑坐标映射到视口后 tap） */
const TOUCH_BUTTONS = {
  left: { x: 52, y: GAME_HEIGHT - 52 },
  right: { x: 136, y: GAME_HEIGHT - 52 },
  dash: { x: GAME_WIDTH - 148, y: GAME_HEIGHT - 52 },
  jump: { x: GAME_WIDTH - 52, y: GAME_HEIGHT - 52 },
};

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 像素级比对两张 PNG，返回差异像素占比（0~1）。尺寸不一致视为完全不同。 */
function computePixelDiff(actual, baseline) {
  if (actual.equals(baseline)) return 0;
  const a = PNG.sync.read(actual);
  const b = PNG.sync.read(baseline);
  if (a.width !== b.width || a.height !== b.height) return 1;
  const total = a.width * a.height;
  let changed = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const dr = Math.abs(a.data[o] - b.data[o]);
    const dg = Math.abs(a.data[o + 1] - b.data[o + 1]);
    const db = Math.abs(a.data[o + 2] - b.data[o + 2]);
    if (dr + dg + db > 48) changed++;
  }
  return changed / total;
}

/** 目标 URL 是否可达（任意 HTTP 响应即视为服务已启动） */
async function isReachable(url, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(url, { signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 确保游戏服务可用：
 *  - 已可达：直接复用（返回 null，不负责关闭）；
 *  - 不可达且有 SERVER_CMD：拉起子进程并等待就绪（返回子进程，调用方负责关闭）；
 *  - 不可达且无 SERVER_CMD：报错提示。
 */
async function ensureServer(baseUrl, { serverCmd }) {
  if (await isReachable(baseUrl)) return null;
  if (!serverCmd) {
    throw new Error(
      `[capture-acceptance] ${baseUrl} 不可达，且未提供 SERVER_CMD。` +
        '请先启动 dev server，或设置 SERVER_CMD 自动拉起。',
    );
  }
  const child = spawn(serverCmd, { shell: true, stdio: 'inherit' });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (await isReachable(baseUrl, 2000)) return child;
    if (child.exitCode != null) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(
    `[capture-acceptance] SERVER_CMD 启动后 ${baseUrl} 仍不可达: ${serverCmd}`,
  );
}

/** 读取游戏状态快照 */
function getState(page) {
  return page.evaluate(() => window.__game?.getState() ?? null);
}

/** 等待游戏完成引导（window.__game 可用） */
async function waitForGame(page, timeoutMs = ACCEPTANCE.loadTimeoutMs) {
  try {
    await page.waitForFunction(() => window.__game?.getState() != null, undefined, {
      timeout: timeoutMs,
    });
    return true;
  } catch {
    return false;
  }
}

/** 画布是否已渲染 */
function canvasReady(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#game-container canvas');
    return !!canvas && canvas.width > 0 && canvas.height > 0;
  });
}

/** 等待玩家落地（用于跳跃逻辑自测后复位） */
async function waitForGrounded(page, timeoutMs = 3000) {
  try {
    await page.waitForFunction(
      () => window.__game?.getState()?.isGrounded === true,
      undefined,
      { timeout: timeoutMs },
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * 手感采样：在页面内用 rAF 统计约 1 秒的平均 FPS 与最大帧间隔（jank 信号），
 * 并读取 Phaser 实际帧率（若 window.__ACCEPTANCE__ 存在）。
 */
async function measureFeel(page) {
  const raf = await page.evaluate(async () => {
    let frames = 0;
    let last = performance.now();
    let maxGap = 0;
    const start = last;
    await new Promise((resolvePromise) => {
      const loop = (t) => {
        const gap = t - last;
        if (gap > maxGap) maxGap = gap;
        last = t;
        frames++;
        if (t - start >= 1000) resolvePromise();
        else requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    const elapsed = last - start;
    return {
      avgFps: elapsed > 0 ? frames / (elapsed / 1000) : 0,
      maxGapMs: Math.round(maxGap),
      frames,
      elapsedMs: Math.round(elapsed),
    };
  });

  const phaserFps = await page.evaluate(
    () => (window.__ACCEPTANCE__ ? Math.round(window.__ACCEPTANCE__.report().fps) : null),
  );

  return { ...raf, phaserFps };
}

/**
 * 触控点击（触控兜底验证）：优先点击 DOM 按钮（index.html 的 #btn-*）；
 * 若无 DOM 按钮（main.ts 的 Phaser 画布按钮），则把逻辑画布坐标映射到视口后
 * 用 touchscreen.tap 点击。返回是否成功触发点击。
 */
async function tapControl(page, domId, layout) {
  const hasDom = await page.evaluate((id) => !!document.getElementById(id), domId);
  if (hasDom) {
    try {
      await page.tap(`#${domId}`);
      return true;
    } catch {
      return false;
    }
  }

  const point = await page.evaluate(
    ([lw, lh, bx, by]) => {
      const canvas = document.querySelector('#game-container canvas');
      if (!canvas) return null;
      const r = canvas.getBoundingClientRect();
      const scale = Math.min(r.width / lw, r.height / lh);
      return {
        x: r.left + (r.width - lw * scale) / 2 + bx * scale,
        y: r.top + (r.height - lh * scale) / 2 + by * scale,
      };
    },
    [GAME_WIDTH, GAME_HEIGHT, layout.x, layout.y],
  );

  if (!point) return false;
  await page.touchscreen.tap(point.x, point.y);
  return true;
}

/** 截屏 + 与基线比对（基线缺失时自动建立） */
async function capture(page, name, opts) {
  const shotPath = join(opts.screenshotDir, `${name}.png`);
  const basePath = join(opts.baselineDir, `${name}.png`);
  mkdirSync(dirname(shotPath), { recursive: true });
  const actual = await page.screenshot({ path: shotPath });

  if (!existsSync(basePath)) {
    if (opts.updateBaselines) {
      mkdirSync(dirname(basePath), { recursive: true });
      writeFileSync(basePath, actual);
      return { name, path: shotPath, matched: true, pixelDiff: 0, baselineCreated: true };
    }
    return { name, path: shotPath, matched: false, pixelDiff: 1, baselineMissing: true };
  }

  const baseline = readFileSync(basePath);
  const pixelDiff = computePixelDiff(actual, baseline);
  return {
    name,
    path: shotPath,
    matched: pixelDiff <= ACCEPTANCE.maxPixelDiff,
    pixelDiff,
  };
}

// ---------------------------------------------------------------------------
// 逻辑自测 / 触控兜底
// ---------------------------------------------------------------------------

/** 桌面视口下的可玩性逻辑自测：初始态 / 跳跃 / 二段跳 / 跳跃上限 / 冲刺 / 冷却 / 朝向 */
async function runLogicChecks(page) {
  const checks = [];

  const s0 = await getState(page);
  checks.push({
    name: 'initial-state',
    passed: !!s0 && s0.isGrounded && s0.jumpCount === 0 && s0.dashCooldownRemaining === 0,
    detail: s0 ? JSON.stringify(s0) : 'state unavailable',
  });

  const jumped = await page.evaluate(() => window.__game.jump());
  const s1 = await getState(page);
  checks.push({
    name: 'jump',
    passed: jumped === true && !!s1 && s1.jumpCount === 1 && !s1.isGrounded,
    detail: `jump()=${jumped} jumpCount=${s1?.jumpCount}`,
  });

  const doubleJumped = await page.evaluate(() => window.__game.jump());
  const s2 = await getState(page);
  checks.push({
    name: 'double-jump',
    passed: doubleJumped === true && !!s2 && s2.jumpCount === 2,
    detail: `jump()=${doubleJumped} jumpCount=${s2?.jumpCount}`,
  });

  const capped = await page.evaluate(() => window.__game.jump());
  const s3 = await getState(page);
  checks.push({
    name: 'jump-cap',
    passed: capped === false && !!s3 && s3.jumpCount === 2,
    detail: `jump()=${capped} jumpCount=${s3?.jumpCount}`,
  });

  await waitForGrounded(page);

  const dashed = await page.evaluate(() => window.__game.dash());
  const s4 = await getState(page);
  checks.push({
    name: 'dash',
    passed: dashed === true && !!s4 && s4.dashCooldownRemaining > 0,
    detail: `dash()=${dashed} cd=${s4?.dashCooldownRemaining}ms`,
  });

  const dashedAgain = await page.evaluate(() => window.__game.dash());
  checks.push({
    name: 'dash-cooldown',
    passed: dashedAgain === false,
    detail: `dash()=${dashedAgain} (expected false during cooldown)`,
  });

  await page.evaluate(() => {
    window.__game.moveLeft(true);
    window.__game.moveRight(false);
  });
  await page.waitForTimeout(120);
  const left = await getState(page);

  await page.evaluate(() => {
    window.__game.moveLeft(false);
    window.__game.moveRight(true);
  });
  await page.waitForTimeout(120);
  const right = await getState(page);

  await page.evaluate(() => {
    window.__game.moveLeft(false);
    window.__game.moveRight(false);
  });

  checks.push({
    name: 'move-facing',
    passed: left?.facing === -1 && right?.facing === 1,
    detail: `left=${left?.facing} right=${right?.facing}`,
  });

  return checks;
}

/** 触控兜底：触屏仿真 + 真实 tap + 截图 */
async function runTouchChecks(browser, checks, opts) {
  const screenshots = [];
  const ctx = await browser.newContext({
    viewport: ACCEPTANCE.touchViewport,
    hasTouch: true,
    isMobile: true,
  });
  try {
    const page = await ctx.newPage();
    const sep = opts.baseUrl.includes('?') ? '&' : '?';
    const url = `${opts.baseUrl}${sep}${TOUCH_QUERY_PARAM}=1`;
    await page.goto(url, { waitUntil: 'load', timeout: ACCEPTANCE.loadTimeoutMs });

    const booted = await waitForGame(page);
    checks.push({ name: 'touch-boot', passed: booted, detail: url });

    const showTouch = await page.evaluate(() => window.__game?.showTouch === true);
    const ui = await page.evaluate(() => {
      const controls = document.getElementById('touch-controls');
      const domVisible = !!controls && getComputedStyle(controls).display !== 'none';
      const fallbackActive = window.__ACCEPTANCE__?.isTouchFallbackActive() ?? false;
      const hasJumpBtn = !!document.getElementById('btn-jump');
      return { domVisible, fallbackActive, hasJumpBtn };
    });
    const uiActive = ui.domVisible || ui.fallbackActive;
    checks.push({
      name: 'touch-fallback-active',
      passed: showTouch && uiActive,
      detail: `showTouch=${showTouch} domVisible=${ui.domVisible} fallbackActive=${ui.fallbackActive}`,
    });

    await page.waitForTimeout(ACCEPTANCE.settleDelayMs);
    screenshots.push(await capture(page, 'touch', opts));

    const tappedJump = await tapControl(page, 'btn-jump', TOUCH_BUTTONS.jump);
    const jumped = await page
      .waitForFunction(() => window.__game.getState().jumpCount >= 1, undefined, {
        timeout: 3000,
      })
      .then(() => true)
      .catch(() => false);
    checks.push({
      name: 'touch-jump',
      passed: tappedJump && jumped,
      detail: `tapped=${tappedJump} jumpCount=${(await getState(page))?.jumpCount}`,
    });

    const tappedDash = await tapControl(page, 'btn-dash', TOUCH_BUTTONS.dash);
    const dashed = await page
      .waitForFunction(() => window.__game.getState().dashCooldownRemaining > 0, undefined, {
        timeout: 3000,
      })
      .then(() => true)
      .catch(() => false);
    checks.push({
      name: 'touch-dash',
      passed: tappedDash && dashed,
      detail: `tapped=${tappedDash} cd=${(await getState(page))?.dashCooldownRemaining}ms`,
    });
  } finally {
    await ctx.close();
  }
  return screenshots;
}

// ---------------------------------------------------------------------------
// 主流程 + 报告
// ---------------------------------------------------------------------------

async function runProbe(opts) {
  const browser = await chromium.launch({ headless: opts.headless });
  try {
    const checks = [];
    const screenshots = [];

    // 1. 桌面视口：加载 + 逻辑自测 + 截图 + 手感
    const ctx = await browser.newContext({ viewport: ACCEPTANCE.viewport });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(String(err)));

    await page.goto(opts.baseUrl, { waitUntil: 'load', timeout: ACCEPTANCE.loadTimeoutMs });

    const booted = await waitForGame(page);
    const canvasOk = await canvasReady(page);
    checks.push({ name: 'boot', passed: booted, detail: opts.baseUrl });
    checks.push({
      name: 'canvas',
      passed: canvasOk,
      detail: canvasOk ? 'canvas rendered' : 'no canvas',
    });

    if (booted) {
      checks.push(...(await runLogicChecks(page)));
    }

    checks.push({
      name: 'no-runtime-errors',
      passed: pageErrors.length === 0,
      detail: pageErrors.join('; '),
    });

    await page.waitForTimeout(ACCEPTANCE.settleDelayMs);
    screenshots.push(await capture(page, 'desktop', opts));

    const feel = await measureFeel(page);
    checks.push({
      name: 'feel-fps',
      passed: feel.avgFps >= opts.minFps,
      detail: `${feel.avgFps.toFixed(1)} fps (min ${opts.minFps})`,
    });
    checks.push({
      name: 'feel-jank',
      passed: feel.maxGapMs <= 100,
      detail: `max frame gap ${feel.maxGapMs} ms`,
    });

    await ctx.close();

    // 2. 触控兜底：触屏仿真 + 真实 tap + 截图
    screenshots.push(...(await runTouchChecks(browser, checks, opts)));

    const passed =
      checks.every((c) => c.passed) &&
      screenshots.every((s) => s.matched) &&
      feel.avgFps >= opts.minFps;

    return { baseUrl: opts.baseUrl, passed, checks, screenshots, feel };
  } finally {
    await browser.close();
  }
}

function formatReport(report) {
  const lines = [];
  lines.push(`Acceptance capture → ${report.baseUrl}`);
  lines.push('');
  lines.push('Checks:');
  for (const c of report.checks) {
    lines.push(`  ${c.passed ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  lines.push('');
  lines.push('Screenshots:');
  for (const s of report.screenshots) {
    const status = s.baselineCreated
      ? 'BASELINE'
      : s.baselineMissing
        ? 'MISSING'
        : s.matched
          ? 'MATCH'
          : 'DIFF';
    lines.push(`  ${status.padEnd(8)} ${s.name} (diff=${(s.pixelDiff * 100).toFixed(2)}%)`);
  }
  lines.push('');
  lines.push(
    `Feel: ${report.feel.avgFps.toFixed(1)} fps · max gap ${report.feel.maxGapMs} ms` +
      (report.feel.phaserFps != null ? ` · phaser ${report.feel.phaserFps} fps` : ''),
  );
  lines.push('');
  lines.push(`RESULT: ${report.passed ? 'PASS' : 'FAIL'}`);
  return lines.join('\n');
}

async function main() {
  const opts = {
    baseUrl: process.env.BASE_URL ?? 'http://127.0.0.1:5173',
    headless: !process.env.HEADED,
    minFps: Number(process.env.MIN_FPS ?? 30),
    screenshotDir: resolve(ACCEPTANCE.screenshotDir),
    baselineDir: resolve(ACCEPTANCE.baselineDir),
    updateBaselines: true,
  };

  let server = null;
  try {
    server = await ensureServer(opts.baseUrl, { serverCmd: process.env.SERVER_CMD ?? '' });
    const report = await runProbe(opts);
    console.log(formatReport(report));
    if (!report.passed) process.exitCode = 1;
  } finally {
    if (server) server.kill();
  }
}

const isDirectRun = (() => {
  if (!process.argv[1]) return false;
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  main().catch((err) => {
    console.error('[capture-acceptance] 运行失败:', err);
    process.exitCode = 1;
  });
}