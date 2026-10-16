import { expect, test, type Page } from "@playwright/test";
import { barById, bars, center, openMenu, openPlanning, touch } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
    localStorage.setItem("ambux.routing", "estimate");
  });
});

test("l'attente de séance reste lisible sur la timeline étroite", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "émulation 390×844, pas un iPhone");
  test.setTimeout(120_000);
  await openPlanning(page);
  await openMenu(page, "Demande de demain");
  await page.getByRole("button", { name: "Ajouter un transport" }).click();
  await page.getByRole("textbox", { name: "Nom", exact: true }).fill("SEANCEGANTT");
  await page.getByRole("textbox", { name: "Prénom", exact: true }).fill("Lea");
  await page.locator("input[type='time']").first().fill("09:30");
  await page.getByLabel("Attente à l'établissement (min)").fill("45");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  const row = page.locator("div.border-b").filter({ hasText: "SEANCEGANTT Lea" }).filter({ hasText: "Aller" });
  await expect(row.getByText("attente 45 min")).toBeVisible();
  await expect(
    page.locator("div.border-b").filter({ hasText: "SEANCEGANTT Lea" }).filter({ hasText: "Retour" }),
  ).toBeVisible();
  await row.getByRole("button", { name: "Timeline" }).click();
  await expect(page.getByText("Attente à l'établissement : 45 min")).toBeVisible();
  await expect(page.locator("[data-stay='45']").first()).toBeVisible();
  await page.getByRole("button", { name: "Meilleur créneau" }).click();
  const badge = page.locator(".gantt-stay[data-stay='45']");
  const refused = page.getByText("aucun équipage compatible");
  await expect(badge.or(refused)).toBeAttached();
  if ((await badge.count()) > 0) {
    await badge.scrollIntoViewIfNeeded();
    await expect(badge).toBeVisible();
    await expect(badge).toContainText("attente 45 min");
  }
});

test("un glisser refusé efface le motif déjà affiché par la croix", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  await openPlanning(page);
  const allonge = (await bars(page)).find((item) => item.posture === "allonge" && item.depart >= 8 * 60);
  expect(allonge).toBeTruthy();
  await center(page, allonge!.id);
  await page.locator(`[data-transport-id="${allonge!.id}"]`).click();
  const refused = await refuseTowardVsl(page, allonge!.id);
  expect(refused).toBe(true);
  await expect(page.locator(".dpad-reason")).toBeVisible();
  const reason = (await page.locator(".dpad-reason").innerText()).trim();
  expect(reason.length).toBeGreaterThan(0);

  await center(page, allonge!.id);
  const from = await barById(page, allonge!.id);
  const vsl = page.locator("[data-track][data-vehicle='vsl']").first();
  await vsl.scrollIntoViewIfNeeded();
  const box = await vsl.boundingBox();
  expect(box).toBeTruthy();
  const targetY = box!.y + Math.min(box!.height / 2, 30);
  if (testInfo.project.name === "phone") {
    await touch(page, "pointerdown", from.x, from.y);
    await page.waitForTimeout(500);
    await touch(page, "pointermove", from.x, targetY);
    await touch(page, "pointerup", from.x, targetY);
  } else {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x, targetY, { steps: 12 });
    await page.mouse.up();
  }
  await expect(page.locator(".dpad-reason")).toHaveCount(0);
  await expect(page.getByText(/Incompatibilité :|Conflit horaire :/)).toBeVisible();
  expect((await barById(page, allonge!.id)).crew).toBe(from.crew);
  expect((await barById(page, allonge!.id)).depart).toBe(from.depart);
});

async function refuseTowardVsl(page: Page, id: string): Promise<boolean> {
  const tracks = await page.locator("[data-track]").evaluateAll((nodes) =>
    nodes.map((node) => ({
      id: node.getAttribute("data-crew-id") ?? "",
      vehicle: node.getAttribute("data-vehicle") ?? "",
    })),
  );
  const boundary = tracks.findIndex(
    (track, index) => track.vehicle === "ambulance" && tracks[index + 1]?.vehicle === "vsl",
  );
  const crewId = (await barById(page, id)).crew;
  const start = tracks.findIndex((track) => track.id === crewId);
  const direction = start <= boundary ? "Véhicule suivant" : "Véhicule précédent";
  for (let step = 0; step < 8; step++) {
    const before = await barById(page, id);
    await page.getByRole("button", { name: direction }).click();
    const after = await barById(page, id);
    if (after.crew === before.crew) return (await page.locator(".dpad-reason").count()) > 0;
  }
  return false;
}
