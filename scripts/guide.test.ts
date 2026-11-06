import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { previewCsv } from "../src/game/csv.ts";
import { previewCrews, previewVehicles } from "../src/game/fleetCsv.ts";
import { DEFAULT_RULES } from "../src/game/types.ts";
import { readTables } from "../src/io/parsers/readTable.ts";
import {
  GUIDE_META,
  GUIDE_STEPS,
  missionExample,
  normHeader,
  parseDelimited,
  selectSheet,
  tableToPreviewCsv,
  templateCsv,
  templateGrid,
  templateXlsx,
  workbookSheets,
} from "../src/io/templates/guide.ts";

const ISO = "2026-10-16";

describe("modèles d'import guidé", () => {
  it("propose flotte, personnel, puis missions, avec une ligne fictive hors Rouen", () => {
    assert.deepEqual(GUIDE_STEPS, ["vehicules", "equipages", "missions"]);
    for (const step of GUIDE_STEPS) {
      const grid = templateGrid(step, ISO);
      assert.equal(grid.length, 2);
      assert.equal(grid[0]!.join(";"), GUIDE_META[step].columns);
      const flat = grid.flat().join(" ");
      assert.equal(/rouen/i.test(flat), false);
    }
    assert.match(templateGrid("missions", ISO).flat().join(" "), /Lyon/);
    assert.match(templateGrid("vehicules", ISO).flat().join(" "), /LY-410-EX/);
    assert.match(templateGrid("equipages", ISO).flat().join(" "), /LY-410-EX/);
    assert.deepEqual(missionExample(ISO)[3], ISO);
    assert.equal(missionExample(ISO)[4], "09:15");
    const crew = templateGrid("equipages", ISO)[1]!;
    assert.equal(crew[1], "BERNARD Claire");
    assert.equal(crew[2], "MOREAU Hugo");
  });

  it("écrit un csv et un xlsx que les validateurs existants acceptent", async () => {
    const vehiclesCsv = templateCsv("vehicules", ISO);
    assert.equal(vehiclesCsv.startsWith("\uFEFF"), true);
    assert.equal(
      vehiclesCsv
        .replace(/^\uFEFF/, "")
        .trim()
        .split("\n").length,
      2,
    );
    const fromCsv = await previewVehicles(vehiclesCsv, []);
    assert.equal(fromCsv.accepted.length, 1);
    assert.equal(fromCsv.accepted[0]!.plate, "LY-410-EX");
    assert.equal(fromCsv.accepted[0]!.vehicleType, "ambulance");
    assert.equal(fromCsv.rejected.length, 0);

    const xlsx = await templateXlsx("missions", ISO);
    const book = XLSX.read(xlsx, { type: "array" });
    const sheet = book.Sheets.Missions!;
    const clock = sheet.B5 ?? sheet[XLSX.utils.encode_cell({ r: 1, c: 4 })];
    assert.equal(clock?.t, "s");
    assert.equal(clock?.v, "09:15");
    const tables = await readTables(toBuffer(xlsx), "ambux-modele-missions.xlsx");
    assert.equal(tables[0]!.headers[1], "nom");
    assert.equal(tables[0]!.rows[0]![2], "Inès");
    const mapped = tableToPreviewCsv(tables[0]!.headers, tables[0]!.rows, GUIDE_META.missions.columns, "missions");
    assert.equal("csv" in mapped, true);
    if (!("csv" in mapped)) return;
    const preview = await previewCsv(mapped.csv, [], DEFAULT_RULES, ISO, async (query) => ({
      lat: 45.76,
      lng: 4.83,
      label: query,
    }));
    assert.equal(preview.rejected.length, 0);
    assert.equal(preview.accepted.length, 1);
    assert.equal(preview.accepted[0]!.patient.lastName, "LEFEVRE");
    assert.equal(preview.accepted[0]!.transport.appointmentMin, 9 * 60 + 15);
  });
});

describe("validation de l'import guidé", () => {
  it("explique un type inconnu, une plaque absente et une date hors mission", async () => {
    const badType = tableToPreviewCsv(
      ["immatriculation", "type", "nom"],
      [["LY-410-EX", "voiture", "Master"]],
      GUIDE_META.vehicules.columns,
      "vehicules",
    );
    assert.equal("csv" in badType, true);
    if (!("csv" in badType)) return;
    const vehicles = previewVehicles(badType.csv, []);
    assert.equal(vehicles.accepted.length, 0);
    assert.match(vehicles.rejected[0]!.reason, /Type « voiture » inconnu/);
    assert.match(vehicles.rejected[0]!.reason, /ambulance, vsl/);

    const crews = previewCrews(templateCsv("equipages", ISO), []);
    assert.match(crews.rejected[0]!.reason, /LY-410-EX/);
    assert.match(crews.rejected[0]!.reason, /introuvable/);

    const fleet = previewVehicles(templateCsv("vehicules", ISO), []);
    const named = previewCrews(templateCsv("equipages", ISO), [
      { plate: fleet.accepted[0]!.plate, vehicleType: fleet.accepted[0]!.vehicleType },
    ]);
    assert.equal(named.accepted.length, 1);
    assert.equal(named.accepted[0]!.driver, "BERNARD Claire");
    assert.equal(named.accepted[0]!.dea, true);

    const late = tableToPreviewCsv(
      GUIDE_META.missions.columns.split(";"),
      [
        [
          "EX-2",
          "MARTIN",
          "Luc",
          "1999-01-01",
          "08:00",
          "1 rue du Test, Lyon",
          "2 rue du Test, Lyon",
          "assis",
          "simple",
        ],
      ],
      GUIDE_META.missions.columns,
      "missions",
    );
    assert.equal("csv" in late, true);
    if (!("csv" in late)) return;
    const missions = await previewCsv(late.csv, [], DEFAULT_RULES, ISO, async () => null);
    assert.match(missions.rejected[0]!.reason, /1999-01-01/);
    assert.match(missions.rejected[0]!.reason, /2026-10-16/);
  });

  it("remet les colonnes dans l'ordre et nomme celles qui manquent", () => {
    assert.equal(normHeader("Heure RDV"), "heure_rdv");
    assert.equal(normHeader("Adresse départ"), "adresse_depart");
    const reordered = tableToPreviewCsv(
      ["nom", "type", "immatriculation"],
      [["Master", "ambulance", "LY-410-EX"]],
      GUIDE_META.vehicules.columns,
      "vehicules",
    );
    assert.equal("csv" in reordered, true);
    if (!("csv" in reordered)) return;
    const accepted = previewVehicles(reordered.csv, []);
    assert.equal(accepted.accepted[0]?.plate, "LY-410-EX");
    assert.equal(accepted.rejected.length, 0);

    const missing = tableToPreviewCsv(
      ["immatriculation", "nom"],
      [["LY-410-EX", "Master"]],
      GUIDE_META.vehicules.columns,
      "vehicules",
    );
    assert.equal("reason" in missing, true);
    if (!("reason" in missing)) return;
    assert.match(missing.reason, /la colonne type/);
    assert.match(missing.reason, /Colonnes attendues : immatriculation, type, nom/);

    const picked = selectSheet(
      [
        { file: "a.xlsx", sheet: "Notes", headers: ["commentaire"], rows: [["rien"]] },
        {
          file: "a.xlsx",
          sheet: "Flotte",
          headers: ["immatriculation", "type", "nom"],
          rows: [["LY-410-EX", "ambulance", "Master"]],
        },
      ],
      GUIDE_META.vehicules.columns,
    );
    assert.equal(picked?.sheet, "Flotte");
  });

  it("garde la date ISO d'un csv et d'une cellule Excel", async () => {
    const raw = [
      GUIDE_META.missions.columns,
      "EX-100;LEFEVRE;Inès;2026-10-16;09:15;12 rue des Tilleuls, Lyon;Clinique des Tilleuls, Lyon;assis;simple;;exemple fictif;;",
      ";MARTIN;Luc;1999-01-01;08:00;1 rue du Test, Lyon;2 rue du Test, Lyon;assis;simple;;;;",
    ].join("\n");
    const parsed = parseDelimited(raw);
    assert.equal(parsed?.rows[0]?.[3], "2026-10-16");
    assert.equal(parsed?.rows[1]?.[3], "1999-01-01");
    const mapped = tableToPreviewCsv(parsed!.headers, parsed!.rows, GUIDE_META.missions.columns, "missions");
    assert.equal("csv" in mapped, true);
    if (!("csv" in mapped)) return;
    const preview = await previewCsv(mapped.csv, [], DEFAULT_RULES, ISO, async (query) => ({
      lat: 45.76,
      lng: 4.83,
      label: query,
    }));
    assert.equal(preview.accepted.length, 1);
    assert.equal(preview.accepted[0]!.patient.lastName, "LEFEVRE");
    assert.match(preview.rejected[0]!.reason, /1999-01-01/);

    const serial = Math.round((Date.UTC(2026, 9, 16) - Date.UTC(1899, 11, 30)) / 86_400_000);
    const book = XLSX.utils.book_new();
    const sheet: XLSX.WorkSheet = {
      A1: { t: "s", v: "date" },
      B1: { t: "s", v: "heure_rdv" },
      A2: { t: "n", v: serial, z: "yyyy-mm-dd" },
      B2: { t: "n", v: (9 * 60 + 15) / (24 * 60), z: "hh:mm" },
      "!ref": "A1:B2",
    };
    XLSX.utils.book_append_sheet(book, sheet, "Missions");
    const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer | Uint8Array;
    const buffer = bytes instanceof ArrayBuffer ? bytes : toBuffer(new Uint8Array(bytes));
    const tables = await workbookSheets(buffer);
    assert.equal(tables[0]!.rows[0]![0], "2026-10-16");
    assert.equal(tables[0]!.rows[0]![1], "09:15");
  });
});

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
