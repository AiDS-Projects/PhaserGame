/**
 * acceptanceProbe.ts —— 可玩原型验收自测（Playwright 截图自测 + 手感确认 + 触控兜底）
 *
 * 职责：
 *  1. 截图自测：驱动 Chromium 打开原型，分别以桌面 / 触控两套视口截图，并与基线
 *     （baselineDir）做像素级回归比对（阈值 ACCEPTANCE.maxPixelDiff），超出即判失败；
 *     基线缺失时自动建立基线（updateBaselines）。
 *  2. 手感确认：在页面内采样 requestAnimationFrame，统计平均 FPS 与最大帧间隔（jank），
 *     并读取 Phaser 实际帧率（window.__ACCEPTANCE__，若存在）作为交叉信号。
 *  3. 触控兜底：以 hasTouch + isMobile + ?touch=1 模拟触屏，确认触控 UI 激活，
 *     并通过真实 tap 驱动跳跃 / 冲刺，验证 pointer/touch 事件链路可用。
 *
 * 运行时钩子契约（与现有代码对齐）：
 *  - window.__game          由 index.html / main.ts 暴露（getState/jump/dash/moveLeft/moveRight/showTouch）
 *  - window.__ACCEPTANCE__  由 BootScene 暴露（report/isTouchFallbackActive）
 *
 * 运行依赖（devDependencies）：
 *  - playwright      提供 chromium 与截图能力
 *  - pngjs           像素级截图比对（playwright 的传递依赖，类型用 @types/pngjs）
 *
 * 用法：
 *   npx tsx src/acceptance/acceptanceProbe.ts
 *   BASE_URL=http://127.0.0.1:8080 npx tsx src/acceptance/acceptanceProbe.ts
 *   BASE_URL=http://127.0.0.1:8080 HEADED=1 npx tsx src/acceptance/acceptanceProbe.ts
 */

import { chromium, type Browser, type Page } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACCEPTANCE,
  GAME_HEIGHT,
  GAME_WIDTH,
  TOUCH_BUTTONS,
  TOUCH_QUERY_PARAM,
} from '../constants';
import { getLevelSummary, type LevelSummary } from '../level/levelLayout';

// pngjs 是 playwright 的 Node-only 传递依赖，主项目（浏览器）tsc 编译面无法解析其类型；
// 改为运行时 require 并以内联最小结构声明返回类型，规避 TS2307 且不影响像素比对逻辑。
const require = createRequire(import.meta.url);
const PNG = require('pngjs') as {
  sync: { read(buffer: Buffer): { width: number; height: number; data: Buffer } };
};

// ---------------------------------------------------------------------------
// 运行时钩子类型（与 index.html / main.ts 的 window.__game、BootScene 的
// window.__ACCEPTANCE__ 对齐；仅用于编译期类型，运行期在浏览器内读取）
// ---------------------------------------------------------------------------

export interface GameStateSnapshot {
  jumpCount: number;
  maxJumps: number;
  isGrounded: boolean;
  dashCooldownRemaining: number;
  dashRemaining: number;
  invincibleRemaining: number;
  facing: number;
}

export interface GameHooks {
  getState: () => GameStateSnapshot | null;
  jump: () => boolean;
  dash: () => boolean;
  moveLeft: (on: boolean) => void;
  moveRight: (on: boolean) => void;
  showTouch: boolean;
}

export interface AcceptanceReport {
  ready: boolean;
  sceneKey: string;
  inputMode: 'touch' | 'desktop';
  isTouchDevice: boolean;
  touchFallbackActive: boolean;
  fps: number;
  scaleMode: string;
  width: number;
  height: number;
  bootedAt: number;
}

/** 浏览器内 window 的增强视图（evaluate 回调内使用，类型在编译期擦除） */
type ProbeWindow = Window & {
  __game?: GameHooks;
  __ACCEPTANCE__?: {
    report: () => AcceptanceReport;
    isTouchFallbackActive: () => boolean;
  };
};

// ---------------------------------------------------------------------------
// 结果类型
// ---------------------------------------------------------------------------

export interface ProbeCheck {
  name: string;
  passed: boolean;
  detail?: string;
}

export interface ScreenshotOutcome {
  name: string;
  path: string;
  matched: boolean;
  pixelDiff: number;
  baselineCreated?: boolean;
  baselineMissing?: boolean;
}

export interface FeelMetrics {
  avgFps: number;
  maxGapMs: number;
  frames: number;
  elapsedMs: number;
  phaserFps: number | null;
}

export interface ProbeReport {
  baseUrl: string;
  passed: boolean;
  checks: ProbeCheck[];
  screenshots: ScreenshotOutcome[];
  feel: FeelMetrics;
  levelSummary: LevelSummary;
}

export interface ProbeOptions {
  /** 游戏服务地址（默认取 BASE_URL 或 http://localhost:5173） */
  baseUrl?: string;
  /** 是否无头运行（默认 true；设 HEADED=1 可观察实际手感） */
  headless?: boolean;
  /** 截屏输出目录（默认 ACCEPTANCE.screenshotDir） */
  screenshotDir?: string;
  /** 基线目录（默认 ACCEPTANCE.baselineDir） */
  baselineDir?: string;
  /** 基线缺失时是否自动建立（默认 true） */
  updateBaselines?: boolean;
  /** 手感 FPS 下限（低于即失败，默认 30） */
  minFps?: number;
}

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 像素级比对两张 PNG，返回差异像素占比（0~1）。尺寸不一致视为完全不同。 */
function computePixelDiff(actual: Buffer, baseline: Buffer): number {
  if (actual.equals(baseline)) {
    return 0;
  }
  const a = PNG.sync.read(actual);
  const b = PNG.sync.read(baseline);
  if (a.width !== b.width || a.height !== b.height) {
    return 1;
  }
  const total = a.width * a.height;
  let changed = 0;
  for (let i = 0; i < total; i++) {
    const o = i * 4;
    const dr = Math.abs(a.data[o] - b.data[o]);
    const dg = Math.abs(a.data[o + 1] - b.data[o + 1]);
    const db = Math.abs(a.data[o + 2] - b.data[o + 2]);
    if (dr + dg + db > 48) {
      changed++;
    }
  }
  return changed / total;
}

/**
 * 手感采样：在页面内用 rAF 统计约 1 秒的平均 FPS 与最大帧间隔（jank 信号），
 * 并读取 Phaser 实际帧率（若 window.__ACCEPTANCE__ 存在）。
 */
async function measureFeel(page: Page): Promise<FeelMetrics> {
  const raf = await page.evaluate(async () => {
    let frames = 0;
    let last = performance.now();
    let maxGap = 0;
    const start = last;
    await new Promise<void>((resolvePromise) => {
      const loop = (t: number) => {
        const gap = t - last;
        if (gap > maxGap) {
          maxGap = gap;
        }
        last = t;
        frames++;
        if (t - start >= 1000) {
          resolvePromise();
        } else {
          requestAnimationFrame(loop);
        }
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

  const phaserFps = await page.evaluate(() => {
    const w = window as unknown as ProbeWindow;
    return w.__ACCEPTANCE__ ? Math.round(w.__ACCEPTANCE__.report().fps) : null;
  });

  return { ...raf, phaserFps };
}

/**
 * 触控点击（触控兜底验证）：优先点击 DOM 按钮（index.html 的 #btn-*）；
 * 若无 DOM 按钮（main.ts 的 Phaser 画布按钮），则把逻辑画布坐标映射到视口后
 * 用 touchscreen.tap 点击。返回是否成功触发点击。
 */
async function tapControl(
  page: Page,
  domId: string,
  layout: { x: number; y: number },
): Promise<boolean> {
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
      if (!canvas) {
        return null;
      }
      const r = canvas.getBoundingClientRect();
      const scale = Math.min(r.width / lw, r.height / lh);
      return {
        x: r.left + (r.width - lw * scale) / 2 + bx * scale,
        y: r.top + (r.height - lh * scale) / 2 + by * scale,
      };
    },
    [GAME_WIDTH, GAME_HEIGHT, layout.x, layout.y] as const,
  );

  if (!point) {
    return false;
  }
  await page.touchscreen.tap(point.x, point.y);
  return true;
}

// ---------------------------------------------------------------------------
// 验收探针
// ---------------------------------------------------------------------------

export class AcceptanceProbe {
  private readonly opts: Required<ProbeOptions>;

  constructor(options: ProbeOptions = {}) {
    this.opts = {
      baseUrl: options.baseUrl ?? process.env.BASE_URL ?? 'http://localhost:5173',
      headless: options.headless ?? !process.env.HEADED,
      screenshotDir: resolve(options.screenshotDir ?? ACCEPTANCE.screenshotDir),
      baselineDir: resolve(options.baselineDir ?? ACCEPTANCE.baselineDir),
      updateBaselines: options.updateBaselines ?? true,
      minFps: options.minFps ?? 30,
    };
  }

  async run(): Promise<ProbeReport> {
    const browser = await chromium.launch({ headless: this.opts.headless });
    try {
      const checks: ProbeCheck[] = [];
      const screenshots: ScreenshotOutcome[] = [];

      // 1. 关卡布局自洽（Node 侧纯数据校验，无需浏览器）
      const levelSummary = getLevelSummary();
      checks.push({
        name: 'level-layout',
        passed: levelSummary.issues.length === 0,
        detail: levelSummary.issues.length
          ? levelSummary.issues.join('; ')
          : `solids=${levelSummary.solidCount} hazards=${levelSummary.hazardCount} goal=${levelSummary.goalCount}`,
      });

      // 2. 桌面视口：加载 + 逻辑自测 + 截图 + 手感
      const ctx = await browser.newContext({
        viewport: { width: ACCEPTANCE.viewport.width, height: ACCEPTANCE.viewport.height },
      });
      const page = await ctx.newPage();
      const pageErrors: string[] = [];
      page.on('pageerror', (err) => pageErrors.push(String(err)));

      await page.goto(this.opts.baseUrl, {
        waitUntil: 'load',
        timeout: ACCEPTANCE.loadTimeoutMs,
      });

      const booted = await this.waitForGame(page);
      const canvasOk = await this.canvasReady(page);
      checks.push({ name: 'boot', passed: booted, detail: this.opts.baseUrl });
      checks.push({
        name: 'canvas',
        passed: canvasOk,
        detail: canvasOk ? 'canvas rendered' : 'no canvas',
      });

      if (booted) {
        checks.push(...(await this.runLogicChecks(page)));
      }

      checks.push({
        name: 'no-runtime-errors',
        passed: pageErrors.length === 0,
        detail: pageErrors.join('; '),
      });

      await page.waitForTimeout(ACCEPTANCE.settleDelayMs);
      screenshots.push(await this.capture(page, 'desktop'));

      const feel = await measureFeel(page);
      checks.push({
        name: 'feel-fps',
        passed: feel.avgFps >= this.opts.minFps,
        detail: `${feel.avgFps.toFixed(1)} fps (min ${this.opts.minFps})`,
      });
      checks.push({
        name: 'feel-jank',
        passed: feel.maxGapMs <= 100,
        detail: `max frame gap ${feel.maxGapMs} ms`,
      });

      await ctx.close();

      // 3. 触控兜底：触屏仿真 + 真实 tap + 截图
      screenshots.push(...(await this.runTouchChecks(browser, checks)));

      const passed =
        checks.every((c) => c.passed) &&
        screenshots.every((s) => s.matched) &&
        feel.avgFps >= this.opts.minFps;

      return { baseUrl: this.opts.baseUrl, passed, checks, screenshots, feel, levelSummary };
    } finally {
      await browser.close();
    }
  }

  /** 桌面视口下的可玩性逻辑自测：初始态 / 跳跃 / 二段跳 / 跳跃上限 / 冲刺 / 冷却 / 朝向 */
  private async runLogicChecks(page: Page): Promise<ProbeCheck[]> {
    const checks: ProbeCheck[] = [];

    const s0 = await this.getState(page);
    checks.push({
      name: 'initial-state',
      passed: !!s0 && s0.isGrounded && s0.jumpCount === 0 && s0.dashCooldownRemaining === 0,
      detail: s0 ? JSON.stringify(s0) : 'state unavailable',
    });

    const jumped = await page.evaluate(() => (window as unknown as ProbeWindow).__game!.jump());
    const s1 = await this.getState(page);
    checks.push({
      name: 'jump',
      passed: jumped === true && !!s1 && s1.jumpCount === 1 && !s1.isGrounded,
      detail: `jump()=${jumped} jumpCount=${s1?.jumpCount}`,
    });

    const doubleJumped = await page.evaluate(
      () => (window as unknown as ProbeWindow).__game!.jump(),
    );
    const s2 = await this.getState(page);
    checks.push({
      name: 'double-jump',
      passed: doubleJumped === true && !!s2 && s2.jumpCount === 2,
      detail: `jump()=${doubleJumped} jumpCount=${s2?.jumpCount}`,
    });

    const capped = await page.evaluate(() => (window as unknown as ProbeWindow).__game!.jump());
    const s3 = await this.getState(page);
    checks.push({
      name: 'jump-cap',
      passed: capped === false && !!s3 && s3.jumpCount === 2,
      detail: `jump()=${capped} jumpCount=${s3?.jumpCount}`,
    });

    await this.waitForGrounded(page);

    const dashed = await page.evaluate(() => (window as unknown as ProbeWindow).__game!.dash());
    const s4 = await this.getState(page);
    checks.push({
      name: 'dash',
      passed: dashed === true && !!s4 && s4.dashCooldownRemaining > 0,
      detail: `dash()=${dashed} cd=${s4?.dashCooldownRemaining}ms`,
    });

    const dashedAgain = await page.evaluate(
      () => (window as unknown as ProbeWindow).__game!.dash(),
    );
    checks.push({
      name: 'dash-cooldown',
      passed: dashedAgain === false,
      detail: `dash()=${dashedAgain} (expected false during cooldown)`,
    });

    await page.evaluate(() => {
      const g = (window as unknown as ProbeWindow).__game!;
      g.moveLeft(true);
      g.moveRight(false);
    });
    await page.waitForTimeout(120);
    const left = await this.getState(page);

    await page.evaluate(() => {
      const g = (window as unknown as ProbeWindow).__game!;
      g.moveLeft(false);
      g.moveRight(true);
    });
    await page.waitForTimeout(120);
    const right = await this.getState(page);

    await page.evaluate(() => {
      const g = (window as unknown as ProbeWindow).__game!;
      g.moveLeft(false);
      g.moveRight(false);
    });

    checks.push({
      name: 'move-facing',
      passed: left?.facing === -1 && right?.facing === 1,
      detail: `left=${left?.facing} right=${right?.facing}`,
    });

    return checks;
  }

  /** 触控兜底：触屏仿真 + 真实 tap + 截图 */
  private async runTouchChecks(
    browser: Browser,
    checks: ProbeCheck[],
  ): Promise<ScreenshotOutcome[]> {
    const screenshots: ScreenshotOutcome[] = [];
    const ctx = await browser.newContext({
      viewport: { width: ACCEPTANCE.touchViewport.width, height: ACCEPTANCE.touchViewport.height },
      hasTouch: true,
      isMobile: true,
    });
    try {
      const page = await ctx.newPage();
      const sep = this.opts.baseUrl.includes('?') ? '&' : '?';
      const url = `${this.opts.baseUrl}${sep}${TOUCH_QUERY_PARAM}=1`;
      await page.goto(url, { waitUntil: 'load', timeout: ACCEPTANCE.loadTimeoutMs });

      const booted = await this.waitForGame(page);
      checks.push({ name: 'touch-boot', passed: booted, detail: url });

      const showTouch = await page.evaluate(
        () => (window as unknown as ProbeWindow).__game?.showTouch === true,
      );
      const ui = await page.evaluate(() => {
        const controls = document.getElementById('touch-controls');
        const domVisible = !!controls && getComputedStyle(controls).display !== 'none';
        const fallbackActive =
          (window as unknown as ProbeWindow).__ACCEPTANCE__?.isTouchFallbackActive() ?? false;
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
      screenshots.push(await this.capture(page, 'touch'));

      const tappedJump = await tapControl(page, 'btn-jump', TOUCH_BUTTONS.jump);
      const jumped = await page
        .waitForFunction(
          () => (window as unknown as ProbeWindow).__game!.getState()!.jumpCount >= 1,
          undefined,
          { timeout: 3000 },
        )
        .then(() => true)
        .catch(() => false);
      checks.push({
        name: 'touch-jump',
        passed: tappedJump && jumped,
        detail: `tapped=${tappedJump} jumpCount=${(await this.getState(page))?.jumpCount}`,
      });

      const tappedDash = await tapControl(page, 'btn-dash', TOUCH_BUTTONS.dash);
      const dashed = await page
        .waitForFunction(
          () => (window as unknown as ProbeWindow).__game!.getState()!.dashCooldownRemaining > 0,
          undefined,
          { timeout: 3000 },
        )
        .then(() => true)
        .catch(() => false);
      checks.push({
        name: 'touch-dash',
        passed: tappedDash && dashed,
        detail: `tapped=${tappedDash} cd=${(await this.getState(page))?.dashCooldownRemaining}ms`,
      });
    } finally {
      await ctx.close();
    }
    return screenshots;
  }

  /** 截屏 + 与基线比对（基线缺失时按 updateBaselines 决定建立或判失败） */
  private async capture(page: Page, name: string): Promise<ScreenshotOutcome> {
    const shotPath = join(this.opts.screenshotDir, `${name}.png`);
    const basePath = join(this.opts.baselineDir, `${name}.png`);
    mkdirSync(dirname(shotPath), { recursive: true });
    const actual = await page.screenshot({ path: shotPath });

    if (!existsSync(basePath)) {
      if (this.opts.updateBaselines) {
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

  private async getState(page: Page): Promise<GameStateSnapshot | null> {
    return page.evaluate(() => (window as unknown as ProbeWindow).__game?.getState() ?? null);
  }

  private async waitForGame(page: Page): Promise<boolean> {
    try {
      await page.waitForFunction(
        () => (window as unknown as ProbeWindow).__game?.getState() != null,
        undefined,
        { timeout: ACCEPTANCE.loadTimeoutMs },
      );
      return true;
    } catch {
      return false;
    }
  }

  private async canvasReady(page: Page): Promise<boolean> {
    return page.evaluate(() => {
      const canvas = document.querySelector('#game-container canvas') as HTMLCanvasElement | null;
      return !!canvas && canvas.width > 0 && canvas.height > 0;
    });
  }

  private async waitForGrounded(page: Page): Promise<boolean> {
    try {
      await page.waitForFunction(
        () => (window as unknown as ProbeWindow).__game?.getState()?.isGrounded === true,
        undefined,
        { timeout: 3000 },
      );
      return true;
    } catch {
      return false;
    }
  }
}

// ---------------------------------------------------------------------------
// 便捷入口 + CLI 输出
// ---------------------------------------------------------------------------

export async function runAcceptanceProbe(options: ProbeOptions = {}): Promise<ProbeReport> {
  return new AcceptanceProbe(options).run();
}

function formatReport(report: ProbeReport): string {
  const lines: string[] = [];
  lines.push(`Acceptance probe → ${report.baseUrl}`);
  lines.push('');
  lines.push(`Level: ${report.levelSummary.name} (${report.levelSummary.width}x${report.levelSummary.height})`);
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

export async function runCli(): Promise<void> {
  const report = await runAcceptanceProbe();
  console.log(formatReport(report));
  if (!report.passed) {
    process.exitCode = 1;
  }
}

const isDirectRun = (() => {
  if (!process.argv[1]) {
    return false;
  }
  try {
    return fileURLToPath(import.meta.url) === resolve(process.argv[1]);
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  runCli().catch((err) => {
    console.error('[acceptanceProbe] 运行失败:', err);
    process.exitCode = 1;
  });
}