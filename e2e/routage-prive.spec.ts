import { expect, test } from "@playwright/test";

const NETWORK = /photon\.komoot\.io|router\.project-osrm\.org|routing\.openstreetmap\.de|api\.openrouteservice\.org/;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
  });
});

test("le mode privé n'envoie pas les adresses", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem("ambux.routing.private.v1", JSON.stringify({ version: 1, enabled: true }));
    localStorage.setItem(
      "ambux.routing.notice.v1",
      JSON.stringify({ version: 1, acceptedAt: "2026-11-06T08:00:00.000Z" }),
    );
  });
  const hits: string[] = [];
  await page.route(NETWORK, async (route) => {
    hits.push(route.request().url());
    await route.abort();
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Voir l'exemple" }).first().click();
  await page.getByRole("button", { name: "Ouvrir le planning" }).click();
  const banner = page.getByRole("status").filter({ hasText: /adresses non envoyées/i });
  await expect(banner).toBeVisible();
  expect(hits).toEqual([]);
  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/b4-prive-390.png", scale: "css" });
  }

  await page
    .getByRole("navigation", { name: "Navigation" })
    .getByRole("button", { name: "Carte", exact: true })
    .click();
  await expect(page.getByRole("link", { name: "OpenStreetMap" })).toBeVisible();
  expect(hits).toEqual([]);
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/opt/cursor/artifacts/b4-1440.png", scale: "css" });
  }

  await page
    .getByRole("navigation", { name: "Navigation" })
    .getByRole("button", { name: "Réglages", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Routage" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Pas d'envoi d'adresse/ })).toBeChecked();
  await page.getByRole("button", { name: "Révoquer l'avertissement d'envoi" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("ambux.routing.notice.v1"))).toBeNull();
  await expect(page.getByRole("checkbox", { name: /Pas d'envoi d'adresse/ })).toBeChecked();
  expect(hits).toEqual([]);
});

test("l'avertissement précède le premier géocodage", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.removeItem("ambux-workspace-v1");
    localStorage.removeItem("ambux.routing.notice.v1");
    localStorage.removeItem("ambux.routing.private.v1");
  });
  let sent = false;
  const hits: string[] = [];
  await page.route(NETWORK, async (route) => {
    hits.push(route.request().url());
    if (!sent || !route.request().url().includes("photon.komoot.io")) {
      await route.abort();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        features: [
          {
            geometry: { coordinates: [0.1, 49.18] },
            properties: { name: "12 rue des Lilas", city: "Villefictive", postcode: "00000" },
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Bêta" }).click();
  await page.getByRole("button", { name: "Mon entreprise" }).click();
  await expect(page.getByRole("checkbox", { name: "Pas d'envoi d'adresse" })).toBeVisible();
  await page.getByLabel("Nom de la société").fill("Transports Fictifs");
  await page.getByLabel("Ville par défaut").fill("Villefictive");
  await page.getByLabel("Région par défaut").fill("Contrée");
  await page.getByLabel("Adresse du dépôt").fill("12 rue des Lilas");
  await page.getByRole("button", { name: "Localiser" }).click();

  const dialog = page.getByRole("dialog", { name: "Envoi des adresses" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/services publics tiers/i)).toBeVisible();
  const box = dialog.getByRole("checkbox", { name: /services publics/ });
  await expect(box).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Continuer" })).toBeDisabled();
  expect(hits).toEqual([]);
  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/b4-avertissement-390.png", scale: "css" });
  }

  await box.check();
  sent = true;
  await dialog.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("textbox", { name: "Latitude" })).toHaveValue("49.18");
  await expect(page.getByRole("textbox", { name: "Longitude" })).toHaveValue("0.1");
  expect(hits.some((url) => url.includes("photon.komoot.io"))).toBe(true);
  const stored = await page.evaluate(() => localStorage.getItem("ambux.routing.notice.v1"));
  expect(stored).toContain('"version":1');
});
