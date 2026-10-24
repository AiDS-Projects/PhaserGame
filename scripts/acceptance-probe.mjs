#!/usr/bin/env node
/**
 * acceptance-probe.mjs — 可玩原型验收自测
 *
 * 按验收标准执行 Playwright 截图自测 + 手感确认，附带触控兜底。
 * 产物写入 OUT_DIR（默认 artifacts/acceptance-probe）：
 *   report.json / 01-boot.png / 02-input.png / 03-touch.png
 *
 * 运行前提：
 *   - 已启动游戏 dev server（默认 http://localhost:5173）
 *   - npm i -D playwright && npx playwright install chromium
 *
 * 用法：
 *   node scripts/acceptance-probe.mjs
 *   BASE_URL=http://localhost:4173 OUT_DIR=artifacts/probe node scripts/acceptance-probe.mjs
 */

import { chromium, devices } from 'playwright';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const OUT_DIR = path.resolve(process.env.OUT_DIR || 'artifacts/acceptance-probe');
const HEADLESS = process.env.HEADLESS !== '0';
const FPS_THRESHOLD = Number(process.env.FPS_THRESHOLD || 10);
const GOTO_TIMEOUT = Number(process.env.GOTO_TIMEOUT || 30000);
const CANVAS_TIMEOUT = Number(process.env.CANVAS_TIMEOUT || 15000);

const DESKTOP_VIEWPORT = { width: 1280, height: 720 };
const TOUCH_DEVICE = devices['iPhone 13'];

const results = [];

function record(id, label, pass, note = '', evidence = {}) {
  results.push({ id, label, pass: Boolean(pass), note, evidence });
  return Boolean(pass);
}

function attachErrorCapture(page, sink) {
  page.on('console', (msg) => {
    if (msg.type() === 'error') sink.push(`[console.error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => sink.push(`[pageerror] ${err.message}`));
}

async function getCanvasInfo(page) {
  return page.evaluate(() => {
    const c = document.querySelector('#game-container canvas');
    if (!c) return null;
    return {
      width: c.width,
      height: c.height,
      cssWidth: getComputedStyle(c).width,
      cssHeight: getComputedStyle(c).height,
      hasWebGL: Boolean(c.getContext('webgl2') || c.getContext('webgl')),
    };
  });
}

async function measureFps(page, seconds = 2) {
  return page.evaluate(
    (secs) =>
      new Promise((resolve) => {
        let frames = 0;
        const start = performance.now();
        const tick = () => {
          frames += 1;
          if (performance.now() - start >= secs * 1000) {
            resolve(Number((frames / secs).toFixed(1)));
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
    seconds
  );
}

async function syntheticTouch(page, x, y) {
  await page.evaluate(
    ({ x, y }) => {
      const target = document.elementFromPoint(x, y) || document.body;
      const opts = (t) => ({
        bubbles: true,
        cancelable: true,
        composed: true,
        touches: [t],
        targetTouches: [t],
        changedTouches: [t],
      });
      const make = (px, py) =>
        new Touch({
          identifier: Date.now(),
          target,
          clientX: px,
          clientY: py,
          screenX: px,
          screenY: py,
          pageX: px,
          pageY: py,
          radiusX: 1,
          radiusY: 1,
          force: 1,
        });
      const start = make(x, y);
      target.dispatchEvent(new TouchEvent('touchstart', opts(start)));
      const move = make(x + 10, y + 10);
      target.dispatchEvent(new TouchEvent('touchmove', opts(move)));
      target.dispatchEvent(new TouchEvent('touchend', opts(move)));
    },
    { x, y }
  );
}

async function waitForGame(page) {
  await page.waitForSelector('#game-container canvas', { timeout: CANVAS_TIMEOUT });
  const ready = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const deadline = Date.now() + 8000;
        const probe = () => {
          const flag = window.__GAME_READY__ ?? window.__PHASER_READY__ ?? null;
          if (flag || Date.now() > deadline) resolve(Boolean(flag));
          else setTimeout(probe, 100);
        };
        probe();
      })
  );
  if (!ready) await page.waitForTimeout(1200);
  return ready;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: HEADLESS });
  const report = {
    baseUrl: BASE_URL,
    at: new Date().toISOString(),
    criteria: [],
    artifacts: {},
    handFeelChecklist: [],
  };

  try {
    // ---------- 桌面：启动 + 渲染 + 输入 ----------
    const desktopErrors = [];
    const ctx = await browser.newContext({ viewport: DESKTOP_VIEWPORT });
    const page = await ctx.newPage();
    attachErrorCapture(page, desktopErrors);

    let bootOk = false;
    let canvas = null;
    try {
      await page.goto(BASE_URL, { waitUntil: 'load', timeout: GOTO_TIMEOUT });
      canvas = await getCanvasInfo(page);
      if (canvas) {
        bootOk = true;
        record(
          'boot',
          '页面加载 / Canvas 挂载',
          true,
          `canvas ${canvas.width}x${canvas.height} (css ${canvas.cssWidth}x${canvas.cssHeight})`,
          canvas
        );
      } else {
        record('boot', '页面加载 / Canvas 挂载', false, '未找到 #game-container canvas');
      }
    } catch (e) {
      record('boot', '页面加载 / Canvas 挂载', false, `无法访问 ${BASE_URL}: ${e.message}`);
    }

    if (bootOk) {
      const ready = await waitForGame(page).catch(() => false);

      // 首帧截图 + 非黑屏启发式（纯黑 PNG 通常远小于渲染帧）
      try {
        const bootShot = path.join(OUT_DIR, '01-boot.png');
        await page.screenshot({ path: bootShot });
        report.artifacts.boot = bootShot;
        const bootStat = await stat(bootShot);
        const renderPass = bootStat.size > 2000;
        record(
          'render',
          '首帧渲染（非黑屏启发式）',
          renderPass,
          `PNG ${bootStat.size}B, ready=${ready}`,
          { ready, bytes: bootStat.size }
        );
      } catch (e) {
        record('render', '首帧渲染', false, e.message);
      }

      const fps = await measureFps(page, 2).catch(() => 0);
      record('fps', `帧率 ≥ ${FPS_THRESHOLD} fps`, fps >= FPS_THRESHOLD, `avg ${fps} fps`, { fps });

      const beforeInput = desktopErrors.length;
      const cx = Math.floor(DESKTOP_VIEWPORT.width / 2);
      const cy = Math.floor(DESKTOP_VIEWPORT.height / 2);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('Space');
      await page.keyboard.press('ArrowLeft');
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(300);
      const inputShot = path.join(OUT_DIR, '02-input.png');
      await page.screenshot({ path: inputShot });
      report.artifacts.input = inputShot;
      const newInputErrors = desktopErrors.length - beforeInput;
      record('input', '键盘/指针输入无报错', newInputErrors === 0, `新增错误 ${newInputErrors} 条`, {
        newErrors: desktopErrors.slice(beforeInput),
      });
    } else {
      record('render', '首帧渲染', false, '跳过：页面未加载');
      record('fps', '帧率检测', false, '跳过：页面未加载');
      record('input', '键盘/指针输入', false, '跳过：页面未加载');
    }

    record('desktop-no-crash', '桌面端无运行时错误', desktopErrors.length === 0, `${desktopErrors.length} 条错误`, {
      errors: desktopErrors.slice(0, 10),
    });
    await ctx.close();

    // ---------- 移动端：真实触屏 + 合成兜底 ----------
    const touchErrors = [];
    const mctx = await browser.newContext({ ...TOUCH_DEVICE });
    const mpage = await mctx.newPage();
    attachErrorCapture(mpage, touchErrors);
    try {
      await mpage.goto(BASE_URL, { waitUntil: 'load', timeout: GOTO_TIMEOUT });
      await mpage.waitForSelector('#game-container canvas', { timeout: CANVAS_TIMEOUT });
      const mcanvas = await getCanvasInfo(mpage);
      const vp = mpage.viewportSize();
      const tx = Math.floor((vp?.width || 390) / 2);
      const ty = Math.floor((vp?.height || 664) / 2);
      const beforeTouch = touchErrors.length;
      if (mpage.touchscreen) {
        await mpage.touchscreen.tap(tx, ty);
      }
      // 兜底：合成 TouchEvent，确保触屏 API 不可用时仍覆盖触控路径
      await syntheticTouch(mpage, tx, ty);
      await mpage.waitForTimeout(300);
      const touchShot = path.join(OUT_DIR, '03-touch.png');
      await mpage.screenshot({ path: touchShot });
      report.artifacts.touch = touchShot;
      const newTouchErrors = touchErrors.length - beforeTouch;
      record('touch', '触控输入（真实触屏 + 合成兜底）无报错', newTouchErrors === 0, `新增错误 ${newTouchErrors} 条`, {
        newErrors: touchErrors.slice(beforeTouch),
        canvas: mcanvas,
      });
    } catch (e) {
      record('touch', '触控输入', false, e.message);
    }
    await mctx.close();
  } finally {
    await browser.close();
  }

  report.criteria = results;
  report.handFeelChecklist = [
    '帧率稳定性：肉眼确认无周期性卡顿（参考 report 中 avg fps）',
    '输入延迟：按下方向键/点击后角色或场景是否即时响应',
    '触控手感：移动端拖拽/点按是否跟手、无跳变',
    '画面表现：截图 01~03 是否渲染正常（无黑屏/花屏/错位）',
  ];

  const passed = results.filter((r) => r.pass).length;
  report.summary = { total: results.length, passed, failed: results.length - passed, ok: passed === results.length };

  await writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2), 'utf8');

  console.log(`\n验收自测结果 (${report.summary.passed}/${report.summary.total} 通过) — ${BASE_URL}\n`);
  for (const r of results) {
    console.log(`${r.pass ? '✓' : '✗'} ${r.label}${r.note ? ` — ${r.note}` : ''}`);
  }
  console.log(`\n产物目录: ${OUT_DIR}`);
  console.log('手感确认清单:');
  report.handFeelChecklist.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));

  process.exit(report.summary.ok ? 0 : 1);
}

main().catch((e) => {
  console.error('acceptance-probe 运行失败:', e);
  process.exit(2);
});