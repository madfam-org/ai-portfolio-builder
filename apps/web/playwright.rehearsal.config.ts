/**
 * The rehearsal walk-through (rehearsal/journey.spec.ts): NOT part of `pnpm test:e2e` and not a gate. It walks the
 * whole signed-in journey as a synthetic persona on a desktop and a phone viewport and saves a full-page screenshot
 * of every screen, plus a report of console errors, CSP violations and 5xx answers, so a person (or an agent) can
 * look at what a beta user will see. Run by `.github/workflows/rehearsal.yml`; locally: `pnpm --filter @cv/web
 * rehearsal` after `pnpm build`, with CV_TEST_OWNER_URL / CV_TEST_APP_URL as for the e2e.
 */
import { defineConfig, devices } from '@playwright/test';
import { E2E_PORT } from './e2e/support/env.ts';

const args = ['--host-resolver-rules=MAP *.localhost localhost, MAP cv-p.madfam.io localhost'];

export default defineConfig({
  testDir: 'rehearsal',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 180_000,
  outputDir: 'rehearsal-output/traces',
  use: { trace: 'off', launchOptions: { args } },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node e2e/support/serve.ts',
    url: `http://localhost:${E2E_PORT}/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
