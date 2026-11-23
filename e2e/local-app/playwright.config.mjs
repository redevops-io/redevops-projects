// Browser checks against a LOCAL app (synthetic data, no credentials). Not part of the unit-test run.
//   1. Run the app in public-demo mode with the sample provider under /projects, e.g. (agentic-os-enterprise):
//        PROJECTS_PUBLIC_DEMO=1 PROJECTS_PROVIDER=sample PUBLIC_BASE_PATH=/projects PROJECTS_UI_DIR=<built UI, VITE_PROJECTS_API=/ --base=/> \
//          python -m uvicorn agentic_os_enterprise.projects_workflow.combined_app:app --port 8292
//   2. npm i --no-save @playwright/test @axe-core/playwright && npx playwright install chromium
//   3. APP_URL=http://127.0.0.1:8292 npx playwright test -c <this file>
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: /.*\.pw\.mjs$/, workers: 1, retries: 0, timeout: 60_000, expect: { timeout: 8_000 },
  reporter: [['list']],
  use: { ...devices['Desktop Chrome'], channel: undefined, headless: true, viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' },
});
