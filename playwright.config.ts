import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests run against the production build served statically.
 * Headless Chromium renders WebGL with SwiftShader (software): these tests
 * check behaviour only and are never used as performance evidence.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4310',
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chromium', viewport: { width: 1280, height: 720 } } }],
  webServer: {
    command: 'node scripts/serve-dist.mjs 4310',
    url: 'http://localhost:4310',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
