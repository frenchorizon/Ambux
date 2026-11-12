import { expect, test } from "@playwright/test";
import { openPlanning } from "./helpers";

test("un retour tardif affiche l'alerte et le seuil se règle", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await openPlanning(page);
  const retour = page.locator("[data-kind='dialyse_retour'], [data-kind='retour']").first();
  await retour.scrollIntoViewIfNeeded();
  await retour.click();
  const later = page.getByRole("button", { name: "5 minutes plus tard" });
  const alert = page.locator(".da-detail [data-return-alert]");
  for (let step = 0; step < 16 && (await alert.count()) === 0; step += 1) {
    if (!(await later.isVisible())) break;
    await later.click();
  }
  await expect(alert).toContainText("Attention, beaucoup de retard");
  await expect(alert).toContainText(/Retard \d+ min après la sortie/);
  await expect(page.locator("[data-return-alert]").first()).toBeVisible();
  await expect(page.getByRole("banner")).toContainText(/\d+ points à vérifier/);
  await retour.evaluate((node) => node.scrollIntoView({ block: "center", inline: "nearest" }));
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
