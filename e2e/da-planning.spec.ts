import { expect, test } from "@playwright/test";
import { openPlanning } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "dark");
    localStorage.setItem("ambux.routing", "estimate");
  });
});

test("l'en-tête, le menu et la carte de détail suivent la maquette", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await openPlanning(page);
  const header = page.getByRole("banner");
  await expect(header.getByText("Demain est posé.", { exact: true })).toBeVisible();
  const meta = header.locator("[data-plan-meta]");
  const courses = Number(await meta.getAttribute("data-courses"));
  const blocks = await page.locator("[data-transport-id]").count();
  expect(courses).toBe(blocks);
  await expect(meta).toContainText(`${courses} courses`);
  const saved = await meta.getAttribute("data-saved");
  expect(saved).toMatch(/^-?\d+$/);
  await expect(meta).toContainText("km à vide");

  await header.getByRole("button", { name: "Autres actions" }).click();
  const menu = page.getByRole("group", { name: "Autres actions" });
  for (const name of ["Importer", "Feuilles de route", "Exporter", "Aide"]) {
    await expect(menu.getByRole("button", { name, exact: true })).toBeVisible();
  }
  for (const name of ["Annuler", "Rétablir", "Rechercher"]) {
    await expect(header.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await header.getByRole("button", { name: "Autres actions" }).click();

  await expect(page.getByRole("navigation", { name: "Navigation" }).getByRole("button")).toHaveCount(5);

  await expect(page.locator(".gantt-block").getByText(/[−-]\d+ min/)).toHaveCount(0);

  const block = page.locator(".gantt-block").nth(8);
  await block.click();
  const detail = page.getByRole("complementary", { name: "Détail de la course" });
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(/RDV \d{2}:\d{2}/);
  await expect(detail.getByRole("button", { name: "Meilleur créneau" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Retirer" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(detail).toHaveCount(0);

  await block.click();
  await expect(detail).toBeVisible();
  await page.locator(".da-gantt-head").click({ position: { x: 8, y: 8 } });
  await expect(detail).toHaveCount(0);

  if (testInfo.project.name === "phone") {
    const pill = page.getByRole("navigation", { name: "Navigation" });
    const box = await pill.boundingBox();
    expect(box?.width ?? 0).toBeLessThan(390);
    await page.screenshot({ path: "/opt/cursor/artifacts/da-planning-390.png", scale: "css" });
    await block.click();
    await expect(detail).toBeVisible();
    await page.screenshot({ path: "/opt/cursor/artifacts/da-detail-390.png", scale: "css" });
  }
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/opt/cursor/artifacts/da-planning-1440.png", scale: "css" });
    await block.click();
    await expect(detail).toBeVisible();
    await page.screenshot({ path: "/opt/cursor/artifacts/da-detail-1440.png", scale: "css" });
    await page.keyboard.press("Escape");
    await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
    await page.getByRole("button", { name: "Mode clair" }).click();
    await page.getByRole("navigation").getByRole("button", { name: "Timeline", exact: true }).click();
    await expect(page.locator(".da-gantt-scene")).toBeVisible();
    await page.screenshot({ path: "/opt/cursor/artifacts/da-planning-clair-1440.png", scale: "css" });
  }
});

test("un point orange signale une anomalie réelle", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await openPlanning(page);
  const dot = page.locator("[data-anomaly]");
  if ((await dot.count()) === 0) {
    const blocks = page.locator(".gantt-block");
    const total = await blocks.count();
    for (let index = total - 1; index >= Math.max(0, total - 8) && (await dot.count()) === 0; index -= 1) {
      await blocks.nth(index).click();
      const later = page.getByRole("button", { name: "5 minutes plus tard" });
      for (let step = 0; step < 14 && (await dot.count()) === 0; step += 1) {
        if (!(await later.isVisible())) break;
        await later.dispatchEvent("pointerdown");
      }
    }
  }
  await expect(dot.first()).toBeVisible();
  await expect(page.getByRole("banner")).toContainText(/\d+ points à vérifier/);
  const shot = testInfo.project.name === "phone" ? "da-anomalie-390.png" : "da-anomalie-1440.png";
  if (testInfo.project.name === "phone" || testInfo.project.name === "desktop") {
    await page.screenshot({ path: `/opt/cursor/artifacts/${shot}`, scale: "css" });
  }
});
