#!/usr/bin/env node
/**
 * runtime-acceptance.mjs — 可玩原型验收自测
 *
 * 职责：
 *   1. 启动本地开发服务器（默认 Vite，可用 ACCEPT_URL 复用已启动服务）
 *   2. 用 Playwright 按验收标准截图自测（桌面端 + 移动触控端）
 *   3. 手感确认：帧率采样、渲染非空白、输入响应、无控制台错误
 *   4. 触控兜底：移动端仿真 + touch 事件，确认触控可玩
 *
 * 用法：
 *   node scripts/runtime-acceptance.mjs
 *   ACCEPT_URL=http://localhost:5173 node scripts/runtime-acceptance.mjs
 *   PORT=6001 node scripts/runtime-acceptance.mjs
 *
 * 依赖：
 *   npm i -D playwright
 *   npx playwright install chromium
 *
 * 产物：artifacts/acceptance/（*.png、report.json、report.md）
 * 退出码：0 全部通过；1 存在失败项；2 环境/依赖问题
 */
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'artifacts', 'acceptance');

// ---------------- 配置 ----------------
const HOST = process.env.ACCEPT_HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 5173);
const BASE_URL = process.env.ACCEPT_URL || `http://${HOST}:${PORT}`;
const SERVER_COMMAND =
  process.env.SERVER_COMMAND || `npx vite --host ${HOST} --port ${PORT} --strictPort`;

const T = {
  serverBoot: 60_000, // 服务器启动超时
  pageLoad: 20_000,   // 页面加载超时
  settle: 2_500,      // 页面加载后等待游戏初始化
  feelSample: 2_000,  // 帧率采样时长
  inputSettle: 900,   // 输入后等待渲染
};

const MIN_FPS = 30;
const BLANK_VARIANCE = 4; // 亮度方差低于该值视为空白

// 控制台错误里可忽略的噪声（如自动请求 favicon 产生的 404）
const IGNORED_CONSOLE = [/favicon/i];

// ---------------- 工具 ----------------
const ts = () => new Date().toISOString().slice(11, 23);
const log = (...a) => console.log(`[${ts()}]`, ...a);
const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

const results = [];
const screenshots = [];

function record(check, status, detail = '') {
  results.push({ check, status, detail });
  console.log(`  [${status.toUpperCase()}] ${check}${detail ? ` — ${detail}` : ''}`);
}

async function fetchOk(url, ms = 2000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    return res.ok || res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitFor(url, timeoutMs = T.serverBoot, interval = 500) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fetchOk(url)) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  return false;
}

// ---------------- 开发服务器管理 ----------------
let server = null;

function spawnServer() {
  log('启动开发服务器:', SERVER_COMMAND);
  const child = spawn(SERVER_COMMAND, {
    cwd: ROOT,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });
  child.stdout.on('data', (d) => process.stdout.write(`  [server] ${d}`));
  child.stderr.on('data', (d) => process.stdout.write(`  [server] ${d}`));
  return child;
}

async function ensureServer() {
  if (process.env.ACCEPT_URL) {
    if (!(await fetchOk(BASE_URL))) {
      throw new Error(`ACCEPT_URL 无法访问: ${BASE_URL}`);
    }
    log('复用已启动服务:', BASE_URL);
    return BASE_URL;
  }
  if (await fetchOk(BASE_URL)) {
    log('检测到已在运行的服务:', BASE_URL);
    return BASE_URL;
  }
  server = spawnServer();
  if (!(await waitFor(BASE_URL))) {
    throw new Error(`开发服务器在 ${T.serverBoot / 1000}s 内未就绪: ${BASE_URL}`);
  }
  log('开发服务器就绪:', BASE_URL);
  return BASE_URL;
}

function stopServer() {
  if (!server) return;
  try {
    if (process.platform === 'win32' && server.pid) {
      spawn('taskkill', ['/pid', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      server.kill('SIGTERM');
    }
  } catch {
    /* 忽略清理失败 */
  }
  server = null;
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopServer();
    process.exit(130);
  });
}

// ---------------- Playwright 加载 ----------------
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    console.error('[FAIL] 未安装 playwright。请执行: npm i -D playwright && npx playwright install chromium');
    process.exit(2);
  }
}

// ---------------- 页面辅助 ----------------
function attachWatchers(page) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !IGNORED_CONSOLE.some((re) => re.test(m.text()))) {
      consoleErrors.push(m.text());
    }
  });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  return { consoleErrors, pageErrors };
}

async function shot(page, name) {
  const file = path.join(OUT_DIR, name);
  await page.screenshot({ path: file });
  screenshots.push(file);
  return file;
}

/**
 * 采样画布内容，判断是否真的在渲染（而非空白）。
 * 采用多策略：先 drawImage 到 2D 画布读像素，失败/空白再尝试 WebGL readPixels。
 */
async function sampleCanvas(page) {
  return page.evaluate((blankVariance) => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { found: false };

    const w = canvas.width || canvas.clientWidth;
    const h = canvas.height || canvas.clientHeight;

    const varianceFrom = (pixels) => {
      let min = 255;
      let max = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const lum =
          0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
        if (lum < min) min = lum;
        if (lum > max) max = lum;
      }
      return max - min;
    };

    // 策略 A：drawImage 到 2D 画布
    try {
      const c2 = document.createElement('canvas');
      c2.width = Math.max(1, Math.min(w, 80));
      c2.height = Math.max(1, Math.min(h, 80));
      const ctx = c2.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(canvas, 0, 0, c2.width, c2.height);
      const a = varianceFrom(ctx.getImageData(0, 0, c2.width, c2.height).data);
      if (a >= blankVariance) {
        return {
          found: true, width: w, height: h, blank: false,
          variance: Number(a.toFixed(1)), strategy: 'drawImage',
        };
      }
    } catch {
      /* 忽略，进入下一策略 */
    }

    // 策略 B：WebGL readPixels
    try {
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (gl) {
        const gw = gl.drawingBufferWidth;
        const gh = gl.drawingBufferHeight;
        const px = new Uint8Array(gw * gh * 4);
        gl.readPixels(0, 0, gw, gh, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const b = varianceFrom(px);
        if (b >= blankVariance) {
          return {
            found: true, width: gw, height: gh, blank: false,
            variance: Number(b.toFixed(1)), strategy: 'readPixels',
          };
        }
      }
    } catch {
      /* 忽略 */
    }

    return { found: true, width: w, height: h, blank: true, variance: 0, strategy: 'none' };
  }, BLANK_VARIANCE);
}

async function sampleFps(page, durationMs = T.feelSample) {
  return page.evaluate(async (dur) => {
    return await new Promise((resolve) => {
      let frames = 0;
      const start = performance.now();
      function tick(now) {
        frames += 1;
        if (now - start >= dur) {
          resolve({
            frames,
            elapsed: now - start,
            fps: Number(((frames * 1000) / (now - start)).toFixed(1)),
          });
          return;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }, durationMs);
}

/** 执行一组输入，返回画面是否发生变化（用于手感/触控响应判断） */
async function applyInputs(page, inputs) {
  const before = await page.screenshot();
  const beforeHash = sha1(before);
  for (const input of inputs) {
    if (input.type === 'key') {
      await page.keyboard.press(input.key);
    } else if (input.type === 'pointer') {
      await page.mouse.click(input.x, input.y);
    } else if (input.type === 'tap') {
      await page.touchscreen.tap(input.x, input.y);
    }
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(T.inputSettle);
  const after = await page.screenshot();
  return { changed: beforeHash !== sha1(after) };
}

// ---------------- 桌面端验收 ----------------
async function desktopChecks(browser, url) {
  log('\n== 桌面端验收 ==');
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const watchers = attachWatchers(page);

  await page.goto(url, { waitUntil: 'load', timeout: T.pageLoad });
  await page.waitForTimeout(T.settle);

  // 1. 画布渲染
  const canvas = await sampleCanvas(page);
  if (!canvas.found || !canvas.width) {
    record('游戏画布渲染', 'fail', '未找到有效 canvas');
  } else if (canvas.blank) {
    record('游戏画布渲染', 'warn', `canvas ${canvas.width}x${canvas.height} 但内容疑似空白，请查看截图人工复核`);
  } else {
    record('游戏画布渲染', 'pass', `canvas ${canvas.width}x${canvas.height}，亮度方差 ${canvas.variance}`);
  }

  await shot(page, 'desktop-boot.png');

  // 2. 帧率（手感）
  const fps = await sampleFps(page);
  if (fps.fps >= MIN_FPS) {
    record('帧率（手感）', 'pass', `${fps.fps} fps（阈值 ${MIN_FPS}）`);
  } else {
    record('帧率（手感）', 'warn', `${fps.fps} fps，低于 ${MIN_FPS}`);
  }

  // 3. 输入响应（手感）
  const resp = await applyInputs(page, [
    { type: 'key', key: 'ArrowRight' },
    { type: 'key', key: 'Space' },
    { type: 'pointer', x: 640, y: 360 },
  ]);
  if (resp.changed) {
    record('输入响应（手感）', 'pass', '键盘/鼠标输入后画面发生变化');
  } else {
    record('输入响应（手感）', 'warn', '输入后画面未变化（可能为静态场景，请人工复核）');
  }
  await shot(page, 'desktop-after-input.png');

  // 4. 控制台错误
  if (watchers.consoleErrors.length === 0 && watchers.pageErrors.length === 0) {
    record('控制台/页面错误', 'pass', '无错误');
  } else {
    const msgs = [...watchers.consoleErrors, ...watchers.pageErrors].slice(0, 3).join(' | ');
    record('控制台/页面错误', 'fail', msgs);
  }

  await context.close();
}

// ---------------- 触控兜底（移动端仿真） ----------------
async function touchChecks(browser, url, devices) {
  log('\n== 触控兜底（移动端仿真）==');
  const device = devices['Pixel 5'];
  const context = await browser.newContext({ ...device });
  const page = await context.newPage();
  const watchers = attachWatchers(page);

  await page.goto(url, { waitUntil: 'load', timeout: T.pageLoad });
  await page.waitForTimeout(T.settle);

  // 1. 画布渲染
  const canvas = await sampleCanvas(page);
  if (canvas.found && canvas.width && !canvas.blank) {
    record('触控端画布渲染', 'pass', `canvas ${canvas.width}x${canvas.height}`);
  } else if (canvas.found && canvas.blank) {
    record('触控端画布渲染', 'warn', '画布疑似空白，请查看截图人工复核');
  } else {
    record('触控端画布渲染', 'fail', '未找到 canvas');
  }

  await shot(page, 'touch-boot.png');

  // 2. 触控响应
  const vp = page.viewportSize() || { width: 393, height: 851 };
  const tx = Math.round(vp.width / 2);
  const ty = Math.round(vp.height / 2);
  const resp = await applyInputs(page, [
    { type: 'tap', x: tx, y: ty },
    { type: 'tap', x: tx - 60, y: ty - 60 },
  ]);
  if (resp.changed) {
    record('触控响应（兜底）', 'pass', 'touch 点击后画面发生变化');
  } else {
    record('触控响应（兜底）', 'warn', 'touch 点击后画面未变化（可能为静态场景，请人工复核）');
  }
  await shot(page, 'touch-after-tap.png');

  // 3. 控制台错误
  if (watchers.consoleErrors.length === 0 && watchers.pageErrors.length === 0) {
    record('触控端控制台错误', 'pass', '无错误');
  } else {
    const msgs = [...watchers.consoleErrors, ...watchers.pageErrors].slice(0, 3).join(' | ');
    record('触控端控制台错误', 'fail', msgs);
  }

  await context.close();
}

// ---------------- 报告 ----------------
async function writeReport({ url, pass, warn, fail }) {
  const json = {
    url,
    at: new Date().toISOString(),
    pass,
    warn,
    fail,
    results,
    screenshots: screenshots.map((s) => path.relative(ROOT, s)),
  };
  await writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(json, null, 2), 'utf8');

  const lines = [
    '# 可玩原型验收报告',
    '',
    `- 目标：${url}`,
    `- 时间：${json.at}`,
    `- 结果：通过 ${pass} / 警告 ${warn} / 失败 ${fail}`,
    '',
    '## 检查明细',
    '',
  ];
  for (const r of results) {
    lines.push(`- [${r.status.toUpperCase()}] ${r.check}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  lines.push('', '## 截图', '');
  for (const s of json.screenshots) {
    lines.push(`- \`${s}\``);
  }
  lines.push('');
  await writeFile(path.join(OUT_DIR, 'report.md'), lines.join('\n'), 'utf8');
}

// ---------------- 主流程 ----------------
async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  log('验收产物目录:', OUT_DIR);

  const url = await ensureServer();

  const pw = await loadPlaywright();
  const { chromium, devices } = pw;

  log('启动 Chromium…');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    await desktopChecks(browser, url);
    await touchChecks(browser, url, devices);
  } finally {
    await browser.close();
    stopServer();
  }

  const fail = results.filter((r) => r.status === 'fail').length;
  const warn = results.filter((r) => r.status === 'warn').length;
  const pass = results.filter((r) => r.status === 'pass').length;

  log(`\n== 汇总 == 通过 ${pass}，警告 ${warn}，失败 ${fail}`);
  await writeReport({ url, pass, warn, fail });

  const exitCode = fail > 0 ? 1 : 0;
  log(exitCode === 0 ? '验收通过' : '验收未通过');
  return exitCode;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    stopServer();
    console.error('[FAIL] 验收脚本执行失败:', err?.message || err);
    process.exitCode = 1;
  });