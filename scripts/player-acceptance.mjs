#!/usr/bin/env node
/**
 * scripts/player-acceptance.mjs
 *
 * 可玩原型验收自测 —— 按验收标准做 Playwright 截图自测与手感确认，附带触控兜底。
 *
 * 用法：
 *   node scripts/player-acceptance.mjs [URL]
 *   ACCEPT_URL=http://localhost:5173 node scripts/player-acceptance.mjs
 *
 * 环境变量：
 *   ACCEPT_URL        被测地址（默认 http://localhost:5173）
 *   ACCEPT_WAIT_MS    首帧等待毫秒（默认 3000）
 *   ACCEPT_HEADLESS   设为 0 走有头模式（默认 1 无头）
 *   ACCEPT_SHOTS      设为 0 跳过截图（默认 1 截图）
 *   ACCEPT_TOUCH      Playwright 设备名，用于触控兜底（默认 iPhone 13）
 *   ACCEPT_SHOT_DIR   截图输出目录（默认 <root>/acceptance-shots）
 *
 * 验收标准：
 *   1. 页面无 page error / console error
 *   2. #game-container 内存在可见 canvas，且尺寸非零
 *   3. 游戏循环在跑（相隔 500ms 的 canvas 帧存在像素差异）
 *   4. 桌面与触控（模拟移动设备）两套环境均通过
 *   5. 触控事件（touchstart/touchmove/touchend）可派发且不报错
 */

import { chromium, devices } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const CONFIG = {
  url: process.env.ACCEPT_URL || process.argv[2] || 'http://localhost:5173',
  waitMs: Number(process.env.ACCEPT_WAIT_MS || 3000),
  headless: process.env.ACCEPT_HEADLESS !== '0',
  screenshots: process.env.ACCEPT_SHOTS !== '0',
  touchDevice: process.env.ACCEPT_TOUCH || 'iPhone 13',
  shotDir: process.env.ACCEPT_SHOT_DIR || path.join(ROOT, 'acceptance-shots'),
};

const results = [];
let shotSeq = 0;

const log = (msg) => console.log(`[acceptance] ${msg}`);
const warn = (msg) => console.warn(`[acceptance][warn] ${msg}`);

/** 收集页面与 console 错误 */
function attachErrorCollector(page, bucket) {
  page.on('pageerror', (err) => {
    bucket.push(`pageerror: ${err.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      bucket.push(`console.error: ${msg.text()}`);
    }
  });
}

/** 等待 canvas 出现并返回其包围盒 */
async function waitForCanvas(page, timeout = 10000) {
  await page.waitForSelector('#game-container canvas', { timeout });
  return page.locator('#game-container canvas').boundingBox();
}

/** 帧差检测：两帧 buffer 不同则视为循环在跑 */
function buffersDiffer(a, b) {
  if (!a || !b || a.length !== b.length) return true;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return true;
  }
  return false;
}

async function shoot(page, name) {
  if (!CONFIG.screenshots) return null;
  await mkdir(CONFIG.shotDir, { recursive: true });
  shotSeq += 1;
  const file = path.join(CONFIG.shotDir, `${String(shotSeq).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

/** 桌面环境自测 */
async function testDesktop(browser) {
  const bucket = [];
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  attachErrorCollector(page, bucket);

  log(`加载桌面环境: ${CONFIG.url}`);
  await page.goto(CONFIG.url, { waitUntil: 'load' });
  await page.waitForTimeout(CONFIG.waitMs);

  let canvasBox;
  try {
    canvasBox = await waitForCanvas(page);
  } catch {
    await context.close();
    return {
      env: 'desktop',
      pass: false,
      checks: [
        { name: '页面无错误', pass: bucket.length === 0, detail: bucket.join('; ') || 'ok' },
        { name: 'canvas 存在且可见', pass: false, detail: '未在 #game-container 中找到 canvas' },
        { name: '游戏循环运行中', pass: false, detail: 'canvas 缺失，跳过帧差检测' },
      ],
    };
  }

  const frameA = await page.locator('#game-container canvas').screenshot();
  await page.waitForTimeout(500);
  const frameB = await page.locator('#game-container canvas').screenshot();
  const animating = buffersDiffer(frameA, frameB);

  const shot = await shoot(page, 'desktop');

  const checks = [
    { name: '页面无错误', pass: bucket.length === 0, detail: bucket.join('; ') || 'ok' },
    {
      name: 'canvas 存在且可见',
      pass: Boolean(canvasBox && canvasBox.width > 0 && canvasBox.height > 0),
      detail: canvasBox
        ? `${Math.round(canvasBox.width)}x${Math.round(canvasBox.height)}`
        : '无包围盒',
    },
    {
      name: '游戏循环运行中（帧差检测）',
      pass: animating,
      detail: animating ? '两帧存在像素差异' : '两帧画面相同，疑似未渲染',
    },
  ];

  await context.close();
  return { env: 'desktop', pass: checks.every((c) => c.pass), checks, shot };
}

/** 触控兜底：模拟移动设备，验证触控事件可派发 */
async function testTouch(browser) {
  const bucket = [];
  const device = devices[CONFIG.touchDevice] || devices['iPhone 13'];
  const context = await browser.newContext({
    ...device,
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  attachErrorCollector(page, bucket);

  log(`加载触控环境: ${CONFIG.url} (${CONFIG.touchDevice})`);
  await page.goto(CONFIG.url, { waitUntil: 'load' });
  await page.waitForTimeout(CONFIG.waitMs);

  let canvasBox;
  try {
    canvasBox = await waitForCanvas(page);
  } catch {
    await context.close();
    return {
      env: 'touch',
      pass: false,
      checks: [
        { name: '页面无错误', pass: bucket.length === 0, detail: bucket.join('; ') || 'ok' },
        { name: 'canvas 存在且可见', pass: false, detail: '未找到 canvas' },
        { name: '触控事件派发无错误', pass: false, detail: 'canvas 缺失，跳过触控派发' },
      ],
    };
  }

  const cx = canvasBox.x + canvasBox.width / 2;
  const cy = canvasBox.y + canvasBox.height / 2;

  let touchOk = true;
  let touchDetail = 'touchstart/touchmove/touchend 均派发成功';
  try {
    await page.touchscreen.tap(cx, cy);
    await page.dispatchEvent('#game-container canvas', 'touchstart', {
      touches: [{ identifier: 1, clientX: cx, clientY: cy }],
    });
    await page.dispatchEvent('#game-container canvas', 'touchmove', {
      touches: [{ identifier: 1, clientX: cx + 30, clientY: cy + 30 }],
    });
    await page.dispatchEvent('#game-container canvas', 'touchend', {
      touches: [],
      changedTouches: [{ identifier: 1, clientX: cx + 30, clientY: cy + 30 }],
    });
  } catch (err) {
    touchOk = false;
    touchDetail = `触控派发失败: ${err.message}`;
  }
  await page.waitForTimeout(300);

  const frameA = await page.locator('#game-container canvas').screenshot();
  await page.waitForTimeout(500);
  const frameB = await page.locator('#game-container canvas').screenshot();
  const animating = buffersDiffer(frameA, frameB);

  const shot = await shoot(page, 'touch');

  const checks = [
    { name: '页面无错误', pass: bucket.length === 0, detail: bucket.join('; ') || 'ok' },
    {
      name: 'canvas 存在且可见',
      pass: Boolean(canvasBox && canvasBox.width > 0 && canvasBox.height > 0),
      detail: canvasBox
        ? `${Math.round(canvasBox.width)}x${Math.round(canvasBox.height)}`
        : '无包围盒',
    },
    { name: '触控事件派发无错误', pass: touchOk, detail: touchDetail },
    {
      name: '游戏循环运行中（帧差检测）',
      pass: animating,
      detail: animating ? '两帧存在像素差异' : '两帧画面相同，疑似未渲染',
    },
  ];

  await context.close();
  return { env: 'touch', pass: checks.every((c) => c.pass), checks, shot };
}

function printReport() {
  const allPass = results.every((r) => r.pass);
  console.log('\n========== 可玩原型验收报告 ==========');
  for (const r of results) {
    console.log(`\n[${r.env}] ${r.pass ? 'PASS' : 'FAIL'}`);
    for (const c of r.checks) {
      console.log(`  ${c.pass ? '√' : '×'} ${c.name} — ${c.detail}`);
    }
    if (r.shot) console.log(`  📷 ${r.shot}`);
  }
  console.log('\n======================================');
  console.log(`总结: ${allPass ? '全部通过' : '存在未通过项'}`);
  return allPass;
}

async function main() {
  const browser = await chromium.launch({ headless: CONFIG.headless });
  try {
    results.push(await testDesktop(browser));
    results.push(await testTouch(browser));
  } finally {
    await browser.close();
  }

  const report = {
    url: CONFIG.url,
    device: CONFIG.touchDevice,
    at: new Date().toISOString(),
    results,
    pass: results.every((r) => r.pass),
  };
  await mkdir(CONFIG.shotDir, { recursive: true });
  await writeFile(
    path.join(CONFIG.shotDir, 'report.json'),
    JSON.stringify(report, null, 2),
    'utf8',
  );

  const ok = printReport();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('[acceptance] 致命错误:', err);
  process.exit(2);
});