import { defineConfig, devices } from '@playwright/test';

// E2E smoke tests run against the dev server with mocked APIs (VITE_MOCK=1),
// so they are deterministic and need no network.
// PW_CHROMIUM_PATH lets sandboxes with a preinstalled Chromium skip `playwright install`.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:5174',
    launchOptions: { executablePath },
    geolocation: { latitude: 47.3773, longitude: 8.5374, accuracy: 8 },
    permissions: ['geolocation'],
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 }, launchOptions: { executablePath } }, testIgnore: /mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: { executablePath } }, testMatch: /mobile/ },
  ],
  webServer: {
    command: 'pnpm exec vite --port 5174 --strictPort',
    env: { VITE_MOCK: '1' },
    url: 'http://localhost:5174',
    reuseExistingServer: !process.env.CI,
  },
});
