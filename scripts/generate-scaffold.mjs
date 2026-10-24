import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * 可玩原型验收自测
 * - 按验收标准做 Playwright 截图自测
 * - 手感确认（帧率 / 输入响应 / 触控兜底）
 *
 * 运行：
 *   node scripts/generate-scaffold.mjs
 *
 * 环境变量：
 *   GAME_URL       被测地址，默认 http://localhost:5173
 *   OUT_DIR        截图输出目录，默认 ./artifacts/acceptance
 *   SCENARIOS      逗号分隔的用例名，默认全部
 *   HEADED         非空则显示浏览器窗口
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const GAME_URL = process.env.GAME_URL ?? "http://localhost:5173";
const OUT_DIR = path.resolve(ROOT, process.env.OUT_DIR ?? "artifacts/acceptance");
const HEADED = Boolean(process.env.HEADED);
const ONLY = (process.env.SCENARIOS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const VIEWPORT = { width: 1280, height: 720 };

// ---------------------------------------------------------------------------
// 验收标准：每个用例 = 一段输入脚本 + 若干断言 + 截图
// ---------------------------------------------------------------------------
const SCENARIOS = [
  {
    name: "boot-canvas",
    description: "页面加载后画布应渲染出来（游戏已初始化）",
    async run({ page, shot, assert }) {
      await page.goto(GAME_URL, { waitUntil: "networkidle" });
      await page.waitForSelector("canvas", { timeout: 15_000 });
      assert(await canvasSize(page), "canvas 应有非零尺寸");
      await shot("boot-canvas");
    },
  },
  {
    name: "pointer-input",
    description: "指针（鼠标）点击/移动应触发游戏输入",
    async run({ page, shot, assert, frameDelta }) {
      await page.goto(GAME_URL, { waitUntil: "networkidle" });
      await page.waitForSelector("canvas", { timeout: 15_000 });
      const box = await canvasBox(page);
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.waitForTimeout(80);
      await page.mouse.move(cx + 60, cy + 40);
      await page.mouse.up();
      await shot("pointer-input");
      assert(await frameDelta(page) < 34, "帧间隔应 < 34ms（≥30fps）");
    },
  },
  {
    name: "touch-input",
    description: "触控兜底：touch 事件应可驱动游戏",
    async run({ page, shot, assert, frameDelta }) {
      await page.goto(GAME_URL, { waitUntil: "networkidle" });
      await page.waitForSelector("canvas", { timeout: 15_000 });
      const box = await canvasBox(page);
      const cx = box.x + box.width / 2;
      const cy = box.y + box.height / 2;
      // 使用 CDP 派发真实触摸事件，保证 hasTouch 上下文下走 touch 路径
      const client = await page.context().newCDPSession(page);
      await client.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: cx, y: cy }],
      });
      await page.waitForTimeout(80);
      await client.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: cx + 60, y: cy + 40 }],
      });
      await client.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await shot("touch-input");
      assert(await frameDelta(page) < 34, "帧间隔应 < 34ms（≥30fps）");
    },
  },
  {
    name: "feel-sweep",
    description: "手感确认：连续输入并统计平均帧间隔",
    async run({ page, shot, assert, frameStats }) {
      await page.goto(GAME_URL, { waitUntil: "networkidle" });
      await page.waitForSelector("canvas", { timeout: 15_000 });
      const box = await canvasBox(page);
      const { avg, p95 } = await frameStats(page, 120);
      assert(avg < 34, `平均帧间隔应 < 34ms，实测 ${avg.toFixed(1)}ms`);
      assert(p95 < 50, `p95 帧间隔应 < 50ms，实测 ${p95.toFixed(1)}ms`);
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(150);
      await page.mouse.up();
      await shot("feel-sweep");
    },
  },
];

// ---------------------------------------------------------------------------
// 页面内工具函数（在浏览器上下文执行）
// ---------------------------------------------------------------------------
async function canvasBox(page) {
  return page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) throw new Error("未找到 canvas");
    const r = c.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

async function canvasSize(page) {
  const box = await canvasBox(page);
  return box.width > 1 && box.height > 1;
}

/** 单次帧间隔（ms），用于断言实时流畅度 */
async function frameDelta(page) {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        let last = performance.now();
        requestAnimationFrame(function tick(t) {
          const dt = t - last;
          if (dt > 0) resolve(dt);
          else {
            last = t;
            requestAnimationFrame(tick);
          }
        });
      }),
  );
}

/** 采样 N 帧，返回 { avg, p95, fps } */
async function frameStats(page, frames = 120) {
  return page.evaluate(
    (n) =>
      new Promise((resolve) => {
        const deltas = [];
        let last = performance.now();
        let count = 0;
        function tick(t) {
          const dt = t - last;
          last = t;
          if (dt > 0 && dt < 200) deltas.push(dt);
          count += 1;
          if (count < n) requestAnimationFrame(tick);
          else {
            const sorted = [...deltas].sort((a, b) => a - b);
            const sum = deltas.reduce((a, b) => a + b, 0);
            const avg = sum / deltas.length;
            const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? avg;
            resolve({ avg, p95, fps: 1000 / avg });
          }
        }
        requestAnimationFrame(tick);
      }),
    frames,
  );
}

// ---------------------------------------------------------------------------
// 运行器
// ---------------------------------------------------------------------------
async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: !HEADED,
    args: ["--autoplay-policy=no-user-gesture-required"],
  });

  // hasTouch: true 启用触控兜底；移动设备视口供触控场景使用
  const context = await browser.newContext({
    viewport: VIEWPORT,
    hasTouch: true,
    isMobile: false,
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  const shot = async (name) => {
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    await page.screenshot({
      path: path.join(OUT_DIR, `${name}.png`),
      fullPage: true,
    });
  };

  const assert = (cond, msg) => {
    if (!cond) throw new Error(`断言失败：${msg}`);
  };

  const scenarios = ONLY.length
    ? SCENARIOS.filter((s) => ONLY.includes(s.name))
    : SCENARIOS;

  const results = [];
  for (const scenario of scenarios) {
    process.stdout.write(`\n[RUN] ${scenario.name} — ${scenario.description}\n`);
    try {
      await scenario.run({
        page,
        shot,
        assert,
        frameDelta,
        frameStats,
        errors,
      });
      if (errors.length) {
        throw new Error(`页面存在错误：\n  ${errors.join("\n  ")}`);
      }
      results.push({ name: scenario.name, ok: true });
      process.stdout.write(`[PASS] ${scenario.name}\n`);
    } catch (err) {
      results.push({ name: scenario.name, ok: false, error: err.message });
      process.stdout.write(`[FAIL] ${scenario.name}: ${err.message}\n`);
      await shot(`${scenario.name}-failure`).catch(() => {});
    } finally {
      errors.length = 0;
    }
  }

  await browser.close();

  const passed = results.filter((r) => r.ok).length;
  process.stdout.write(
    `\n验收结果：${passed}/${results.length} 通过，截图输出目录 ${OUT_DIR}\n`,
  );
  process.exitCode = passed === results.length ? 0 : 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});