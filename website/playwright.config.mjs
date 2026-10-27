import { defineConfig } from "@playwright/test";
import { pagesBase } from "./scripts/pages-base.mjs";
const baseURL = `http://localhost:4173${pagesBase(process.env.GITHUB_REPOSITORY, process.env.PAGES_BASE_PATH)}`;
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
    screenshot: "only-on-failure",
    colorScheme: "light",
  },
  webServer: {
    command: "pnpm run preview",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1440, height: 1000 } } },
    {
      name: "mobile",
      use: {
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
