/**
 * Playwright e2e over the BUILT standalone server (`pnpm build`, then `pnpm test:e2e`), Chromium only, one worker:
 * the specs share one throwaway database (CV_TEST_OWNER_URL / CV_TEST_APP_URL, as the pg suite) and two owners.
 * W3-2/3/4 add spec files under e2e/; nobody edits this config.
 */
import { defineConfig, devices } from '@playwright/test';
import { E2E_PORT } from './e2e/support/env.ts';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    trace: 'retain-on-failure',
    launchOptions: {
      // *.localhost → the server's loopback address, whichever family it bound.
      args: ['--host-resolver-rules=MAP *.localhost localhost'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node e2e/support/serve.ts',
    url: `http://localhost:${E2E_PORT}/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
