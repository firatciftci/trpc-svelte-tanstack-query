import { defineConfig, devices } from "@playwright/test";
import process from "node:process";

const port = 4317;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI == null ? 0 : 2,
  reporter: process.env.CI == null ? "list" : "github",
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `vite build && vite preview --port ${port} --strictPort`,
    port,
    reuseExistingServer: process.env.CI == null,
    timeout: 180_000,
  },
});
