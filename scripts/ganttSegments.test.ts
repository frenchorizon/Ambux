import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { rememberTravel } from "../src/lib/routing.ts";
import { previewOnGrid, scheduleFleet, simulateLeg, snap5, visualParts } from "../src/game/schedule.ts";
import { DEFAULT_RULES, type Crew, type Location, type Transport } from "../src/game/types.ts";

const depot: Location = { id: "g-depot", name: "Depot", short: "Depot", kind: "depot", lat: 49.41, lng: 1.05, city: "Rouen" };
const home: Location = { id: "g-home", name: "Maison", short: "Maison", kind: "domicile", lat: 49.44, lng: 1.1, city: "Rouen" };
const chu: Location = { id: "g-chu", name: "Chu", short: "Chu", kind: "chu", lat: 49.46, lng: 1.12, city: "Rouen" };
const locMap = new Map([depot, home, chu].map((location) => [location.id, location]));

function crew(patch: Partial<Crew> = {}): Crew {
  return {
    id: "c1",
    code: "AMB-1",
    driver: "Martin",
    mate: "Durand",
    vehicleType: "ambulance",
    plate: "HC 101 KL",
    vehicleName: "Ambulance",
    color: "#145",
    baseId: depot.id,
    shiftStart: 6 * 60,
    shiftEnd: 18 * 60,
    delayUntil: 0,
    dea: true,
    ...patch,
  };
}

function trip(patch: Partial<Transport> = {}): Transport {
  return {
    id: "t1",
    dossier: "DOS-1",
    patientId: "p1",
    pickupId: home.id,
    dropoffId: chu.id,
    windowStart: 8 * 60 - 20,
    windowEnd: 8 * 60 + 20,
    appointmentMin: 8 * 60,
    toleranceMin: 20,
    posture: "assis",
    serviceMin: 10,
    kind: "simple",
    priority: "normal",
    cancelled: false,
    ...patch,
  };
}

function seedRoads(): void {
  rememberTravel(depot.id, home.id, { km: 6.4, min: 14, source: "osrm" });
  rememberTravel(home.id, chu.id, { km: 4.1, min: 11, source: "osrm" });
  rememberTravel(chu.id, home.id, { km: 4.4, min: 17, source: "osrm" });
  rememberTravel(chu.id, depot.id, { km: 8, min: 18, source: "osrm" });
  rememberTravel(home.id, depot.id, { km: 6.4, min: 14, source: "osrm" });
}

describe("segments du Gantt", () => {
  it("découpe la course en vide, PEC et trajet+dépose aux durées réelles", () => {
    seedRoads();
    const leg = simulateLeg(trip(), 7 * 60 + 46, depot.id, crew(), locMap);
    assert.equal(leg.deadheadMin, 14);
    assert.equal(leg.pecMin, DEFAULT_RULES.pecAmbMin);
    assert.equal(leg.loadedMin, 11);
    assert.equal(leg.dropoffMin, DEFAULT_RULES.dropoffMin);
    assert.equal(leg.kmEstimated, false);
    const parts = visualParts(leg);
    assert.deepEqual(
      parts.map((part) => part.kind),
      ["vide", "pec", "charge"],
    );
    const minutes = Object.fromEntries(parts.map((part) => [part.kind, part.end - part.start]));
    assert.equal(minutes.vide, 14);
    assert.equal(minutes.pec, 10);
    assert.equal(minutes.charge, 11 + 8);
    const vsl = simulateLeg(trip(), 7 * 60 + 46, depot.id, crew({ vehicleType: "vsl", dea: false, mate: "" }), locMap);
    assert.equal(vsl.pecMin, 5);
  });

  it("reprend le trajet à vide depuis le nouvel arrêt précédent", () => {
    seedRoads();
    const first = trip({ id: "a", crewId: "c1", departMin: 8 * 60 });
    const second = trip({
      id: "b",
      dossier: "DOS-2",
      crewId: "c1",
      departMin: 10 * 60,
      appointmentMin: 10 * 60,
      windowStart: 10 * 60 - 20,
      windowEnd: 10 * 60 + 20,
    });
    const chained = scheduleFleet([crew()], [first, second], [], locMap).get("c1")?.legs ?? [];
    assert.equal(chained[1]?.fromId, chu.id);
    assert.equal(chained[1]?.deadheadMin, 17);
    const alone = scheduleFleet([crew()], [{ ...second }], [], locMap).get("c1")?.legs ?? [];
    assert.equal(alone[0]?.fromId, depot.id);
    assert.equal(alone[0]?.deadheadMin, 14);
  });

  it("marque une durée estimée seulement quand le routage a échoué", () => {
    rememberTravel("est-a", "est-b", { km: 3, min: 9, source: "estimate" });
    rememberTravel("est-b", "est-c", { km: 2, min: 6, source: "ors" });
    rememberTravel("est-c", "est-b", { km: 2, min: 6, source: "ors" });
    const places = new Map<string, Location>([
      ["est-a", { ...depot, id: "est-a" }],
      ["est-b", { ...home, id: "est-b" }],
      ["est-c", { ...chu, id: "est-c" }],
    ]);
    const failed = simulateLeg(
      trip({ pickupId: "est-b", dropoffId: "est-c" }),
      8 * 60,
      "est-a",
      crew({ baseId: "est-a" }),
      places,
    );
    assert.equal(failed.kmEstimated, true);
    assert.equal(failed.deadheadMin, 9);
    const road = simulateLeg(
      trip({ pickupId: "est-c", dropoffId: "est-b" }),
      8 * 60,
      "est-b",
      crew({ baseId: "est-b" }),
      places,
    );
    assert.equal(road.kmEstimated, false);
    assert.equal(road.loadedMin, 6);
  });

  it("aligne un déplacement sur un créneau de 5 minutes", () => {
    seedRoads();
    assert.equal(snap5(487), 485);
    assert.equal(snap5(488), 490);
    assert.equal(snap5(485), 485);
    const preview = previewOnGrid(crew(), trip(), 8 * 60 + 7, [trip()], [], locMap, 6 * 60);
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    assert.equal(preview.departMin % 5, 0);
    assert.equal(preview.departMin, 8 * 60 + 5);
  });
});
