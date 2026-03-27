import { defineConfig, devices } from "@playwright/test";

const MOCK_PORT = 3111;
const VITE_PORT = 5199; // Different from dev server (5174) to avoid conflicts

export default defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["html", { open: "never" }]],

  use: {
    baseURL: `http://localhost:${VITE_PORT}`,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },

  projects: [
    {
      name: "Mobile Chrome",
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "Mobile Chrome landscape",
      use: { ...devices["Pixel 7 landscape"] },
    },
  ],

  webServer: [
    {
      command: `MOCK_PORT=${MOCK_PORT} npx tsx e2e/mock-server.ts`,
      port: 3099,
      reuseExistingServer: !process.env.CI,
      timeout: 10_000,
    },
    {
      command: `VITE_API_PORT=${MOCK_PORT} npx vite --port ${VITE_PORT}`,
      port: VITE_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 15_000,
    },
  ],
});
