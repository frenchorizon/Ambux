import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
  });
});

test("le régulateur ouvre le planning de demain", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Demain est déjà posé/i }).first()).toBeVisible();
  await page.getByRole("button", { name: "Voir l'exemple" }).first().click();
  await page.getByRole("button", { name: "Ouvrir le planning" }).click();

  await expect(page.getByText("Équipage", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Annuler" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Rétablir" })).toBeVisible();
  await expect(page.getByLabel("Date de mission")).toHaveValue("2026-10-16");
  await expect(page.getByText("Tolérance ±")).toHaveCount(0);
  await expect(page.getByText("Pause repas")).toHaveCount(0);

  if (testInfo.project.name === "phone") {
    await expect(page.getByRole("button", { name: "Carte" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Réglages" })).toBeVisible();
  }

  await page.getByRole("button", { name: "Synthèse" }).click();
  await expect(page.getByText(/à vide/i).first()).toBeVisible();

  await page.getByRole("button", { name: "Réglages" }).click();
  await expect(page.getByText("Pause repas")).toBeVisible();

  await page.getByRole("button", { name: "À placer" }).click();
  await expect(page.getByRole("heading", { name: "À placer" })).toBeVisible();

  await page.getByRole("button", { name: "Réglages" }).click();
  await page.getByRole("button", { name: "Mode sombre" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByText("Données stockées uniquement dans ce navigateur")).toBeVisible();
});
