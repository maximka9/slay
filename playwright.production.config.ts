import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/production', outputDir: './test-results-production', workers: 1, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', channel: process.env.PLAYWRIGHT_CHANNEL, viewport: { width: 1280, height: 720 } },
  webServer: { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
