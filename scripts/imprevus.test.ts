import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyUnavailability, planRipple, reoptimizeStable } from "../src/game/imprevus.ts";
import { recordHistory } from "../src/game/history.ts";
import { initialState, reducer, type Action } from "../src/game/reducer.ts";
import { DAY_END, DAY_START, type Crew, type GameState, type Location, type Transport } from "../src/game/types.ts";

const depot: Location = { id: "depot", name: "Depot", short: "Depot", kind: "depot", lat: 49.41, lng: 1.05, city: "Rouen" };
const home: Location = { id: "home", name: "Maison", short: "Maison", kind: "domicile", lat: 49.44, lng: 1.08, city: "Rouen" };
const chu: Location = { id: "chu", name: "Chu", short: "Chu", kind: "chu", lat: 49.445, lng: 1.1, city: "Rouen" };
const locations = [depot, home, chu];

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
    shiftEnd: 20 * 60,
    delayUntil: 0,
    dea: true,
    ...patch,
  };
}

function trip(patch: Partial<Transport> = {}): Transport {
  const appointment = patch.appointmentMin ?? 8 * 60;
  return {
    id: "t1",
    dossier: "DOS-1",
    patientId: "p1",
    pickupId: home.id,
    dropoffId: chu.id,
    windowStart: appointment - 20,
    windowEnd: appointment + 20,
    appointmentMin: appointment,
    toleranceMin: 20,
    posture: "assis",
    serviceMin: 10,
    kind: "simple",
    priority: "normal",
    cancelled: false,
    ...patch,
  };
}

function playing(patch: Partial<GameState>): GameState {
  return {
    ...initialState,
    phase: "playing",
    locations,
    crews: [crew(), crew({ id: "c2", code: "AMB-2", plate: "EF-456-GH", driver: "Bernard", mate: "Colin" })],
    ...patch,
  };
}

function byId(state: GameState, id: string): Transport {
  const found = state.transports.find((item) => item.id === id);
  assert.ok(found, id);
  return found;
}

describe("indisponibilité", () => {
  it("met les courses de la journée dans À placer", () => {
    const morning = trip({ id: "am", dossier: "DOS-AM", crewId: "c1", departMin: 8 * 60, appointmentMin: 8 * 60 });
    const afternoon = trip({ id: "pm", dossier: "DOS-PM", crewId: "c1", departMin: 15 * 60, appointmentMin: 15 * 60 });
    const state = playing({ transports: [morning, afternoon] });
    const next = reducer(state, {
      type: "SET_UNAVAILABILITY",
      crewId: "c1",
      fromMin: 6 * 60,
      toMin: 20 * 60,
      reason: "absence",
      replace: false,
    });
    assert.equal(byId(next, "am").crewId, undefined);
    assert.equal(byId(next, "pm").crewId, undefined);
    assert.equal(byId(next, "am").pinned, false);
    const block = next.blocks.find((item) => item.kind === "absence" && item.crewId === "c1");
    assert.ok(block);
    assert.equal(block.startMin, 6 * 60);
    assert.equal(block.endMin, 20 * 60);
    assert.match(next.toast?.message ?? "", /À placer/);
  });

  it("ne retire qu'une panne sur le créneau", () => {
    const morning = trip({ id: "am", dossier: "DOS-AM", crewId: "c1", departMin: 8 * 60, appointmentMin: 8 * 60 });
    const afternoon = trip({ id: "pm", dossier: "DOS-PM", crewId: "c1", departMin: 15 * 60, appointmentMin: 15 * 60 });
    const state = playing({ transports: [morning, afternoon] });
    const next = reducer(state, {
      type: "SET_UNAVAILABILITY",
      crewId: "c1",
      fromMin: 7 * 60,
      toMin: 12 * 60,
      reason: "panne",
      replace: false,
    });
    assert.equal(byId(next, "am").crewId, undefined);
    assert.equal(byId(next, "pm").crewId, "c1");
    assert.equal(byId(next, "pm").departMin, 15 * 60);
    assert.equal(next.blocks.some((block) => block.kind === "panne" && block.crewId === "c1"), true);
  });

  it("replace les courses sur un autre équipage sans les épingler", () => {
    const morning = trip({ id: "am", dossier: "DOS-AM", crewId: "c1", departMin: 8 * 60, appointmentMin: 8 * 60, pinned: true });
    const state = playing({ transports: [morning] });
    const next = reducer(state, {
      type: "SET_UNAVAILABILITY",
      crewId: "c1",
      fromMin: 6 * 60,
      toMin: 20 * 60,
      reason: "panne",
      replace: true,
    });
    const moved = byId(next, "am");
    assert.equal(moved.crewId, "c2");
    assert.equal(moved.pinned, false);
    assert.ok(moved.departMin != null);
    assert.match(next.toast?.message ?? "", /replacée/);
  });
});

describe("appel tardif", () => {
  it("ajoute la course de 19:00 et la pose", () => {
    const state = playing({ transports: [] });
    const appointment = 19 * 60;
    const next = reducer(state, {
      type: "ADD_LATE",
      transport: trip({ id: "late", dossier: "DOS-LATE", appointmentMin: appointment, windowStart: appointment - 20, windowEnd: appointment + 20 }),
      patient: { id: "p1", firstName: "", lastName: "Leroy", phone: "", birthYear: 1954, addressId: home.id },
    });
    const late = byId(next, "late");
    assert.equal(late.crewId != null, true);
    assert.equal(late.pinned, true);
    assert.ok((late.departMin ?? 0) >= 18 * 60);
    assert.match(next.toast?.message ?? "", /Course ajoutée sur/);
    assert.equal(next.patients.some((patient) => patient.lastName === "Leroy"), true);
  });

  it("reste dans À placer si aucun créneau, et s'annule en une étape", () => {
    const busy = trip({
      id: "busy",
      crewId: "c1",
      departMin: 6 * 60,
      appointmentMin: 6 * 60 + 30,
      windowStart: 6 * 60,
      windowEnd: 7 * 60,
    });
    const state = playing({
      crews: [crew({ shiftEnd: 7 * 60 + 30 })],
      transports: [busy],
    });
    const action: Action = {
      type: "ADD_LATE",
      transport: trip({
        id: "late",
        appointmentMin: 19 * 60,
        windowStart: 19 * 60 - 20,
        windowEnd: Math.min(DAY_END, 19 * 60 + 20),
      }),
    };
    const past = recordHistory([], [], state, action.type).past;
    const next = reducer(state, action);
    assert.equal(byId(next, "late").crewId, undefined);
    assert.match(next.toast?.message ?? "", /À placer/);
    const undone = reducer(next, { type: "HYDRATE", state: past[0]!, label: "Modification annulée." });
    assert.equal(undone.transports.some((item) => item.id === "late"), false);
    assert.equal(past.length, 1);
  });
});

describe("régénérer sans tout bouleverser", () => {
  it("garde l'épinglé et le stable, et ne place que le non affecté", () => {
    const pinned = trip({ id: "pin", dossier: "DOS-PIN", crewId: "c1", departMin: 8 * 60, appointmentMin: 8 * 60, pinned: true });
    const stable = trip({ id: "stay", dossier: "DOS-STAY", crewId: "c1", departMin: 11 * 60, appointmentMin: 11 * 60 });
    const loose = trip({ id: "loose", dossier: "DOS-LOOSE", appointmentMin: 15 * 60, windowStart: 15 * 60 - 20, windowEnd: 15 * 60 + 20 });
    const state = playing({ transports: [pinned, stable, loose] });
    const plan = reoptimizeStable({
      crews: state.crews,
      transports: state.transports,
      blocks: [],
      locations,
      nowMin: -1,
      rules: state.rules,
    });
    const keptPin = plan.transports.find((item) => item.id === "pin")!;
    const keptStay = plan.transports.find((item) => item.id === "stay")!;
    const placed = plan.transports.find((item) => item.id === "loose")!;
    assert.equal(keptPin.crewId, "c1");
    assert.equal(keptPin.departMin, 8 * 60);
    assert.equal(keptPin.pinned, true);
    assert.equal(keptStay.crewId, "c1");
    assert.equal(keptStay.departMin, 11 * 60);
    assert.equal(placed.crewId != null, true);
    assert.deepEqual(plan.changes.map((change) => change.transportId), ["loose"]);
    assert.equal(plan.lockedIds.includes("pin"), true);
    assert.equal(plan.lockedIds.includes("stay"), true);
  });

  it("n'écrit qu'une étape d'annulation", () => {
    const pinned = trip({ id: "pin", crewId: "c1", departMin: 8 * 60, appointmentMin: 8 * 60, pinned: true });
    const loose = trip({ id: "loose", dossier: "DOS-LOOSE", appointmentMin: 16 * 60, windowStart: 16 * 60 - 20, windowEnd: 16 * 60 + 20 });
    const state = playing({ transports: [pinned, loose] });
    const action: Action = { type: "APPLY_REOPT" };
    const past = recordHistory([], [], state, action.type).past;
    const next = reducer(state, action);
    assert.equal(byId(next, "pin").departMin, 8 * 60);
    assert.equal(byId(next, "pin").crewId, "c1");
    assert.ok(byId(next, "loose").crewId);
    assert.equal(past.length, 1);
    const undone = reducer(next, { type: "HYDRATE", state: past[0]!, label: "Modification annulée." });
    assert.equal(byId(undone, "loose").crewId, undefined);
    assert.equal(byId(undone, "pin").pinned, true);
  });

  it("laisse une course épinglée même si elle gêne", () => {
    const pinned = trip({ id: "pin", crewId: "c1", departMin: 8 * 60, appointmentMin: 8 * 60, pinned: true });
    const state = playing({
      transports: [pinned],
      blocks: [{ id: "absence-c1", crewId: "c1", startMin: 7 * 60, endMin: 12 * 60, kind: "absence", label: "Absent" }],
    });
    const plan = reoptimizeStable({
      crews: state.crews,
      transports: state.transports,
      blocks: state.blocks,
      locations,
      nowMin: -1,
    });
    const kept = plan.transports.find((item) => item.id === "pin")!;
    assert.equal(kept.crewId, "c1");
    assert.equal(kept.departMin, 8 * 60);
    assert.equal(plan.changes.length, 0);
  });
});

describe("épingle et conséquences", () => {
  it("épingle un déplacement manuel et permet de retirer l'épingle", () => {
    const state = playing({ transports: [trip()] });
    const placed = reducer(state, { type: "ASSIGN", transportId: "t1", crewId: "c1", departMin: 8 * 60 });
    assert.equal(byId(placed, "t1").pinned, true);
    assert.equal(byId(placed, "t1").crewId, "c1");
    const open = reducer(placed, { type: "UNPIN", transportId: "t1" });
    assert.equal(byId(open, "t1").pinned, false);
    assert.equal(byId(open, "t1").crewId, "c1");
    const again = reducer(open, { type: "PIN", transportId: "t1" });
    assert.equal(byId(again, "t1").pinned, true);
  });

  it("décale les courses suivantes et le dit", () => {
    const first = trip({ id: "a", dossier: "DOS-A", crewId: "c1", departMin: 8 * 60, appointmentMin: 8 * 60 + 10 });
    const second = trip({
      id: "b",
      dossier: "DOS-B",
      crewId: "c1",
      departMin: 8 * 60 + 15,
      appointmentMin: 8 * 60 + 30,
      windowStart: 8 * 60,
      windowEnd: 10 * 60,
    });
    const state = playing({ transports: [first, second] });
    const preview = planRipple({
      crew: state.crews[0]!,
      transport: first,
      requestedDepart: 8 * 60,
      transports: state.transports,
      blocks: [],
      locMap: new Map(locations.map((location) => [location.id, location])),
      nowMin: -1,
    });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    assert.equal(preview.shifts.length, 1);
    assert.equal(preview.shifts[0]?.transportId, "b");
    assert.ok((preview.shifts[0]?.toDepartMin ?? 0) > second.departMin!);
    assert.ok(preview.shifts.every((shift) => shift.toDepartMin > shift.fromDepartMin));

    const next = reducer(state, { type: "ASSIGN", transportId: "a", crewId: "c1", departMin: 8 * 60, ripple: true });
    assert.equal(byId(next, "a").pinned, true);
    assert.equal(byId(next, "b").pinned, undefined);
    assert.ok((byId(next, "b").departMin ?? 0) > second.departMin!);
    assert.match(next.toast?.message ?? "", /suivante/);
  });

  it("ne rapproche pas une course suivante qui tient déjà", () => {
    const first = trip({ id: "a", dossier: "DOS-A", crewId: "c1", departMin: 8 * 60, appointmentMin: 8 * 60 + 10 });
    const later = trip({
      id: "b",
      dossier: "DOS-B",
      crewId: "c1",
      departMin: 12 * 60,
      appointmentMin: 12 * 60,
      windowStart: 11 * 60,
      windowEnd: 13 * 60,
    });
    const state = playing({ transports: [first, later] });
    const preview = planRipple({
      crew: state.crews[0]!,
      transport: first,
      requestedDepart: 8 * 60,
      transports: state.transports,
      blocks: [],
      locMap: new Map(locations.map((location) => [location.id, location])),
      nowMin: -1,
    });
    assert.equal(preview.ok, true);
    if (!preview.ok) return;
    assert.equal(preview.shifts.some((shift) => shift.transportId === "b"), false);
  });

  it("refuse de bouger une course suivante épinglée, sans rien déplacer", () => {
    const first = trip({ id: "a", dossier: "DOS-A", crewId: "c1", departMin: 8 * 60, appointmentMin: 8 * 60 + 10 });
    const second = trip({
      id: "b",
      dossier: "DOS-B",
      crewId: "c1",
      departMin: 8 * 60 + 15,
      appointmentMin: 8 * 60 + 30,
      windowStart: 8 * 60,
      windowEnd: 10 * 60,
      pinned: true,
    });
    const state = playing({ transports: [first, second] });
    const next = reducer(state, { type: "ASSIGN", transportId: "a", crewId: "c1", departMin: 8 * 60 + 20, ripple: true });
    assert.match(next.toast?.message ?? "", /épinglée/);
    assert.equal(byId(next, "a").departMin, 8 * 60);
    assert.equal(byId(next, "b").departMin, 8 * 60 + 15);
    assert.equal(byId(next, "a").pinned, undefined);
  });

  it("ne resserre pas, ne retarde pas et ne régénère pas une course épinglée", () => {
    const pinned = trip({
      id: "pin",
      crewId: "c1",
      departMin: 12 * 60,
      appointmentMin: 8 * 60,
      windowStart: 7 * 60,
      windowEnd: 9 * 60,
      pinned: true,
    });
    const loose = trip({
      id: "loose",
      dossier: "DOS-LOOSE",
      crewId: "c1",
      departMin: 14 * 60,
      appointmentMin: 10 * 60,
      windowStart: 9 * 60,
      windowEnd: 11 * 60,
    });
    const state = playing({ transports: [pinned, loose], nowMin: 7 * 60 });
    const compacted = reducer(state, { type: "COMPACT" });
    assert.equal(byId(compacted, "pin").departMin, 12 * 60);
    assert.ok((byId(compacted, "loose").departMin ?? 12 * 60) < 14 * 60);

    const delayed = reducer(
      {
        ...state,
        calls: [
          {
            id: "retard-1",
            triggerMin: 7 * 60,
            spawned: true,
            resolved: false,
            expired: false,
            kind: "retard",
            title: "Retard",
            body: "",
            caller: "Standard",
            phone: "",
            crewId: "c1",
            deltaMin: 25,
          },
        ],
      },
      { type: "RESOLVE_CALL", callId: "retard-1", choice: "accept" },
    );
    assert.equal(byId(delayed, "pin").departMin, 12 * 60);
    assert.equal(byId(delayed, "loose").departMin, 14 * 60 + 25);
    assert.match(delayed.toast?.message ?? "", /épinglée/);

    const generated = reducer(state, {
      type: "APPLY_STOPS",
      stops: [{ transportId: "pin", crewId: "c2", departMin: 16 * 60 }],
    });
    assert.equal(byId(generated, "pin").crewId, "c1");
    assert.equal(byId(generated, "pin").departMin, 12 * 60);
  });
});

describe("fonction pure d'indisponibilité", () => {
  it("signale une course déjà engagée sans la retirer", () => {
    const running = trip({ id: "run", crewId: "c1", departMin: 8 * 60, appointmentMin: 8 * 60 });
    const result = applyUnavailability({
      crews: [crew()],
      transports: [running],
      blocks: [],
      locations,
      nowMin: 9 * 60,
      crewId: "c1",
      fromMin: DAY_START,
      toMin: 20 * 60,
      reason: "absence",
      replace: false,
    });
    assert.equal(result.transports[0]?.crewId, "c1");
    assert.match(result.message, /engagée/);
    assert.equal(result.changed, true);
  });
});
