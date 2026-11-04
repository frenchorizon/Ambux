import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCATIONS } from "../src/data/world.ts";
import { initialState, reducer } from "../src/game/reducer.ts";
import { INTENSITY_COUNT, hashSeed, randomDay } from "../src/game/randomDay.ts";
import { indexLocations, previewOnGrid, scheduleFleet } from "../src/game/schedule.ts";
import { DEFAULT_RULES, type ConstraintIntensity, type Transport } from "../src/game/types.ts";

const places = new Set(LOCATIONS.map((location) => location.id));
const locMap = indexLocations(LOCATIONS);

function checkDay(seedLabel: string, missions: number, intensity: ConstraintIntensity) {
  const day = randomDay({ seedLabel, missions, intensity });
  const note = day.dayNote;
  assert.equal(note.seedLabel, seedLabel);
  assert.equal(note.missions, missions);
  assert.equal(note.intensity, intensity);
  assert.equal(note.constraints.length, INTENSITY_COUNT[intensity]);
  const kinds = note.constraints.map((item) => item.kind);
  assert.equal(new Set(kinds).size, kinds.length, kinds.join(","));
  assert.ok(kinds.includes("garage") || kinds.includes("absence"), kinds.join(","));
  for (const item of note.constraints) {
    assert.ok(item.label.length > 0);
    assert.ok(item.detail.length > 0);
  }
  const extra = kinds.includes("urgence") ? 1 : 0;
  assert.equal(day.transports.length, missions + extra, `${seedLabel} ${day.transports.length}`);
  assert.ok(day.patients.length > 0);

  for (const patient of day.patients) {
    assert.equal(patient.phone.startsWith("02 35"), true, patient.phone);
    assert.ok(places.has(patient.addressId), patient.addressId);
    assert.ok(patient.firstName && patient.lastName);
  }
  for (const transport of day.transports) {
    assert.ok(places.has(transport.pickupId), transport.pickupId);
    assert.ok(places.has(transport.dropoffId), transport.dropoffId);
    assert.notEqual(transport.pickupId, transport.dropoffId);
    const crew = day.crews.find((item) => item.id === transport.crewId);
    if (transport.posture === "allonge" && crew) assert.equal(crew.vehicleType, "ambulance");
    if (crew?.vehicleType === "ambulance") assert.equal(crew.dea, true);
    if (crew?.vehicleType === "ambulance") assert.notEqual(crew.mate.trim(), "");
  }

  const blocked = new Set(
    day.blocks
      .filter(
        (block) =>
          (block.kind === "absence" || block.kind === "panne") &&
          day.crews.some(
            (crew) =>
              crew.id === block.crewId && block.startMin <= crew.shiftStart + 1 && block.endMin >= crew.shiftEnd - 1,
          ),
      )
      .map((block) => block.crewId),
  );
  for (const transport of day.transports) {
    if (!transport.cancelled && transport.crewId) assert.equal(blocked.has(transport.crewId), false, transport.crewId);
  }

  const schedules = scheduleFleet(day.crews, day.transports, day.blocks, locMap, "anchored", DEFAULT_RULES);
  for (const block of day.blocks) {
    const legs = schedules.get(block.crewId)?.legs ?? [];
    for (const leg of legs) {
      const overlap = leg.departMin < block.endMin - 0.05 && leg.endMin > block.startMin + 0.05;
      assert.equal(overlap, false, `${seedLabel} ${block.label} ${block.crewId}`);
      assert.equal(leg.incompatible, false);
    }
  }

  const garage = note.constraints.find((item) => item.kind === "garage");
  if (garage?.crewId) {
    const crew = day.crews.find((item) => item.id === garage.crewId);
    const block = day.blocks.find((item) => item.crewId === garage.crewId && item.label === "Garage");
    const sample = sampleTrip(day.transports, crew?.vehicleType === "vsl");
    assert.ok(crew && block && sample);
    const preview = previewOnGrid(
      crew!,
      sample!,
      block!.startMin + 15,
      day.transports,
      day.blocks,
      locMap,
      -1,
      DEFAULT_RULES,
    );
    assert.equal(preview.ok, false);
    if (!preview.ok) assert.match(preview.message, /Indisponible : Garage/);
  }

  const absent = note.constraints.find((item) => item.kind === "absence");
  if (absent?.crewId) {
    const crew = day.crews.find((item) => item.id === absent.crewId);
    assert.ok(crew);
    if (crew!.vehicleType === "ambulance" && crew!.mate.trim() === "") {
      const sample = sampleTrip(day.transports, false);
      const preview = previewOnGrid(crew!, sample!, 8 * 60, day.transports, day.blocks, locMap, -1);
      assert.equal(preview.ok, false);
      if (!preview.ok) assert.match(preview.message, /auxiliaire|Indisponible/);
    }
  }

  const vsl = day.crews.find((crew) => crew.vehicleType === "vsl");
  assert.ok(vsl);
  const bed = sampleTrip(day.transports, false);
  bed.posture = "allonge";
  bed.service = "AMB";
  const refused = previewOnGrid(vsl!, bed, 9 * 60, [], [], locMap, -1);
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.match(refused.message, /VSL/);

  for (const meal of day.blocks.filter((block) => block.kind === "repas")) {
    assert.ok(meal.startMin >= DEFAULT_RULES.mealFrom - 0.5, meal.label);
    assert.ok(meal.endMin <= DEFAULT_RULES.mealTo + 0.5, meal.label);
  }
  if (note.constraints.some((item) => item.kind === "repas")) {
    assert.ok(day.blocks.some((block) => block.label === "Repas imposé"));
  }
  return day;
}

function sampleTrip(transports: readonly Transport[], sitting: boolean): Transport {
  const found = transports.find(
    (transport) => (sitting ? transport.posture !== "allonge" : true) && !transport.cancelled,
  );
  assert.ok(found);
  return { ...found!, crewId: undefined, departMin: undefined, cancelled: false };
}

describe("journée aléatoire", () => {
  it("rejoue la même graine et change avec une autre", () => {
    const left = randomDay({ seedLabel: "rouen-42", missions: 42, intensity: "moyenne" });
    const right = randomDay({ seedLabel: "rouen-42", missions: 42, intensity: "moyenne" });
    assert.deepEqual(left, right);
    assert.equal(hashSeed("rouen-42"), hashSeed("rouen-42"));
    assert.notEqual(hashSeed("rouen-42"), hashSeed("rouen-43"));
    const other = randomDay({ seedLabel: "rouen-43", missions: 42, intensity: "moyenne" });
    const names = (day: typeof left) =>
      day.patients.map((patient) => `${patient.firstName} ${patient.lastName}`).join("|");
    assert.notEqual(names(left), names(other));
    const shorter = randomDay({ seedLabel: "rouen-42", missions: 30, intensity: "faible" });
    assert.notEqual(shorter.transports.length, left.transports.length);
  });

  it("tient les invariants sur 200 graines", () => {
    const levels: ConstraintIntensity[] = ["faible", "moyenne", "forte"];
    for (let index = 0; index < 200; index++) {
      const missions = 30 + (index % 61);
      checkDay(`lot-${index}`, missions, levels[index % levels.length]!);
    }
  });

  it("ouvre la journée dans le planning et laisse la journée type sans graine affichée", () => {
    const started = reducer(initialState, {
      type: "START_RANDOM",
      seed: "e2e-aleatoire",
      missions: 36,
      intensity: "moyenne",
    });
    assert.equal(started.phase, "playing");
    assert.equal(started.view, "gantt");
    assert.equal(started.dayNote?.seedLabel, "e2e-aleatoire");
    assert.ok(started.dayNote && started.dayNote.constraints.length >= 2);
    assert.ok(started.transports.length >= 36);
    const fixed = reducer(initialState, { type: "START", amb: 3, vsl: 3, density: "normale", seed: 20261015 });
    assert.equal(fixed.dayNote, undefined);
    assert.equal(fixed.seed, 20261015);
  });
});
