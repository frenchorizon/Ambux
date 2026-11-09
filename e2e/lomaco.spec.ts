import { expect, test } from "@playwright/test";
import fs from "node:fs";
import * as XLSX from "xlsx";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ambux.tour.v1", "1");
    localStorage.setItem("ambux.theme", "light");
  });
});

test("importer Lomaco puis exporter les feuilles", async ({ page }, testInfo) => {
  const csv = [
    "Dossier;Nom;Prénom;Heure RDV;Adresse départ;Adresse arrivée;Type;Sens",
    "DOS-9;BERNARD;Luc;10:30;CHU Charles-Nicolle;Clinique Mathilde, rue de Lessard;TAP;aller",
    "DOS-10;MARTIN;Anne;99:99;CHU Charles-Nicolle;Clinique Mathilde, rue de Lessard;VSL;aller",
  ].join("\n");
  await page.goto("/");
  await page.getByRole("button", { name: "Voir l'exemple" }).first().click();
  await page.getByRole("button", { name: "Ouvrir le planning" }).click();
  await expect(page.getByText("Équipage", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Autres actions" }).click();
  await page.getByRole("group", { name: "Autres actions" }).getByRole("button", { name: "Importer" }).click();
  await page.getByLabel("Fichiers Lomaco").setInputFiles({
    name: "lomaco.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.getByText("lomaco.csv")).toBeVisible();
  await page.getByRole("button", { name: "Colonnes" }).click();
  await expect(page.getByLabel("Profil d'import")).toContainText("Lomaco (à confirmer)");
  await expect(page.getByLabel("Colonne Heure RDV")).toHaveValue("heure_rdv");
  await expect(page.getByLabel("Colonne Type")).toHaveValue("type");
  await page.screenshot({
    path:
      testInfo.project.name === "phone"
        ? "/opt/cursor/artifacts/v05-import-telephone.png"
        : "/opt/cursor/artifacts/v05-import-colonnes.png",
  });
  await page.getByRole("button", { name: "Aperçu" }).click();
  await expect(page.getByText(/BERNARD Luc/)).toBeVisible();
  await expect(page.getByText(/Heure invalide/)).toBeVisible();
  await expect(page.getByText(/TAP/).first()).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/opt/cursor/artifacts/v05-import-apercu.png" });
  }
  await page.getByRole("button", { name: "Fusionner" }).click();
  await expect(page.getByText(/transport ajouté/)).toBeVisible();

  await page.getByRole("button", { name: "Autres actions" }).click();
  await page
    .getByRole("group", { name: "Autres actions" })
    .getByRole("button", { name: "Exporter", exact: true })
    .click();
  await expect(page.getByLabel("Profil d'export", { exact: true })).toContainText("Lomaco (à confirmer)");
  await expect(page.getByText("Heure RDV")).toBeVisible();
  if (testInfo.project.name === "desktop") {
    await page.screenshot({ path: "/opt/cursor/artifacts/v05-export.png" });
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Feuilles XLSX" }).click();
    const file = await download;
    const book = XLSX.read(fs.readFileSync((await file.path())!));
    expect(book.SheetNames).toContain("A traiter");
    const grid = XLSX.utils.sheet_to_json<(string | number)[]>(book.Sheets["A traiter"]!, { header: 1, raw: false });
    const flat = grid.flat().join(" ");
    expect(flat).toContain("Heure RDV");
    expect(flat).toContain("DOS-9");
    expect(flat).toContain("TAP");
  }
});
