import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mealIssue, pickMealSlot } from "../src/game/breaks.ts";
import { previewCsv } from "../src/game/csv.ts";
import { generateDay } from "../src/game/generate.ts";
import { isTracked } from "../src/game/history.ts";
import { optimizePlan } from "../src/game/optimizer.ts";
import { initialState, reducer } from "../src/game/reducer.ts";
import { reviewIssues } from "../src/game/review.ts";
import {
  indexLocations,
  previewOnGrid,
  previewPlacement,
  scheduleFleet,
  seanceReturnMin,
  simulateLeg,
  snap5,
  type CrewSchedule,
} from "../src/game/schedule.ts";
import { shiftForIndex } from "../src/game/shifts.ts";
import {
  DAY_END,
  DAY_START,
  DEFAULT_RULES,
  type Crew,
  type GameState,
  type Location,
  type Rules,
  type TimeBlock,
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

function rules(patch: Partial<Rules> = {}): Rules {
  return { ...DEFAULT_RULES, ...patch };
}

describe("repas 11:00–14:30", () => {
  it("pose 30 minutes dans la fenêtre et refuse une fenêtre pleine", () => {
    const open: CrewSchedule = {
      crewId: "c1",
      legs: [
        { departMin: 7 * 60, endMin: 11 * 60, transportId: "a" },
        { departMin: 12 * 60 + 30, endMin: 16 * 60, transportId: "b" },
      ] as CrewSchedule["legs"],
      returnKm: 0,
      returnStart: 16 * 60,
      returnEnd: 16 * 60,
      idleMin: 0,
    };
    const meal = pickMealSlot(open, crew(), DEFAULT_RULES);
    assert.ok(meal);
    assert.ok(meal.startMin >= 11 * 60);
    assert.ok(meal.endMin <= 14 * 60 + 30);
    assert.equal(meal.endMin - meal.startMin, 30);
    assert.equal(mealIssue(meal, DEFAULT_RULES), null);
    assert.ok(meal.endMin <= 12 * 60 + 30);
    assert.ok(meal.startMin >= 11 * 60);

    const blocked: CrewSchedule = {
      ...open,
      legs: [{ departMin: 11 * 60, endMin: 14 * 60 + 30, transportId: "full" }] as CrewSchedule["legs"],
    };
    assert.equal(pickMealSlot(blocked, crew(), DEFAULT_RULES), null);
    assert.equal(mealIssue(undefined, DEFAULT_RULES), "Pause repas manquante");
  });

  it("signale un repas qui déborde de la fenêtre", () => {
    const early: TimeBlock = { id: "r", crewId: "c1", startMin: 10 * 60 + 30, endMin: 11 * 60, kind: "repas", label: "Repas" };
    assert.equal(mealIssue(early, DEFAULT_RULES), "Repas hors fenêtre");
    const late: TimeBlock = { id: "r2", crewId: "c1", startMin: 14 * 60 + 15, endMin: 14 * 60 + 45, kind: "repas", label: "Repas" };
    assert.equal(mealIssue(late, DEFAULT_RULES), "Repas hors fenêtre");
  });
});

describe("amplitude 11 h", () => {
  it("décale les prises de poste de 30 minutes sans sortir de 06:00–20:00", () => {
    const starts = new Set<number>();
    for (let index = 0; index < 8; index++) {
      const shift = shiftForIndex(index, DEFAULT_RULES.amplitudeMin);
      assert.equal(shift.shiftEnd - shift.shiftStart, 11 * 60);
      assert.ok(shift.shiftStart >= DAY_START);
      assert.ok(shift.shiftEnd <= DAY_END);
      starts.add(shift.shiftStart);
    }
    assert.ok(starts.size >= 4);
    const first = shiftForIndex(0, 11 * 60);
    const second = shiftForIndex(1, 11 * 60);
    assert.equal(second.shiftStart - first.shiftStart, 30);
  });

  it("refuse une course qui ne tient pas avant la fin de vacation", () => {
    const preview = previewOnGrid(
      crew({ shiftStart: 6 * 60, shiftEnd: 17 * 60 }),
      trip({
        pickupId: depot.id,
        dropoffId: depot.id,
        appointmentMin: 16 * 60 + 30,
        windowStart: 16 * 60,
        windowEnd: 17 * 60,
        stayMin: 700,
      }),
      16 * 60 + 30,
      [],
      [],
      locMap,
      -1,
    );
    assert.equal(preview.ok, false);
  });
});

describe("journée chargée sans plafond de courses", () => {
  it("pose plus de 15 courses sur une ambulance si elles tiennent", () => {
    const jobs = Array.from({ length: 18 }, (_, index) => {
      const at = 7 * 60 + index * 20;
      return trip({
        id: `amb-${index}`,
        dossier: `DOS-A${index}`,
        pickupId: depot.id,
        dropoffId: depot.id,
        appointmentMin: at,
        windowStart: at - 20,
        windowEnd: at + 20,
      });
    });
    const plan = optimizePlan({
      crews: [crew()],
      transports: jobs,
      blocks: [],
      locations: [depot],
      nowMin: -1,
      seed: 15,
      rules: rules({ maxAmb: 15, mealMin: 0 }),
    });
    const placed = plan.stops.filter((stop) => stop.crewId === "c1").length;
    assert.equal(placed, 18, `ambulance ${placed}`);
  });

  it("pose plus de 25 courses sur un VSL si elles tiennent", () => {
    const jobs = Array.from({ length: 28 }, (_, index) => {
      const at = 7 * 60 + index * 15;
      return trip({
        id: `vsl-${index}`,
        dossier: `DOS-V${index}`,
        pickupId: depot.id,
        dropoffId: depot.id,
        appointmentMin: at,
        windowStart: at - 15,
        windowEnd: at + 15,
        posture: "assis",
      });
    });
    const plan = optimizePlan({
      crews: [crew({ id: "v1", code: "VSL-1", vehicleType: "vsl", dea: false, mate: "" })],
      transports: jobs,
      blocks: [],
      locations: [depot],
      nowMin: -1,
      seed: 25,
      rules: rules({ maxVsl: 25, mealMin: 0 }),
    });
    const placed = plan.stops.filter((stop) => stop.crewId === "v1").length;
    assert.equal(placed, 28, `vsl ${placed}`);
  });

  it("ne signale pas de plafond dans la synthèse", () => {
    const transports = Array.from({ length: 16 }, (_, index) =>
      trip({ id: `over-${index}`, dossier: `DOS-O${index}`, crewId: "c1", departMin: 7 * 60 + index * 20 }),
    );
    const issues = reviewIssues({
      crews: [crew()],
      transports,
      blocks: [],
      rules: DEFAULT_RULES,
      schedules: new Map([["c1", { crewId: "c1", legs: transports.map((item) => ({ transportId: item.id, departMin: item.departMin!, endMin: item.departMin! + 15, lateMin: 0, outOfTolerance: false, kmEstimated: false })), returnKm: 0, returnStart: 0, returnEnd: 0, idleMin: 0 } as CrewSchedule]]),
      patients: new Map(),
    });
    assert.equal(issues.some((issue) => issue.kind === "charge"), false);
  });

  it("accepte au geste une course au-delà de 15 et de 25", () => {
    const onAmb = Array.from({ length: 15 }, (_, index) =>
      trip({
        id: `amb-${index}`,
        crewId: "c1",
        departMin: 6 * 60 + 30 + index * 20,
        pickupId: depot.id,
        dropoffId: depot.id,
        appointmentMin: 6 * 60 + 30 + index * 20,
      }),
    );
    const extra = trip({
      id: "amb-extra",
      pickupId: depot.id,
      dropoffId: depot.id,
      appointmentMin: 16 * 60,
      windowStart: 16 * 60 - 20,
      windowEnd: 16 * 60 + 20,
    });
    const accepted = previewPlacement(crew(), extra, 16 * 60, onAmb, [], locMap, -1, rules({ maxAmb: 15 }));
    assert.equal(accepted.ok, true);
    const onVsl = Array.from({ length: 25 }, (_, index) =>
      trip({ id: `vsl-${index}`, crewId: "v1", departMin: 6 * 60 + index * 15, pickupId: depot.id, dropoffId: depot.id }),
    );
    const vsl = crew({ id: "v1", code: "VSL-1", vehicleType: "vsl", dea: false, mate: "" });
    const overVsl = previewPlacement(vsl, extra, 15 * 60, onVsl, [], locMap, -1, rules({ maxVsl: 25 }));
    assert.equal(overVsl.ok, true);
  });
});

describe("tolérance, geste et contraintes", () => {
  it("aligne le geste sur 5 minutes et refuse le créneau pris", () => {
    assert.equal(snap5(8), 10);
    assert.equal(snap5(12), 10);
    assert.equal(snap5(13), 15);
    const keeper = trip({
      id: "keep",
      crewId: "c1",
      departMin: 8 * 60,
      appointmentMin: 8 * 60,
      windowStart: 8 * 60 - 20,
      windowEnd: 8 * 60 + 20,
    });
    const moving = trip({
      id: "move",
      dossier: "DOS-2",
      appointmentMin: 10 * 60,
      windowStart: 10 * 60 - 20,
      windowEnd: 10 * 60 + 20,
    });
    const ok = previewOnGrid(crew(), moving, 10 * 60 + 2, [keeper], [], locMap, -1);
    assert.equal(ok.ok, true);
    if (ok.ok) assert.equal(ok.departMin % 5, 0);
    const packed = crew({ shiftStart: 8 * 60, shiftEnd: 8 * 60 + 20 });
    const clash = previewOnGrid(
      packed,
      trip({ id: "move", pickupId: depot.id, dropoffId: depot.id, appointmentMin: 8 * 60, windowStart: 7 * 60, windowEnd: 9 * 60 }),
      8 * 60,
      [trip({ id: "keep", crewId: "c1", departMin: 8 * 60, pickupId: depot.id, dropoffId: depot.id, appointmentMin: 8 * 60, windowStart: 7 * 60, windowEnd: 9 * 60 })],
      [],
      locMap,
      -1,
    );
    assert.equal(clash.ok, false);
    if (!clash.ok) assert.match(clash.message, /Conflit horaire/);
  });

  it("refuse l'allongé sur un VSL et l'ambulance sans DEA", () => {
    const bed = trip({ posture: "allonge" });
    const vsl = previewOnGrid(crew({ vehicleType: "vsl", dea: false, mate: "" }), bed, 8 * 60, [], [], locMap, -1);
    assert.equal(vsl.ok, false);
    if (!vsl.ok) assert.match(vsl.message, /Incompatibilité/);
    const bare = previewOnGrid(crew({ dea: false }), trip(), 8 * 60, [], [], locMap, -1);
    assert.equal(bare.ok, false);
  });

  it("accepte l'intérieur de la tolérance et refuse l'extérieur", () => {
    const inside = simulateLeg(trip(), 7 * 60 + 50, depot.id, crew(), locMap);
    assert.equal(inside.outOfTolerance, false);
    const edge = simulateLeg(trip({ appointmentMin: 8 * 60, toleranceMin: 20, windowStart: 8 * 60 - 20, windowEnd: 8 * 60 + 20 }), 8 * 60, depot.id, crew(), locMap);
    assert.equal(edge.outOfTolerance, false);
    const late = simulateLeg(trip(), 10 * 60, depot.id, crew(), locMap);
    assert.equal(late.outOfTolerance, true);
    assert.ok(late.lateMin >= 1);
  });

  it("compte l'attente de séance dans l'occupation du véhicule", () => {
    const plain = simulateLeg(trip({ pickupId: depot.id, dropoffId: depot.id }), 9 * 60, depot.id, crew(), locMap);
    const stayed = simulateLeg(trip({ pickupId: depot.id, dropoffId: depot.id, stayMin: 45 }), 9 * 60, depot.id, crew(), locMap);
    assert.equal(stayed.endMin - plain.endMin, 45);
    const stay = trip({
      id: "stay",
      crewId: "c1",
      departMin: 9 * 60,
      pickupId: depot.id,
      dropoffId: depot.id,
      stayMin: 45,
      appointmentMin: 9 * 60,
      windowStart: 9 * 60 - 20,
      windowEnd: 9 * 60 + 20,
    });
    const stayLeg = simulateLeg(stay, 9 * 60, depot.id, crew(), locMap);
    const next = trip({
      id: "next",
      dossier: "DOS-N",
      pickupId: depot.id,
      dropoffId: depot.id,
      appointmentMin: plain.endMin + 10,
      windowStart: plain.endMin - 10,
      windowEnd: plain.endMin + 40,
    });
    const duringStay = previewOnGrid(crew({ shiftStart: 9 * 60, shiftEnd: stayLeg.endMin + 2 }), next, plain.endMin + 10, [stay], [], locMap, -1);
    assert.equal(duringStay.ok, false);
    if (!duringStay.ok) assert.match(duringStay.message, /Conflit horaire/);
  });

  it("ne pose pas une course sur la pause repas", () => {
    const meal: TimeBlock = { id: "repas-c1", crewId: "c1", startMin: 12 * 60, endMin: 12 * 60 + 30, kind: "repas", label: "Repas" };
    const lunch = trip({
      id: "lunch",
      appointmentMin: 12 * 60 + 10,
      windowStart: 12 * 60 - 10,
      windowEnd: 12 * 60 + 40,
      pickupId: depot.id,
      dropoffId: depot.id,
    });
    const blocked = previewOnGrid(crew({ shiftStart: 12 * 60, shiftEnd: 12 * 60 + 40 }), lunch, 12 * 60 + 10, [], [meal], locMap, -1);
    assert.equal(blocked.ok, false);
    const around = previewOnGrid(crew(), lunch, 12 * 60 + 10, [], [meal], locMap, -1);
    assert.equal(around.ok, true);
    if (around.ok) {
      assert.ok(around.leg.endMin <= meal.startMin + 1 || around.leg.departMin >= meal.endMin - 1);
    }
  });
});

describe("aller, retour, série et dialyse", () => {
  it("relie l'aller et le retour sur la même série", async () => {
    const raw = [
      "dossier;nom;prenom;date;heure_rdv;adresse_depart;adresse_arrivee;mobilite;sens;serie;telephone;note;heure_retour",
      "DOS-AR;Dialyse;Anne;;08:30;Depot;Chu;assis;ar;serie-anne;;seance;12:30",
      "DOS-BAD;Martin;Luc;1999-01-01;09:00;Depot;Chu;assis;simple;;;;",
    ].join("\n");
    const preview = await previewCsv(raw, [depot, chu], DEFAULT_RULES, "2026-10-16");
    assert.equal(preview.rejected.length, 1);
    assert.equal(preview.accepted.length, 1);
    const row = preview.accepted[0]!;
    assert.equal(row.transport.kind, "aller");
    assert.equal(row.retour?.kind, "retour");
    assert.ok(row.transport.seriesId);
    assert.equal(row.retour?.seriesId, row.transport.seriesId);
    assert.equal(row.transport.appointmentMin, 8 * 60 + 30);
    assert.equal(row.retour?.appointmentMin, 12 * 60 + 30);
  });

  it("importe l'attente et rejette une attente illisible", async () => {
    const raw = [
      "dossier;nom;prenom;date;heure_rdv;adresse_depart;adresse_arrivee;mobilite;sens;serie;telephone;note;heure_retour;attente",
      "DOS-W;Zora;Line;;10:15;Depot;Chu;assis;aller;serie-z;;;;45",
      "DOS-X;Zora;Line;;14:15;Chu;Depot;assis;retour;serie-z;;;;",
      "DOS-Y;Martin;Luc;;09:00;Depot;Chu;assis;simple;;;;;trois",
    ].join("\n");
    const preview = await previewCsv(raw, [depot, chu], DEFAULT_RULES, "2026-10-16");
    assert.equal(preview.rejected.length, 1);
    assert.match(preview.rejected[0]!.reason, /Attente invalide/);
    const aller = preview.accepted.find((row) => row.transport.kind === "aller");
    const retour = preview.accepted.find((row) => row.transport.kind === "retour");
    assert.equal(aller?.transport.stayMin, 45);
    assert.equal(retour?.transport.stayMin, undefined);
    assert.equal(aller?.retour?.appointmentMin, seanceReturnMin(10 * 60 + 15, 45));
    assert.equal(aller?.retour?.pickupId, chu.id);
    assert.equal(aller?.retour?.dropoffId, depot.id);
    assert.equal(aller?.retour?.seriesId, aller?.transport.seriesId);
    assert.match(aller?.summary ?? "", /attente 45 min/);
    assert.match(aller?.summary ?? "", /retour 11:00/);
  });

  it("crée le retour à l'arrivée plus l'attente, calé sur 5 minutes, puis le met à jour", () => {
    assert.equal(seanceReturnMin(9 * 60 + 30, 45), 10 * 60 + 15);
    assert.equal(seanceReturnMin(9 * 60 + 2, 45), 9 * 60 + 45);
    assert.equal(seanceReturnMin(8 * 60, 4 * 60), 12 * 60);
    assert.equal(seanceReturnMin(10 * 60, 30), 10 * 60 + 30);
    const base = {
      ...initialState,
      live: false,
      locations: [depot, home, chu],
      rules: DEFAULT_RULES,
    };
    const aller = trip({
      id: "kine",
      kind: "aller",
      seriesId: "kine",
      pickupId: home.id,
      dropoffId: chu.id,
      appointmentMin: 9 * 60 + 30,
      windowStart: 9 * 60 + 10,
      windowEnd: 9 * 60 + 50,
      stayMin: 45,
    });
    const created = reducer(base, { type: "ADD_TRANSPORT", transport: aller });
    const back = created.transports.find((item) => item.kind === "retour");
    assert.ok(back);
    assert.equal(back.appointmentMin, 10 * 60 + 15);
    assert.equal(back.pickupId, chu.id);
    assert.equal(back.dropoffId, home.id);
    assert.equal(back.seriesId, "kine");
    assert.equal(created.transports.filter((item) => item.kind === "retour").length, 1);
    const updated = reducer(created, {
      type: "UPDATE_TRANSPORT",
      transport: { ...aller, stayMin: 4 * 60 },
    });
    const shifted = updated.transports.find((item) => item.id === back.id);
    assert.equal(shifted?.appointmentMin, 13 * 60 + 30);
    assert.equal(updated.transports.filter((item) => item.kind === "retour").length, 1);
  });

  it("refuse de poser le retour d'une série simple avant l'aller", () => {
    const aller = trip({
      id: "a",
      kind: "aller",
      seriesId: "s-qa",
      appointmentMin: 14 * 60,
      windowStart: 14 * 60 - 20,
      windowEnd: 14 * 60 + 20,
      pickupId: depot.id,
      dropoffId: depot.id,
    });
    const retour = trip({
      id: "r",
      kind: "retour",
      seriesId: "s-qa",
      appointmentMin: 8 * 60,
      windowStart: 8 * 60 - 20,
      windowEnd: 8 * 60 + 20,
      pickupId: depot.id,
      dropoffId: depot.id,
    });
    const plan = optimizePlan({
      crews: [crew()],
      transports: [aller, retour],
      blocks: [],
      locations: [depot],
      nowMin: -1,
      seed: 5,
      rules: DEFAULT_RULES,
    });
    const placed = new Set(plan.stops.map((stop) => stop.transportId));
    assert.equal(placed.has("a") && placed.has("r"), false);
    const legs = [
      { transportId: "a", departMin: 14 * 60, endMin: 14 * 60 + 30 },
      { transportId: "r", departMin: 8 * 60, endMin: 8 * 60 + 30 },
    ];
    const issues = reviewIssues({
      crews: [crew()],
      transports: [
        { ...aller, crewId: "c1", departMin: 14 * 60 },
        { ...retour, crewId: "c1", departMin: 8 * 60 },
      ],
      blocks: [],
      rules: DEFAULT_RULES,
      schedules: new Map([
        ["c1", { crewId: "c1", legs, returnKm: 0, returnStart: 0, returnEnd: 0, idleMin: 0 } as CrewSchedule],
      ]),
      patients: new Map(),
    });
    assert.ok(issues.some((issue) => issue.kind === "serie" && issue.id === "ser-order-s-qa"));
  });

  it("ajoute une série une seule fois et reprend le lendemain sans affectation", () => {
    const started = reducer(initialState, { type: "START", amb: 2, vsl: 1, density: "normale", seed: 4 });
    assert.ok(started.tomorrowTransports.length > 0);
    const imported = reducer(started, { type: "IMPORT_SERIES" });
    assert.ok(imported.transports.length > started.transports.length);
    assert.equal(imported.toast?.tone, "ok");
    const again = reducer(imported, { type: "IMPORT_SERIES" });
    assert.equal(again.transports.length, imported.transports.length);
    const rolled = reducer(imported, { type: "ROLL_DAY" });
    assert.notEqual(rolled.missionIso, imported.missionIso);
    assert.equal(rolled.transports.some((transport) => transport.crewId), false);
    assert.equal(rolled.blocks.some((block) => block.kind === "repas"), false);
  });

  it("décale le retour de dialyse quand la séance change", () => {
    const started = reducer(initialState, { type: "START", amb: 1, vsl: 1, density: "normale", seed: 3 });
    const retour = started.transports.find((transport) => transport.kind === "dialyse_retour" && transport.centerArriveMin != null);
    assert.ok(retour);
    const next = reducer(started, { type: "SET_RULES", rules: { sessionMin: 5 * 60 } });
    const updated = next.transports.find((transport) => transport.id === retour.id);
    assert.equal(updated?.appointmentMin, retour.centerArriveMin! + 5 * 60);
  });
});

describe("journée générée", () => {
  it("respecte repas, amplitude, charges et l'ordre dialyse sur 80 courses", () => {
    const world = generateDay({ amb: 4, vsl: 4, density: "chargee", seed: 9 });
    assert.ok(world.transports.length >= 80, `seulement ${world.transports.length}`);
    for (const crew of world.crews) {
      assert.equal(crew.shiftEnd - crew.shiftStart, 11 * 60);
      assert.ok(crew.shiftStart >= DAY_START && crew.shiftEnd <= DAY_END);
    }
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

    const transports = world.transports.map((transport) => {
      const stop = plan.stops.find((item) => item.transportId === transport.id);
      if (!stop) return { ...transport, crewId: undefined, departMin: undefined };
      return { ...transport, crewId: stop.crewId, departMin: stop.departMin };
    });
    const located = indexLocations(world.locations);
    const schedules = scheduleFleet(world.crews, transports, plan.meals, located, "anchored", DEFAULT_RULES);
    for (const crew of world.crews) {
      const schedule = schedules.get(crew.id);
      assert.ok(schedule);
      for (const leg of schedule.legs) {
        assert.equal(leg.conflict, false, leg.transportId);
        assert.equal(leg.incompatible, false, leg.transportId);
        assert.ok(leg.endMin <= crew.shiftEnd + 1.5, `${crew.code} finit à ${leg.endMin}`);
      }
      if (schedule.legs.length > 0) {
        const meal = plan.meals.find((block) => block.crewId === crew.id);
        assert.ok(meal, `${crew.code} sans repas`);
        assert.ok(meal.startMin >= 11 * 60 - 1);
        assert.ok(meal.endMin <= 14 * 60 + 30 + 1);
        assert.ok(schedule.legs.every((leg) => leg.endMin <= meal.startMin + 1 || leg.departMin >= meal.endMin - 1));
      }
    }

    const groups = new Map<string, Transport[]>();
    for (const transport of transports) {
      if (!transport.seriesId || !transport.kind.startsWith("dialyse")) continue;
      const list = groups.get(transport.seriesId) ?? [];
      list.push(transport);
      groups.set(transport.seriesId, list);
    }
    assert.ok(groups.size > 0);
    for (const list of groups.values()) {
      const aller = list.find((transport) => transport.kind.includes("aller"));
      const retour = list.find((transport) => transport.kind.includes("retour"));
      if (!aller?.crewId || !retour?.crewId || !aller.departMin || !retour.departMin) continue;
      if (aller.crewId === retour.crewId) assert.ok(retour.departMin >= aller.departMin);
    }
  });

  it("n'enregistre pas l'horloge dans l'historique", () => {
    assert.equal(isTracked("TICK"), false);
    assert.equal(isTracked("ASSIGN"), true);
    assert.equal(isTracked("SET_MISSION"), true);
    assert.equal(isTracked("IMPORT_SERIES"), true);
  });
});

describe("règles du jour sur le créneau et le resserrage", () => {
  function tight(): GameState {
    const custom = { ...DEFAULT_RULES, pecAmbMin: 1, dropoffMin: 1 };
    return {
      ...initialState,
      live: false,
      rules: custom,
      locations: [depot],
      crews: [crew({ baseId: depot.id, shiftStart: 8 * 60, shiftEnd: 8 * 60 + 12 })],
      transports: [
        trip({
          pickupId: depot.id,
          dropoffId: depot.id,
          appointmentMin: 8 * 60,
          windowStart: 8 * 60,
          windowEnd: 8 * 60 + 20,
        }),
      ],
    };
  }

  it("Meilleur créneau utilise la PEC du jour", () => {
    const next = reducer(tight(), { type: "BEST_SLOT", transportId: "t1" });
    assert.equal(next.transports[0]?.crewId, "c1");
    const defaults = reducer({ ...tight(), rules: DEFAULT_RULES }, { type: "BEST_SLOT", transportId: "t1" });
    assert.equal(defaults.transports[0]?.crewId, undefined);
  });

  it("revenir à l'heure prévue utilise la PEC du jour", () => {
    const next = reducer(tight(), { type: "SNAP_BACK", transportId: "t1" });
    assert.equal(next.transports[0]?.crewId, "c1");
  });

  it("le resserrage utilise la PEC du jour", () => {
    const block: TimeBlock = { id: "pause", crewId: "c1", startMin: 9 * 60, endMin: 9 * 60 + 30, kind: "pause", label: "Pause" };
    const state: GameState = {
      ...initialState,
      live: false,
      rules: { ...DEFAULT_RULES, pecAmbMin: 1, dropoffMin: 1 },
      locations: [depot],
      crews: [crew({ baseId: depot.id })],
      blocks: [block],
      transports: [
        trip({
          crewId: "c1",
          departMin: 12 * 60,
          pickupId: depot.id,
          dropoffId: depot.id,
          appointmentMin: 8 * 60 + 50,
          windowStart: 8 * 60 + 50,
          windowEnd: 10 * 60,
        }),
      ],
    };
    const next = reducer(state, { type: "COMPACT" });
    assert.equal(next.transports[0]?.departMin, 8 * 60 + 50);
  });
});
