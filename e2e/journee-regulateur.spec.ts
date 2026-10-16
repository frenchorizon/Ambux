import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import * as XLSX from "xlsx";
import { barById, bars, center, mealWindows, minutes, openMenu, openPlanning, shiftSpans, showTimeline, touch } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
  });
});

test("règles du jour : repas, amplitude et plafonds", async ({ page }) => {
  await openPlanning(page);
  const meals = await mealWindows(page);
  const tracks = await page.locator("[data-track]").count();
  expect(meals.length).toBe(tracks);
  for (const meal of meals) {
    expect(meal.start).toBeGreaterThanOrEqual(11 * 60 - 1);
    expect(meal.end).toBeLessThanOrEqual(14 * 60 + 30 + 1);
    expect(meal.end - meal.start).toBeGreaterThanOrEqual(29);
    expect(meal.end - meal.start).toBeLessThanOrEqual(31);
  }
  await expect(page.getByText("Pause repas manquante")).toHaveCount(0);

  const shifts = await shiftSpans(page);
  expect(shifts.length).toBe(tracks);
  const starts = new Set<string>();
  for (const shift of shifts) {
    expect(minutes(shift.end) - minutes(shift.start)).toBe(11 * 60);
    expect(minutes(shift.start)).toBeGreaterThanOrEqual(6 * 60);
    expect(minutes(shift.end)).toBeLessThanOrEqual(20 * 60);
    starts.add(shift.start);
  }
  expect(starts.size).toBeGreaterThan(1);

  await page.getByRole("button", { name: "Réglages" }).click();
  await expect(page.getByLabel("Repas à partir de")).toHaveValue("11:00");
  await expect(page.getByLabel("Jusqu'à")).toHaveValue("14:30");
  await expect(page.getByLabel("Pause repas (minutes)")).toHaveValue("30");
  await expect(page.getByLabel("Tolérance autour du rendez-vous (minutes)")).toHaveValue("20");
  await expect(page.getByLabel("Amplitude de vacation (heures)")).toHaveValue("11");
  await expect(page.getByLabel("Charge max ambulance")).toHaveValue("15");
  await expect(page.getByLabel("Charge max VSL")).toHaveValue("25");
  await expect(page.getByLabel("Séance de dialyse (heures)")).toHaveValue("4");
});

test("import CSV et XLSX, rejets, puis édition patient véhicule équipage", async ({ page }) => {
  test.setTimeout(150_000);
  await openPlanning(page);

  await openMenu(page, "Demande de demain");
  const csv = [
    "dossier;nom;prenom;date;heure_rdv;adresse_depart;adresse_arrivee;mobilite;sens;serie;telephone;note;heure_retour",
    "DOS-QA1;ZORAQA;Line;2026-10-16;10:15;CHU Charles-Nicolle;Clinique Mathilde, rue de Lessard;assis;ar;serie-qa;0600000000;consultation;14:15",
    "DOS-QA2;ZORAQA;Line;1999-01-01;11:00;CHU Charles-Nicolle;Clinique Mathilde, rue de Lessard;assis;simple;;;;",
    "DOS-QA3;ZORAQA;Noe;;10:99;CHU Charles-Nicolle;Clinique Mathilde, rue de Lessard;assis;simple;;;;",
  ].join("\n");
  await page.locator("textarea").fill(csv);
  await page.getByRole("button", { name: "Prévisualiser" }).click();
  await expect(page.getByText(/ZORAQA Line/)).toBeVisible();
  await expect(page.getByText(/retour 14:15/)).toBeVisible();
  await expect(page.getByText(/Date « 1999-01-01 »/)).toBeVisible();
  await expect(page.getByText(/Heure invalide/)).toBeVisible();
  await page.getByRole("button", { name: "Fusionner les lignes acceptées" }).click();
  await expect(page.getByText(/\d+ transports? ajoutés?\./)).toBeVisible();
  const zora = page.locator("div.border-b").filter({ hasText: "ZORAQA Line" });
  await expect(zora.filter({ hasText: "Aller" }).first()).toBeVisible();
  await expect(zora.filter({ hasText: "Retour" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Ajouter un transport" }).click();
  await page.getByRole("textbox", { name: "Nom", exact: true }).fill("SEANCEQA");
  await page.getByRole("textbox", { name: "Prénom", exact: true }).fill("Ines");
  await page.locator("input[type='time']").first().fill("09:30");
  await page.getByRole("checkbox", { name: "Retour" }).check();
  await page.getByLabel("Attente à l'établissement (min)").fill("45");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByText("SEANCEQA Ines").first()).toBeVisible();
  await expect(page.getByText("attente 45 min")).toBeVisible();
  const seanceRows = page.locator("div.border-b").filter({ hasText: "SEANCEQA Ines" });
  await expect(seanceRows.filter({ hasText: "Aller" })).toBeVisible();
  await expect(seanceRows.filter({ hasText: "Retour" })).toBeVisible();

  await openMenu(page, "Importer");
  await page.getByLabel("Fichiers Lomaco").setInputFiles({
    name: "lomaco-qa.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: workbook(),
  });
  await expect(page.getByText("lomaco-qa.xlsx").first()).toBeVisible();
  await page.getByRole("button", { name: "Colonnes" }).click();
  await page.getByRole("button", { name: "Aperçu" }).click();
  await expect(page.getByText(/BERNARD Luc/)).toBeVisible();
  await expect(page.getByText(/Heure invalide/)).toBeVisible();
  await expect(page.getByText(/trop courte/)).toBeVisible();
  await expect(page.getByText(/introuvable pour l'équipage/)).toBeVisible();
  await expect(page.getByText(/GR-100-QA/).first()).toBeVisible();
  await page.getByRole("button", { name: "Fusionner" }).click();
  await expect(page.getByText(/\d+ transports? ajoutés?\./)).toBeVisible();

  await openMenu(page, "Patients");
  await page.getByRole("button", { name: "Modifier" }).first().click();
  await page.getByRole("textbox", { name: "Nom", exact: true }).fill("ZATEST");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("heading", { name: /ZATEST/ }).first()).toBeVisible();

  await openMenu(page, "Véhicules");
  await page.getByPlaceholder("GR-000-XX").fill("gr-404-qa");
  await page.getByPlaceholder("Renault Master").fill("Master QA");
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByText(/GR-404-QA est en ligne/)).toBeVisible();
  await expect.poll(async () => page.locator("input").evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value))).toContain("GR-404-QA");
  await page.getByLabel("Import CSV des véhicules").fill(
    ["immatriculation;type;nom", "ZZ;ambulance;Court", "GR-777-AA;voiture;Inconnu", "GR-777-AA;ambulance;Master test"].join("\n"),
  );
  await page.getByRole("button", { name: "Prévisualiser" }).click();
  await expect(page.getByText(/Immatriculation « ZZ » trop courte/)).toBeVisible();
  await expect(page.getByText(/Type « voiture » inconnu/)).toBeVisible();
  await page.getByRole("button", { name: "Fusionner les lignes acceptées" }).click();
  await expect.poll(async () => page.locator("input").evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value))).toContain("GR-777-AA");

  await openMenu(page, "Équipages");
  await page.getByLabel("Import CSV des équipages").fill(
    ["immatriculation;conducteur;auxiliaire;dea", "INCONNU;MARTIN Paul;DURAND Lea;oui", "GR-777-AA;MARTIN Paul;DURAND Lea;oui"].join("\n"),
  );
  await page.getByRole("button", { name: "Prévisualiser" }).click();
  await expect(page.getByText(/Véhicule « INCONNU » introuvable/)).toBeVisible();
  await page.getByRole("button", { name: "Fusionner les lignes acceptées" }).click();
  await expect(page.locator("select").filter({ hasText: "MARTIN Paul" }).first()).toBeVisible();
  await page.getByPlaceholder("Nom Prénom").fill("Noam Testeur");
  await page.locator("select").first().selectOption("conducteur");
  await page.getByRole("button", { name: "Ajouter" }).click();
  const driver = page.locator("select").filter({ has: page.locator("option", { hasText: "Noam Testeur" }) }).first();
  await driver.selectOption({ label: "Noam Testeur" });
  await expect.poll(async () => driver.evaluate((node) => (node as HTMLSelectElement).selectedOptions[0]?.textContent ?? "")).toContain("Noam Testeur");
});

test("Gantt : tap, 5 minutes, véhicule, refus, annuler, à placer", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await openPlanning(page);
  const phone = testInfo.project.name === "phone";

  const sample = (await bars(page)).find((item) => item.posture === "assis") ?? (await bars(page))[0]!;
  await center(page, sample.id);
  await page.locator(`[data-transport-id="${sample.id}"]`).click();
  await expect(page.locator("[data-pickup-times]")).toContainText(/Prise en charge \d{2}:\d{2} · prévue \d{2}:\d{2}/);
  await expect(page.getByText(/RDV \d{2}:\d{2}/)).toBeVisible();
  const shown = await page.locator("[data-pickup-times]").innerText();
  const planned = shown.match(/prévue (\d{2}:\d{2})/)?.[1];
  expect(planned).toBe(clock(sample.appointment));

  const moved = await nudgeFive(page);
  expect(moved.after % 5).toBe(0);
  expect(moved.after).toBeGreaterThan(moved.before);
  expect(moved.after - moved.before).toBeLessThanOrEqual(15);
  await page.getByRole("button", { name: "Annuler" }).click();
  expect((await barById(page, moved.id)).depart).toBe(moved.before);
  await page.getByRole("button", { name: "Rétablir" }).click();
  expect((await barById(page, moved.id)).depart).toBe(moved.after);
  await page.keyboard.press("Control+z");
  expect((await barById(page, moved.id)).depart).toBe(moved.before);

  const changed = await changeVehicle(page);
  expect(changed.after).not.toBe(changed.before);
  await page.getByRole("button", { name: "Annuler" }).click();

  const allonge = (await bars(page)).find((item) => item.posture === "allonge");
  const vsl = (await bars(page)).find((item) => item.vehicle === "vsl");
  expect(allonge && vsl).toBeTruthy();
  await center(page, allonge!.id);
  await page.locator(`[data-transport-id="${allonge!.id}"]`).click();
  const refused = await pushAllongeTowardVsl(page, allonge!.id);
  expect(refused.crew).toBe(refused.before);
  await expect(page.locator(".dpad-reason")).toContainText(/Incompatibilité|Conflit horaire|Pas d'autre équipage/);

  if (phone) await touchReject(page, allonge!.id, vsl!.crew);
  else await mouseReject(page, allonge!.id, vsl!.crew);
  expect((await barById(page, allonge!.id)).depart).toBe(allonge!.depart);

  const parked = (await bars(page)).find((item) => item.posture === "assis")!;
  await center(page, parked.id);
  await page.locator(`[data-transport-id="${parked.id}"]`).click();
  const patient = await page.locator("[data-pickup-times]").evaluate((node) => node.parentElement?.querySelector(".truncate")?.textContent?.trim() ?? "");
  expect(patient.length).toBeGreaterThan(3);
  await page.getByRole("button", { name: "Retirer" }).click();
  await expect(page.locator(`[data-transport-id="${parked.id}"]`)).toHaveCount(0);
  await page.getByRole("button", { name: "À placer" }).click();
  await expect(page.getByRole("heading", { name: "À placer" })).toBeVisible();
  const card = page.locator("article").filter({ hasText: patient });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Meilleur créneau" }).click();
  await showTimeline(page);
  await expect(page.locator(`[data-transport-id="${parked.id}"]`)).toBeVisible();
});

test("séries, date, reprise du lendemain et brouillon", async ({ page }) => {
  test.setTimeout(150_000);
  await openPlanning(page);
  await openMenu(page, "Demande de demain");
  await expect(page.getByText("Aucune série habituelle")).toHaveCount(0);
  await page.getByRole("button", { name: "Ajouter les séries cochées" }).click();
  await expect(page.getByText(/course.*série ajoutée/)).toBeVisible();
  await expect(page.getByText("non affecté").first()).toBeVisible();
  await page.getByRole("button", { name: "Ajouter les séries cochées" }).click();
  await expect(page.getByText("Aucune série nouvelle à ajouter.")).toBeVisible();

  await showTimeline(page);
  await page.getByLabel("Date de mission").fill("2026-10-19");
  await expect(page.getByLabel("Date de mission")).toHaveValue("2026-10-19");
  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByLabel("Date de mission")).toHaveValue("2026-10-16");
  await page.getByRole("button", { name: "Rétablir" }).click();
  await expect(page.getByLabel("Date de mission")).toHaveValue("2026-10-19");

  await openMenu(page, "Demande de demain");
  await page.getByRole("button", { name: "Reprendre au jour suivant" }).click();
  await expect(page.getByText(/sans affectation/)).toBeVisible();
  await expect(page.getByLabel("Date de mission")).toHaveValue("2026-10-20");
  await showTimeline(page);
  await expect(page.locator("[data-transport-id]")).toHaveCount(0);
  await page.getByRole("button", { name: "À placer" }).click();
  await expect(page.getByRole("button", { name: "Meilleur créneau" }).first()).toBeVisible();
});

test("le brouillon survit au rechargement", async ({ page }) => {
  test.setTimeout(120_000);
  await openPlanning(page);
  await page.getByLabel("Date de mission").fill("2026-10-18");
  await openMenu(page, "Véhicules");
  await page.getByPlaceholder("GR-000-XX").fill("QA-181-ZZ");
  await page.getByPlaceholder("Renault Master").fill("Brouillon");
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByText(/QA-181-ZZ est en ligne/)).toBeVisible();
  await page.waitForFunction(() => localStorage.getItem("ambux-drafts-v1")?.includes("QA-181-ZZ") === true);
  await page.reload();
  await page.goto("/#demo");
  await page.getByRole("button", { name: /courses/ }).first().click();
  await expect(page.getByLabel("Date de mission")).toHaveValue("2026-10-18");
  await openMenu(page, "Véhicules");
  await expect.poll(async () => page.locator("input").evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value))).toContain("QA-181-ZZ");
});

test("CSV et feuille de route Lomaco IMPRESSION_STD", async ({ page }) => {
  test.setTimeout(120_000);
  await openPlanning(page);
  await page.locator("[data-transport-id]").first().click();
  const patient = await page.locator("[data-pickup-times]").evaluate((node) => node.parentElement?.querySelector(".truncate")?.textContent?.trim() ?? "");
  expect(patient).toMatch(/\S+ \S+/);

  await openMenu(page, "Exporter le CSV");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Télécharger le CSV" }).click();
  const file = await download;
  const csv = fs.readFileSync((await file.path())!, "utf8").replace(/^\uFEFF/, "");
  const header = csv.split("\n")[0] ?? "";
  for (const column of ["dossier", "date", "statut", "equipage", "patient", "heure_rdv", "depart", "prise_en_charge", "mobilite", "sens", "repas"]) {
    expect(header).toContain(column);
  }
  expect(csv).toContain("2026-10-16");
  expect(csv).toContain("affecte");
  expect(csv.toLowerCase()).toContain(patient.toLowerCase());
  const rows = csv.trim().split("\n");
  const mealIndex = (rows[0] ?? "").split(";").indexOf("repas");
  expect(mealIndex).toBeGreaterThan(0);
  const mealCells = rows.slice(1).map((line) => line.split(";")[mealIndex] ?? "").filter((cell) => /\d{2}:\d{2}-\d{2}:\d{2}/.test(cell));
  expect(mealCells.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Fermer" }).click();

  await page.evaluate(() => {
    const native = window.open.bind(window);
    window.open = (...args) => {
      const child = native(...(args as Parameters<typeof window.open>));
      if (child) child.print = () => undefined;
      return child;
    };
  });
  await openMenu(page, "Feuilles de route");
  await expect(page.getByText(/repas/).first()).toBeVisible();
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: /Imprimer AMB-/ }).first().click();
  const sheet = await popup;
  await expect(sheet.getByText("Choix IMPRESSION_STD").first()).toBeVisible();
  await expect(sheet.getByText("Personne transportée").first()).toBeVisible();
  await expect(sheet.getByText(/Page \d+\/\d+/).first()).toBeVisible();
  await expect(sheet.getByText(/16 octobre 2026/i).first()).toBeVisible();
  await expect(sheet.locator("tbody tr").first()).toBeVisible();
  const body = await sheet.locator("body").innerText();
  expect(body.toLowerCase()).toContain(patient.split(" ")[0]!.toLowerCase());
  await sheet.close();
});

test("carte sans clé, mode sombre et routage coupé", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const tiles: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/openstreetmap|cartocdn|basemaps\.carto|\/\d+\/\d+\/\d+\.png/.test(url)) tiles.push(url);
  });
  await openPlanning(page);
  await page.getByRole("button", { name: "Carte" }).click();
  await expect.poll(() => tiles.filter((url) => /openstreetmap/.test(url)).length, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(tiles.join("\n")).not.toMatch(/apikey|cartocdn|basemaps\.carto/i);
  const tile = page.locator("img.leaflet-tile").first();
  await expect(tile).toBeVisible();
  const src = (await tile.getAttribute("src")) ?? "";
  expect(src).toMatch(/openstreetmap/i);
  expect(src).not.toMatch(/apikey/i);

  await openMenu(page, "Mode sombre");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator(".leaflet-container.basemap-dark")).toBeVisible();
  const darkSrc = (await page.locator("img.leaflet-tile").first().getAttribute("src")) ?? "";
  expect(darkSrc).not.toMatch(/apikey|cartocdn/i);

  if (testInfo.project.name === "desktop") {
    await page.goto("/");
    await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
    const seen: string[] = [];
    page.on("request", (request) => {
      if (/openstreetmap/.test(request.url())) seen.push(request.url());
    });
    await page.getByRole("button", { name: "Planning en 1 clic" }).first().click();
    await page.getByRole("button", { name: "Ouvrir le planning" }).click();
    await page.getByRole("button", { name: "Carte" }).click();
    await expect.poll(() => seen.some((url) => url.includes("openstreetmap.de") || url.includes("openstreetmap.fr"))).toBeTruthy();
    expect(seen.join("\n")).not.toMatch(/apikey|cartocdn/i);
  }
});

test("OSRM muet : bandeau et tracés estimés", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("ambux.routing", "estimate"));
  await openPlanning(page);
  await expect(page.getByText("Routage dégradé")).toBeVisible();
  await page.getByRole("button", { name: "Carte" }).click();
  await expect(page.getByText("Tracés estimés")).toBeVisible();
  await expect(page.locator(".leaflet-container")).toBeVisible();
});

test("journée chargée : plus de 80 courses", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Journée chargée" }).click();
  const about = await page.getByText(/Environ \d+ transports/).innerText();
  const demand = Number(about.match(/(\d+)/)?.[1]);
  expect(demand).toBeGreaterThanOrEqual(80);
  await page.getByRole("button", { name: "Préparer ce planning" }).click();
  await expect(page.getByRole("heading", { name: "Demande de demain" })).toBeVisible();
  const started = Date.now();
  await page.getByRole("main").getByRole("button", { name: "Générer le planning" }).click();
  await expect(page.getByRole("button", { name: "Appliquer ce planning" })).toBeVisible({ timeout: 45_000 });
  const elapsed = Date.now() - started;
  expect(elapsed, `${elapsed} ms pour ${demand} courses`).toBeLessThan(20_000);
  console.log(`QA_PERF_MS ${elapsed} QA_DEMAND ${demand}`);
  await page.getByRole("button", { name: "Appliquer ce planning" }).click();
  await expect(page.locator("[data-transport-id]").first()).toBeVisible();
  const placed = await page.locator("[data-transport-id]").count();
  expect(placed).toBeGreaterThan(40);
  console.log(`QA_PLACED ${placed}`);
  const clickStarted = Date.now();
  await page.locator("[data-transport-id]").first().click();
  await expect(page.locator("[data-dpad]")).toBeVisible();
  expect(Date.now() - clickStarted).toBeLessThan(3_000);
});

function clock(min: number): string {
  const hours = Math.floor(min / 60);
  const mins = min % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function workbook(): Buffer {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["Immatriculation", "Type", "Nom du véhicule"],
    ["ZZ", "AMB", "Court"],
    ["GR-100-QA", "AMB", "Master QA"],
  ]), "Vehicules");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["Immatriculation", "Conducteur", "Auxiliaire", "DEA"],
    ["INCONNU", "PETIT Jean", "DURAND Lea", "oui"],
    ["GR-100-QA", "MARTIN Paul", "DURAND Lea", "oui"],
  ]), "Equipages");
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ["Dossier", "Nom", "Prénom", "Heure RDV", "Adresse départ", "Adresse arrivée", "Type", "Sens"],
    ["DOS-X1", "BERNARD", "Luc", "10:30", "CHU Charles-Nicolle", "Clinique Mathilde, rue de Lessard", "TAP", "aller"],
    ["DOS-X2", "MARTIN", "Anne", "99:99", "CHU Charles-Nicolle", "Clinique Mathilde, rue de Lessard", "VSL", "aller"],
  ]), "Courses");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function nudgeFive(page: Page): Promise<{ id: string; before: number; after: number }> {
  const candidates = (await bars(page)).filter((item) => item.posture === "assis" && item.depart >= 8 * 60);
  for (const candidate of candidates.slice(0, 12)) {
    await center(page, candidate.id);
    await page.locator(`[data-transport-id="${candidate.id}"]`).click();
    const before = (await barById(page, candidate.id)).depart;
    await page.getByRole("button", { name: "5 minutes plus tard" }).click();
    const after = (await barById(page, candidate.id)).depart;
    if (after > before && after % 5 === 0 && after - before <= 15) return { id: candidate.id, before, after };
    if (after !== before) await page.getByRole("button", { name: "Annuler" }).click();
  }
  throw new Error("aucune course n'a accepté +5 minutes");
}

async function changeVehicle(page: Page): Promise<{ id: string; before: string; after: string }> {
  const candidates = (await bars(page)).filter((item) => item.posture === "assis" && item.vehicle === "ambulance");
  for (const candidate of candidates.slice(0, 6)) {
    await center(page, candidate.id);
    await page.locator(`[data-transport-id="${candidate.id}"]`).click();
    const before = (await barById(page, candidate.id)).crew;
    await page.getByRole("button", { name: "Véhicule suivant" }).click();
    const after = (await barById(page, candidate.id)).crew;
    if (after !== before) return { id: candidate.id, before, after };
  }
  throw new Error("aucun changement de véhicule accepté");
}

async function pushAllongeTowardVsl(page: Page, id: string): Promise<{ before: string; crew: string }> {
  const tracks = await page.locator("[data-track]").evaluateAll((nodes) =>
    nodes.map((node) => ({ id: node.getAttribute("data-crew-id") ?? "", vehicle: node.getAttribute("data-vehicle") ?? "" })),
  );
  const boundary = tracks.findIndex((track, index) => track.vehicle === "ambulance" && tracks[index + 1]?.vehicle === "vsl");
  const startCrew = (await barById(page, id)).crew;
  const direction = tracks.findIndex((track) => track.id === startCrew) <= boundary ? "Véhicule suivant" : "Véhicule précédent";
  for (let step = 0; step < 8; step++) {
    const now = await barById(page, id);
    const index = tracks.findIndex((track) => track.id === now.crew);
    if (index === boundary || tracks[index]?.vehicle === "vsl") break;
    await page.getByRole("button", { name: direction }).click();
    const next = await barById(page, id);
    if (next.crew === now.crew) return { before: now.crew, crew: next.crew };
  }
  const atEdge = await barById(page, id);
  await page.getByRole("button", { name: direction }).click();
  const after = await barById(page, id);
  return { before: atEdge.crew, crew: after.crew };
}

async function mouseReject(page: Page, id: string, crewId: string) {
  await center(page, id);
  const from = await barById(page, id);
  const box = await page.locator(`[data-crew-id="${crewId}"]`).boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, box!.y + box!.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByText(/Incompatibilité :|Conflit horaire :/).first()).toBeVisible();
}

async function touchReject(page: Page, id: string, crewId: string) {
  await center(page, id);
  const from = await barById(page, id);
  const box = await page.locator(`[data-crew-id="${crewId}"]`).boundingBox();
  expect(box).toBeTruthy();
  await touch(page, "pointerdown", from.x, from.y);
  await page.waitForTimeout(500);
  await touch(page, "pointermove", from.x, box!.y + box!.height / 2);
  await touch(page, "pointerup", from.x, box!.y + box!.height / 2);
  await expect(page.getByText(/Incompatibilité :|Conflit horaire :/).first()).toBeVisible();
}
