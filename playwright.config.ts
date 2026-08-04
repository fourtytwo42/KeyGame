import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const useInstalledChrome = process.env.PLAYWRIGHT_SYSTEM_CHROME === "1";

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: externalBaseUrl || "http://127.0.0.1:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    channel: useInstalledChrome ? "chrome" : undefined,
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm start",
        url: "http://127.0.0.1:3000/api/status",
        reuseExistingServer: true,
        timeout: 90_000,
      },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
