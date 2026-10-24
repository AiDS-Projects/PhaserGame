#!/usr/bin/env node
/**
 * verify-files.mjs — 可玩原型验收自测（截图自测 + 手感确认 + 触控兜底 + 产物文件校验）
 *
 * 与 scripts/capture-acceptance.mjs、scripts/runtime-acceptance.mjs、src/acceptance/acceptanceProbe.ts
 * 保持同一套验收口径，本脚本的独特职责是「产物文件校验」：
 *
 *   1. 截图自测：驱动 Chromium 分别以桌面 / 触控两套视口打开原型并截图，
 *      与基线（BASELINE_DIR）做像素级回归比对（阈值 maxPixelDiff=0.02）。
 *   2. 手感确认：页面内 rAF 采样约 1 秒的平均 FPS 与最大帧间隔（jank），
 *      并交叉读取 Phaser 实际帧率（window.__ACCEPTANCE__，若存在）。
 *   3. 触控兜底：以 hasTouch + isMobile + ?touch=1 模拟触屏，确认触控 UI 激活，
 *      通过真实 tap 驱动跳跃 / 冲刺，验证 pointer / touch 事件链路可用。
 *   4. 产物文件校验（本脚本核心）：
 *      - 校验每个输出截图是合法 PNG（签名 + IHDR 尺寸 + 非空白帧）；
 *      - 校验基线文件存在且合法（缺失时给出「需建立基线」提示，非硬失败）；
 *      - 校验 report.json 为合法 JSON 且字段完整。
 *
 * 运行时钩子契约（与 index.html / main.ts / BootScene 对齐）：
 *   - window.__game          暴露 getState/jump/dash/moveLeft/moveRight/showTouch
 *   - window.__ACCEPTANCE__  暴露 report/isTouchFallbackActive
 *
 * 运行依赖（devDependencies）：
 *   - playwright  提供 chromium 与截图能力
 *   - pngjs       像素级比对 + PNG 解码（playwright 的传递依赖）
 *
 * 用法：
 *   node scripts/verify-files.mjs
 *   BASE_URL=http://127.0.0.1:8080 node scripts/verify-files.mjs
 *   HEADED=1 node scripts/verify-files.mjs
 *   SERVER_CMD="npx --yes http-server . -p 5173 -a 127.0.0.1 -c-1" node scripts/verify-files.mjs
 *
 * 产物：OUT_DIR/（desktop.png、touch.png、report.json）
 * 退出码：0 全部通过；1 存在失败项；2 环境/依赖问题
 */

import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
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
  /** 像素差异容忍阈值（比例 0~1，超出即判定回归） */
  maxPixelDiff: 0.02,
  /** 页面加载超时（ms） */
  loadTimeoutMs: 5000,
  /** 截图前等待画面稳定时间（ms） */
  settleDelayMs: 500,
  /** 亮度方差低于该值视为空白帧 */
  minBlankVariance: 4,
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

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// ---------------------------------------------------------------------------
// PNG 文件校验工具（本脚本核心：不依赖浏览器，直接校验产物文件字节）
// ---------------------------------------------------------------------------

/**
 * 校验是否为合法 PNG，并解析 IHDR 得到尺寸。
 * 返回 { ok, reason?, width?, height? }。
 */
function inspectPng(buf) {
  if (!buf || buf.length < 24) return { ok: false, reason: 'too small / empty' };
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) return { ok: false, reason: 'bad PNG signature' };
  const chunkType = buf.toString('ascii', 12, 16);
  if (chunkType !== 'IHDR') return { ok: false, reason: `first chunk is "${chunkType}", expected IHDR` };
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  if (width <= 0 || height <= 0) return { ok: false, reason: `invalid dimensions ${width}x${height}` };
  return { ok: true, width, height };
}

/** 解码 PNG 后计算亮度方差（0~255），用于空白帧启发式判断 */
function pngBlankVariance(buf) {
  const { data } = PNG.sync.read(buf);
  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  return max - min;
}

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

/**
 * 校验单个截图产物文件：存在 + 合法 PNG + 尺寸匹配 + 非空白。
 * 返回结构化结果 { path, exists, passed, note, ... }。
 */
function verifyScreenshotFile(absPath, expectW, expectH) {
  const entry = { path: absPath, level: 'fail' };
  if (!existsSync(absPath)) {
    entry.exists = false;
    entry.passed = false;
    entry.note = 'missing';
    return entry;
  }
  entry.exists = true;
  const buf = readFileSync(absPath);
  entry.size = buf.length;
  const info = inspectPng(buf);
  entry.pngOk = info.ok;
  entry.width = info.width;
  entry.height = info.height;
  if (!info.ok) {
    entry.passed = false;
    entry.note = `invalid PNG: ${info.reason}`;
    return entry;
  }
  if (expectW && info.width !== expectW) {
    entry.passed = false;
    entry.note = `width ${info.width}, expected ${expectW}`;
    return entry;
  }
  if (expectH && info.height !== expectH) {
    entry.passed = false;
    entry.note = `height ${info.height}, expected ${expectH}`;
    return entry;
  }
  const variance = pngBlankVariance(buf);
  entry.blankVariance = Number(variance.toFixed(1));
  if (variance < ACCEPTANCE.minBlankVariance) {
    entry.passed = false;
    entry.note = `blank frame (variance ${entry.blankVariance})`;
    return entry;
  }
  entry.passed = true;
  entry.note = `${info.width}x${info.height}, variance ${entry.blankVariance}`;
  return entry;
}

/** 校验 report.json：存在 + 合法 JSON + 字段完整。 */
function verifyReportFile(absPath) {
  const entry = { path: absPath, level: 'fail' };
  if (!existsSync(absPath)) {
    entry.exists = false;
    entry.passed = false;
    entry.note = 'missing';
    return entry;
  }
  entry.exists = true;
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(absPath, 'utf8'));
  } catch (e) {
    entry.passed = false;
    entry.note = `invalid JSON: ${e.message}`;
    return entry;
  }
  entry.parsed = parsed;
  const keysOk =
    parsed && typeof parsed === 'object' && 'summary' in parsed && 'checks' in parsed;
  entry.passed = keysOk;
  entry.note = keysOk ? `summary=${JSON.stringify(parsed.summary)}` : 'missing summary/checks fields';
  return entry;
}

// ---------------------------------------------------------------------------
// 服务器管理
// ---------------------------------------------------------------------------

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

/** 确保游戏服务可用（已可达则复用，否则按 SERVER_CMD 拉起子进程） */
async function ensureServer(baseUrl, { serverCmd }) {
  if (await isReachable(baseUrl)) return null;
  if (!serverCmd) {
    throw new Error(
      `[verify-files] ${baseUrl} 不可达，且未提供 SERVER_CMD。` +
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
  throw new Error(`[verify-files] SERVER_CMD 启动后 ${baseUrl} 仍不可达: ${serverCmd}`);
}

// ---------------------------------------------------------------------------
// 页面辅助
// ---------------------------------------------------------------------------

function getState(page) {
  return page.evaluate(() => window.__game?.getState() ?? null);
}

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

function canvasReady(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('#game-container canvas');
    return !!canvas && canvas.width > 0 && canvas.height > 0;
  });
}

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

/** 手感采样：rAF 统计平均 FPS + 最大帧间隔，并读取 Phaser 实际帧率 */
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

/** 触控点击：优先 DOM 按钮，否则映射逻辑画布坐标后 touchscreen.tap */
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

/** 截屏写入 OUT_DIR，并与基线（若存在）做像素比对 */
async function capture(page, name, opts) {
  const shotPath = join(opts.outDir, `${name}.png`);
  const actual = await page.screenshot({ path: shotPath });
  const basePath = join(opts.baselineDir, `${name}.png`);

  let pixelDiff = null;
  let matched = null;
  if (existsSync(basePath)) {
    const baseline = readFileSync(basePath);
    pixelDiff = computePixelDiff(actual, baseline);
    matched = pixelDiff <= ACCEPTANCE.maxPixelDiff;
  }
  return { name, path: shotPath, pixelDiff, matched };
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
    viewport: { width: ACCEPTANCE.touchViewport.width, height: ACCEPTANCE.touchViewport.height },
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
      return { domVisible, fallbackActive };
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
// 主流程
// ---------------------------------------------------------------------------

async function runVerify(opts) {
  const browser = await chromium.launch({ headless: opts.headless });
  try {
    const checks = [];
    const screenshots = [];
    const fileChecks = [];

    // 1. 桌面视口：加载 + 逻辑自测 + 截图 + 手感
    const ctx = await browser.newContext({
      viewport: { width: ACCEPTANCE.viewport.width, height: ACCEPTANCE.viewport.height },
    });
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

    // 3. 产物文件校验（本脚本核心）
    for (const s of screenshots) {
      const expect =
        s.name === 'desktop'
          ? { w: ACCEPTANCE.viewport.width, h: ACCEPTANCE.viewport.height }
          : { w: ACCEPTANCE.touchViewport.width, h: ACCEPTANCE.touchViewport.height };
      fileChecks.push(verifyScreenshotFile(s.path, expect.w, expect.h));
    }

    // 4. 基线文件校验（缺失仅提示，非硬失败）
    for (const name of ['desktop', 'touch']) {
      const basePath = join(opts.baselineDir, `${name}.png`);
      if (existsSync(basePath)) {
        const expect =
          name === 'desktop'
            ? { w: ACCEPTANCE.viewport.width, h: ACCEPTANCE.viewport.height }
            : { w: ACCEPTANCE.touchViewport.width, h: ACCEPTANCE.touchViewport.height };
        fileChecks.push(verifyScreenshotFile(basePath, expect.w, expect.h));
      } else {
        fileChecks.push({
          path: basePath,
          level: 'warn',
          exists: false,
          passed: false,
          note: 'baseline missing（首次运行：可执行 capture-acceptance.mjs 建立基线）',
        });
      }
    }

    // 5. 报告写入 + 校验
    const hardFileFail = fileChecks.some((f) => f.level !== 'warn' && !f.passed);
    const screenFail = screenshots.some((s) => s.matched === false);
    const checksFail = checks.some((c) => !c.passed);
    const feelFail = feel.avgFps < opts.minFps;
    const passed = !checksFail && !screenFail && !hardFileFail && !feelFail;

    const summary = {
      total: checks.length + fileChecks.length,
      checksPassed: checks.filter((c) => c.passed).length,
      fileChecksPassed: fileChecks.filter((f) => f.passed).length,
      screenshots,
      ok: passed,
    };

    const reportJson = {
      baseUrl: opts.baseUrl,
      at: new Date().toISOString(),
      passed,
      summary,
      checks,
      fileChecks,
      feel,
    };
    const reportPath = join(opts.outDir, 'report.json');
    writeFileSync(reportPath, JSON.stringify(reportJson, null, 2), 'utf8');
    fileChecks.push(verifyReportFile(reportPath));

    return { baseUrl: opts.baseUrl, passed, checks, screenshots, fileChecks, feel };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// 报告输出
// ---------------------------------------------------------------------------

function formatReport(report) {
  const lines = [];
  lines.push(`Verify files → ${report.baseUrl}`);
  lines.push('');
  lines.push('Checks:');
  for (const c of report.checks) {
    lines.push(`  ${c.passed ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
  }
  lines.push('');
  lines.push('Screenshots:');
  for (const s of report.screenshots) {
    const status =
      s.matched == null ? 'NO-BASELINE' : s.matched ? 'MATCH' : 'DIFF';
    const diff = s.pixelDiff == null ? '' : ` diff=${(s.pixelDiff * 100).toFixed(2)}%`;
    lines.push(`  ${status.padEnd(11)} ${s.name}${diff}`);
  }
  lines.push('');
  lines.push('Files:');
  for (const f of report.fileChecks) {
    const tag = f.level === 'warn' ? 'WARN' : f.passed ? 'PASS' : 'FAIL';
    lines.push(`  ${tag.padEnd(5)} ${f.path}${f.note ? ` — ${f.note}` : ''}`);
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
    outDir: resolve(process.env.OUT_DIR ?? 'artifacts/verify-files'),
    baselineDir: resolve(process.env.BASELINE_DIR ?? ACCEPTANCE.baselineDir),
  };
  mkdirSync(opts.outDir, { recursive: true });

  let server = null;
  try {
    server = await ensureServer(opts.baseUrl, { serverCmd: process.env.SERVER_CMD ?? '' });
    const report = await runVerify(opts);
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
    console.error('[verify-files] 运行失败:', err);
    process.exitCode = 1;
  });
}