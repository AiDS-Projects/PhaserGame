import { defineConfig, devices } from '@playwright/test';
import { ACCEPTANCE } from './src/constants';

// 运行时可覆盖：PORT / BASE_URL / SERVER_CMD（缺省走 Vite dev server，端口 5173）
const PORT = Number(process.env.PORT ?? 5173);
const baseURL = process.env.BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  // 验收自测规格文件目录
  testDir: './test',

  // 截图自测对手感与确定性要求高：单 worker、串行、不重试
  fullyParallel: false,
  workers: 1,
  retries: 0,

  forbidOnly: !!process.env.CI,

  timeout: 30_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      // 与 constants.ts 的 ACCEPTANCE.maxPixelDiff 对齐：像素差异占比 > 2% 判为回归
      maxDiffPixelRatio: ACCEPTANCE.maxPixelDiff,
      threshold: 0.2,
      animations: 'disabled',
      caret: 'hide',
    },
  },

  // 基线截图（扁平命名：test/baselines/desktop.png 等，与 acceptanceProbe 约定一致）
  snapshotDir: ACCEPTANCE.baselineDir,
  snapshotPathTemplate: '{snapshotDir}/{arg}{ext}',

  // 实际截图 / diff / trace / video 输出目录
  outputDir: ACCEPTANCE.screenshotDir,

  reporter: [
    ['list'],
    ['html', { outputFolder: `${ACCEPTANCE.screenshotDir}/report`, open: 'never' }],
  ],

  use: {
    baseURL,
    navigationTimeout: ACCEPTANCE.loadTimeoutMs,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },

  // 本地服务：缺省走 Vite dev server；无 Vite 时可用静态服务器覆盖，
  // 例：SERVER_CMD="npx --yes http-server . -p 5173 -a 127.0.0.1 -c-1"
  webServer: {
    command:
      process.env.SERVER_CMD ??
      `npm run dev -- --port ${PORT} --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },

  projects: [
    {
      // 桌面视口：截图自测 + 键盘手感确认（与逻辑画布 960x540 一致）
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: ACCEPTANCE.viewport,
      },
    },
    {
      // 触控兜底：移动端视口 + 触屏仿真（?touch=1 强制开启触控 UI）
      name: 'touch-chromium',
      use: {
        ...devices['Pixel 5'],
        viewport: ACCEPTANCE.touchViewport,
        deviceScaleFactor: 1,
      },
    },
  ],
});