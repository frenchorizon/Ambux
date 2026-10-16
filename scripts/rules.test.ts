import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickMealSlot } from "../src/game/breaks.ts";
import { previewCsv } from "../src/game/csv.ts";
import { generateDay } from "../src/game/generate.ts";
import { recordHistory } from "../src/game/history.ts";
import { optimizePlan } from "../src/game/optimizer.ts";
import { initialState, reducer, type Action } from "../src/game/reducer.ts";
import { scheduleFleet, simulateLeg, type CrewSchedule } from "../src/game/schedule.ts";
import { shiftForIndex } from "../src/game/shifts.ts";
import { labelForIso } from "../src/lib/format.ts";
import {
  DEFAULT_RULES,
  type Crew,
  type GameState,
  type Location,
  type Transport,
} from "../src/game/types.ts";

const depot: Location = { id: "depot", name: "Depot", short: "Depot", kind: "depot", lat: 49.41, lng: 1.05, city: "Rouen" };
const home: Location = { id: "home", name: "Maison", short: "Maison", kind: "domicile", lat: 49.44, lng: 1.08, city: "Rouen" };
const chu: Location = { id: "chu", name: "Chu", short: "Chu", kind: "chu", lat: 49.445, lng: 1.1, city: "Rouen" };
const locMap = new Map([depot, home, chu].map((location) => [location.id, location]));

function crew(patch: Partial<Crew> = {}): Crew {
  return {
    id: "c1",
    code: "AMB-1",
    driver: "Martin",
    mate: "Durand",
    vehicleType: "ambulance",
    plate: "AB-123-CD",
    vehicleName: "Ambulance",
    color: "#145",
    baseId: depot.id,
    shiftStart: 6 * 60,
    shiftEnd: 17 * 60,
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

describe("règles de planning", () => {
  it("nomme la date de mission en français", () => {
    assert.equal(labelForIso("2026-10-16"), "Vendredi 16 octobre 2026");
  });

  it("refuse l'allongé en VSL et l'ambulance sans DEA", () => {
    const base = trip();
    const vsl = simulateLeg({ ...base, posture: "allonge" }, 7 * 60 + 40, depot.id, crew({ vehicleType: "vsl", dea: false, mate: "" }), locMap);
    assert.equal(vsl.incompatible, true);
    const bare = simulateLeg(base, 7 * 60 + 40, depot.id, crew({ dea: false }), locMap);
    assert.equal(bare.incompatible, true);
    const ok = simulateLeg(base, 7 * 60 + 40, depot.id, crew(), locMap);
    assert.equal(ok.incompatible, false);
  });

  it("signale un écart hors tolérance et accepte l'intérieur", () => {
    const early = simulateLeg(trip(), 6 * 60, depot.id, crew(), locMap);
    assert.equal(early.outOfTolerance, false);
    assert.ok(early.waitMin > 0);
    const near = simulateLeg(trip(), 7 * 60 + 45, depot.id, crew(), locMap);
    assert.equal(near.outOfTolerance, false);
    assert.ok(near.deadheadMin > 0);
    const late = simulateLeg(trip(), 10 * 60, depot.id, crew(), locMap);
    assert.equal(late.outOfTolerance, true);
  });

  it("prolonge la course de l'attente à l'établissement", () => {
    const plain = simulateLeg(trip(), 7 * 60 + 40, depot.id, crew(), locMap);
    const stayed = simulateLeg(trip({ stayMin: 45 }), 7 * 60 + 40, depot.id, crew(), locMap);
    assert.equal(stayed.endMin, plain.endMin + 45);
  });

  it("pose le repas entre 11:00 et 14:30", () => {
    const schedule: CrewSchedule = {
      crewId: "c1",
      legs: [],
      returnKm: 0,
      returnStart: 6 * 60,
      returnEnd: 6 * 60,
      idleMin: 0,
    };
    const meal = pickMealSlot(schedule, crew(), DEFAULT_RULES);
    assert.ok(meal);
    assert.ok(meal.startMin >= 11 * 60);
    assert.ok(meal.endMin <= 14 * 60 + 30);
    assert.equal(meal.endMin - meal.startMin, DEFAULT_RULES.mealMin);
  });

  it("marque un chevauchement", () => {
    const first = trip({ id: "a", departMin: 8 * 60, crewId: "c1" });
    const second = trip({ id: "b", dossier: "DOS-2", departMin: 8 * 60 + 10, crewId: "c1", appointmentMin: 8 * 60 + 20, windowStart: 8 * 60, windowEnd: 9 * 60 });
    const legs = scheduleFleet([crew()], [first, second], [], locMap).get("c1")?.legs ?? [];
    assert.equal(legs.length, 2);
    assert.ok(legs.some((leg) => leg.conflict));
  });

  it("borne l'amplitude", () => {
    const shift = shiftForIndex(0, DEFAULT_RULES.amplitudeMin);
    assert.equal(shift.shiftEnd - shift.shiftStart, 11 * 60);
  });

  it("plafonne la charge ambulance", () => {
    const jobs = [8, 9, 10, 15].map((hour, index) =>
      trip({
        id: `load-${index}`,
        dossier: `DOS-L${index}`,
        appointmentMin: hour * 60,
        windowStart: hour * 60 - 20,
        windowEnd: hour * 60 + 20,
      }),
    );
    const plan = optimizePlan({
      crews: [crew()],
      transports: jobs,
      blocks: [],
      locations: [depot, home, chu],
      nowMin: -1,
      seed: 3,
      rules: { ...DEFAULT_RULES, maxAmb: 2 },
    });
    const placed = plan.stops.length;
    assert.ok(placed <= 2, `placé ${placed}`);
    assert.ok(placed >= 1);
    assert.ok(plan.unassignedIds.length >= 2);
  });
});

describe("journée du régulateur", () => {
  it("importe un CSV, relie l'aller-retour et rejette une mauvaise date", async () => {
    const raw = [
      "dossier;nom;prenom;date;heure_rdv;adresse_depart;adresse_arrivee;mobilite;sens;serie;telephone;note;heure_retour",
      ";Martin;Luc;1999-01-01;09:00;Depot;Chu;assis;simple;;;;",
      ";Dialyse;Anne;;08:00;Depot;Chu;assis;ar;;;seance;12:00",
    ].join("\n");
    const preview = await previewCsv(raw, [depot, chu], DEFAULT_RULES, "2026-10-16");
    assert.equal(preview.rejected.length, 1);
    assert.match(preview.rejected[0]!.reason, /1999-01-01/);
    assert.equal(preview.accepted.length, 1);
    const row = preview.accepted[0]!;
    assert.ok(row.transport.seriesId);
    assert.equal(row.retour?.seriesId, row.transport.seriesId);
    assert.equal(row.transport.kind, "aller");
    assert.equal(row.retour?.kind, "retour");
  });

  it("change la date, reprend le lendemain et annule", () => {
    const bundle = { state: reducer(initialState, { type: "START", amb: 2, vsl: 1, density: "normale", seed: 4 }), past: [] as GameState[], future: [] as GameState[] };
    bundle.past = recordHistory([], [], initialState, "START").past;
    const step = (action: Action) => {
      const recorded = recordHistory(bundle.past, bundle.future, bundle.state, action.type);
      bundle.past = recorded.past;
      bundle.future = recorded.future;
      bundle.state = reducer(bundle.state, action);
    };
    const undo = () => {
      const prev = bundle.past.pop();
      assert.ok(prev);
      bundle.future.push(bundle.state);
      bundle.state = reducer(bundle.state, { type: "HYDRATE", state: prev, label: "Modification annulée." });
    };
    const redo = () => {
      const next = bundle.future.pop();
      assert.ok(next);
      bundle.past.push(bundle.state);
      bundle.state = reducer(bundle.state, { type: "HYDRATE", state: next, label: "Modification rétablie." });
    };

    step({ type: "SET_MISSION", iso: "2026-10-17" });
    assert.equal(bundle.state.missionIso, "2026-10-17");
    assert.match(bundle.state.missionLabel, /17 octobre 2026/);
    undo();
    assert.equal(bundle.state.missionIso, "2026-10-16");
    redo();
    assert.equal(bundle.state.missionIso, "2026-10-17");

    const before = bundle.state.transports.length;
    const series = bundle.state.tomorrowTransports.filter((transport) => !transport.cancelled).length;
    step({ type: "IMPORT_SERIES" });
    assert.equal(bundle.state.transports.length, before + series);
    assert.ok(series > 0);

    step({ type: "ROLL_DAY" });
    assert.equal(bundle.state.missionIso, "2026-10-18");
    assert.equal(bundle.state.transports.some((transport) => transport.crewId), false);
    assert.equal(bundle.state.blocks.some((block) => block.kind === "repas"), false);
  });

  it("place une grosse journée en moins de 8 s", () => {
    const world = generateDay({ amb: 4, vsl: 4, density: "chargee", seed: 9 });
    assert.ok(world.transports.length >= 80, `seulement ${world.transports.length}`);
    const started = performance.now();
    const plan = optimizePlan({
      crews: world.crews,
      transports: world.transports,
      blocks: [],
      locations: world.locations,
      nowMin: -1,
      seed: 9,
      rules: DEFAULT_RULES,
    });
    const elapsed = performance.now() - started;
    assert.ok(elapsed < 8000, `${Math.round(elapsed)} ms`);
    assert.ok(plan.stops.length > 40);
  });
});
