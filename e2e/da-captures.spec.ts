import { expect, test } from "@playwright/test";
import { openPlanning, showTimeline } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "dark");
    localStorage.setItem("ambux.routing", "estimate");
  });
});

test("captures timeline sombre et mode clair", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await openPlanning(page);
  await showTimeline(page);
  await expect(page.getByText("Équipage", { exact: true })).toBeVisible();
  const timelineName = testInfo.project.name === "phone" ? "da-timeline-390.png" : "da-timeline-1440.png";
  if (testInfo.project.name === "phone" || testInfo.project.name === "desktop") {
    await page.screenshot({ path: `/opt/cursor/artifacts/${timelineName}`, scale: "css" });
  }
  if (testInfo.project.name !== "desktop") return;
  await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
  await page.getByRole("button", { name: "Mode clair" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await showTimeline(page);
  await page.screenshot({ path: "/opt/cursor/artifacts/da-clair-1440.png", scale: "css" });
});
