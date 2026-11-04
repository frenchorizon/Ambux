import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
  });
});

test("gestes, exports, brouillon et demande vide", async ({ page }, testInfo) => {
  test.setTimeout(150_000);
  await openPlanning(page);

  await expect(page.locator("[title^='Heure prévue']")).toHaveCount(0);
  if (testInfo.project.name === "phone") await touchRejectsOverlap(page);
  else await mouseRejectsOverlap(page);
  await expectNoOverlap(page);

  if (testInfo.project.name === "desktop") {
    await nudgeWithoutOverlap(page);
    await restorePlannedTime(page);
    await expectCsvDownload(page);
    await expectPrintSheet(page);
    await importFleet(page);
    await restoreDraft(page);
    await emptyDemand(page);
  }
});

test("le gantt découpe chaque course", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "capture téléphone");
  await openPlanning(page);
  const block = page.locator("[data-transport-id]").first();
  await expect(block.locator("[data-seg='pec']")).toBeVisible();
  await expect(block.locator("[data-seg='charge']")).toBeVisible();
  const labels = await page.locator("[data-transport-id]").allInnerTexts();
  for (const label of labels) {
    expect(label).not.toContain("à vide");
    expect(label.trim()).not.toBe("de");
  }
  await block.click();
  await expect(
    page.getByRole("paragraph").filter({ hasText: /vide \d+ min \/ PEC \d+ min \/ trajet \d+ min \/ dépose \d+ min/ }),
  ).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/v060-gantt-phone.png" });
});

test("la carte charge des rues sans clé", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "vérifié sur téléphone");
  const tiles: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/openstreetmap|cartocdn|basemaps\.carto|\/\d+\/\d+\/\d+\.png/.test(url)) tiles.push(url);
  });
  await openPlanning(page);
  await page.getByRole("button", { name: "Carte" }).click();
  await expect
    .poll(() => tiles.filter((url) => url.includes("tile.openstreetmap.org")).length, { timeout: 20_000 })
    .toBeGreaterThan(0);
  expect(tiles.join("\n")).not.toMatch(/apikey|cartocdn|basemaps\.carto/i);
  expect(tiles.some((url) => /openstreetmap\.org\/(?:1[4-9]|[2-9]\d)\//.test(url))).toBeTruthy();
  const tile = page.locator("img.leaflet-tile-loaded").first();
  await expect(tile).toBeVisible();
  const src = (await tile.getAttribute("src")) ?? "";
  expect(src).toContain("openstreetmap");
  expect(src).not.toMatch(/apikey/i);
  await page.screenshot({ path: "/opt/cursor/artifacts/phone-carte-rues.png" });

  await page.getByRole("button", { name: "Réglages" }).click();
  await page.getByRole("button", { name: "Mode sombre" }).click();
  await page.getByRole("button", { name: "Carte" }).click();
  await expect(page.locator(".leaflet-container.basemap-dark")).toBeVisible();
  const darkSrc = (await page.locator("img.leaflet-tile").first().getAttribute("src")) ?? "";
  expect(darkSrc).not.toMatch(/apikey|cartocdn/i);
  await page.screenshot({ path: "/opt/cursor/artifacts/phone-carte-sombre.png" });
});

test("une tuile en erreur bascule vers un autre fond", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "vérifié sur bureau");
  const seen: string[] = [];
  await page.route("https://tile.openstreetmap.org/**", (route) => route.abort());
  page.on("request", (request) => {
    if (/openstreetmap/.test(request.url())) seen.push(request.url());
  });
  await openPlanning(page);
  await page.getByRole("button", { name: "Carte" }).click();
  await expect
    .poll(() => seen.some((url) => url.includes("openstreetmap.de") || url.includes("openstreetmap.fr")))
    .toBeTruthy();
  expect(seen.join("\n")).not.toMatch(/apikey|cartocdn/i);
  const src = (await page.locator("img.leaflet-tile").first().getAttribute("src")) ?? "";
  expect(src).not.toMatch(/apikey|tile\.openstreetmap\.org/i);
});

test("OSRM coupé : tracé estimé et bandeau", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "phone", "vérifié sur bureau");
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem("ambux.routing", "estimate"));
  await openPlanning(page);
  await expect(page.getByText("Routage dégradé")).toBeVisible();
  await page.getByRole("button", { name: "Carte" }).click();
  await expect(page.getByText("Tracés estimés")).toBeVisible();
  await expect(page.locator(".leaflet-container")).toBeVisible();
});

async function openPlanning(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Planning en 1 clic" }).first().click();
  await page.getByRole("button", { name: "Ouvrir le planning" }).click();
  await expect(page.getByText("Équipage", { exact: true })).toBeVisible();
}

type Bar = {
  id: string;
  crew: string;
  vehicle: string;
  posture: string;
  depart: number;
  end: number;
  appointment: number;
  x: number;
  y: number;
  trackX: number;
  trackY: number;
};

async function bars(page: Page): Promise<Bar[]> {
  return page.locator("[data-transport-id]").evaluateAll((nodes) =>
    nodes.map((node) => {
      const track = node.closest("[data-track]");
      const box = node.getBoundingClientRect();
      const trackBox = track?.getBoundingClientRect();
      return {
        id: node.getAttribute("data-transport-id") ?? "",
        crew: track?.getAttribute("data-crew-id") ?? "",
        vehicle: track?.getAttribute("data-vehicle") ?? "",
        posture: node.getAttribute("data-posture") ?? "",
        depart: Number(node.getAttribute("data-depart")),
        end: Number(node.getAttribute("data-end")),
        appointment: Number(node.getAttribute("data-appointment")),
        x: box.x + Math.min(box.width / 2, 24),
        y: box.y + box.height / 2,
        trackX: (trackBox?.x ?? box.x) + 90,
        trackY: (trackBox?.y ?? box.y) + (trackBox?.height ?? box.height) / 2,
      };
    }),
  );
}

async function barById(page: Page, id: string): Promise<Bar> {
  const found = (await bars(page)).find((item) => item.id === id);
  expect(found, id).toBeTruthy();
  return found!;
}

async function center(page: Page, id: string) {
  await page
    .locator(`[data-transport-id="${id}"]`)
    .evaluate((node) => node.scrollIntoView({ block: "center", inline: "center" }));
}

async function mouseRejectsOverlap(page: Page) {
  const allonge = (await bars(page)).find((item) => item.posture === "allonge");
  const vsl = (await bars(page)).find((item) => item.vehicle === "vsl");
  expect(allonge).toBeTruthy();
  expect(vsl).toBeTruthy();
  await center(page, allonge!.id);
  const from = await barById(page, allonge!.id);
  const box = await page.locator(`[data-crew-id="${vsl!.crew}"]`).boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, box!.y + box!.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByText(/Incompatibilité|Conflit horaire/).first()).toBeVisible();
  expect((await barById(page, from.id)).depart).toBe(from.depart);
}

async function touchRejectsOverlap(page: Page) {
  const allonge = (await bars(page)).find((item) => item.posture === "allonge");
  const vsl = (await bars(page)).find((item) => item.vehicle === "vsl");
  expect(allonge).toBeTruthy();
  expect(vsl).toBeTruthy();
  await center(page, allonge!.id);
  const from = await barById(page, allonge!.id);
  const box = await page.locator(`[data-crew-id="${vsl!.crew}"]`).boundingBox();
  expect(box).toBeTruthy();
  await page.evaluate(
    async ({ x, y, x2, y2 }) => {
      const target = document.elementFromPoint(x, y);
      if (!target) throw new Error("course introuvable au doigt");
      target.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          pointerType: "touch",
          pointerId: 7,
          isPrimary: true,
          buttons: 1,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 500));
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: x2,
          clientY: y2,
          pointerType: "touch",
          pointerId: 7,
          buttons: 1,
        }),
      );
      window.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          clientX: x2,
          clientY: y2,
          pointerType: "touch",
          pointerId: 7,
        }),
      );
    },
    { x: from.x, y: from.y, x2: from.x, y2: box!.y + box!.height / 2 },
  );
  await expect(page.getByText(/Incompatibilité|Conflit horaire/).first()).toBeVisible();
  expect((await barById(page, from.id)).depart).toBe(from.depart);
}

async function nudgeWithoutOverlap(page: Page) {
  const candidates = (await bars(page)).filter((item) => item.posture === "assis" && item.vehicle === "ambulance");
  let moved = false;
  for (const candidate of candidates.slice(0, 6)) {
    await center(page, candidate.id);
    const from = await barById(page, candidate.id);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 140, from.y, { steps: 10 });
    await page.mouse.up();
    const after = await barById(page, candidate.id);
    await expectNoOverlap(page);
    if (after.depart !== from.depart && after.crew === from.crew) {
      moved = true;
      break;
    }
  }
  expect(moved).toBe(true);
}

async function restorePlannedTime(page: Page) {
  const shifted = (await bars(page)).find((item) => Math.abs(item.depart - item.appointment) >= 8);
  const target = shifted ?? (await bars(page))[0];
  expect(target).toBeTruthy();
  await page.locator(`[data-transport-id="${target!.id}"]`).click();
  await expect(page.getByRole("button", { name: "Heure prévue" })).toBeVisible();
  await expect(page.getByText(/RDV \d{2}:\d{2}/)).toBeVisible();
  const before = await barById(page, target!.id);
  await page.getByRole("button", { name: "Heure prévue" }).click();
  const after = await barById(page, target!.id);
  expect(Math.abs(after.depart - after.appointment)).toBeLessThanOrEqual(
    Math.abs(before.depart - before.appointment) + 2,
  );
}

async function expectNoOverlap(page: Page) {
  const list = await bars(page);
  const byCrew = new Map<string, Bar[]>();
  for (const item of list) {
    const group = byCrew.get(item.crew) ?? [];
    group.push(item);
    byCrew.set(item.crew, group);
  }
  for (const group of byCrew.values()) {
    group.sort((a, b) => a.depart - b.depart);
    for (let index = 1; index < group.length; index++) {
      expect(group[index]!.depart).toBeGreaterThanOrEqual(group[index - 1]!.end - 1);
    }
  }
}

async function expectCsvDownload(page: Page) {
  await page.getByRole("button", { name: "Autres actions" }).click();
  await page
    .getByRole("group", { name: "Autres actions" })
    .getByRole("button", { name: "Exporter", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Télécharger le CSV" }).click();
  const file = await download;
  const path = await file.path();
  expect(path).toBeTruthy();
  const text = fs.readFileSync(path!, "utf8").replace(/^\uFEFF/, "");
  expect(text.split("\n")[0]).toContain("dossier");
  expect(text).toContain("2026-10-16");
  expect(text).toMatch(/affecte|a_traiter/);
}

async function expectPrintSheet(page: Page) {
  await page.evaluate(() => {
    const native = window.open.bind(window);
    window.open = (...args) => {
      const child = native(...(args as Parameters<typeof window.open>));
      if (child) child.print = () => undefined;
      return child;
    };
  });
  await page.getByRole("button", { name: "Autres actions" }).click();
  await page.getByRole("group", { name: "Autres actions" }).getByRole("button", { name: "Feuilles de route" }).click();
  const popup = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: /Imprimer AMB-/ })
    .first()
    .click();
  const sheet = await popup;
  await expect(sheet.getByText("Choix IMPRESSION_STD").first()).toBeVisible();
  await expect(sheet.getByText("Personne transportée").first()).toBeVisible();
  await expect(sheet.getByText("À faire").first()).toBeVisible();
  await expect(sheet.locator("tbody tr").first()).toBeVisible();
  await sheet.setViewportSize({ width: 820, height: 1160 });
  await sheet.screenshot({ path: "/opt/cursor/artifacts/v051-feuille-lomaco.png", fullPage: true });
  await sheet.close();
  await page.getByRole("button", { name: "Fermer" }).click();
}

async function expectPlate(page: Page, plate: string) {
  await expect
    .poll(async () =>
      page.locator("input").evaluateAll((nodes) => nodes.map((node) => (node as HTMLInputElement).value)),
    )
    .toContain(plate);
}

async function openDonnee(page: Page, name: string) {
  await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
  await page.getByRole("button", { name, exact: true }).click();
}

async function importFleet(page: Page) {
  await openDonnee(page, "Véhicules");
  const model = page.waitForEvent("download");
  await page.getByRole("button", { name: "Télécharger le modèle" }).click();
  const template = fs.readFileSync((await (await model).path())!, "utf8");
  expect(template).toContain("immatriculation;type;nom");
  const box = page.getByLabel("Import CSV des véhicules");
  await box.fill(
    [
      "immatriculation;type;nom",
      "ZZ;ambulance;Court",
      "GR-777-AA;voiture;Inconnu",
      "GR-777-AA;ambulance;Master test",
    ].join("\n"),
  );
  await page.getByRole("button", { name: "Prévisualiser" }).click();
  await expect(page.getByText(/Immatriculation « ZZ » trop courte/)).toBeVisible();
  await expect(page.getByText(/Type « voiture » inconnu/)).toBeVisible();
  await page.getByRole("button", { name: "Fusionner les lignes acceptées" }).click();
  await expectPlate(page, "GR-777-AA");

  await openDonnee(page, "Équipages");
  await page
    .getByLabel("Import CSV des équipages")
    .fill(
      [
        "immatriculation;conducteur;auxiliaire;dea",
        "INCONNU;MARTIN Paul;DURAND Lea;oui",
        "GR-777-AA;MARTIN Paul;DURAND Lea;oui",
      ].join("\n"),
    );
  await page.getByRole("button", { name: "Prévisualiser" }).click();
  await expect(page.getByText(/Véhicule « INCONNU » introuvable/)).toBeVisible();
  await page.getByRole("button", { name: "Fusionner les lignes acceptées" }).click();
  await expect(page.locator("select").filter({ hasText: "MARTIN Paul" }).first()).toBeVisible();
}

async function restoreDraft(page: Page) {
  await page.getByRole("button", { name: "Timeline" }).click();
  await page.getByLabel("Date de mission").fill("2026-10-17");
  await expect(page.getByLabel("Date de mission")).toHaveValue("2026-10-17");
  await page.waitForTimeout(300);
  await page.reload();
  await page.goto("/#demo");
  await page
    .getByRole("button", { name: /courses/ })
    .first()
    .click();
  await expect(page.getByText("Équipage", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Date de mission")).toHaveValue("2026-10-17");
  await openDonnee(page, "Véhicules");
  await expectPlate(page, "GR-777-AA");
}

async function emptyDemand(page: Page) {
  await openDonnee(page, "Demande de demain");
  await page.getByRole("button", { name: "Vider la demande" }).click();
  await expect(page.getByText("Aucune course. Ajoutez-en une ou importez un fichier.")).toBeVisible();
}
