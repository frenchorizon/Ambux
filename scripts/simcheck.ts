import { generateDay, quotas } from "../src/game/generate.ts";
import { optimizePlan } from "../src/game/optimizer.ts";
import { scheduleFleet } from "../src/game/schedule.ts";
import { indexById } from "../src/lib/collections.ts";
import { DAY_START } from "../src/game/types.ts";

const failures: string[] = [];
const fail = (message: string) => failures.push(message);

const quota = quotas("chargee");
const world = generateDay({ amb: 3, vsl: 3, density: "chargee", seed: 20261015 });
const again = generateDay({ amb: 3, vsl: 3, density: "chargee", seed: 20261015 });
if (world.transports.length !== again.transports.length) fail("génération non déterministe");
if (world.patients[0]?.lastName !== again.patients[0]?.lastName) fail("noms non déterministes");

const byCrew = new Map<string, number>();
for (const transport of world.transports) {
  if (!transport.crewId) continue;
  byCrew.set("built", (byCrew.get("built") ?? 0) + 1);
}
const perType = { ambulance: [] as number[], vsl: [] as number[] };
for (const crew of world.crews) {
  const count = world.transports.filter((transport) => {
    const original = transport;
    return original.patientId && world.transports;
  }).length;
  void count;
  const owned = world.transports.filter((transport) => transport.crewId === crew.id).length;
  perType[crew.vehicleType].push(owned);
}

const locMap = indexById(world.locations);
const schedules = scheduleFleet(world.crews, world.transports, world.blocks, locMap, "anchored");
let overlaps = 0;
let incompat = 0;
let placed = 0;
for (const crew of world.crews) {
  const legs = schedules.get(crew.id)?.legs ?? [];
  placed += legs.length;
  for (let index = 1; index < legs.length; index++) {
    if (legs[index]!.departMin < legs[index - 1]!.endMin - 0.4) overlaps += 1;
  }
  for (const leg of legs) {
    const transport = world.transports.find((item) => item.id === leg.transportId);
    if (transport?.posture === "allonge" && crew.vehicleType === "vsl") incompat += 1;
    for (const block of world.blocks) {
      if (block.crewId === crew.id && leg.departMin < block.endMin && leg.endMin > block.startMin) overlaps += 1;
    }
  }
}
if (overlaps) fail(`chevauchements initiaux : ${overlaps}`);
if (incompat) fail(`allongé sur VSL au départ : ${incompat}`);

const totals = {
  transports: world.transports.length,
  placed,
  unassigned: world.transports.length - placed,
  amb: perType.ambulance,
  vsl: perType.vsl,
  calls: world.calls.length,
  tomorrow: world.tomorrowItems.length,
};

console.log("quotas", quota);
console.log("généré", totals);

const started = performance.now();
const plan = optimizePlan({
  crews: world.crews,
  transports: world.transports,
  blocks: world.blocks,
  locations: world.locations,
  nowMin: DAY_START,
  seed: world.seed,
});
const elapsed = performance.now() - started;

const assigned = world.transports.map((transport) => {
  const stop = plan.stops.find((item) => item.transportId === transport.id);
  if (!stop) return { ...transport, crewId: undefined, departMin: undefined };
  return { ...transport, crewId: stop.crewId, departMin: stop.departMin };
});
const optSchedules = scheduleFleet(world.crews, assigned, [], locMap, "anchored");
let optOverlap = 0;
let optIncompat = 0;
let optPlaced = 0;
for (const crew of world.crews) {
  const legs = optSchedules.get(crew.id)?.legs ?? [];
  optPlaced += legs.length;
  for (let index = 1; index < legs.length; index++) {
    if (legs[index]!.departMin < legs[index - 1]!.endMin - 0.4) optOverlap += 1;
  }
  for (const leg of legs) {
    const transport = assigned.find((item) => item.id === leg.transportId);
    if (transport?.posture === "allonge" && crew.vehicleType === "vsl") optIncompat += 1;
  }
}
if (optOverlap) fail(`chevauchements optimiseur : ${optOverlap}`);
if (optIncompat) fail(`allongé sur VSL après optimiseur : ${optIncompat}`);
if (plan.metrics.placed < placed) fail(`l'optimiseur place moins de courses (${plan.metrics.placed} < ${placed})`);
if (elapsed > 2500) fail(`optimiseur trop lent : ${elapsed.toFixed(0)} ms`);
const ratio = world.transports.length ? plan.metrics.placed / world.transports.length : 0;
if (ratio < 0.8) fail(`taux de placement optimiseur trop bas : ${(ratio * 100).toFixed(0)} %`);

console.log("optimiseur", {
  ms: Math.round(elapsed),
  tested: plan.tested,
  placed: plan.metrics.placed,
  unassigned: plan.metrics.unassigned,
  emptyKm: Math.round(plan.metrics.emptyKm),
  emptyRatio: plan.metrics.emptyRatio.toFixed(2),
  fill: plan.metrics.fillRate.toFixed(2),
  late: plan.metrics.lateCount,
  score: plan.metrics.planScore,
  optPlaced,
});

const initialMetrics = {
  emptyKm: Math.round(world.stats.baselineEmptyKm),
  placed: world.stats.baselinePlaced,
  total: world.stats.baselineTotal,
  fill: world.stats.baselineFill.toFixed(2),
  late: world.stats.baselineLate,
  score: world.stats.baselineScore,
};
console.log("départ", initialMetrics);

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("simcheck ok");
