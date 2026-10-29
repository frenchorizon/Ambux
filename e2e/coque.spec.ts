import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { openPlanning } from "./helpers";

const shots = "/opt/cursor/artifacts";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "dark");
  });
});

test("coque en verre, bureau et mobile", async ({ page }, testInfo) => {
  mkdirSync(shots, { recursive: true });
  const phone = testInfo.project.name === "phone";
  await openPlanning(page);
  await page.evaluate(() => document.fonts.ready);
  const startup = page.getByRole("status");
  await startup.waitFor({ state: "visible", timeout: 8_000 }).catch(() => undefined);
  await startup.waitFor({ state: "hidden", timeout: 8_000 }).catch(() => undefined);

  const header = page.getByRole("banner");
  await expect(header).toBeVisible();
  await expect(header.getByLabel("Date de mission")).toHaveValue("2026-10-16");
  await expect(header.getByRole("button", { name: /^Générer/ })).toHaveAccessibleName(
    phone ? "Générer" : "Générer le planning",
  );
  await expect(header.getByRole("button", { name: "Autres actions" })).toBeVisible();
  await expect(header.getByRole("button", { name: "Annuler" })).toBeVisible();
  await expect(header.getByRole("button", { name: "Rétablir" })).toBeVisible();
  await expect(header.getByRole("button", { name: "Rechercher" })).toBeVisible();
  await expect(header.locator(".version-chip")).toHaveText(/^v\d+$/);
  if (phone) await expect(header.getByText("16 oct. 2026", { exact: true })).toBeVisible();
  else await expect(header.getByText("Planning du vendredi 16 octobre")).toBeVisible();

  const blur = await header.evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(blur).toMatch(/blur/);
  const headerBg = await header.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(headerBg).not.toBe("rgba(0, 0, 0, 0)");
  const headerBorder = await header.evaluate((el) => getComputedStyle(el).borderBottomColor);
  expect(headerBorder).not.toBe("rgba(0, 0, 0, 0)");

  for (const name of ["Annuler", "Rétablir", "Rechercher", "Autres actions"]) {
    const box = await header.getByRole("button", { name, exact: true }).boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  const nav = page.getByRole("navigation", { name: "Navigation" });
  await expect(nav.getByRole("button", { name: "Timeline", exact: true })).toHaveAttribute("aria-current", "page");
  for (const name of ["Timeline", "Carte", "À placer", "Synthèse", "Réglages"]) {
    await expect(nav.getByRole("button", { name, exact: true })).toBeVisible();
  }

  const css = await page.evaluate(() => {
    const found: string[] = [];
    const walk = (rules: CSSRuleList) => {
      for (const rule of rules) {
        found.push(rule.cssText);
        if ("cssRules" in rule && rule.cssRules) walk(rule.cssRules);
      }
    };
    for (const sheet of document.styleSheets) {
      try {
        walk(sheet.cssRules);
      } catch {
        /* feuille externe */
      }
    }
    return found.join("\n");
  });
  expect(css).toMatch(/@supports not \(backdrop-filter: blur\(1px\)\)/);
  expect(css).toContain(".shell-side");
  expect(css).toContain(".routing-banner");
  expect(css).toContain("safe-area-inset-bottom");

  if (phone) {
    await expect(page.locator("aside")).toHaveCount(0);
    await expect(nav).toHaveClass(/shell-tabs/);
    const navBlur = await nav.evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(navBlur).toMatch(/blur/);
    const margin = await nav.evaluate((el) => Number.parseFloat(getComputedStyle(el).marginBottom));
    expect(margin).toBeGreaterThanOrEqual(8);
    const buttons = nav.getByRole("button");
    await expect(buttons).toHaveCount(5);
    for (let index = 0; index < 5; index += 1) {
      const box = await buttons.nth(index).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
    const activeColor = await nav
      .getByRole("button", { name: "Timeline", exact: true })
      .evaluate((el) => getComputedStyle(el).color);
    expect(activeColor).toBe("rgb(46, 196, 182)");
    const main = await page.locator("main").boundingBox();
    const bar = await nav.boundingBox();
    expect(main).not.toBeNull();
    expect(bar).not.toBeNull();
    expect(main!.y + main!.height).toBeLessThanOrEqual(bar!.y + 1);
    await page.screenshot({ path: `${shots}/coque-390.png` });

    await page.getByRole("button", { name: "À placer", exact: true }).click();
    await page.getByRole("button", { name: "Appel tardif" }).click();
    await page.getByLabel("Nom du patient").fill(" ");
    await page.getByRole("button", { name: "Ajouter et placer" }).click();
    const toast = page.getByRole("status");
    await expect(toast).toBeVisible();
    const toastBox = await toast.boundingBox();
    const navBox = await nav.boundingBox();
    expect(toastBox).not.toBeNull();
    expect(navBox).not.toBeNull();
    expect(toastBox!.y + toastBox!.height).toBeLessThanOrEqual(navBox!.y + 1);
  } else {
    await expect(page.locator("nav.shell-tabs")).toHaveCount(0);
    const aside = page.locator("aside");
    await expect(aside).toBeVisible();
    await expect(aside.getByText("Ambux", { exact: true })).toBeVisible();
    const box = await aside.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(200);
    expect(box?.width ?? 0).toBeLessThanOrEqual(220);
    const sideBlur = await aside.evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(sideBlur).toMatch(/blur/);
    const sideBg = await aside.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(sideBg).not.toBe("rgba(0, 0, 0, 0)");
    const active = aside.getByRole("button", { name: "Timeline", exact: true });
    const activeBg = await active.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(activeBg).toBe("rgba(46, 196, 182, 0.14)");
    const activeBorder = await active.evaluate((el) => getComputedStyle(el).borderTopColor);
    expect(activeBorder).toBe("rgb(46, 196, 182)");
    const activeText = await active.evaluate((el) => getComputedStyle(el).color);
    expect(activeText).toBe("rgb(255, 255, 255)");
    await expect(aside.getByRole("button", { name: "Données et export" })).toHaveCount(0);
    await page.screenshot({ path: `${shots}/coque-1440.png` });
  }
});

test("bandeau de routage en verre corail", async ({ page }, testInfo) => {
  mkdirSync(shots, { recursive: true });
  await page.addInitScript(() => localStorage.setItem("ambux.routing", "estimate"));
  await openPlanning(page);
  const startup = page.getByRole("status");
  await startup.waitFor({ state: "visible", timeout: 8_000 }).catch(() => undefined);
  await startup.waitFor({ state: "hidden", timeout: 8_000 }).catch(() => undefined);
  const banner = page.locator(".routing-banner");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Routage dégradé");
  await expect(banner).toContainText("km estimé");
  const blur = await banner.evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(blur).toMatch(/blur/);
  const border = await banner.evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(border).toBe("rgba(255, 122, 107, 0.55)");
  const shot = testInfo.project.name === "phone" ? "coque-banner-390.png" : "coque-banner-1440.png";
  await page.screenshot({ path: `${shots}/${shot}` });
});

test("mode clair : le texte de la coque reste lisible", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("ambux.theme", "light"));
  await openPlanning(page);
  const phone = testInfo.project.name === "phone";
  const button = page
    .getByRole("navigation", { name: "Navigation" })
    .getByRole("button", { name: "Carte", exact: true });
  const color = await button.evaluate((el) => getComputedStyle(el).color);
  expect(color).not.toBe("rgb(255, 255, 255)");
  const surface = phone ? page.locator("nav.shell-tabs") : page.locator("aside");
  const bg = await surface.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  const headerColor = await page.getByRole("banner").evaluate((el) => getComputedStyle(el).color);
  expect(headerColor).not.toBe("rgb(255, 255, 255)");
});

test("repli opaque sans flou forcé", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPlanning(page);
  const header = page.getByRole("banner");
  const filter = await header.evaluate((el) => getComputedStyle(el).backdropFilter);
  expect(filter === "none" || filter === "").toBe(true);
  const bg = await header.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  expect(bg).not.toBe("rgba(255, 255, 255, 0.06)");
});
