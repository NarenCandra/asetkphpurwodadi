import {defineConfig, devices} from '@playwright/test';

const port = Number(process.env.E2E_PORT || 8765);
const python = process.env.E2E_PYTHON || 'python';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'id-ID',
  },
  projects: [
    {name: 'desktop', use: {...devices['Desktop Chrome'], viewport: {width: 1280, height: 900}}, testIgnore: /mobile\.spec\.mjs/},
    {name: 'mobile', use: {...devices['Pixel 7']}, testMatch: /mobile\.spec\.mjs/},
  ],
  webServer: {
    command: `${python} tests/e2e_server.py`,
    url: `http://127.0.0.1:${port}/api/config`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {E2E_PORT: String(port)},
  },
});
