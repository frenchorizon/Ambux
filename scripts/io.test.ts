import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { isTracked } from "../src/game/history.ts";
import { LOMACO_IMPORT_PROFILE, detectField, mapSheet, previewLomaco } from "../src/game/lomaco.ts";
import { initialState, reducer } from "../src/game/reducer.ts";
import type { CrewSchedule } from "../src/game/schedule.ts";
import { DEFAULT_RULES, MAX_VEHICLES, type Crew, type Location, type Transport } from "../src/game/types.ts";
import { readTables } from "../src/io/parsers/readTable.ts";
import { suggestExtraField } from "../src/io/mapping/suggest.ts";
import { checkPersonnel, parseAttente, readAvailability } from "../src/io/validators/rows.ts";
import {
  excelSerial,
  frenchDate,
  inPlanningRange,
  loadPlanningChoice,
  planningCsv,
  planningMatrix,
  planningXlsx,
  savePlanningChoice,
} from "../src/io/exporters/planning.ts";

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

describe("io / mapping", () => {
  it("suggère les champs ajoutés sans écraser Lomaco", () => {
    assert.equal(suggestExtraField("Disponibilités"), "disponibilite");
    assert.equal(suggestExtraField("Contraintes"), "contraintes");
    assert.equal(suggestExtraField("Attente"), "attente");
    assert.equal(detectField("Heure RDV", LOMACO_IMPORT_PROFILE), "heure_rdv");
    assert.equal(detectField("Attente", LOMACO_IMPORT_PROFILE), "attente");
    assert.equal(LOMACO_IMPORT_PROFILE.name, "Lomaco (à confirmer)");
  });
});

describe("io / parsers", () => {
  it("lit un csv et un xls", async () => {
    const csv = new TextEncoder().encode("Nom;Rôle\nLEROY Marc;conducteur\n");
    const tables = await readTables(csv.buffer.slice(csv.byteOffset, csv.byteOffset + csv.byteLength), "personnel.csv");
    assert.equal(tables[0]!.headers[0], "Nom");
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["Immatriculation", "Type"],
        ["ZZ-100-ZZ", "VSL"],
      ]),
      "Vehicules",
    );
    const bytes = XLSX.write(book, { type: "array", bookType: "xls" });
    const buffer = bytes instanceof ArrayBuffer ? bytes : Uint8Array.from(bytes as ArrayLike<number>).buffer;
    const xls = await readTables(buffer, "flotte.xls");
    assert.equal(xls[0]!.rows[0]![0], "ZZ-100-ZZ");
  });
});

describe("io / validators", () => {
  it("crée le retour d'une séance et n'écrit rien avant la fusion", async () => {
    const locations = [chu, mathilde];
    const sheet = mapSheet(
      {
        file: "seance.csv",
        sheet: "Courses",
        headers: ["Nom", "Prénom", "Heure RDV", "Adresse départ", "Adresse arrivée", "Type", "Sens", "Attente"],
        rows: [
          [
            "TESSIER",
            "Noémie",
            "09:00",
            "CHU Charles-Nicolle",
            "Clinique Mathilde, rue de Lessard",
            "VSL",
            "simple",
            "90",
          ],
        ],
      },
      LOMACO_IMPORT_PROFILE,
    );
    const preview = await previewLomaco([sheet], {
      locations,
      rules: DEFAULT_RULES,
      missionIso: "2026-10-16",
      fleet: [],
      geocode: async () => null,
    });
    assert.equal(locations.length, 2);
    assert.equal(preview.transports.length, 1);
    assert.equal(preview.transports[0]!.retour?.appointmentMin, 10 * 60 + 30);
    assert.match(preview.warnings.map((row) => row.message).join(" "), /retour créé/);
    assert.equal(preview.rejected.length, 0);
    assert.deepEqual(parseAttente("1h30"), { ok: true, minutes: 90 });
    assert.equal(readAvailability("indisponible").active, false);
    assert.equal(checkPersonnel({ nom: "LEROY Marc", role: "pilote" }).ok, false);
  });

  it("prévisualise patients, personnel et disponibilité", async () => {
    const people = mapSheet(
      {
        file: "gens.csv",
        sheet: "Personnel",
        headers: ["Nom", "Rôle", "Disponibilités"],
        rows: [
          ["LEROY Marc", "conducteur", "06:00-17:00"],
          ["LEROY Marc", "conducteur", "08:00-12:00"],
        ],
      },
      LOMACO_IMPORT_PROFILE,
    );
    const patients = mapSheet(
      {
        file: "patients.csv",
        sheet: "Patients",
        headers: ["Nom", "Prénom", "Adresse", "Contraintes"],
        rows: [["LEROY", "Marc", "12 rue des Carmes, Rouen", "fauteuil, oxygène"]],
      },
      LOMACO_IMPORT_PROFILE,
    );
    const fleet = mapSheet(
      {
        file: "vehicules.csv",
        sheet: "Vehicules",
        headers: ["Immatriculation", "Type", "Disponibilité"],
        rows: [["ZZ-200-ZZ", "VSL", "indisponible"]],
      },
      LOMACO_IMPORT_PROFILE,
    );
    assert.deepEqual([people.kind, patients.kind, fleet.kind], ["personnel", "patient", "vehicule"]);
    const preview = await previewLomaco([people, patients, fleet], {
      locations: [],
      rules: DEFAULT_RULES,
      missionIso: "2026-10-16",
      fleet: [],
      geocode: async () => ({ lat: 49.44, lng: 1.09, label: "12 rue des Carmes, Rouen" }),
    });
    assert.equal(preview.personnel.length, 1);
    assert.equal(preview.personnel[0]!.availability, "06:00-17:00");
    assert.equal(
      preview.rejected.some((row) => row.reason.includes("déjà")),
      true,
    );
    assert.equal(preview.patients[0]!.patient.constraints, "fauteuil, oxygène");
    assert.equal(preview.patients[0]!.patient.mobility, "fauteuil");
    assert.equal(preview.vehicles[0]!.active, false);
    assert.match(preview.warnings.map((row) => row.message).join(" "), /mobilité/);
  });

  it("fusionne tout d'un seul geste, sans plafond", () => {
    assert.equal(isTracked("IMPORT_APPLY"), true);
    const crew = (index: number): Crew => ({
      id: `c${index}`,
      code: `VSL-${index}`,
      driver: "Conducteur",
      mate: "",
      vehicleType: "vsl",
      plate: `AA-${String(index).padStart(3, "0")}-AA`,
      vehicleName: "VSL",
      color: "#123",
      baseId: "depot",
      shiftStart: 6 * 60,
      shiftEnd: 17 * 60,
      delayUntil: 0,
      dea: false,
    });
    const full = {
      ...initialState,
      crews: Array.from({ length: MAX_VEHICLES }, (_, index) => crew(index)),
    };
    const transport: Transport = {
      id: "t-tessier",
      dossier: "DOS-1",
      patientId: "p-tessier",
      pickupId: chu.id,
      dropoffId: mathilde.id,
      windowStart: 8 * 60,
      windowEnd: 10 * 60,
      appointmentMin: 9 * 60,
      posture: "assis",
      serviceMin: 10,
      kind: "simple",
      priority: "normal",
      cancelled: false,
    };
    const next = reducer(full, {
      type: "IMPORT_APPLY",
      vehicles: [{ plate: "ZZ-300-ZZ", vehicleType: "vsl", name: "VSL démo", active: true }],
      crews: [],
      patients: [],
      personnel: [{ name: "LEROY Marc", role: "conducteur", availability: "06:00-17:00" }],
      courses: [
        {
          transport,
          patient: {
            id: "p-tessier",
            firstName: "Noémie",
            lastName: "TESSIER",
            phone: "",
            birthYear: 1950,
            addressId: chu.id,
          },
          locations: [],
        },
      ],
    });
    assert.equal(next.crews.length, MAX_VEHICLES + 1);
    assert.equal(
      next.vehicles.some((item) => item.plate === "ZZ-300-ZZ"),
      true,
    );
    assert.equal(
      next.staff.some((item) => item.name === "LEROY Marc" && item.availability === "06:00-17:00"),
      true,
    );
    assert.equal(
      next.transports.some((item) => item.id === "t-tessier"),
      true,
    );
    assert.match(next.toast?.message ?? "", /transport ajouté/);
  });
});

describe("io / exporters", () => {
  it("filtre le lendemain, le csv et les dates françaises", async () => {
    const storage = memory();
    assert.equal(loadPlanningChoice("2026-10-16", storage).from, "2026-10-16");
    savePlanningChoice({ columns: ["date", "patient"], from: "2026-10-17", to: "2026-10-18" }, storage);
    assert.deepEqual(loadPlanningChoice("2026-10-16", storage).columns, ["date", "patient"]);
    assert.equal(inPlanningRange("2026-10-16", "2026-10-17", "2026-10-17"), false);
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
      departMin: 10 * 60 + 20,
    };
    const schedule: CrewSchedule = {
      crewId: "c1",
      legs: [
        {
          transportId: "t1",
          crewId: "c1",
          departMin: 10 * 60 + 20,
          arrivePickup: 10 * 60 + 24,
          endMin: 11 * 60 + 5,
          deadheadMin: 4,
          waitMin: 0,
          loadedMin: 8,
          pecMin: 5,
          dropoffMin: 8,
          deadheadKm: 1,
          loadedKm: 3,
          lateMin: 0,
          deviationMin: 0,
          outOfTolerance: false,
          kmEstimated: true,
          routingPending: false,
          conflict: false,
          incompatible: false,
          fromId: "depot",
          dropoffId: mathilde.id,
          segments: [],
        },
      ],
      returnKm: 0,
      returnStart: 0,
      returnEnd: 0,
      idleMin: 0,
    };
    const matrix = planningMatrix({
      crews: [crew],
      transports: [transport],
      patients: new Map([
        ["p1", { id: "p1", firstName: "Luc", lastName: "Bernard", phone: "", birthYear: 1950, addressId: chu.id }],
      ]),
      locations: new Map([chu, mathilde].map((item) => [item.id, item])),
      schedules: new Map([["c1", schedule]]),
      missionIso: "2026-10-16",
      from: "2026-10-16",
      to: "2026-10-16",
      columns: ["date", "heure_debut", "patient", "adresse_pec", "adresse_depose", "equipe", "vehicule", "duree"],
    });
    assert.equal(frenchDate("2026-10-16"), "16/10/2026");
    assert.equal(matrix.rows[0]![0], "16/10/2026");
    assert.equal(matrix.rows[0]![2], "Bernard Luc");
    const csv = planningCsv(matrix);
    assert.equal(csv.charCodeAt(0), 0xfeff);
    assert.match(csv, /Date;Heure début;Patient/);
    const outside = planningMatrix({
      crews: [crew],
      transports: [transport],
      patients: new Map(),
      locations: new Map(),
      schedules: new Map(),
      missionIso: "2026-10-16",
      from: "2026-10-17",
      to: "2026-10-17",
      columns: ["date"],
    });
    assert.equal(outside.rows.length, 0);
    const bytes = await planningXlsx(matrix, "2026-10-16");
    const book = XLSX.read(bytes, { type: "array", cellNF: true });
    const sheet = book.Sheets.Planning!;
    assert.equal(sheet.A2?.z, "dd/mm/yyyy");
    assert.equal(sheet.A2?.v, excelSerial("2026-10-16"));
    assert.equal(sheet.A2?.w, "16/10/2026");
  });
});

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
    get length() {
      return data.size;
    },
  };
}
