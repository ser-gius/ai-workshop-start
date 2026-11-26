// The demo (.claude/skills/record-demo) as visual tests: the same steps on the same data, compared
// screenshot by screenshot. Deterministic only in the pinned Playwright image (its fonts, its Chromium),
// so the baselines are made there too, in the cloud: .github/workflows/visual-baselines.yml.
import { defineConfig } from '@playwright/test';

const PORT = 4317;
const size = { width: 1280, height: 800 };

export default defineConfig({
  testDir: 'tests/visual',
  // tests/visual/<spec>-snapshots/<name>-linux.png: made on Linux, compared on Linux.
  snapshotPathTemplate: '{testDir}/{testFileName}-snapshots/{arg}-{platform}{ext}',
  forbidOnly: !!process.env.CI,
  // On CI a missing baseline fails, never writes itself; only the baseline workflow passes --update-snapshots.
  updateSnapshots: process.env.CI ? 'none' : 'missing',
  retries: 0, // a flaky screenshot is a bug in the test, not something to retry
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: {
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css', maxDiffPixels: 0 },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    browserName: 'chromium',
    // Outside the image, where Playwright's own Chromium may not download: CHROME=/usr/bin/google-chrome.
    launchOptions: process.env.CHROME ? { executablePath: process.env.CHROME } : {},
    viewport: size,
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
    video: { mode: 'on', size }, // every run, passed or failed
    screenshot: 'on',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tests/visual/server.ts',
    env: { PORT: String(PORT) },
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
  },
});
