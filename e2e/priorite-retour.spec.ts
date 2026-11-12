import { expect, test } from "@playwright/test";
import { openPlanning } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "dark");
    localStorage.setItem("ambux.routing", "estimate");
  });
});

test("un retour tardif affiche l'alerte et le seuil se règle", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await openPlanning(page);
  const id = await page.locator("[data-kind='dialyse_retour'], [data-kind='retour']").evaluateAll((nodes) => {
    let best = nodes[0];
    let max = -1;
    for (const node of nodes) {
      const delay = Number(node.getAttribute("data-return-delay") ?? 0);
      if (delay >= max) {
        max = delay;
        best = node;
      }
    }
    return best?.getAttribute("data-transport-id") ?? "";
  });
  const retour = page.locator(`[data-transport-id="${id}"]`);
  await retour.scrollIntoViewIfNeeded();
  await retour.click();
  const alert = page.locator(".da-detail [data-return-alert]");
  for (let step = 0; step < 8 && (await alert.count()) === 0; step += 1) {
    await page.keyboard.press("ArrowRight");
  }
  await expect(alert).toContainText("Attention, beaucoup de retard");
  await expect(alert).toContainText(/Retard \d+ min après la sortie/);
  await expect(page.locator("[data-return-alert]").first()).toBeVisible();
  await expect(page.getByRole("banner")).toContainText(/\d+ points à vérifier/);
  await retour.evaluate((node) => node.scrollIntoView({ block: "start", inline: "nearest" }));
  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/priorite-390.png", scale: "css" });
  }
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/opt/cursor/artifacts/priorite-1440.png", scale: "css" });
    await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
    const field = page.getByRole("spinbutton", { name: /Alerte retard de retour/ });
    await expect(field).toHaveValue("30");
    await field.scrollIntoViewIfNeeded();
    await page.screenshot({ path: "/opt/cursor/artifacts/priorite-reglage-1440.png", scale: "css" });
  }
});
