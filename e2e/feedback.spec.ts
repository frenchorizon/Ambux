import { expect, test, type Locator } from "@playwright/test";

const FORBIDDEN = [
  "patient",
  "adresse",
  "address",
  "telephone",
  "phone",
  "planning",
  "dossier",
  "latitude",
  "longitude",
];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
    localStorage.setItem("ambux.routing", "estimate");
  });
});

test("le formulaire s'ouvre et le contexte technique n'a pas de champ patient", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Demain est déjà posé/i })).toBeVisible();
  await page.getByRole("navigation", { name: "Sections" }).getByRole("link", { name: "Bêta" }).click();
  await page.getByRole("main").getByRole("button", { name: "Donner mon avis" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Donner mon avis" })).toBeVisible();
  await expect(dialog.getByText("Les données métier ne sont pas jointes.")).toBeVisible();
  const landing = await readContext(dialog);
  expect(landing.ecran).toBe("accueil");
  expect(landing.mode).toBe("demo");
  expect(landing.version).toBe("0.9.0-alpha.3-b9");
  expect(landing.courses).toBe(0);
  assertNoPatientFields(landing);

  await dialog.getByRole("radio", { name: "4" }).check();
  await dialog.getByLabel("Texte").fill("Le geste est clair.");
  const submit = dialog.getByRole("button", { name: "Ouvrir le courriel" });
  await expect(submit).toHaveAttribute("data-feedback-mailto", /mailto:a-completer@exemple\.invalid\?/);
  const mailto = (await submit.getAttribute("data-feedback-mailto")) ?? "";
  const body = decodeURIComponent(mailto.slice(mailto.indexOf("body=") + 5));
  expect(body).toContain("Aucune donnée métier n'est jointe");
  expect(body).toContain("Note : 4/5");
  expect(body.toLowerCase()).not.toContain("patient");
  for (const word of FORBIDDEN) expect(body.toLowerCase()).not.toContain(word);

  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/b6-feedback-390.png", scale: "css" });
  }
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/opt/cursor/artifacts/b6-1440.png", scale: "css" });
  }

  await dialog.getByRole("button", { name: "Fermer" }).click();
  await page.getByRole("link", { name: "Accueil" }).click();
  await page.getByRole("button", { name: "Voir l'exemple" }).first().click();
  await page.getByRole("button", { name: "Ouvrir le planning" }).click();
  const label = (await page.locator("[data-transport-id]").first().getAttribute("aria-label")) ?? "";
  const patient = label.split(",")[0]?.trim() ?? "";
  expect(patient.length).toBeGreaterThan(3);

  await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
  await page.getByRole("main").getByRole("button", { name: "Donner mon avis" }).click();
  const settings = page.getByRole("dialog");
  const ctx = await readContext(settings);
  expect(ctx.ecran).toBe("reglages");
  expect(ctx.mode).toBe("demo");
  expect(ctx.courses).toBeGreaterThan(0);
  expect(ctx.equipages).toBeGreaterThan(0);
  expect(ctx.vehicules).toBeGreaterThan(0);
  assertNoPatientFields(ctx);
  expect(JSON.stringify(ctx)).not.toContain(patient);
  await settings.getByRole("radio", { name: "2" }).check();
  const mail = settings.getByRole("button", { name: "Ouvrir le courriel" });
  await expect(mail).toHaveAttribute("data-feedback-mailto", /Courses/);
  const href = (await mail.getAttribute("data-feedback-mailto")) ?? "";
  expect(decodeURIComponent(href)).not.toContain(patient);
});

test("le bandeau entreprise ouvre un avis sans le nom de la société", async ({ page }) => {
  test.setTimeout(120_000);
  const company = {
    schema: 1,
    mode: "entreprise",
    companyName: "Transports Fictifs",
    city: "Caen",
    region: "Normandie",
    amplitudeMin: 600,
    depot: { label: "place Saint-Pierre", lat: 49.18, lng: -0.36 },
  };
  await page.addInitScript((profile) => {
    localStorage.setItem("ambux-workspace-v1", JSON.stringify(profile));
    localStorage.setItem("ambux-drafts-v1", "[]");
  }, company);

  await page.goto("/");
  const banner = page.locator(".mode-banner").first();
  await expect(banner).toContainText("Transports Fictifs");
  await banner.getByRole("button").first().click();
  await banner.getByRole("button", { name: "Donner mon avis" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Les données métier ne sont pas jointes.")).toBeVisible();
  const ctx = await readContext(dialog);
  expect(ctx.mode).toBe("entreprise");
  assertNoPatientFields(ctx);
  const blob = JSON.stringify(ctx);
  expect(blob).not.toContain("Transports Fictifs");
  expect(blob).not.toContain("Caen");
  expect(blob).not.toContain("Saint-Pierre");
  expect(blob).not.toContain("49.18");
});

async function readContext(dialog: Locator) {
  const raw = await dialog.locator("[data-feedback-context]").getAttribute("data-feedback-context");
  const ctx = JSON.parse(raw ?? "{}") as Record<string, unknown>;
  return ctx as {
    version: string;
    ecran: string;
    mode: string;
    courses: number;
    equipages: number;
    vehicules: number;
  };
}

function assertNoPatientFields(ctx: Record<string, unknown>): void {
  expect(Object.keys(ctx).sort()).toEqual(["courses", "ecran", "equipages", "mode", "vehicules", "version"]);
  const blob = JSON.stringify(ctx).toLowerCase();
  for (const word of FORBIDDEN) expect(blob).not.toContain(word);
}
