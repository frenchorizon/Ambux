import { expect, test } from "@playwright/test";

const COMPANY = "Ambulances Exemple";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
    if (sessionStorage.getItem("ambux-e2e-fresh") === "1") return;
    sessionStorage.setItem("ambux-e2e-fresh", "1");
    localStorage.removeItem("ambux-workspace-v1");
    localStorage.setItem(
      "ambux-drafts-v1",
      JSON.stringify([
        {
          schema: 1,
          version: 1,
          savedAt: "2026-10-01T00:00:00.000Z",
          missionDate: "SENTINELLE",
          missionIso: "2026-01-01",
          seed: 1,
          density: "normale",
          ambCount: 0,
          vslCount: 0,
          locations: [],
          patients: [],
          crews: [],
          transports: [],
          blocks: [],
          rules: {},
          vehicles: [],
          staff: [],
          tomorrowItems: [],
          tomorrowTransports: [],
          stats: {},
          calls: [],
          lomaco: [],
        },
      ]),
    );
  });
});

test("une société vide se configure, se recharge et peut revenir à la démo", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  let geocodeUrl = "";
  await page.route("https://photon.komoot.io/**", async (route) => {
    geocodeUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        features: [
          {
            geometry: { coordinates: [6.129, 45.899] },
            properties: { name: "Hôtel de Ville", city: "Annecy", postcode: "74000" },
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Bêta" }).click();
  await expect(page.getByRole("heading", { name: "Commencer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Essayer avec des données fictives" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mon entreprise" })).toBeVisible();
  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/b1-choix-390.png", scale: "css" });
  }

  await page.getByRole("button", { name: "Mon entreprise" }).click();
  await page.getByLabel("Nom de la société").fill(COMPANY);
  await page.getByLabel("Ville par défaut").fill("Annecy");
  await page.getByLabel("Région par défaut").fill("Auvergne-Rhône-Alpes");
  await page.getByLabel("Adresse du dépôt").fill("place de l'Hôtel-de-Ville");
  await page.getByRole("button", { name: "Localiser" }).click();
  await expect(page.getByLabel("Latitude")).toHaveValue("45.899");
  await expect(page.getByLabel("Longitude")).toHaveValue("6.129");
  const called = new URL(geocodeUrl);
  expect(called.searchParams.get("q")).toBe("place de l'Hôtel-de-Ville, Annecy, Auvergne-Rhône-Alpes");
  expect(called.searchParams.get("lat")).toBeNull();

  await page.getByLabel("Amplitude horaire").fill("10");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("button", { name: "Demande de demain" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Importer" })).toBeVisible();
  await page.getByRole("button", { name: "Demande de demain" }).click();

  await expect(page.getByRole("heading", { name: "Demande de demain" })).toBeVisible();
  await expect(page.getByText("Aucune course. Ajoutez-en une ou importez un fichier.")).toBeVisible();
  await expect(page.locator(".mode-banner")).toContainText(COMPANY);
  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/b1-entreprise-390.png", scale: "css" });
  }
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/opt/cursor/artifacts/b1-1440.png", scale: "css" });
  }

  await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
  await expect(page.getByLabel("Amplitude de vacation (heures)")).toHaveValue("10");

  const beforeReload = await page.evaluate(() => localStorage.getItem("ambux-drafts-v1"));
  await page.reload();
  await expect(page.locator(".mode-banner")).toContainText(COMPANY);
  await expect(page.getByRole("button", { name: "Essayer avec des données fictives" })).toHaveCount(0);
  const afterReload = await page.evaluate(() => localStorage.getItem("ambux-drafts-v1"));
  const drafts = JSON.parse(afterReload ?? "[]") as { version: number; missionDate?: string }[];
  expect(drafts.some((draft) => draft.version === 1 && draft.missionDate === "SENTINELLE")).toBe(true);
  expect(beforeReload).toContain("SENTINELLE");
  const workspace = await page.evaluate(() => localStorage.getItem("ambux-workspace-v1"));
  expect(workspace).toContain("Annecy");
  expect(workspace).not.toContain("ambux-drafts");

  await page.locator(".mode-banner").getByRole("button").first().click();
  await page.locator(".mode-banner").getByRole("button", { name: "Changer" }).click();
  await page.getByRole("button", { name: "Essayer avec des données fictives" }).click();
  await page.getByRole("link", { name: "Accueil" }).click();
  await expect(page.getByRole("heading", { name: /Demain est déjà posé/i })).toBeVisible();
  await expect(page.locator(".mode-banner")).toHaveCount(0);
});
