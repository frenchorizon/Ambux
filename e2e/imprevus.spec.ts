import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
  });
});

test("absence, épingle, régénération et appel tardif", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "phone", "parcours régulateur en 390 px");
  test.setTimeout(150_000);
  await openPlanning(page);

  await page.getByRole("button", { name: "Autres actions" }).click();
  await page.getByRole("banner").getByRole("button", { name: "Aide", exact: true }).click();
  await page.getByRole("button", { name: "Feuille équipage" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await pickCrewWithCourse(page);

  const before = await page.getByRole("button", { name: "Détail" }).count();
  expect(before).toBeGreaterThan(0);

  await page.getByRole("button", { name: "Détail" }).first().click();
  const course = page.getByRole("dialog");
  await expect(course.getByRole("button", { name: "Poser ce créneau" })).toBeVisible();
  await expect(
    course
      .getByText(/Aucune course suivante décalée|→|ne bouge pas|Conflit horaire|Hors tolérance|indisponibilité/)
      .first(),
  ).toBeVisible();
  await course.getByRole("button", { name: "Épingler" }).click();
  await expect(course.getByRole("button", { name: "Retirer l'épingle" })).toBeVisible();
  await course.getByRole("button", { name: "Fermer" }).click();
  await expect(page.getByRole("button", { name: /Épinglée/ }).first()).toBeVisible();

  await page.getByRole("button", { name: "Régénérer sans tout bouleverser" }).click();
  const reopt = page.getByRole("dialog");
  await expect(reopt.getByText(/course déplacée|courses déplacées|Aucune course déplacée/)).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/imprevus-reopt-390.png" });
  const apply = reopt.getByRole("button", { name: "Appliquer" });
  if (await apply.isEnabled()) {
    await apply.click();
    await reopt.getByRole("button", { name: "Annuler cette étape" }).click();
  } else {
    await reopt.getByRole("button", { name: "Fermer" }).click();
  }
  await expect(page.getByRole("button", { name: /Épinglée/ }).first()).toBeVisible();

  await page.getByText("Indisponibilité", { exact: true }).click();
  await page.getByRole("button", { name: "Absent", exact: true }).click();
  await expect(page.getByText(/dans À placer|Aucune course à retirer/)).toBeVisible();
  await page.screenshot({ path: "/opt/cursor/artifacts/imprevus-absence-390.png" });
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("button", { name: /Épinglée/ }).first()).toBeVisible();
  expect(await page.getByRole("button", { name: "Détail" }).count()).toBe(before);

  await page.getByRole("button", { name: "À placer" }).click();
  await page.getByRole("button", { name: "Appel tardif" }).click();
  await page.getByLabel("Nom du patient").fill("Leroy");
  await page.getByLabel("Heure de prise en charge").fill("19:00");
  await page.getByRole("button", { name: "Ajouter et placer" }).click();
  await expect(page.getByText(/Course ajoutée/)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({ path: "/opt/cursor/artifacts/imprevus-appel-390.png" });
});

async function openPlanning(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Planning en 1 clic" }).first().click();
  await page.getByRole("button", { name: "Ouvrir le planning" }).click();
  await expect(page.getByText("Équipage", { exact: true })).toBeVisible();
  await expect(page.locator("[data-transport-id]").first()).toBeVisible();
}

async function pickCrewWithCourse(page: Page) {
  const select = page.getByLabel("Équipage");
  const values = await select
    .locator("option")
    .evaluateAll((nodes) => nodes.map((node) => (node as HTMLOptionElement).value));
  for (const value of values) {
    await select.selectOption(value);
    if ((await page.getByRole("button", { name: "Détail" }).count()) > 0) return;
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1,
  );
  expect(fits).toBe(true);
}
