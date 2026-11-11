import { defineConfig } from '@playwright/test';
const externalBaseUrl = process.env.PRODUCTION_BASE_URL;
export default defineConfig({
  testDir: './tests/production', outputDir: './test-results-production', workers: 1, reporter: 'list',
  use: { baseURL: externalBaseUrl ?? 'http://127.0.0.1:4173', channel: process.env.PLAYWRIGHT_CHANNEL, viewport: { width: 1280, height: 720 } },
  webServer: externalBaseUrl ? undefined : { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI },
});
