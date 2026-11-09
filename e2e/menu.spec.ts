import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
  });
});

test("menu court, données dans les réglages, gain en synthèse", async ({ page }, testInfo) => {
  await openPlanning(page);

  await page.getByRole("button", { name: "Autres actions" }).click();
  const menu = page.getByRole("group", { name: "Autres actions" });
  await expect(menu.getByRole("button")).toHaveCount(4);
  for (const name of ["Importer", "Feuilles de route", "Exporter", "Aide"]) {
    await expect(menu.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(menu.getByRole("button", { name: "Équipages" })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "Véhicules" })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "Patients" })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "Mode sombre" })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "Simuler la journée" })).toHaveCount(0);
  await expect(menu.getByRole("button", { name: "Annuler" })).toHaveCount(0);
  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/phone-menu.png" });
  }

  await menu.getByRole("button", { name: "Aide" }).click();
  await expect(page.getByRole("button", { name: "Simuler la journée" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Feuille équipage" })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Données" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Équipages", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Véhicules", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Patients", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Demande de demain", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mode sombre" })).toBeVisible();
  const storage = page.getByText("Données stockées uniquement dans ce navigateur");
  await expect(storage).toBeVisible();
  const overflow = await page.locator("main").evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/phone-reglages-donnees.png" });
    await storage.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/opt/cursor/artifacts/phone-reglages-stockage.png" });
  }

  await page.getByRole("button", { name: "Équipages", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Équipages", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retour aux réglages" }).click();
  await expect(page.getByRole("heading", { name: "Données" })).toBeVisible();

  await page.getByRole("navigation").getByRole("button", { name: "Synthèse", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Gain vs planning initial" })).toBeVisible();
  await expect(page.getByText("Temps de régulation")).toHaveCount(0);
  await expect(page.getByText(/km en moins|km en plus|Identique/).first()).toBeVisible();
  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/phone-synthese-gain.png" });
  }
});

async function openPlanning(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Voir l'exemple" }).first().click();
  await page.getByRole("button", { name: "Ouvrir le planning" }).click();
  await expect(page.getByText("Équipage", { exact: true })).toBeVisible();
}
