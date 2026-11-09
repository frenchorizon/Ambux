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
  await expect(page.getByRole("heading", { name: /Demain est déjà posé/i })).toBeVisible();
  await expect(page.locator(".mode-banner")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Bêta" }).click();
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
  if (testInfo.project.name === "phone" || testInfo.project.name === "desktop") {
    await page.getByRole("button", { name: "Passer en mode sombre" }).click();
    await page.getByRole("link", { name: "Accueil" }).click();
    const daName = testInfo.project.name === "phone" ? "da-landing-390.png" : "da-landing-1440.png";
    await page.screenshot({ path: `/opt/cursor/artifacts/${daName}`, scale: "css" });
    const heroName = testInfo.project.name === "phone" ? "da-hero-390.png" : "da-hero-1440.png";
    await page.locator(".da-hero-card").screenshot({ path: `/opt/cursor/artifacts/${heroName}`, scale: "css" });
    await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Bêta" }).click();
    await page.getByRole("button", { name: "Passer en mode clair" }).click();
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
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Bêta" }).click();
  await expect(page.getByRole("heading", { name: "Commencer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Essayer avec des données fictives" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mon entreprise" })).toBeVisible();
  await expect(page.getByText(/accès gratuit/i).first()).toBeVisible();
  await expect(page.getByRole("note").filter({ hasText: BETA }).first()).toBeVisible();
  const text = await page.locator("body").innerText();
  expect(text).toMatch(/Lomaco/);
  expect(text).not.toMatch(/\bjeu\b/i);
  expect(text).not.toMatch(/\bpartie\b/i);
  expect(text).not.toMatch(/\bscore\b/i);
  expect(text).not.toMatch(/\bdémo\b/i);
});

test("l'accueil ne défile pas", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.theme", "dark");
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Demain est déjà posé/i })).toBeVisible();
  const fits = await page.evaluate(() => {
    const root = document.scrollingElement;
    if (!root) return false;
    return root.scrollHeight <= window.innerHeight + 1 && root.scrollWidth <= window.innerWidth + 1;
  });
  expect(fits).toBe(true);
  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/da-accueil-390.png", scale: "css" });
  }
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/opt/cursor/artifacts/da-accueil-1440.png", scale: "css" });
  }
});

test("chaque lien de la nav ouvre sa page", async ({ page }, testInfo) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Sections" });
  await expect(nav.getByRole("link")).toHaveCount(2);
  await nav.getByRole("link", { name: "Méthode" }).click();
  await expect(page.getByRole("heading", { name: "La demande de demain" })).toBeVisible();
  await expect(page).toHaveURL(/#methode$/);
  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/da-page-methode-390.png", scale: "css" });
  }
  await page.getByRole("link", { name: "Accueil" }).click();
  await expect(page.getByRole("heading", { name: /Demain est déjà posé/i })).toBeVisible();
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Bêta" }).click();
  await expect(page.getByRole("heading", { name: "Pas un tarif en vigueur" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mon entreprise" })).toBeVisible();
  await expect(page).toHaveURL(/#beta$/);
  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/da-page-beta-390.png", scale: "css" });
  }
});
