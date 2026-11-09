import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  reporter: "line",
  use: {
    baseURL: "http://127.0.0.1:5280",
    locale: "fr-FR",
    storageState: "e2e/demo-workspace.json",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5280",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: "phone",
      use: { browserName: "chromium", channel: "chrome", viewport: { width: 390, height: 844 } },
    },
    {
      name: "desktop",
      use: { browserName: "chromium", channel: "chrome", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "iphone",
      testMatch:
        /gantt-(ios|fantome|dnd5)\.spec\.ts|entreprise\.spec\.ts|persistance\.spec\.ts|legal\.spec\.ts|feedback\.spec\.ts|import-guide\.spec\.ts|routage-prive\.spec\.ts|landing-ton\.spec\.ts|generer-depuis-accueil\.spec\.ts/,
      use: {
        ...devices["iPhone 13"],
        // Le descripteur Playwright laisse 664 px au viewport (barre Safari). Le lot et le projet phone sont en 390×844.
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
