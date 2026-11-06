import { expect, test } from "@playwright/test";

const BETA = "Pas un dispositif médical, version bêta, sans garantie.";
const COMPANY = "Transports Fictifs";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
    localStorage.setItem("ambux.routing", "estimate");
  });
});

test("les pages légales s'ouvrent depuis l'accueil et les réglages", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /planning de demain/i })).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: BETA }).first()).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Pages légales" }).getByRole("link", { name: "Mentions légales" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Mentions légales" }).click();
  await expect(page.getByRole("heading", { name: "Mentions légales", exact: true })).toBeVisible();
  await expect(page.getByText("Brouillon à faire relire par un humain.")).toBeVisible();
  await expect(page.getByText("SIRET", { exact: true })).toBeVisible();
  await expect(page.getByText("à compléter", { exact: true }).first()).toBeVisible();
  const mentions = await page.locator("main").innerText();
  expect(mentions).toContain("Aucun SIRET");
  expect(mentions).not.toMatch(/\b\d{14}\b/);
  expect(mentions).toContain(BETA);
  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/b5-legal-390.png", fullPage: true, scale: "css" });
  }
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/opt/cursor/artifacts/b5-1440.png", fullPage: true, scale: "css" });
  }

  await page.getByRole("link", { name: "Politique de confidentialité" }).click();
  await expect(page.getByRole("heading", { name: "Politique de confidentialité", exact: true })).toBeVisible();
  const privacy = await page.locator("main").innerText();
  expect(privacy).toContain("photon.komoot.io");
  expect(privacy).toContain("stockage local");
  expect(privacy).toContain("Brouillon à faire relire par un humain.");
  await page.getByRole("button", { name: "Fermer" }).click();
  await expect(page.getByRole("heading", { name: /planning de demain/i })).toBeVisible();

  await page.getByRole("button", { name: "Planning en 1 clic" }).first().click();
  await page.getByRole("button", { name: "Ouvrir le planning" }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
  await page.getByRole("link", { name: "Mentions légales" }).click();
  await expect(page.getByRole("heading", { name: "Mentions légales", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fermer" }).click();
  await expect(page.getByRole("heading", { name: "Informations" })).toBeVisible();

  await page.getByRole("button", { name: "Autres actions" }).click();
  await page
    .getByRole("group", { name: "Autres actions" })
    .getByRole("button", { name: "Importer", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Fichiers Lomaco")).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
});

test("la case bloque le premier import réel en mode entreprise", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript((company) => {
    localStorage.setItem("ambux-workspace-v1", JSON.stringify(company));
    localStorage.removeItem("ambux.consent.v1");
  }, companyProfile());

  await page.goto("/");
  await expect(page.locator(".mode-banner").first()).toContainText(COMPANY);
  await expect(page.getByRole("note").filter({ hasText: BETA })).toBeVisible();

  await page.getByRole("button", { name: "Autres actions" }).click();
  await page
    .getByRole("group", { name: "Autres actions" })
    .getByRole("button", { name: "Importer", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const box = dialog.getByRole("checkbox", { name: /données dont j'ai le droit/ });
  await expect(box).toBeVisible();
  await expect(dialog.getByLabel("Fichiers Lomaco")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Confirmer et importer" })).toBeDisabled();
  await box.scrollIntoViewIfNeeded();
  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/b5-consent-390.png", scale: "css" });
  }

  await box.check();
  await dialog.getByRole("button", { name: "Confirmer et importer" }).click();
  await expect(dialog.getByLabel("Fichiers Lomaco")).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  const stored = await page.evaluate(() => localStorage.getItem("ambux.consent.v1"));
  expect(stored).toContain('"version":1');

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Révoquer le consentement d'import" }).click();
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("ambux.consent.v1"))).toBeNull();
  await expect(page.getByText("Aucun consentement d'import enregistré dans ce navigateur.")).toBeVisible();

  await page.getByRole("button", { name: "Véhicules", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /données dont j'ai le droit/ })).toBeVisible();
  await expect(page.getByText("Choisir un fichier")).toHaveCount(0);
});

function companyProfile() {
  return {
    schema: 1,
    mode: "entreprise",
    companyName: COMPANY,
    city: "Caen",
    region: "Normandie",
    amplitudeMin: 600,
    depot: { label: "place Saint-Pierre", lat: 49.18, lng: -0.36 },
  };
}
