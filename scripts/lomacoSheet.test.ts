import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectField, LOMACO_IMPORT_PROFILE, mapSheet, previewLomaco } from "../src/game/lomaco.ts";
import { lomacoPlanningHtml, planningDate } from "../src/game/lomacoSheet.ts";
import type { Leg } from "../src/game/schedule.ts";
import { DEFAULT_RULES, type Crew, type Location, type Patient, type Transport } from "../src/game/types.ts";

const home: Location = {
  id: "home",
  name: "12 rue des Lilas",
  short: "Lilas",
  kind: "domicile",
  lat: 49.44,
  lng: 1.05,
  city: "Rouen",
  postalCode: "76000",
};
const chu: Location = {
  id: "chu",
  name: "Clinique des Tilleuls",
  short: "Tilleuls",
  kind: "clinique",
  lat: 49.45,
  lng: 1.1,
  city: "Rouen",
  postalCode: "76000",
};

function crew(): Crew {
  return {
    id: "c1",
    code: "AMB-1",
    driver: "Karim Bensaïd",
    mate: "Léa Morel",
    vehicleType: "ambulance",
    vehicleCode: "105",
    plate: "HC 105 KL",
    vehicleName: "Master",
    color: "#145",
    baseId: "depot",
    shiftStart: 6 * 60,
    shiftEnd: 18 * 60,
    delayUntil: 0,
    dea: true,
  };
}

function leg(id: string, pickup: number): Leg {
  return {
    transportId: id,
    crewId: "c1",
    departMin: pickup - 15,
    arrivePickup: pickup,
    endMin: pickup + 40,
    deadheadMin: 15,
    waitMin: 0,
    loadedMin: 12,
    pecMin: 10,
    deadheadKm: 2,
    loadedKm: 4,
    lateMin: 0,
    deviationMin: 0,
    outOfTolerance: false,
    kmEstimated: false,
    conflict: false,
    incompatible: false,
    fromId: home.id,
    dropoffId: chu.id,
    segments: [{ kind: "loaded", start: pickup + 8, end: pickup + 20 }],
  };
}

describe("feuille Planning IMPRESSION_STD", () => {
  it("date le mardi 13 octobre 2026", () => {
    assert.equal(planningDate("2026-10-13"), "mardi 13 octobre 2026");
  });

  it("reconnaît naissance, motif et série", () => {
    assert.equal(detectField("Né(e) le", LOMACO_IMPORT_PROFILE), "naissance");
    assert.equal(detectField("Motif", LOMACO_IMPORT_PROFILE), "motif");
    assert.equal(detectField("Série", LOMACO_IMPORT_PROFILE), "serie");
    assert.equal(detectField("Code véhicule", LOMACO_IMPORT_PROFILE), "code_vehicule");
  });

  it("imprime une feuille A4 par équipage, triée, avec le séparateur", async () => {
    const patient: Patient = {
      id: "p1",
      firstName: "Luc",
      lastName: "Bernard",
      phone: "02 35 00 11 22",
      birthYear: 1948,
      birthDate: "1948-03-14",
      addressId: home.id,
    };
    const early: Transport = {
      id: "t-late",
      dossier: "DOS-2",
      patientId: "p1",
      pickupId: home.id,
      dropoffId: chu.id,
      windowStart: 11 * 60,
      windowEnd: 12 * 60,
      appointmentMin: 11 * 60 + 30,
      posture: "assis",
      serviceMin: 10,
      kind: "retour",
      priority: "normal",
      cancelled: false,
      crewId: "c1",
      service: "VSL",
      motif: "KINE",
    };
    const first: Transport = {
      id: "t-early",
      dossier: "DOS-1",
      patientId: "p1",
      pickupId: home.id,
      dropoffId: chu.id,
      windowStart: 8 * 60,
      windowEnd: 9 * 60,
      appointmentMin: 8 * 60 + 30,
      posture: "assis",
      serviceMin: 10,
      kind: "dialyse_aller",
      seriesId: "serie-1",
      priority: "normal",
      cancelled: false,
      crewId: "c1",
      service: "TAP",
      motif: "DIAL",
      note: "PRENDRE PROCHAIN RDV",
    };
    const html = lomacoPlanningHtml({
      missionIso: "2026-10-13",
      editedAt: new Date(2026, 9, 13, 8, 15),
      regulator: "Noam Keller",
      crews: [crew()],
      transports: [early, first],
      patients: new Map([[patient.id, patient]]),
      locations: new Map([
        [home.id, home],
        [chu.id, chu],
      ]),
      legs: new Map([
        [first.id, leg(first.id, 8 * 60 + 10)],
        [early.id, leg(early.id, 11 * 60 + 10)],
      ]),
    });
    const earlyAt = html.indexOf("DOS-1") === -1 ? html.indexOf("TAP") : html.indexOf("TAP");
    assert.ok(html.indexOf("TAP") < html.indexOf("KINE - KINE"));
    assert.match(html, /mardi 13 octobre 2026/);
    assert.match(html, /Planning - Édité le 13\/10\/2026 à 08:15/);
    assert.match(html, /Par Noam Keller/);
    assert.match(html, /Choix IMPRESSION_STD/);
    assert.match(html, /Page 1\/1/);
    assert.match(html, /BERNARD/);
    assert.match(html, /Né\(e\) le 14\/03\/1948/);
    assert.match(html, /02 35 00 11 22/);
    assert.match(html, /76000 Rouen/);
    assert.match(html, /DIAL - DIALYSE/);
    assert.match(html, /Série/);
    assert.match(html, /À faire/);
    assert.match(html, /105 - HC 105 KL/);
    assert.match(html, /CN - Karim Bensaïd/);
    assert.match(html, /PRENDRE PROCHAIN RDV/);
    assert.match(html, /size: A4 portrait/);
    assert.equal(earlyAt >= 0, true);

    const sheet = mapSheet(
      {
        file: "courses.csv",
        sheet: "Courses",
        headers: [
          "Nom",
          "Prénom",
          "Heure RDV",
          "Adresse départ",
          "Adresse arrivée",
          "Type",
          "Né(e) le",
          "Motif",
          "Série",
        ],
        rows: [
          [
            "BERNARD",
            "Luc",
            "10:30",
            "Clinique des Tilleuls",
            "12 rue des Lilas",
            "TAP",
            "14/03/1948",
            "DIAL - DIALYSE",
            "Unique",
          ],
        ],
      },
      LOMACO_IMPORT_PROFILE,
    );
    const preview = await previewLomaco([sheet], {
      locations: [home, chu],
      rules: DEFAULT_RULES,
      missionIso: "2026-10-16",
      fleet: [],
      geocode: async () => null,
    });
    assert.equal(preview.transports[0]?.patient.birthDate, "1948-03-14");
    assert.equal(preview.transports[0]?.transport.motif, "DIAL");
    assert.equal(preview.transports[0]?.transport.seriesId, undefined);
    assert.equal(preview.rejected.length, 0);
  });

  it("passe à la page 2 et marque une course prise en charge", () => {
    const patient: Patient = {
      id: "p",
      firstName: "Anne",
      lastName: "Martin",
      phone: "06 00 00 00 00",
      birthYear: 1960,
      birthDate: "1960-01-02",
      addressId: home.id,
    };
    const transports: Transport[] = Array.from({ length: 8 }, (_, index) => ({
      id: `t${index}`,
      dossier: `DOS-${index}`,
      patientId: "p",
      pickupId: home.id,
      dropoffId: chu.id,
      windowStart: 8 * 60 + index * 30,
      windowEnd: 9 * 60 + index * 30,
      appointmentMin: 8 * 60 + index * 30,
      posture: "assis" as const,
      serviceMin: 8,
      kind: "aller" as const,
      priority: "normal" as const,
      cancelled: false,
      crewId: "c1",
      service: "AMB" as const,
      motif: "CONS" as const,
    }));
    const legs = new Map(transports.map((transport, index) => [transport.id, leg(transport.id, 8 * 60 + index * 30)]));
    const html = lomacoPlanningHtml({
      missionIso: "2026-10-16",
      editedAt: new Date(2026, 9, 16, 9, 0),
      live: true,
      nowMin: 8 * 60 + 10,
      crews: [crew()],
      transports,
      patients: new Map([["p", patient]]),
      locations: new Map([
        [home.id, home],
        [chu.id, chu],
      ]),
      legs,
    });
    assert.match(html, /Page 1\/2/);
    assert.match(html, /Page 2\/2/);
    assert.match(html, /Pris en charge/);
    assert.match(html, /À faire/);
  });
});
