import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEMO_MEASURE } from "../src/data/demoFacts.ts";
import { emptyDriveMin, naiveBaseline } from "../src/game/baseline.ts";
import { generateDay } from "../src/game/generate.ts";
import { optimizePlan } from "../src/game/optimizer.ts";
import { returnDelayMin, scheduleFleet } from "../src/game/schedule.ts";
import { indexById } from "../src/lib/collections.ts";
import { DEFAULT_RULES } from "../src/game/types.ts";

describe("journée type Rouen", () => {
  it("reste dans le volume, le vide et le gain annoncés", () => {
    const world = generateDay({ amb: 3, vsl: 3, density: "normale", seed: 20261015 });
    assert.ok(world.transports.length >= 60 && world.transports.length <= 70, `courses ${world.transports.length}`);
    const names = world.locations.map((location) => location.name).join("\n");
    assert.match(names, /Charles-Nicolle/);
    assert.match(names, /Becquerel/);
    assert.match(names, /Clinique Mathilde/);
    assert.match(names, /kinésithérapie/);
    assert.match(names, /dialyse/i);
    const kine = world.transports.filter((transport) => transport.motif === "KINE").length;
    const dial = world.transports.filter((transport) => transport.motif === "DIAL").length;
    assert.ok(kine >= 8, `kiné ${kine}`);
    assert.ok(dial >= 4, `dialyse ${dial}`);
    for (const patient of world.patients) {
      assert.ok(patient.firstName && patient.lastName);
      assert.equal(patient.phone.startsWith("02 35"), true);
    }

    const plan = optimizePlan({
      crews: world.crews,
      transports: world.transports,
      blocks: world.blocks,
      locations: world.locations,
      nowMin: -1,
      seed: world.seed,
      rules: DEFAULT_RULES,
    });
    assert.equal(plan.metrics.lateCount, 0);
    assert.ok(plan.metrics.emptyRatio >= 0.25 && plan.metrics.emptyRatio <= 0.3, plan.metrics.emptyRatio.toFixed(3));
    assert.ok(plan.metrics.fillRate >= 0.3 && plan.metrics.fillRate <= 0.55, plan.metrics.fillRate.toFixed(3));
    assert.equal(`${plan.metrics.placed} / ${plan.metrics.total}`, DEMO_MEASURE.placed);
    assert.equal(String(Math.round(plan.metrics.emptyKm)), DEMO_MEASURE.ambuxEmptyKm);
    assert.equal(DEMO_MEASURE.late, "0");

    const locMap = indexById(world.locations);
    const naive = naiveBaseline({
      crews: world.crews,
      transports: world.transports,
      blocks: world.blocks,
      locMap,
      rules: DEFAULT_RULES,
    });
    assert.equal(String(Math.round(naive.metrics.emptyKm)), DEMO_MEASURE.naiveEmptyKm);
    assert.ok(naive.metrics.emptyKm > plan.metrics.emptyKm + 40);

    const shown = world.transports.map((transport) => {
      const stop = plan.stops.find((item) => item.transportId === transport.id);
      if (!stop) return { ...transport, crewId: undefined, departMin: undefined };
      return { ...transport, crewId: stop.crewId, departMin: stop.departMin };
    });
    const schedules = scheduleFleet(world.crews, shown, plan.meals, locMap, "anchored", DEFAULT_RULES);
    let worstReturn = 0;
    for (const schedule of schedules.values()) {
      for (const leg of schedule.legs) {
        const transport = shown.find((item) => item.id === leg.transportId);
        if (transport) worstReturn = Math.max(worstReturn, returnDelayMin(transport, leg.arrivePickup));
      }
    }
    assert.ok(worstReturn < DEFAULT_RULES.returnAlertMin, `retour le plus tardif ${worstReturn} min`);
    const drive = emptyDriveMin(schedules);
    assert.ok(
      naive.emptyDriveMin > drive + 30,
      `temps à vide ${Math.round(naive.emptyDriveMin)} contre ${Math.round(drive)}`,
    );
  });
});
