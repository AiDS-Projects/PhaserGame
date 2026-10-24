import { defineConfig, type UserConfig } from 'vite';

// Playwright 截图自测所需的 dev/preview 服务器配置，可被 playwright.config.ts 复用
export const webServer = {
  command: 'vite --host 0.0.0.0 --port 5173',
  port: 5173,
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
} as const;

export default defineConfig({
  base: './',

  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // 触控兜底：允许局域网设备（手机/平板）访问进行手感确认
    allowedHosts: true,
    hmr: {
      host: '0.0.0.0',
      port: 5173,
    },
    headers: {
      // 保证 WebGL/WebAudio 与跨域资源在移动端触控测试下正常工作
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },

  preview: {
    host: true,
    port: 4173,
    strictPort: true,
    allowedHosts: true,
  },

  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          phaser: ['phaser'],
        },
      },
    },
  },

  optimizeDeps: {
    include: ['phaser'],
    exclude: ['playwright', '@playwright/test'],
  },
} satisfies UserConfig);