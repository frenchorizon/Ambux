import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import * as XLSX from "xlsx";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
    localStorage.removeItem("ambux.io.planningChoice");
  });
});

test("import séance puis export du planning", async ({ page }, testInfo) => {
  const phone = testInfo.project.name === "phone";
  const csv = [
    "Nom;Prénom;Heure RDV;Adresse départ;Adresse arrivée;Type;Sens;Attente",
    "TESSIER;Noémie;09:00;CHU Charles-Nicolle;Clinique Mathilde, rue de Lessard;VSL;simple;90",
    "MARTIN;Anne;99:99;CHU Charles-Nicolle;Clinique Mathilde, rue de Lessard;VSL;aller;",
  ].join("\n");
  await openPlanning(page);
  if (phone) {
    await expect(page.getByRole("button", { name: "Importer", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Exporter", exact: true })).toBeVisible();
    await page.screenshot({ path: "/opt/cursor/artifacts/phone-import-export.png" });
  }

  await openNamed(page, "Importer", phone);
  await page.getByLabel("Fichiers Lomaco").setInputFiles({
    name: "seance.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Colonnes" }).click();
  await expect(page.getByLabel("Profil d'import")).toContainText("Lomaco (à confirmer)");
  await expect(page.getByLabel("Colonne Attente")).toHaveValue("attente");
  await page.getByRole("button", { name: "Aperçu" }).click();
  await expect(page.getByRole("table").getByText("TESSIER Noémie")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Séance de 90 min : retour créé.", exact: true })).toBeVisible();
  await expect(page.getByText(/Heure invalide/)).toBeVisible();
  if (phone) await page.screenshot({ path: "/opt/cursor/artifacts/phone-import-apercu.png" });
  await page.getByRole("button", { name: "Fusionner" }).click();
  await expect(page.getByText(/transports? ajoutés?/)).toBeVisible();
  await page.getByRole("navigation").getByRole("button", { name: "À placer", exact: true }).click();
  await expect(page.getByText("TESSIER").first()).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(page.getByText("TESSIER")).toHaveCount(0);

  await openNamed(page, "Exporter", phone);
  await expect(page.getByLabel("Du", { exact: true })).toHaveValue("2026-10-16");
  await expect(page.getByLabel("Au", { exact: true })).toHaveValue("2026-10-16");
  await page.getByRole("checkbox", { name: "Durée estimée", exact: true }).uncheck();
  await page.getByRole("button", { name: "Fermer" }).click();
  await openNamed(page, "Exporter", phone);
  await expect(page.getByRole("checkbox", { name: "Durée estimée", exact: true })).not.toBeChecked();
  await page.getByLabel("Du", { exact: true }).fill("2026-10-17");
  await page.getByLabel("Au", { exact: true }).fill("2026-10-17");
  await expect(page.getByText("0 course dans la période.")).toBeVisible();
  await page.getByLabel("Du", { exact: true }).fill("2026-10-16");
  await page.getByLabel("Au", { exact: true }).fill("2026-10-16");
  if (phone) await page.screenshot({ path: "/opt/cursor/artifacts/phone-export-planning.png" });

  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Planning CSV" }).click();
  const csvFile = await csvDownload;
  const text = fs.readFileSync((await csvFile.path())!, "utf8");
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text.split("\n")[0]).toContain(";");
  expect(text).toContain("Heure début");
  expect(text).not.toContain("Durée estimée");
  expect(text).toContain("16/10/2026");

  if (!phone) {
    const xlsxDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Planning Excel" }).click();
    const xlsxFile = await xlsxDownload;
    const book = XLSX.read(fs.readFileSync((await xlsxFile.path())!), { cellNF: true });
    const sheet = book.Sheets.Planning!;
    expect(sheet.A1?.v).toBe("Société");
    expect(sheet.B1?.v).toBe("Exemple fictif");
    expect(sheet.B2?.z).toBe("dd/mm/yyyy");
    expect(sheet.B2?.w).toBe("16/10/2026");
    expect(sheet.A5?.v).toBe("Date");
    expect(sheet.A6?.z).toBe("dd/mm/yyyy");
    expect(sheet.A6?.w).toBe("16/10/2026");
  }
});

async function openPlanning(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Planning en 1 clic" }).first().click();
  await page.getByRole("button", { name: "Ouvrir le planning" }).click();
  await expect(page.getByText("Équipage", { exact: true })).toBeVisible();
}

async function openNamed(page: Page, name: "Importer" | "Exporter", phone: boolean) {
  if (phone) {
    await page.getByRole("button", { name, exact: true }).click();
    return;
  }
  await page.getByRole("button", { name: "Autres actions" }).click();
  await page.getByRole("group", { name: "Autres actions" }).getByRole("button", { name, exact: true }).click();
}
