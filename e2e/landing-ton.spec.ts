import { expect, test } from "@playwright/test";

const BETA = "Pas un dispositif médical, version bêta, sans garantie.";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
    localStorage.setItem("ambux.routing", "estimate");
  });
});

test("l'accueil parle d'une bêta gratuite, pas d'un jeu", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /planning de demain/i })).toBeVisible();
  await expect(page.locator(".mode-banner").first()).toContainText("Exemple");
  await expect(page.getByRole("note").filter({ hasText: BETA }).first()).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: "Donner mon avis" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Noter ma société" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pas un tarif en vigueur" })).toBeVisible();
  await expect(page.getByText("Indicatif · futur").first()).toBeVisible();
  await expect(page.getByText("79 €")).toBeVisible();
  await expect(page.getByText("Bêta · gratuit")).toBeVisible();

  const text = await page.locator("body").innerText();
  expect(text).toMatch(/accès est gratuit/i);
  expect(text).toMatch(/référence nationale/i);
  expect(text).toContain("Lomaco");
  expect(text).toContain(BETA);
  expect(text).not.toMatch(/\bjeu\b/i);
  expect(text).not.toMatch(/\bpartie\b/i);
  expect(text).not.toMatch(/\bscore\b/i);
  expect(text).not.toMatch(/GameState/);
  expect(text).not.toMatch(/Demander une démo/);
  expect(text).not.toMatch(/\bdémo\b/i);

  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/b9-landing-390.png", fullPage: true, scale: "css" });
  }
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/opt/cursor/artifacts/b9-1440.png", fullPage: true, scale: "css" });
  }

  await page.getByRole("button", { name: "Noter ma société" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Noter ma société" })).toBeVisible();
  await dialog.getByLabel("Société").fill("Transports Fictifs");
  await dialog.getByLabel("Ville").fill("Caen");
  await dialog.getByLabel("Nombre de véhicules").fill("6");
  await dialog.getByLabel("E-mail").fill("regulateur@exemple.invalid");
  await dialog.getByRole("button", { name: "Enregistrer ici" }).click();
  await expect(dialog.getByRole("status")).toContainText("Noté ici");
  const stored = await page.evaluate(() => localStorage.getItem("ambux.demo-ask"));
  expect(stored).toContain("Transports Fictifs");
  expect(stored).not.toContain("patient");
});

test("sans configuration, le choix de mode reste une bêta gratuite", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem("ambux-workspace-v1");
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Commencer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Essayer avec des données fictives" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mon entreprise" })).toBeVisible();
  await expect(page.getByText(/accès gratuit/i)).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: BETA })).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(text).toMatch(/Lomaco/);
  expect(text).not.toMatch(/\bjeu\b/i);
  expect(text).not.toMatch(/\bpartie\b/i);
  expect(text).not.toMatch(/\bscore\b/i);
  expect(text).not.toMatch(/\bdémo\b/i);
});
