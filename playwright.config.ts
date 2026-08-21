import { defineConfig, devices } from '@playwright/test'

// A deliberately small real-browser suite. jsdom cannot exercise the things
// that actually break in a browser — IndexedDB, a real reload, canvas, file
// downloads, two tabs sharing one origin — so these tests cover exactly those
// and nothing that a unit test already covers better.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'list' : 'html',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Mobile layout is a real risk surface and costs one extra project.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // Test the production build, not the dev server: it is what a visitor gets.
  webServer: {
    command:
      'npm run build && npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
