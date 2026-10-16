import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { tablesFromBuffer, sheetsToXlsx } from "../src/game/lomacoFiles.ts";
import {
  LOMACO_EXPORT_PROFILE,
  LOMACO_IMPORT_PROFILE,
  detectField,
  mapSheet,
  previewLomaco,
  routeSheets,
  sheetsToCsvFiles,
  zipTexts,
  type ImportProfile,
} from "../src/game/lomaco.ts";
import type { Crew, Location, Patient, Transport } from "../src/game/types.ts";
import { DEFAULT_RULES } from "../src/game/types.ts";
import type { CrewSchedule } from "../src/game/schedule.ts";

const chu: Location = {
  id: "chu",
  name: "CHU Charles-Nicolle",
  short: "CHU Nicolle",
  kind: "chu",
  lat: 49.44,
  lng: 1.1,
  city: "Rouen",
};
const mathilde: Location = {
  id: "mathilde",
  name: "Clinique Mathilde, rue de Lessard",
  short: "Clinique Mathilde",
  kind: "clinique",
  lat: 49.42,
  lng: 1.09,
  city: "Rouen",
};

describe("import Lomaco", () => {
  it("reconnaît les en-têtes français du profil à confirmer", () => {
    const headers = [
      "N° dossier",
      "Heure RDV",
      "Adresse départ",
      "Adresse d'arrivée",
      "Type",
      "Aller/Retour",
      "Équipage",
      "Immatriculation",
    ];
    const fields = headers.map((header) => detectField(header, LOMACO_IMPORT_PROFILE));
    assert.deepEqual(fields, [
      "dossier",
      "heure_rdv",
      "adresse_depart",
      "adresse_arrivee",
      "type",
      "sens",
      "equipage",
      "immatriculation",
    ]);
    assert.equal(LOMACO_IMPORT_PROFILE.name, "Lomaco (à confirmer)");
    assert.equal(LOMACO_EXPORT_PROFILE.name, "Lomaco (à confirmer)");
  });

  it("un profil enregistré prime sur les synonymes", () => {
    const profile: ImportProfile = { id: "bureau", name: "Bureau", map: { horaire: "heure_rdv" } };
    assert.equal(detectField("Horaire", profile), "heure_rdv");
    assert.equal(detectField("Horaire", LOMACO_IMPORT_PROFILE), "ignore");
  });

  it("prévisualise courses, véhicules et rejets", async () => {
    const sheet = mapSheet(
      {
        file: "lomaco.csv",
        sheet: "Courses",
        headers: [
          "Dossier",
          "Nom",
          "Prénom",
          "Heure RDV",
          "Adresse départ",
          "Adresse arrivée",
          "Type",
          "Sens",
          "Immatriculation",
          "Conducteur",
        ],
        rows: [
          [
            "DOS-9",
            "BERNARD",
            "Luc",
            "10:30",
            "CHU Charles-Nicolle",
            "Clinique Mathilde, rue de Lessard",
            "TAP",
            "aller",
            "GR-880-LM",
            "MARTIN Paul",
          ],
          [
            "DOS-10",
            "MARTIN",
            "Anne",
            "99:99",
            "CHU Charles-Nicolle",
            "Clinique Mathilde, rue de Lessard",
            "VSL",
            "aller",
            "GR-881-LM",
            "",
          ],
          [
            "DOS-11",
            "DURAND",
            "Léa",
            "11:00",
            "CHU Charles-Nicolle",
            "Clinique Mathilde, rue de Lessard",
            "VSL",
            "allongé",
            "GR-882-LM",
            "",
          ],
        ],
      },
      LOMACO_IMPORT_PROFILE,
    );
    assert.equal(sheet.kind, "transport");
    const preview = await previewLomaco([sheet], {
      locations: [chu, mathilde],
      rules: DEFAULT_RULES,
      missionIso: "2026-10-16",
      fleet: [],
      geocode: async () => null,
    });
    assert.equal(preview.transports.length, 1);
    assert.equal(preview.transports[0]!.transport.service, "TAP");
    assert.equal(preview.transports[0]!.transport.posture, "assis");
    assert.equal(preview.vehicles[0]!.vehicleType, "vsl");
    assert.match(preview.vehicles[0]!.summary, /TAP/);
    assert.equal(preview.crews[0]!.driver, "MARTIN Paul");
    assert.equal(preview.rejected.length, 2);
    assert.match(preview.rejected.map((row) => row.reason).join(" "), /Heure invalide/);
    assert.match(preview.rejected.map((row) => row.reason).join(" "), /inconnu/);
  });

  it("garde les accents d'un csv utf-8", async () => {
    const csv = "Prénom;Heure RDV;Adresse départ;Adresse arrivée\nLuc;10:30;CHU;Clinique\n";
    const bytes = new TextEncoder().encode(csv);
    const tables = await tablesFromBuffer(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "accents.csv",
    );
    assert.deepEqual(tables[0]!.headers, ["Prénom", "Heure RDV", "Adresse départ", "Adresse arrivée"]);
    const fields = tables[0]!.headers.map((header) => detectField(header, LOMACO_IMPORT_PROFILE));
    assert.deepEqual(fields, ["prenom", "heure_rdv", "adresse_depart", "adresse_arrivee"]);
  });

  it("lit un classeur xlsx à plusieurs feuilles", async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["Immatriculation", "Type", "Nom du véhicule"],
        ["GR-100-AA", "AMB", "Master"],
      ]),
      "Vehicules",
    );
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["Immatriculation", "Conducteur", "Auxiliaire", "DEA"],
        ["GR-100-AA", "MARTIN Paul", "DURAND Lea", "oui"],
      ]),
      "Equipages",
    );
    const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" });
    const buffer = bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes as ArrayLike<number>).buffer;
    const tables = await tablesFromBuffer(buffer, "lomaco.xlsx");
    assert.equal(tables.length, 2);
    const mapped = tables.map((table) => mapSheet(table, LOMACO_IMPORT_PROFILE));
    assert.deepEqual(
      mapped.map((sheet) => sheet.kind),
      ["vehicule", "equipage"],
    );
    const preview = await previewLomaco(mapped, {
      locations: [],
      rules: DEFAULT_RULES,
      missionIso: "2026-10-16",
      fleet: [],
      geocode: async () => null,
    });
    assert.equal(preview.vehicles[0]!.plate, "GR-100-AA");
    assert.equal(preview.vehicles[0]!.vehicleType, "ambulance");
    assert.equal(preview.crews[0]!.mate, "DURAND Lea");
    assert.equal(preview.rejected.length, 0);
  });
});

describe("export Lomaco", () => {
  it("écrit une feuille par équipage avec le profil à confirmer", async () => {
    const crew: Crew = {
      id: "c1",
      code: "AMB-1",
      driver: "Martin",
      mate: "Durand",
      vehicleType: "ambulance",
      plate: "AB-123-CD",
      vehicleName: "Ambulance",
      color: "#145",
      baseId: "depot",
      shiftStart: 6 * 60,
      shiftEnd: 17 * 60,
      delayUntil: 0,
      dea: true,
    };
    const patient: Patient = {
      id: "p1",
      firstName: "Luc",
      lastName: "Bernard",
      phone: "",
      birthYear: 1950,
      addressId: chu.id,
    };
    const transport: Transport = {
      id: "t1",
      dossier: "DOS-9",
      patientId: "p1",
      pickupId: chu.id,
      dropoffId: mathilde.id,
      windowStart: 10 * 60,
      windowEnd: 11 * 60,
      appointmentMin: 10 * 60 + 30,
      posture: "assis",
      serviceMin: 10,
      kind: "aller",
      priority: "normal",
      cancelled: false,
      crewId: "c1",
      departMin: 10 * 60,
      service: "TAP",
    };
    const loose: Transport = {
      ...transport,
      id: "t2",
      dossier: "DOS-10",
      crewId: undefined,
      departMin: undefined,
      service: "VSL",
    };
    const schedule: CrewSchedule = {
      crewId: "c1",
      legs: [
        {
          id: "leg",
          transportId: "t1",
          departMin: 10 * 60,
          arrivePickup: 10 * 60 + 20,
          endMin: 11 * 60,
          deadheadKm: 1,
          loadedKm: 4,
          kmEstimated: false,
        },
      ],
      returnKm: 2,
      emptyKm: 3,
    } as CrewSchedule;
    const sheets = routeSheets({
      crews: [crew],
      transports: [transport, loose],
      patients: new Map([[patient.id, patient]]),
      locations: new Map([
        [chu.id, chu],
        [mathilde.id, mathilde],
      ]),
      schedules: new Map([["c1", schedule]]),
      missionIso: "2026-10-16",
      columns: LOMACO_EXPORT_PROFILE.columns,
    });
    assert.deepEqual(
      sheets.map((sheet) => sheet.name),
      ["AMB-1", "A traiter"],
    );
    assert.equal(sheets[0]!.rows[0]![2], "Heure RDV");
    assert.equal(sheets[0]!.rows[1]![0], "DOS-9");
    assert.equal(sheets[0]!.rows[1]![5], "TAP");
    assert.equal(sheets[1]!.rows[1]![0], "DOS-10");
    const files = sheetsToCsvFiles(sheets);
    assert.match(files[0]!.text, /Heure RDV/);
    assert.match(files[0]!.name, /AMB-1/);
    const zip = zipTexts(files);
    assert.equal(String.fromCharCode(zip[0]!, zip[1]!), "PK");
    const xlsx = await sheetsToXlsx(sheets);
    const book = XLSX.read(xlsx, { type: "array" });
    assert.deepEqual(book.SheetNames, ["AMB-1", "A traiter"]);
  });
});
