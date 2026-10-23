import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', workers: 1,
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }, { name: 'webkit', use: { browserName: 'webkit', viewport: { width: 1024, height: 768 }, isMobile: true, hasTouch: true } }],
  use: { baseURL: 'http://127.0.0.1:5173', viewport: { width: 1024, height: 768 } },
  webServer: { command: 'npm run dev -- --port 5173 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: false },
});
