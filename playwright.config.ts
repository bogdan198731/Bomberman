import { defineConfig } from '@playwright/test';

// Each fix worktree runs its own server, so the port is configurable.
const port = Number(process.env.VISUAL_PORT || 4310);

export default defineConfig({
  // Agent-written specs live in tests/visual; tests/screens holds the pipeline's own capture.
  testDir: 'tests',
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    // Always test the files on disk, never a cached app shell.
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'phone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: 'node dist/server.js',
    // Scores go to a fresh throwaway folder each run, never to Upstash, even if its settings are in the environment.
    env: { PORT: String(port), HOST: '127.0.0.1', SCORES_DIR: `test-results/scores-${Date.now()}`, UPSTASH_REDIS_REST_URL: '', UPSTASH_REDIS_REST_TOKEN: '' },
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
