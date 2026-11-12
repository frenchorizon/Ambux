import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openMenu, openPlanning, showTimeline } from "./helpers";

const shots = "test-results/primitives";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "dark");
  });
});

test("pilules, dialogue, infobulle et toast en verre", async ({ page }, testInfo) => {
  mkdirSync(shots, { recursive: true });
  const shot = (name: string) => page.screenshot({ path: `${shots}/${testInfo.project.name}-${name}.png` });

  await openPlanning(page);
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator("body")).toHaveCSS("font-family", /Inter/);
  await expect.poll(() => page.evaluate(() => document.fonts.check("16px Inter"))).toBe(true);
  const routeToast = page.getByRole("status");
  await routeToast.waitFor({ state: "visible", timeout: 8_000 }).catch(() => undefined);
  await routeToast.waitFor({ state: "hidden", timeout: 8_000 }).catch(() => undefined);

  await openMenu(page, "Demande de demain");
  const main = page.locator("main");
  const primary = main.getByRole("button", { name: "Générer le planning" });
  const glass = main.getByRole("button", { name: "Ajouter un transport" });
  const danger = main.getByRole("button", { name: "Vider la demande" });
  await expect(primary).toBeVisible();
  await expect(glass).toBeVisible();
  await expect(danger).toBeVisible();
  const height = await danger.evaluate((el) => {
    el.focus({ focusVisible: true });
    return el.getBoundingClientRect().height;
  });
  expect(height).toBeGreaterThanOrEqual(44);
  const outline = await danger.evaluate((el) => getComputedStyle(el).outlineColor);
  expect(outline).toBe("rgb(46, 196, 182)");
  await shot("boutons");

  await showTimeline(page);
  await openMenu(page, "Exporter");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Exporter");
  const dialogBg = await dialog.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(dialogBg).not.toBe("rgba(0, 0, 0, 0)");
  await shot("dialogue");
  await page.getByRole("button", { name: "Fermer" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("navigation").getByRole("button", { name: "Synthèse", exact: true }).click();
  await page.locator("main").getByText("Km à vide", { exact: true }).first().hover();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("Kilomètres prévisionnels");
  await shot("infobulle");

  await page.getByRole("navigation").getByRole("button", { name: "À placer", exact: true }).click();
  await page.getByRole("button", { name: "Appel tardif" }).click();
  await page.getByLabel("Nom du patient").fill(" ");
  await page.getByRole("button", { name: "Ajouter et placer" }).click();
  const toast = page.getByRole("status");
  await expect(toast).toContainText("Nom, heure et adresses sont requis.");
  const box = await toast.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (testInfo.project.name === "phone") {
    expect(box!.y + box!.height).toBeLessThan(viewport!.height - 56);
  } else {
    expect(box!.y).toBeLessThan(140);
    expect(Math.abs(box!.x + box!.width / 2 - viewport!.width / 2)).toBeLessThan(120);
  }
  await shot("toast");

  await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
  await page.getByRole("button", { name: "Mode clair" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.getByRole("button", { name: "Équipages", exact: true })).toBeVisible();
  await shot("mode-clair");
});
