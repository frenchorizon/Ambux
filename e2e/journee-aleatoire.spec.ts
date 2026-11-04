import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
  });
});

test("une journée aléatoire affiche une contrainte", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "iphone", "Le lot phone couvre déjà 390×844.");
  await page.goto("/?seed=e2e-aleatoire&missions=36&intensite=moyenne");
  await expect(page.getByText("Équipage", { exact: true })).toBeVisible();
  const row = page.locator("[data-constraint]").first();
  await expect(row).toBeVisible();
  const motif = await row.getAttribute("data-constraint");
  expect(motif && motif.length > 0).toBeTruthy();
  await row.scrollIntoViewIfNeeded();
  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/aleatoire-390.png" });
  }
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/opt/cursor/artifacts/aleatoire-1440.png" });
  }

  await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
  await expect(page.getByRole("button", { name: "Nouvelle journée aléatoire" })).toBeVisible();
  await expect(page.getByLabel("Graine")).toHaveValue("e2e-aleatoire");
  const list = page.getByRole("list", { name: "Contraintes de la journée" });
  await expect(list).toBeVisible();
  await expect(list.getByText(motif!, { exact: false }).first()).toBeVisible();
});
