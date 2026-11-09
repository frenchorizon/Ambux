import { pathToFileURL } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const RELEASE = "/opt/cursor/artifacts/releases/ambux-v0.9.0-alpha.3-da.html";

async function froid(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

/** Héros → fenêtre d'adresses → timeline avec au moins un bloc. */
async function genererDepuisHero(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Générer demain" }).click();
  const dialog = page.getByRole("dialog", { name: "Envoi des adresses" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Pas d'envoi d'adresse" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("[data-transport-id]").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Demain est déjà posé/i })).toHaveCount(0);
}

test("depuis l'accueil à froid, Générer demain pose un planning", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await froid(page);
  await page.goto("/");
  await genererDepuisHero(page);
  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/da-planning-genere-390.png", scale: "css" });
  }
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/opt/cursor/artifacts/da-planning-genere-1440.png", scale: "css" });
  }
});

test("le HTML autonome, à froid, génère aussi un planning", async ({ page }) => {
  test.setTimeout(180_000);
  await froid(page);
  await page.goto(pathToFileURL(RELEASE).href);
  await genererDepuisHero(page);
});
