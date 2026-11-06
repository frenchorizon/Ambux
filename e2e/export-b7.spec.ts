import { expect, test } from "@playwright/test";
import fs from "node:fs";
import * as XLSX from "xlsx";
import { openPlanning } from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
    localStorage.removeItem("ambux.io.planningChoice");
  });
});

test("exporte le planning du jour, impression comprise", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await openPlanning(page);
  await page.getByRole("navigation").getByRole("button", { name: "Synthèse", exact: true }).click();
  await page.getByRole("button", { name: "Exporter le planning" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Exporter le planning" })).toBeVisible();
  await expect(dialog.getByText("Exemple fictif").first()).toBeVisible();
  await expect(dialog.getByText("16/10/2026").first()).toBeVisible();
  await expect(dialog.getByText("Dépôt Sud, Le Petit-Quevilly").first()).toBeVisible();
  await expect(dialog.getByText("Rien n'est envoyé à Lomaco").first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Feuille de route Lomaco" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Télécharger le CSV" })).toBeVisible();
  const wording = await dialog.innerText();
  expect(wording).not.toMatch(/\bjeu\b/i);
  expect(wording).not.toMatch(/\bpartie\b/i);
  expect(wording).not.toMatch(/\bscore\b/i);

  if (testInfo.project.name === "phone") {
    await page.screenshot({ path: "/opt/cursor/artifacts/b7-export-390.png", scale: "css" });
  }
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/opt/cursor/artifacts/b7-1440.png", scale: "css" });
  }

  const csvDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Planning CSV" }).click();
  const csvFile = await csvDownload;
  const text = fs.readFileSync((await csvFile.path())!, "utf8");
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text.startsWith("\uFEFFSociété;Exemple fictif\nDate;16/10/2026\nDépôt;Dépôt Sud, Le Petit-Quevilly\n\n")).toBe(
    true,
  );
  expect(text).toContain("Heure début");
  expect(text).toContain("16/10/2026");

  const xlsxDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Planning Excel" }).click();
  const xlsxFile = await xlsxDownload;
  const book = XLSX.read(fs.readFileSync((await xlsxFile.path())!), { cellNF: true });
  const sheet = book.Sheets.Planning!;
  expect(sheet.A1?.v).toBe("Société");
  expect(sheet.B1?.v).toBe("Exemple fictif");
  expect(sheet.A3?.v).toBe("Dépôt");
  expect(sheet.B3?.v).toBe("Dépôt Sud, Le Petit-Quevilly");
  expect(sheet.B2?.z).toBe("dd/mm/yyyy");
  expect(sheet.B2?.w).toBe("16/10/2026");
  expect(sheet.A5?.v).toBe("Date");
  expect(sheet.A6?.z).toBe("dd/mm/yyyy");

  await stubPrint(page);
  const popup = page.waitForEvent("popup");
  await dialog.getByRole("button", { name: "Imprimer / PDF" }).click();
  const printed = await popup;
  await expect(printed.getByRole("heading", { name: "Exemple fictif" }).first()).toBeVisible();
  await expect(printed.getByText("Dépôt : Dépôt Sud, Le Petit-Quevilly").first()).toBeVisible();
  const html = await printed.content();
  expect(html).toContain("size: A4 portrait");
  expect(html).toContain("page-break-after: always");
  expect(html).toContain("Rien n'est envoyé à Lomaco");
  await printed.close();

  const lomacoPopup = page.waitForEvent("popup");
  await dialog.getByRole("button", { name: "Feuille de route Lomaco" }).click();
  const lomaco = await lomacoPopup;
  await expect(lomaco.getByText("Choix IMPRESSION_STD").first()).toBeVisible();
  await expect(lomaco.getByText("Exemple fictif").first()).toBeVisible();
  await expect(lomaco.getByText("Dépôt : Dépôt Sud, Le Petit-Quevilly").first()).toBeVisible();
  const lomacoHtml = await lomaco.content();
  expect(lomacoHtml).toContain("size: A4 portrait");
  expect(lomacoHtml).toContain("page-break-after: always");
  await lomaco.close();

  await dialog.getByLabel("Du", { exact: true }).fill("2026-10-18");
  await dialog.getByLabel("Au", { exact: true }).fill("2026-10-16");
  await expect(dialog.getByRole("alert")).toContainText("La date de début est après la date de fin");
  await expect(dialog.getByRole("button", { name: "Planning CSV" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Imprimer / PDF" })).toBeDisabled();

  await dialog.getByRole("button", { name: "Fermer" }).click();
  await page.getByRole("navigation").getByRole("button", { name: "Réglages", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Export du planning" })).toBeVisible();
  await page.getByRole("button", { name: "Exporter le planning" }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Exporter le planning" })).toBeVisible();
});

test("le mode entreprise imprime le nom de la société", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "ambux-workspace-v1",
      JSON.stringify({
        schema: 1,
        mode: "entreprise",
        companyName: "Transports Fictifs",
        city: "Caen",
        region: "Normandie",
        depot: { label: "Zone industrielle", lat: 49.18, lng: -0.37 },
        amplitudeMin: 660,
      }),
    );
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Export du planning" })).toBeVisible();
  await expect(page.getByText("Transports Fictifs").first()).toBeVisible();
  await expect(page.getByText("Zone industrielle, Caen").first()).toBeVisible();
  await page.getByRole("button", { name: "Exporter le planning" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Transports Fictifs").first()).toBeVisible();
  await expect(dialog.getByText("Zone industrielle, Caen").first()).toBeVisible();
  const csvDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Planning CSV" }).click();
  const text = fs.readFileSync((await (await csvDownload).path())!, "utf8");
  expect(text).toContain("Société;Transports Fictifs");
  expect(text).toContain("Date;16/10/2026");
  expect(text).toContain("Dépôt;Zone industrielle, Caen");
  expect(text).toContain("Date;Heure début;Patient");
});

async function stubPrint(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const native = window.open.bind(window);
    window.open = (...args) => {
      const child = native(...(args as Parameters<typeof window.open>));
      if (child) child.print = () => undefined;
      return child;
    };
  });
}
