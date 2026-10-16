import { indexById } from "../lib/collections";
import { mulberry32 } from "../lib/rng";
import { pickMealSlot } from "./breaks";
import { metricsFromSchedules, type Metrics } from "./scoring";
import { crewOrigin, scheduleCrew, scheduleFleet, type CrewSchedule, type Leg } from "./schedule";
import {
  DEFAULT_RULES,
  type Crew,
  type Location,
  type PlanStop,
  type Rules,
  type TimeBlock,
  type Transport,
} from "./types";

export interface PlanResult {
  stops: PlanStop[];
  unassignedIds: string[];
  metrics: Metrics;
  tested: number;
  elapsedMs: number;
  meals: TimeBlock[];
}

interface Sol {
  routes: Record<string, string[]>;
  unassigned: string[];
}

interface CrewEval {
  ok: boolean;
  cost: number;
  departs: { id: string; departMin: number }[];
}

const UNASSIGNED_COST = 280;
const URGENT_EXTRA = 170;

export function optimizePlan(input: {
  crews: readonly Crew[];
  transports: readonly Transport[];
  blocks: readonly TimeBlock[];
  locations: readonly Location[];
  nowMin: number;
  seed?: number;
  rules?: Rules;
}): PlanResult {
  const started = performance.now();
  const locMap = indexById(input.locations);
  const active = input.transports.filter((transport) => !transport.cancelled);
  const byId = indexById(active);
  const current = scheduleFleet(input.crews, active, input.blocks, locMap, "anchored", input.rules ?? DEFAULT_RULES);

  const frozenCount: Record<string, number> = {};
  const origin: Record<string, { time: number; locId: string }> = {};
  const warm = emptySol(input.crews);
  const pool: Transport[] = [];

  for (const crew of input.crews) {
    const schedule = current.get(crew.id)!;
    const frozen = schedule.legs.filter((leg) => leg.departMin <= input.nowMin + 0.05);
    frozenCount[crew.id] = frozen.length;
    warm.routes[crew.id] = frozen.map((leg) => leg.transportId);
    origin[crew.id] = crewOrigin(crew, schedule, input.blocks, input.nowMin);
    const future = schedule.legs.filter((leg) => leg.departMin > input.nowMin + 0.05);
    for (const leg of future) warm.routes[crew.id]!.push(leg.transportId);
  }

  const placed = new Set(Object.values(warm.routes).flat());
  for (const transport of active) {
    if (!placed.has(transport.id)) pool.push(transport);
  }
  warm.unassigned = pool.map((transport) => transport.id);

  const cold = emptySol(input.crews);
  const frozenIds = new Set<string>();
  for (const crew of input.crews) {
    cold.routes[crew.id] = warm.routes[crew.id]!.slice(0, frozenCount[crew.id]);
    for (const id of cold.routes[crew.id]!) frozenIds.add(id);
  }
  cold.unassigned = active.filter((transport) => !frozenIds.has(transport.id)).map((transport) => transport.id);

  const ctx: Ctx = {
    crews: input.crews,
    blocks: input.blocks,
    locMap,
    byId,
    origin,
    frozenCount,
    tested: 0,
    seed: input.seed ?? 20261015,
    rules: input.rules ?? DEFAULT_RULES,
  };

  const greedy = insertGreedy(cloneSol(cold), ctx);
  const polishedCold = hillClimb(greedy, ctx, 320);
  const polishedWarm = hillClimb(cloneSol(warm), ctx, 220);
  const choice = totalCost(polishedCold, ctx) <= totalCost(polishedWarm, ctx) ? polishedCold : polishedWarm;

  const stops: PlanStop[] = [];
  for (const crew of input.crews) {
    const ids = choice.routes[crew.id] ?? [];
    const prefix = ids.slice(0, frozenCount[crew.id] ?? 0);
    for (const id of prefix) {
      const transport = byId.get(id);
      if (transport?.departMin != null) {
        stops.push({ transportId: id, crewId: crew.id, departMin: transport.departMin });
      }
    }
    const suffix = ids.slice(frozenCount[crew.id] ?? 0);
    const evaluation = evaluateSuffix(crew, suffix, ctx);
    for (const depart of evaluation.departs) {
      stops.push({ transportId: depart.id, crewId: crew.id, departMin: depart.departMin });
    }
  }

  const planned = applyStops(active, stops);
  const foreignBlocks = input.blocks.filter((block) => block.kind !== "repas");
  const meals = mealsFor(input.crews, planned, foreignBlocks, locMap, ctx.rules);
  const metrics = metricsFromSchedules(
    input.crews,
    scheduleFleet(input.crews, planned, [...foreignBlocks, ...meals], locMap, "anchored", input.rules ?? DEFAULT_RULES),
    planned,
    [...foreignBlocks, ...meals],
  );

  return {
    stops,
    unassignedIds: choice.unassigned.slice(),
    metrics,
    tested: ctx.tested,
    elapsedMs: performance.now() - started,
    meals,
  };
}

function mealsFor(
  crews: readonly Crew[],
  transports: readonly Transport[],
  blocks: readonly TimeBlock[],
  locMap: Map<string, Location>,
  rules: Rules,
): TimeBlock[] {
  const schedules = scheduleFleet(crews, transports, blocks, locMap, "anchored", rules);
  const meals: TimeBlock[] = [];
  for (const crew of crews) {
    const schedule = schedules.get(crew.id);
    if (!schedule) continue;
    const meal = pickMealSlot(schedule, crew, rules);
    if (meal) meals.push(meal);
  }
  return meals;
}

interface Ctx {
  crews: readonly Crew[];
  blocks: readonly TimeBlock[];
  locMap: Map<string, Location>;
  byId: Map<string, Transport>;
  origin: Record<string, { time: number; locId: string }>;
  frozenCount: Record<string, number>;
  tested: number;
  seed: number;
  rules: Rules;
}

function emptySol(crews: readonly Crew[]): Sol {
  const routes: Record<string, string[]> = {};
  for (const crew of crews) routes[crew.id] = [];
  return { routes, unassigned: [] };
}

function cloneSol(sol: Sol): Sol {
  const routes: Record<string, string[]> = {};
  for (const [id, list] of Object.entries(sol.routes)) routes[id] = list.slice();
  return { routes, unassigned: sol.unassigned.slice() };
}

function maxCourses(crew: Crew, rules: Rules): number {
  return crew.vehicleType === "ambulance" ? rules.maxAmb : rules.maxVsl;
}

function compatible(crew: Crew, transport: Transport): boolean {
  if (transport.posture === "allonge" && crew.vehicleType === "vsl") return false;
  if (crew.vehicleType === "ambulance" && !crew.dea) return false;
  return true;
}

function evaluateSuffix(crew: Crew, suffix: readonly string[], ctx: Ctx): CrewEval {
  ctx.tested += 1;
  const jobs: Transport[] = [];
  for (const id of suffix) {
    const transport = ctx.byId.get(id);
    if (!transport) return { ok: false, cost: Number.POSITIVE_INFINITY, departs: [] };
    if (!compatible(crew, transport)) return { ok: false, cost: Number.POSITIVE_INFINITY, departs: [] };
    jobs.push(transport);
  }
  const frozen = ctx.frozenCount[crew.id] ?? 0;
  if (frozen + jobs.length > maxCourses(crew, ctx.rules)) {
    return { ok: false, cost: Number.POSITIVE_INFINITY, departs: [] };
  }
  const foreign = ctx.blocks.filter((block) => !(block.crewId === crew.id && block.kind === "repas"));
  const schedule = scheduleCrew(crew, jobs, foreign, ctx.locMap, "chain", ctx.origin[crew.id], ctx.rules);
  if (!suffixOk(schedule, crew) || !seriesOrderOk(jobs, schedule)) {
    return { ok: false, cost: Number.POSITIVE_INFINITY, departs: [] };
  }
  let lateMin = 0;
  let emptyKm = schedule.returnKm;
  for (const leg of schedule.legs) {
    lateMin += leg.lateMin;
    emptyKm += leg.deadheadKm;
  }
  if (jobs.length > 0 && ctx.rules.mealMin > 0 && !pickMealSlot(schedule, crew, ctx.rules)) {
    return { ok: false, cost: Number.POSITIVE_INFINITY, departs: [] };
  }
  const load = frozen + jobs.length;
  const cost = emptyKm * 8 + lateMin * 9 + schedule.idleMin * 0.22 + load * load * 1.2;
  return {
    ok: true,
    cost,
    departs: schedule.legs.map((leg) => ({ id: leg.transportId, departMin: leg.departMin })),
  };
}

function suffixOk(schedule: CrewSchedule, crew: Crew): boolean {
  return schedule.legs.every(
    (leg: Leg) =>
      !leg.incompatible &&
      !leg.conflict &&
      leg.lateMin <= 0.5 &&
      !leg.outOfTolerance &&
      leg.endMin <= crew.shiftEnd + 0.5,
  );
}

function seriesOrderOk(jobs: readonly Transport[], schedule: CrewSchedule): boolean {
  const index = new Map<string, number>();
  schedule.legs.forEach((leg, position) => index.set(leg.transportId, position));
  const groups = new Map<string, Transport[]>();
  for (const job of jobs) {
    if (!job.seriesId || !job.kind.startsWith("dialyse")) continue;
    const list = groups.get(job.seriesId) ?? [];
    list.push(job);
    groups.set(job.seriesId, list);
  }
  for (const list of groups.values()) {
    const aller = list.find((transport) => transport.kind.includes("aller"));
    const retour = list.find((transport) => transport.kind.includes("retour"));
    if (!aller || !retour) continue;
    if ((index.get(retour.id) ?? 0) <= (index.get(aller.id) ?? 0)) return false;
  }
  return true;
}

function seriesPenalty(sol: Sol, ctx: Ctx): number {
  const crewOf = new Map<string, string>();
  const indexOf = new Map<string, number>();
  for (const [crewId, ids] of Object.entries(sol.routes)) {
    ids.forEach((id, index) => {
      crewOf.set(id, crewId);
      indexOf.set(id, index);
    });
  }
  const groups = new Map<string, Transport[]>();
  for (const transport of ctx.byId.values()) {
    if (!transport.seriesId || !crewOf.has(transport.id)) continue;
    const list = groups.get(transport.seriesId) ?? [];
    list.push(transport);
    groups.set(transport.seriesId, list);
  }
  let penalty = 0;
  for (const list of groups.values()) {
    const crews = new Set(list.map((transport) => crewOf.get(transport.id)));
    if (crews.size > 1) penalty += list.some((transport) => transport.kind.startsWith("dialyse")) ? 160 : 36;
    const aller = list.find((transport) => transport.kind.endsWith("aller"));
    const retour = list.find((transport) => transport.kind.endsWith("retour"));
    if (aller && retour && crewOf.get(aller.id) === crewOf.get(retour.id)) {
      if ((indexOf.get(retour.id) ?? 0) < (indexOf.get(aller.id) ?? 0)) penalty += 48;
    }
  }
  return penalty;
}

function unassignedPenalty(sol: Sol, ctx: Ctx): number {
  let cost = 0;
  for (const id of sol.unassigned) {
    const transport = ctx.byId.get(id);
    cost += UNASSIGNED_COST + (transport?.priority === "urgent" ? URGENT_EXTRA : 0);
  }
  return cost;
}

function totalCost(sol: Sol, ctx: Ctx): number {
  let cost = seriesPenalty(sol, ctx) + unassignedPenalty(sol, ctx);
  for (const crew of ctx.crews) {
    const ids = sol.routes[crew.id] ?? [];
    const suffix = ids.slice(ctx.frozenCount[crew.id] ?? 0);
    const evaluation = evaluateSuffix(crew, suffix, ctx);
    if (!evaluation.ok) return Number.POSITIVE_INFINITY;
    cost += evaluation.cost;
  }
  return cost;
}

function insertGreedy(sol: Sol, ctx: Ctx): Sol {
  const pending = sol.unassigned
    .map((id) => ctx.byId.get(id)!)
    .filter(Boolean)
    .sort((a, b) => rank(a) - rank(b) || a.windowStart - b.windowStart);
  sol.unassigned = [];
  for (const transport of pending) {
    let best: { crewId: string; index: number; delta: number } | null = null;
    const partner = partnerCrew(transport, sol, ctx);
    for (const crew of ctx.crews) {
      if (!compatible(crew, transport)) continue;
      const ids = sol.routes[crew.id] ?? [];
      const frozen = ctx.frozenCount[crew.id] ?? 0;
      const before = evaluateSuffix(crew, ids.slice(frozen), ctx);
      if (!before.ok && ids.length > frozen) continue;
      const base = before.ok ? before.cost : 0;
      const affinity = !partner ? 0 : partner === crew.id ? -100 : 110;
      for (let index = frozen; index <= ids.length; index++) {
        const next = ids.slice();
        next.splice(index, 0, transport.id);
        const evaluation = evaluateSuffix(crew, next.slice(frozen), ctx);
        if (!evaluation.ok) continue;
        const delta = evaluation.cost - base + affinity;
        if (!best || delta < best.delta) best = { crewId: crew.id, index, delta };
      }
    }
    const limit = UNASSIGNED_COST + (transport.priority === "urgent" ? URGENT_EXTRA : 0) - 8;
    if (best && best.delta < limit) {
      sol.routes[best.crewId]!.splice(best.index, 0, transport.id);
    } else {
      sol.unassigned.push(transport.id);
    }
  }
  return sol;
}

function partnerCrew(transport: Transport, sol: Sol, ctx: Ctx): string | null {
  if (!transport.seriesId || !transport.kind.startsWith("dialyse")) return null;
  for (const [crewId, ids] of Object.entries(sol.routes)) {
    for (const id of ids) {
      const other = ctx.byId.get(id);
      if (other && other.id !== transport.id && other.seriesId === transport.seriesId) return crewId;
    }
  }
  return null;
}

function rank(transport: Transport): number {
  return (
    (transport.priority === "urgent" ? 0 : 2) +
    (transport.posture === "allonge" ? 0 : 1) +
    (transport.kind.startsWith("dialyse") ? 0 : 1)
  );
}

interface Snapshot {
  sol: Sol;
  crewCost: Record<string, number>;
  total: number;
}

function snapshot(sol: Sol, ctx: Ctx): Snapshot {
  const crewCost: Record<string, number> = {};
  let total = seriesPenalty(sol, ctx) + unassignedPenalty(sol, ctx);
  for (const crew of ctx.crews) {
    const suffix = (sol.routes[crew.id] ?? []).slice(ctx.frozenCount[crew.id] ?? 0);
    const evaluation = evaluateSuffix(crew, suffix, ctx);
    crewCost[crew.id] = evaluation.ok ? evaluation.cost : Number.POSITIVE_INFINITY;
    total += crewCost[crew.id]!;
  }
  return { sol, crewCost, total };
}

function costTouching(sol: Sol, ctx: Ctx, base: Snapshot, touched: readonly string[]): number {
  let total = seriesPenalty(sol, ctx) + unassignedPenalty(sol, ctx);
  const dirty = new Set(touched);
  for (const crew of ctx.crews) {
    if (!dirty.has(crew.id)) {
      total += base.crewCost[crew.id] ?? 0;
      continue;
    }
    const suffix = (sol.routes[crew.id] ?? []).slice(ctx.frozenCount[crew.id] ?? 0);
    const evaluation = evaluateSuffix(crew, suffix, ctx);
    if (!evaluation.ok) return Number.POSITIVE_INFINITY;
    total += evaluation.cost;
  }
  return total;
}

function hillClimb(start: Sol, ctx: Ctx, budgetMs: number): Sol {
  const t0 = performance.now();
  let snap = snapshot(cloneSol(start), ctx);
  const rng = mulberry32(ctx.seed + 17);
  let idlePasses = 0;

  while (performance.now() - t0 < budgetMs && idlePasses < 2) {
    let improved = false;
    const movable = movableIds(snap.sol, ctx);
    for (let i = movable.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = movable[i]!;
      movable[i] = movable[j]!;
      movable[j] = tmp;
    }
    for (const id of movable) {
      if (performance.now() - t0 > budgetMs) break;
      const move = bestMove(snap, id, ctx);
      if (move && move.total < snap.total - 0.08) {
        snap = snapshot(move.sol, ctx);
        improved = true;
      }
    }
    idlePasses = improved ? 0 : idlePasses + 1;
  }
  return snap.sol;
}

function movableIds(sol: Sol, ctx: Ctx): string[] {
  const ids = sol.unassigned.slice();
  for (const crew of ctx.crews) {
    const list = sol.routes[crew.id] ?? [];
    ids.push(...list.slice(ctx.frozenCount[crew.id] ?? 0));
  }
  return ids;
}

function bestMove(snap: Snapshot, id: string, ctx: Ctx): { sol: Sol; total: number } | null {
  const transport = ctx.byId.get(id);
  if (!transport) return null;
  const home = locate(snap.sol, id);
  let best: { sol: Sol; total: number } | null = null;
  const consider = (next: Sol, touched: string[]) => {
    const total = costTouching(next, ctx, snap, touched);
    if (total < (best?.total ?? snap.total) - 0.04) best = { sol: next, total };
  };

  for (const crew of ctx.crews) {
    if (!compatible(crew, transport)) continue;
    const ids = snap.sol.routes[crew.id] ?? [];
    const frozen = ctx.frozenCount[crew.id] ?? 0;
    for (let index = frozen; index <= ids.length; index++) {
      if (ids[index] === id) continue;
      if (ids[index - 1] === id && home?.crewId === crew.id) continue;
      consider(place(snap.sol, id, crew.id, index), home ? [home.crewId, crew.id] : [crew.id]);
    }
  }
  if (home) consider(removeOnly(snap.sol, id), [home.crewId]);
  return best;
}

function locate(sol: Sol, id: string): { crewId: string; index: number } | null {
  for (const [crewId, ids] of Object.entries(sol.routes)) {
    const index = ids.indexOf(id);
    if (index >= 0) return { crewId, index };
  }
  return null;
}

function removeId(sol: Sol, id: string): Sol {
  const next = cloneSol(sol);
  for (const ids of Object.values(next.routes)) {
    const index = ids.indexOf(id);
    if (index >= 0) ids.splice(index, 1);
  }
  next.unassigned = next.unassigned.filter((item) => item !== id);
  return next;
}

function place(sol: Sol, id: string, crewId: string, index: number): Sol {
  const located = locate(sol, id);
  let insertAt = index;
  if (located?.crewId === crewId && located.index < index) insertAt -= 1;
  const next = removeId(sol, id);
  const list = next.routes[crewId]!;
  list.splice(Math.max(0, Math.min(insertAt, list.length)), 0, id);
  return next;
}

function removeOnly(sol: Sol, id: string): Sol {
  const next = removeId(sol, id);
  next.unassigned.push(id);
  return next;
}

function applyStops(transports: readonly Transport[], stops: readonly PlanStop[]): Transport[] {
  const map = new Map(stops.map((stop) => [stop.transportId, stop]));
  return transports.map((transport) => {
    const stop = map.get(transport.id);
    if (!stop) return { ...transport, crewId: undefined, departMin: undefined };
    return { ...transport, crewId: stop.crewId, departMin: stop.departMin };
  });
}
