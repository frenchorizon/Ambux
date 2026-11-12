import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { optimizePlan } from "../src/game/optimizer.ts";
import { reviewIssues } from "../src/game/review.ts";
import {
  appointmentWindow,
  dropoffClock,
  returnDelayMin,
  scheduleCrew,
  scheduleFleet,
  simulateLeg,
} from "../src/game/schedule.ts";
import { DAY_END, DAY_START, DEFAULT_RULES, type Crew, type Location, type Transport } from "../src/game/types.ts";

const depot: Location = {
  id: "depot",
  name: "Depot",
  short: "Depot",
  kind: "depot",
  lat: 49.41,
  lng: 1.05,
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
    baseId: depot.id,
    shiftStart: 6 * 60,
    shiftEnd: 18 * 60,
    delayUntil: 0,
    dea: true,
  };
}

function course(patch: Partial<Transport>): Transport {
  const kind = patch.kind ?? "aller";
  const appointment = patch.appointmentMin ?? 9 * 60;
  return {
    id: "t",
    dossier: "DOS",
    patientId: "p",
    pickupId: "home",
    dropoffId: "chu",
    ...appointmentWindow(kind, appointment),
    appointmentMin: appointment,
    toleranceMin: 20,
    posture: "assis",
    serviceMin: 10,
    kind,
    priority: "normal",
    cancelled: false,
    ...patch,
  };
}

const locMap = new Map([[depot.id, depot]]);

describe("priorité aller et retour", () => {
  it("dépose l'aller au plus tard à l'heure du RDV et fait attendre le retour", () => {
    const aller = course({ id: "aller", kind: "aller", appointmentMin: 10 * 60 });
    const retour = course({
      id: "retour",
      kind: "retour",
      appointmentMin: 7 * 60,
      pickupId: "chu",
      dropoffId: "home",
    });
    const schedule = scheduleCrew(crew(), [aller, retour], [], locMap, "chain", undefined, DEFAULT_RULES);
    const allerLeg = schedule.legs.find((leg) => leg.transportId === "aller")!;
    const retourLeg = schedule.legs.find((leg) => leg.transportId === "retour")!;
    assert.ok((dropoffClock(allerLeg) ?? 0) <= 10 * 60 + 0.5);
    assert.ok(retourLeg.arrivePickup >= 7 * 60 - 0.5);
    assert.ok(retourLeg.departMin >= allerLeg.endMin - 0.5);
    assert.equal(retourLeg.outOfTolerance, false);
  });

  it("ne prend jamais un retour avant l'heure de sortie", () => {
    const retour = course({ id: "retour", kind: "retour", appointmentMin: 11 * 60 });
    const leg = simulateLeg(retour, 8 * 60, depot.id, crew(), locMap);
    assert.ok(leg.arrivePickup >= 11 * 60 - 0.5, `arrivée ${leg.arrivePickup}`);
    assert.equal(returnDelayMin(retour, leg.arrivePickup), 0);
    assert.equal(leg.outOfTolerance, false);
  });

  it("place un retour très en retard et le signale sans le refuser", () => {
    const aller = course({
      id: "aller",
      kind: "aller",
      appointmentMin: 9 * 60,
      seriesId: "seance",
    });
    const retour = course({
      id: "retour",
      kind: "retour",
      appointmentMin: 7 * 60,
      seriesId: "seance",
      pickupId: "chu",
      dropoffId: "home",
    });
    const plan = optimizePlan({
      crews: [crew()],
      transports: [aller, retour],
      blocks: [],
      locations: [depot],
      nowMin: -1,
      seed: 1,
      rules: DEFAULT_RULES,
    });
    assert.equal(plan.unassignedIds.includes("retour"), false);
    assert.equal(plan.unassignedIds.includes("aller"), false);
    const shown = plan.stops.map((stop) => {
      const transport = stop.transportId === "aller" ? aller : retour;
      return { ...transport, crewId: stop.crewId, departMin: stop.departMin };
    });
    const leg = scheduleFleet([crew()], shown, [], locMap, "anchored", DEFAULT_RULES)
      .get("c1")!
      .legs.find((item) => item.transportId === "retour")!;
    const delay = returnDelayMin(retour, leg.arrivePickup);
    assert.ok(delay >= 60, `retard ${delay}`);
    const patients = new Map([
      ["p", { id: "p", firstName: "Lina", lastName: "Martin", phone: "", birthYear: 1950, addressId: "home" }],
    ]);
    const late = reviewIssues({
      crews: [crew()],
      transports: shown,
      blocks: [],
      rules: DEFAULT_RULES,
      schedules: scheduleFleet([crew()], shown, [], locMap, "anchored", DEFAULT_RULES),
      patients,
    });
    assert.equal(
      late.some((issue) => issue.kind === "retard_retour"),
      true,
    );
    const quiet = reviewIssues({
      crews: [crew()],
      transports: shown,
      blocks: [],
      rules: { ...DEFAULT_RULES, returnAlertMin: 180 },
      schedules: scheduleFleet([crew()], shown, [], locMap, "anchored", DEFAULT_RULES),
      patients,
    });
    assert.equal(
      quiet.some((issue) => issue.kind === "retard_retour"),
      delay >= 180,
    );
  });

  it("laisse passer deux retours sans aller", () => {
    const first = course({ id: "r1", kind: "retour", appointmentMin: 8 * 60 });
    const second = course({
      id: "r2",
      kind: "retour",
      appointmentMin: 8 * 60 + 10,
      pickupId: "chu",
      dropoffId: "home",
    });
    const plan = optimizePlan({
      crews: [crew()],
      transports: [first, second],
      blocks: [],
      locations: [depot],
      nowMin: -1,
      seed: 2,
      rules: DEFAULT_RULES,
    });
    assert.deepEqual(plan.unassignedIds, []);
    const schedule = scheduleCrew(crew(), [first, second], [], locMap, "chain", undefined, DEFAULT_RULES);
    assert.equal(schedule.legs.length, 2);
    assert.equal(
      schedule.legs.every((leg) => !leg.outOfTolerance),
      true,
    );
  });

  it("ouvre la fenêtre du retour à l'heure de sortie", () => {
    assert.deepEqual(appointmentWindow("retour", 9 * 60), { windowStart: 9 * 60, windowEnd: DAY_END });
    assert.equal(appointmentWindow("aller", 9 * 60).windowStart, DAY_START);
    assert.equal(appointmentWindow("simple", 9 * 60).windowEnd, 9 * 60);
  });
});
