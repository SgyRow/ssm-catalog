import path from "node:path"
import {fileURLToPath} from "node:url"
import {defineConfig, devices} from "@playwright/test"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5174",
    trace: "on-first-retry"
  },
  webServer: {
    command:
      "yarn vite --config e2e/dom-probe/vite.config.ts --host 127.0.0.1 --port 5174",
    cwd: __dirname,
    url: "http://127.0.0.1:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
})
