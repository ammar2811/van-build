import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

/**
 * End-to-end tests run against the production build, the same files a visitor gets.
 * `en-GB` makes the editor start in millimetres so expected values are fixed.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "en-GB",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm build && pnpm preview",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
    // Playwright's WebKit build only runs on the Linux distributions it ships libraries for
    // (Ubuntu, Debian), plus macOS and Windows. CI always runs it; set E2E_WEBKIT=1 to run it
    // locally on a machine that supports it.
    ...(process.env.CI || process.env.E2E_WEBKIT
      ? [{ name: "webkit", use: { ...devices["Desktop Safari"] } }]
      : []),
  ],
});
