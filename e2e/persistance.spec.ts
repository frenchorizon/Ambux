import { expect, test } from "@playwright/test";
import fs from "node:fs";
import { openPlanning } from "./helpers";

const COMPANY = "Transports Fictifs";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
    localStorage.setItem("ambux.routing", "estimate");
  });
});

test("les réglages exportent une sauvegarde .ambux.json", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await openPlanning(page);
  await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
  const zone = page.getByRole("region", { name: "Ce navigateur" });
  await expect(zone.getByRole("button", { name: "Exporter" })).toBeVisible();
  await expect(zone.getByRole("button", { name: "Importer" })).toBeVisible();
  await expect(zone.getByRole("button", { name: "Effacer toutes mes données de ce navigateur" })).toBeVisible();
  await expect(page.getByText("Planning généré")).toBeHidden();
  await zone.getByRole("heading", { name: "Ce navigateur" }).scrollIntoViewIfNeeded();
  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/b2-390.png", scale: "css" });
  }
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/opt/cursor/artifacts/b2-1440.png", scale: "css" });
  }

  const download = page.waitForEvent("download");
  await zone.getByRole("button", { name: "Exporter" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.ambux\.json$/);
  const saved = JSON.parse(fs.readFileSync((await file.path())!, "utf8")) as {
    schema: number;
    kind: string;
    workspace: { mode: string };
    rules: { toleranceMin: number };
    state: { missionIso: string };
  };
  expect(saved.schema).toBe(1);
  expect(saved.kind).toBe("ambux-backup");
  expect(saved.workspace.mode).toBe("demo");
  expect(saved.rules.toleranceMin).toBe(20);
  expect(saved.state.missionIso).toBe("2026-10-16");
});

test("reprend le dernier brouillon démo au rechargement", async ({ page }) => {
  test.setTimeout(120_000);
  await openPlanning(page);
  await page.getByLabel("Date de mission").fill("2026-10-21");
  await page.waitForFunction(() => localStorage.getItem("ambux-drafts-v1")?.includes("2026-10-21") === true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Commencer" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Voir l'exemple" })).toHaveCount(0);
  await expect(page.getByLabel("Date de mission")).toHaveValue("2026-10-21");
  await expect(page.locator(".mode-banner").first()).toContainText("Exemple");
});

test("en démo, le brouillon entreprise plus récent n'est pas repris", async ({ page }) => {
  await page.addInitScript(
    (drafts) => {
      localStorage.setItem("ambux-drafts-v1", JSON.stringify(drafts));
    },
    [draft(1, "2026-03-03"), draft(2, "2026-04-04", "entreprise")],
  );
  await page.goto("/");
  await expect(page.getByLabel("Date de mission")).toHaveValue("2026-03-03");
  await expect(page.getByLabel("Date de mission")).not.toHaveValue("2026-04-04");
});

test("en entreprise, le brouillon démo n'est pas repris", async ({ page }) => {
  await page.addInitScript(
    ({ company, saved }) => {
      localStorage.setItem("ambux-workspace-v1", JSON.stringify(company));
      localStorage.setItem("ambux-drafts-v1", JSON.stringify([saved]));
    },
    { company: companyProfile(), saved: draft(1, "2026-02-02") },
  );
  await page.goto("/");
  await expect(page.locator(".mode-banner").first()).toContainText(COMPANY);
  await expect(page.getByLabel("Date de mission")).toHaveValue("2026-10-16");
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("ambux-drafts-v1"))).toContain("2026-02-02");
});

test("importe un fichier .ambux.json après confirmation", async ({ page }) => {
  test.setTimeout(120_000);
  await openPlanning(page);
  await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
  const file = {
    name: "reprise.ambux.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backupFile())),
  };

  await page.getByLabel("Fichier de sauvegarde").setInputFiles(file);
  await expect(page.getByRole("dialog")).toContainText("Remplacer le travail de ce navigateur");
  await page.getByRole("dialog").getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByLabel("Date de mission")).toHaveValue("2026-10-16");
  await expect(page.locator(".mode-banner").first()).toContainText("Exemple");

  await page.getByLabel("Fichier de sauvegarde").setInputFiles(file);
  await page.getByRole("dialog").getByRole("button", { name: "Remplacer" }).click();
  await expect(page.locator(".mode-banner").first()).toContainText(COMPANY);
  await expect(page.getByLabel("Date de mission")).toHaveValue("2026-11-03");
  await expect(page.getByLabel("Pause repas (minutes)")).toHaveValue("25");

  await page.reload();
  await expect(page.locator(".mode-banner").first()).toContainText(COMPANY);
  await expect(page.getByLabel("Date de mission")).toHaveValue("2026-11-03");
  await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
  await page.getByRole("button", { name: "Patients", exact: true }).click();
  await expect(page.getByRole("heading", { name: "EXEMPLE Noa" })).toBeVisible();
});

test("refuse un fichier qui n'est pas une sauvegarde", async ({ page }) => {
  test.setTimeout(120_000);
  await openPlanning(page);
  await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
  await page.getByLabel("Fichier de sauvegarde").setInputFiles({
    name: "casse.ambux.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(page.getByRole("alert")).toContainText("n'est pas une sauvegarde Ambux");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".mode-banner").first()).toContainText("Exemple");
});

test("efface les clés Ambux et laisse le reste du navigateur", async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem("hors-ambux", "reste");
  });
  await openPlanning(page);
  await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
  await page.getByRole("button", { name: "Effacer toutes mes données de ce navigateur" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Effacer" }).click();
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Bêta" }).click();
  await expect(page.getByRole("heading", { name: "Commencer" })).toBeVisible();
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("hors-ambux"))).toBe("reste");
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("ambux-drafts-v1"))).toBeNull();
  await expect.poll(async () => page.evaluate(() => localStorage.getItem("ambux-workspace-v1"))).toBeNull();
});

function draft(version: number, iso: string, origin?: "entreprise") {
  return {
    schema: 1,
    version,
    savedAt: "2026-10-01T00:00:00.000Z",
    missionDate: iso,
    missionIso: iso,
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
    ...(origin ? { origin } : {}),
  };
}

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

function backupFile() {
  const rules = {
    toleranceMin: 20,
    mealMin: 25,
    mealFrom: 11 * 60,
    mealTo: 14 * 60 + 30,
    maxAmb: 15,
    maxVsl: 25,
    sessionMin: 4 * 60,
    amplitudeMin: 10 * 60,
    pecAmbMin: 10,
    pecVslMin: 5,
    dropoffMin: 8,
  };
  return {
    schema: 1,
    kind: "ambux-backup",
    exportedAt: "2026-11-06T08:00:00.000Z",
    workspace: companyProfile(),
    rules,
    state: {
      phase: "playing",
      view: "reglages",
      missionIso: "2026-11-03",
      missionLabel: "Mardi 3 novembre 2026",
      seed: 1,
      density: "normale",
      ambCount: 0,
      vslCount: 0,
      nowMin: 360,
      paused: true,
      speed: 1,
      regulationMs: 0,
      locations: [
        {
          id: "depot-societe",
          name: "Dépôt fictif",
          short: "Dépôt",
          kind: "depot",
          lat: 49.18,
          lng: -0.36,
          city: "Caen",
        },
      ],
      patients: [
        {
          id: "p-exemple",
          firstName: "Noa",
          lastName: "EXEMPLE",
          phone: "0600000000",
          birthYear: 1980,
          addressId: "depot-societe",
          mobility: "assis",
        },
      ],
      crews: [],
      transports: [],
      blocks: [],
      rules,
      vehicles: [],
      staff: [],
      tomorrowItems: [],
      tomorrowTransports: [],
      stats: {},
      calls: [],
      lomaco: [],
      followNow: false,
      live: false,
    },
  };
}
