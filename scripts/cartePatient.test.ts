import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { previewCsv } from "../src/game/csv.ts";
import { motifLabel, parseMotif } from "../src/game/motif.ts";
import { dropoffClock, simulateLeg } from "../src/game/schedule.ts";
import { DEFAULT_RULES, type Crew, type Location, type Transport } from "../src/game/types.ts";

const depot: Location = {
  id: "depot",
  name: "Depot",
  short: "Depot",
  kind: "depot",
  lat: 49.41,
  lng: 1.05,
  city: "Rouen",
};
const chu: Location = {
  id: "chu",
  name: "Chu",
  short: "Chu",
  kind: "chu",
  lat: 49.44,
  lng: 1.09,
  city: "Rouen",
};

function crew(): Crew {
  return {
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
}

function trip(windowStart: number): Transport {
  return {
    id: "t1",
    dossier: "DOS-1",
    patientId: "p1",
    pickupId: "home",
    dropoffId: "chu",
    windowStart,
    windowEnd: windowStart + 40,
    posture: "assis",
    serviceMin: 10,
    kind: "aller",
    priority: "normal",
    cancelled: false,
  };
}

describe("heure de dépose affichée", () => {
  it("lit le début du segment dropoff, y compris quand le véhicule attend", () => {
    const waited = simulateLeg(trip(8 * 60), 7 * 60, "depot", crew(), new Map());
    assert.ok(waited.waitMin > 0, `attente ${waited.waitMin}`);
    assert.equal(dropoffClock(waited), waited.arrivePickup + waited.pecMin + waited.loadedMin);
    const direct = simulateLeg(trip(6 * 60), 8 * 60, "depot", crew(), new Map());
    assert.equal(direct.waitMin, 0);
    assert.equal(dropoffClock(direct), direct.arrivePickup + direct.pecMin + direct.loadedMin);
    assert.ok((dropoffClock(direct) ?? 0) > direct.arrivePickup);
  });

  it("n'invente pas d'heure pour une course non placée", () => {
    assert.equal(dropoffClock(null), null);
    assert.equal(dropoffClock(undefined), null);
    const bare = simulateLeg(trip(8 * 60), 8 * 60, "depot", crew(), new Map());
    assert.equal(dropoffClock({ ...bare, segments: bare.segments.filter((item) => item.kind !== "dropoff") }), null);
  });
});

describe("libellé de motif", () => {
  it("affiche le libellé long, sinon Aller ou Retour", () => {
    assert.equal(motifLabel({ motif: "CONS", kind: "aller" }), "CONS - CONSULTATION");
    assert.equal(motifLabel({ motif: "KINE", kind: "retour" }), "KINE - KINE");
    assert.equal(motifLabel({ motif: "DIAL", kind: "dialyse_aller" }), "DIAL - DIALYSE");
    assert.equal(motifLabel({ motif: "RADI", kind: "simple" }), "RADI - RADIOTHÉRAPIE");
    assert.equal(motifLabel({ motif: "ORTHO", kind: "aller" }), "ORTHO");
    assert.equal(motifLabel({ kind: "simple" }), "Aller");
    assert.equal(motifLabel({ kind: "aller" }), "Aller");
    assert.equal(motifLabel({ kind: "dialyse_aller" }), "Aller");
    assert.equal(motifLabel({ kind: "retour" }), "Retour");
    assert.equal(motifLabel({ kind: "dialyse_retour" }), "Retour");
    assert.equal(parseMotif(""), null);
    assert.equal(parseMotif("consultation"), "CONS");
    assert.equal(parseMotif("ZUT"), null);
  });
});

describe("CSV motif optionnel", () => {
  const header =
    "dossier;nom;prenom;date;heure_rdv;adresse_depart;adresse_arrivee;mobilite;sens;serie;telephone;note;heure_retour;attente";

  it("accepte une ligne sans colonne motif", async () => {
    const preview = await previewCsv(
      [header, "DOS-1;MORIN;Bernard;;07:05;Depot;Chu;assis;simple;;;;"].join("\n"),
      [depot, chu],
      DEFAULT_RULES,
      "2026-10-16",
    );
    assert.equal(preview.rejected.length, 0);
    assert.equal(preview.accepted[0]?.transport.motif, undefined);
  });

  it("lit le motif et le recopie sur le retour, et refuse un code inconnu", async () => {
    const withMotif = await previewCsv(
      [`${header};motif`, "DOS-2;MARTIN;Lina;;08:00;Depot;Chu;assis;aller;serie-lina;;;;45;KINE"].join("\n"),
      [depot, chu],
      DEFAULT_RULES,
      "2026-10-16",
    );
    assert.equal(withMotif.rejected.length, 0, withMotif.rejected.map((row) => row.reason).join(" | "));
    assert.equal(withMotif.accepted[0]?.transport.motif, "KINE");
    assert.equal(withMotif.accepted[0]?.retour?.motif, "KINE");
    const bad = await previewCsv(
      [`${header};motif`, "DOS-3;PETIT;Jean;;09:00;Depot;Chu;assis;simple;;;;;;TAP"].join("\n"),
      [depot, chu],
      DEFAULT_RULES,
      "2026-10-16",
    );
    assert.equal(bad.accepted.length, 0);
    assert.match(bad.rejected[0]?.reason ?? "", /Motif « TAP »/);
  });
});
