import { expect, test } from "@playwright/test";
import fs from "node:fs";
import * as XLSX from "xlsx";

const COMPANY = "Ambulances Lyon Exemple";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
    localStorage.setItem("ambux.routing", "estimate");
  });
});

test("l'assistant importe la flotte, passe le personnel et retient les missions", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.addInitScript((company) => {
    localStorage.setItem("ambux-workspace-v1", JSON.stringify(company));
    localStorage.setItem("ambux.consent.v1", JSON.stringify({ version: 1, acceptedAt: "2026-11-06T08:00:00.000Z" }));
  }, companyProfile());
  await page.route("https://photon.komoot.io/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        features: [
          {
            geometry: { coordinates: [4.832, 45.757] },
            properties: { name: "Clinique des Tilleuls", city: "Lyon", postcode: "69000" },
          },
        ],
      }),
    });
  });

  await page.goto("/");
  await expect(page.locator(".mode-banner").first()).toContainText(COMPANY);
  await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
  const imports = page.getByRole("region", { name: "Imports" });
  await imports.getByRole("button", { name: "Ouvrir l'assistant" }).click();
  await expect(page.getByRole("heading", { name: "Flotte" })).toBeVisible();
  await expect(page.getByText("Étape 1 sur 3")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);

  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Télécharger le CSV" }).click();
  const csvFile = await csvDownload;
  expect(csvFile.suggestedFilename()).toBe("ambux-modele-vehicules.csv");
  const csv = fs.readFileSync((await csvFile.path())!, "utf8").replace(/^\uFEFF/, "");
  expect(csv).toContain("immatriculation;type;nom");
  expect(csv).toContain("LY-410-EX;ambulance;Master");
  expect(csv.toLowerCase()).not.toContain("rouen");
  expect(csv.trim().split(/\r?\n/)).toHaveLength(2);

  const xlsxDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Télécharger l'Excel" }).click();
  const xlsxFile = await xlsxDownload;
  expect(xlsxFile.suggestedFilename()).toBe("ambux-modele-vehicules.xlsx");
  const book = XLSX.read(fs.readFileSync((await xlsxFile.path())!));
  const grid = XLSX.utils.sheet_to_json<(string | number)[]>(book.Sheets.Flotte!, { header: 1, raw: false });
  expect(grid[0]).toEqual(["immatriculation", "type", "nom"]);
  expect(grid[1]?.[0]).toBe("LY-410-EX");

  await page.getByLabel("Importer la flotte").setInputFiles({
    name: "ambux-modele-vehicules.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: fs.readFileSync((await xlsxFile.path())!),
  });
  await expect(page.getByRole("heading", { name: "1 ligne acceptée" })).toBeVisible();
  await expect(page.getByText("LY-410-EX")).toBeVisible();
  await expect(page.getByRole("heading", { name: "0 rejet" })).toBeVisible();

  await page.getByLabel("Importer la flotte").setInputFiles({
    name: "flotte.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      ["immatriculation;type;nom", "LY-410-EX;ambulance;Master", "ZZ;ambulance;Court"].join("\n"),
      "utf8",
    ),
  });
  await expect(page.getByRole("heading", { name: "1 ligne acceptée" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1 rejet" })).toBeVisible();
  await expect(page.getByText("Immatriculation « ZZ » trop courte.")).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  if (testInfo.project.name === "phone") {
    await page.getByText("Immatriculation « ZZ » trop courte.").scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/opt/cursor/artifacts/b3-assistant-390.png", scale: "css" });
  }
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/opt/cursor/artifacts/b3-1440.png", scale: "css" });
  }

  await page.getByRole("button", { name: "Enregistrer et continuer" }).click();
  await expect(page.getByRole("heading", { name: "Personnel" })).toBeVisible();
  await expect(page.getByText("Étape 2 sur 3")).toBeVisible();
  await page.getByRole("button", { name: "Passer cette étape" }).click();

  await expect(page.getByRole("heading", { name: "Missions" })).toBeVisible();
  await expect(page.getByText("Étape 3 sur 3")).toBeVisible();
  await page.getByLabel("Importer les missions").setInputFiles({
    name: "missions.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "dossier;nom;prenom;date;heure_rdv;adresse_depart;adresse_arrivee;mobilite;sens;serie;telephone;note;heure_retour;attente",
        "EX-100;LEFEVRE;Inès;2026-10-16;09:15;12 rue des Tilleuls;Clinique des Tilleuls;assis;simple;;exemple fictif;;",
        ";MARTIN;Luc;1999-01-01;09:00;12 rue des Tilleuls;Clinique des Tilleuls;assis;simple;;;;",
      ].join("\n"),
      "utf8",
    ),
  });
  await expect(page.getByRole("heading", { name: "1 ligne acceptée" })).toBeVisible();
  await expect(page.getByText(/Date « 1999-01-01 » différente de la mission 2026-10-16/)).toBeVisible();
  await page.getByRole("button", { name: "Enregistrer et terminer" }).click();

  await expect(page.getByRole("heading", { name: "Réglages" })).toBeVisible();
  await page.getByRole("button", { name: "Véhicules", exact: true }).click();
  await expect(page.getByRole("row", { name: /LY-410-EX/ })).toBeVisible();
  await expect(page.getByText("BERNARD Claire")).toHaveCount(0);
  await page.getByRole("button", { name: "Retour aux réglages" }).click();
  await page.getByRole("button", { name: "Demande de demain", exact: true }).click();
  await expect(page.getByText("LEFEVRE Inès")).toBeVisible();
});

test("l'écran entreprise ouvre l'assistant et le consentement bloque le fichier", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.removeItem("ambux-workspace-v1");
    localStorage.removeItem("ambux.consent.v1");
  });

  await page.goto("/");
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Bêta" }).click();
  await page.getByRole("button", { name: "Mon entreprise" }).click();
  await page.getByLabel("Nom de la société").fill(COMPANY);
  await page.getByLabel("Ville par défaut").fill("Lyon");
  await page.getByLabel("Région par défaut").fill("Auvergne-Rhône-Alpes");
  await page.getByLabel("Adresse du dépôt").fill("1 place de l'Exemple");
  await page.getByLabel("Latitude").fill("45.757");
  await page.getByLabel("Longitude").fill("4.832");
  await page.getByLabel("Amplitude horaire").fill("10");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("button", { name: "Assistant d'import" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Importer", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Assistant d'import" }).click();

  await expect(page.getByRole("heading", { name: "Flotte" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Télécharger le CSV" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Télécharger l'Excel" })).toBeVisible();
  await expect(page.getByLabel("Importer la flotte")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: /données dont j'ai le droit/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Passer cette étape" })).toBeVisible();
});

function companyProfile() {
  return {
    schema: 1,
    mode: "entreprise",
    companyName: COMPANY,
    city: "Lyon",
    region: "Auvergne-Rhône-Alpes",
    amplitudeMin: 600,
    depot: { label: "1 place de l'Exemple", lat: 45.757, lng: 4.832 },
  };
}
