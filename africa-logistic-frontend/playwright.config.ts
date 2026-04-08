import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,   // run sequentially so shared DB state is predictable
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.BASE_URL ?? 'https://afri-logistics.lula.com.et',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Accept self-signed certs in local dev if needed
    ignoreHTTPSErrors: true,
    // Keep a viewport that matches typical usage
    viewport: { width: 1280, height: 800 },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
