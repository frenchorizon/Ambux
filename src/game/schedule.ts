import { indexById } from "../lib/collections";
import { travelBetween } from "../lib/routing";
import { DEFAULT_RULES, type Crew, type Location, type Rules, type TimeBlock, type Transport } from "./types";

export interface Segment {
  kind: "deadhead" | "wait" | "loaded" | "pec" | "dropoff";
  start: number;
  end: number;
}

export interface VisualPart {
  kind: "vide" | "pec" | "charge";
  start: number;
  end: number;
}

export interface Leg {
  transportId: string;
  crewId: string;
  departMin: number;
  arrivePickup: number;
  endMin: number;
  deadheadMin: number;
  waitMin: number;
  loadedMin: number;
  pecMin: number;
  dropoffMin: number;
  deadheadKm: number;
  loadedKm: number;
  lateMin: number;
  deviationMin: number;
  outOfTolerance: boolean;
  kmEstimated: boolean;
  routingPending: boolean;
  conflict: boolean;
  incompatible: boolean;
  fromId: string;
  dropoffId: string;
  segments: Segment[];
}

export interface CrewSchedule {
  crewId: string;
  legs: Leg[];
  returnKm: number;
  returnStart: number;
  returnEnd: number;
  idleMin: number;
}

export interface Gap {
  start: number;
  end: number;
  fromId: string;
}

export type PlacementPreview =
  | { ok: true; departMin: number; leg: Leg; warning?: string }
  | { ok: false; reason: "incompatible" | "conflict" | "cancelled" | "started"; message: string };

export function indexLocations(locations: readonly Location[]): Map<string, Location> {
  return indexById(locations);
}

export function travelLoc(
  fromId: string,
  toId: string,
  locMap: Map<string, Location>,
): { km: number; min: number; source: "osrm" | "ors" | "estimate"; pending?: boolean } {
  const from = locMap.get(fromId);
  const to = locMap.get(toId);
  if (!from || !to) return { km: 6, min: 12, source: "estimate" };
  return travelBetween(fromId, toId, from, to);
}

export function plannedPickup(transport: Transport): number {
  return transport.appointmentMin ?? transport.windowStart;
}

export function toleranceOf(transport: Transport): number {
  if (transport.toleranceMin != null) return transport.toleranceMin;
  return Math.max(10, Math.round((transport.windowEnd - transport.windowStart) / 2));
}

export function jumpBreaks(blocks: readonly TimeBlock[], crewId: string, time: number): number {
  let cursor = time;
  for (let guard = 0; guard < 8; guard++) {
    const hit = blocks.find(
      (block) => block.crewId === crewId && cursor >= block.startMin && cursor < block.endMin,
    );
    if (!hit) return cursor;
    cursor = hit.endMin;
  }
  return cursor;
}

export function legHitsBlock(
  blocks: readonly TimeBlock[],
  crewId: string,
  start: number,
  end: number,
): TimeBlock | undefined {
  return blocks.find(
    (block) => block.crewId === crewId && start < block.endMin - 0.05 && end > block.startMin + 0.05,
  );
}

export function serviceDurations(crew: Crew, rules: Rules = DEFAULT_RULES): { pecMin: number; dropoffMin: number } {
  return {
    pecMin: crew.vehicleType === "ambulance" ? (rules.pecAmbMin ?? DEFAULT_RULES.pecAmbMin) : (rules.pecVslMin ?? DEFAULT_RULES.pecVslMin),
    dropoffMin: rules.dropoffMin ?? DEFAULT_RULES.dropoffMin,
  };
}

export function visualParts(leg: Leg): VisualPart[] {
  const parts: VisualPart[] = [];
  const deadhead = leg.segments.find((segment) => segment.kind === "deadhead");
  if (deadhead) parts.push({ kind: "vide", start: deadhead.start, end: deadhead.end });
  const pec = leg.segments.find((segment) => segment.kind === "pec");
  if (pec) parts.push({ kind: "pec", start: pec.start, end: pec.end });
  const loaded = leg.segments.find((segment) => segment.kind === "loaded");
  const dropoff = leg.segments.find((segment) => segment.kind === "dropoff");
  const start = loaded?.start ?? dropoff?.start;
  const end = dropoff?.end ?? loaded?.end;
  if (start != null && end != null && end - start >= 0.4) parts.push({ kind: "charge", start, end });
  return parts;
}

export function simulateLeg(
  transport: Transport,
  departMin: number,
  fromId: string,
  crew: Crew,
  locMap: Map<string, Location>,
  rules: Rules = DEFAULT_RULES,
): Leg {
  const deadhead = travelLoc(fromId, transport.pickupId, locMap);
  const loaded = travelLoc(transport.pickupId, transport.dropoffId, locMap);
  const service = serviceDurations(crew, rules);
  const depart = departMin;
  const rawArrive = depart + deadhead.min;
  const waitMin = Math.max(0, transport.windowStart - rawArrive);
  const arrivePickup = rawArrive + waitMin;
  const loadedStart = arrivePickup + service.pecMin;
  const dropoffArrive = loadedStart + loaded.min;
  const stayMin = Math.max(0, transport.stayMin ?? 0);
  const dropoffEnd = dropoffArrive + service.dropoffMin;
  const endMin = dropoffEnd + stayMin;
  const segments: Segment[] = [];
  const push = (kind: Segment["kind"], start: number, end: number) => {
    if (end - start >= 0.4) segments.push({ kind, start, end });
  };
  push("deadhead", depart, depart + deadhead.min);
  push("wait", rawArrive, arrivePickup);
  push("pec", arrivePickup, loadedStart);
  push("loaded", loadedStart, dropoffArrive);
  push("dropoff", dropoffArrive, dropoffEnd);
  push("wait", dropoffEnd, endMin);
  const pending = Boolean(deadhead.pending || loaded.pending);
  const planned = plannedPickup(transport);
  const tolerance = toleranceOf(transport);

  return {
    transportId: transport.id,
    crewId: crew.id,
    departMin: depart,
    arrivePickup,
    endMin,
    deadheadMin: deadhead.min,
    waitMin,
    loadedMin: loaded.min,
    pecMin: service.pecMin,
    dropoffMin: service.dropoffMin,
    deadheadKm: deadhead.km,
    loadedKm: loaded.km,
    lateMin: Math.max(0, arrivePickup - planned - tolerance),
    deviationMin: Math.round(arrivePickup - planned),
    outOfTolerance: arrivePickup > planned + tolerance + 0.5 || arrivePickup < planned - tolerance - 0.5,
    kmEstimated: !pending && (deadhead.source === "estimate" || loaded.source === "estimate"),
    routingPending: pending,
    conflict: false,
    incompatible:
      (transport.posture === "allonge" && crew.vehicleType === "vsl") ||
      (crew.vehicleType === "ambulance" && !crew.dea),
    fromId,
    dropoffId: transport.dropoffId,
    segments,
  };
}

export function smartDepart(
  earliest: number,
  transport: Transport,
  fromId: string,
  locMap: Map<string, Location>,
): number {
  const travel = travelLoc(fromId, transport.pickupId, locMap);
  return Math.max(earliest, transport.windowStart - travel.min);
}

export function scheduleCrew(
  crew: Crew,
  ordered: readonly Transport[],
  blocks: readonly TimeBlock[],
  locMap: Map<string, Location>,
  mode: "anchored" | "chain",
  origin?: { time: number; locId: string },
  rules: Rules = DEFAULT_RULES,
): CrewSchedule {
  const jobs =
    mode === "anchored"
      ? ordered
          .filter((transport) => transport.departMin != null && !transport.cancelled)
          .slice()
          .sort((a, b) => a.departMin! - b.departMin!)
      : ordered.filter((transport) => !transport.cancelled);

  let cursor = origin?.time ?? crew.shiftStart;
  let locId = origin?.locId ?? crew.baseId;
  const legs: Leg[] = [];
  let idleMin = 0;
  let previousEnd = cursor;

  for (const transport of jobs) {
    cursor = jumpBreaks(blocks, crew.id, cursor);
    let depart =
      mode === "chain"
        ? smartDepart(cursor, transport, locId, locMap)
        : Math.max(transport.departMin ?? cursor, cursor);
    let conflict = mode === "anchored" && depart > (transport.departMin ?? depart) + 1;
    const jumped = jumpBreaks(blocks, crew.id, depart);
    if (jumped > depart + 1) conflict = true;
    depart = jumped;
    let leg = simulateLeg(transport, depart, locId, crew, locMap, rules);
    const hit = legHitsBlock(blocks, crew.id, leg.departMin, leg.endMin);
    if (hit) {
      conflict = true;
      const pushed = jumpBreaks(blocks, crew.id, Math.max(depart, hit.endMin));
      leg = simulateLeg(transport, pushed, locId, crew, locMap, rules);
    }
    if (conflict || legHitsBlock(blocks, crew.id, leg.departMin, leg.endMin)) {
      leg = { ...leg, conflict: true };
    }
    idleMin += Math.max(0, leg.departMin - previousEnd);
    legs.push(leg);
    cursor = leg.endMin;
    previousEnd = leg.endMin;
    locId = transport.dropoffId;
  }

  const back = legs.length ? travelLoc(locId, crew.baseId, locMap) : { km: 0, min: 0 };
  return {
    crewId: crew.id,
    legs,
    returnKm: back.km,
    returnStart: cursor,
    returnEnd: cursor + back.min,
    idleMin,
  };
}

export function scheduleFleet(
  crews: readonly Crew[],
  transports: readonly Transport[],
  blocks: readonly TimeBlock[],
  locMap: Map<string, Location>,
  mode: "anchored" | "chain" = "anchored",
  rules: Rules = DEFAULT_RULES,
): Map<string, CrewSchedule> {
  const map = new Map<string, CrewSchedule>();
  for (const crew of crews) {
    const mine = transports.filter((transport) => transport.crewId === crew.id);
    map.set(crew.id, scheduleCrew(crew, mine, blocks, locMap, mode, undefined, rules));
  }
  return map;
}

export function freeGaps(
  crew: Crew,
  transports: readonly Transport[],
  blocks: readonly TimeBlock[],
  locMap: Map<string, Location>,
  nowMin: number,
  rules: Rules = DEFAULT_RULES,
): Gap[] {
  const schedule = scheduleCrew(
    crew,
    transports.filter((transport) => transport.crewId === crew.id),
    blocks,
    locMap,
    "anchored",
    undefined,
    rules,
  );
  const ranges: { start: number; end: number; locAfter?: string }[] = [];
  for (const leg of schedule.legs) {
    ranges.push({ start: leg.departMin, end: leg.endMin, locAfter: leg.dropoffId });
  }
  for (const block of blocks) {
    if (block.crewId === crew.id) {
      ranges.push({ start: block.startMin, end: block.endMin });
    }
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);

  let cursor = crew.shiftStart;
  let locId = crew.baseId;
  const gaps: Gap[] = [];
  const horizon = Math.max(crew.shiftStart, nowMin);

  for (const range of ranges) {
    if (range.end <= horizon) {
      cursor = Math.max(cursor, range.end);
      if (range.locAfter) locId = range.locAfter;
      continue;
    }
    const gapStart = Math.max(cursor, horizon);
    if (range.start > gapStart + 8) {
      gaps.push({ start: gapStart, end: range.start, fromId: locId });
    }
    cursor = Math.max(cursor, range.end);
    if (range.locAfter) locId = range.locAfter;
  }

  const tail = Math.max(cursor, horizon);
  if (crew.shiftEnd - tail > 8) {
    gaps.push({ start: tail, end: crew.shiftEnd, fromId: locId });
  }
  return gaps;
}

function placeInGap(
  gap: Gap,
  transport: Transport,
  crew: Crew,
  blocks: readonly TimeBlock[],
  locMap: Map<string, Location>,
  requested: number,
  rules: Rules,
): Leg | null {
  const travel = travelLoc(gap.fromId, transport.pickupId, locMap);
  const loaded = travelLoc(transport.pickupId, transport.dropoffId, locMap);
  const service = serviceDurations(crew, rules);
  const minSpan = travel.min + loaded.min + service.pecMin + service.dropoffMin + Math.max(0, transport.stayMin ?? 0);
  if (gap.end - gap.start < minSpan - 1) return null;
  let depart = requested;
  if (depart < gap.start) depart = gap.start;
  const latest = gap.end - minSpan;
  if (depart > latest) depart = latest;
  if (depart < gap.start - 0.2) return null;
  let leg = simulateLeg(transport, depart, gap.fromId, crew, locMap, rules);
  if (leg.endMin > gap.end + 1.5) {
    depart = Math.max(gap.start, leg.departMin - (leg.endMin - gap.end));
    leg = simulateLeg(transport, depart, gap.fromId, crew, locMap, rules);
  }
  if (leg.departMin < gap.start - 0.4 || leg.endMin > gap.end + 1.5) return null;
  if (legHitsBlock(blocks, crew.id, leg.departMin, leg.endMin)) return null;
  return leg;
}

function bestLegInGap(
  gap: Gap,
  transport: Transport,
  crew: Crew,
  blocks: readonly TimeBlock[],
  locMap: Map<string, Location>,
  rules: Rules,
): Leg | null {
  const travel = travelLoc(gap.fromId, transport.pickupId, locMap);
  const smart = Math.max(gap.start, transport.windowStart - travel.min);
  const tries = smart === gap.start ? [gap.start] : [smart, gap.start];
  let best: Leg | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const depart of tries) {
    if (depart >= gap.end) continue;
    const leg = simulateLeg(transport, depart, gap.fromId, crew, locMap, rules);
    if (leg.departMin < gap.start - 0.2 || leg.endMin > gap.end + 0.4) continue;
    if (legHitsBlock(blocks, crew.id, leg.departMin, leg.endMin)) continue;
    const score = leg.lateMin * 20 + leg.waitMin;
    if (score < bestScore) {
      best = leg;
      bestScore = score;
    }
  }
  return best;
}

export function candidatePlacements(
  crew: Crew,
  transport: Transport,
  transports: readonly Transport[],
  blocks: readonly TimeBlock[],
  locMap: Map<string, Location>,
  nowMin: number,
  rules: Rules = DEFAULT_RULES,
): Leg[] {
  if (transport.posture === "allonge" && crew.vehicleType === "vsl") return [];
  if (crew.vehicleType === "ambulance" && !crew.dea) return [];
  const gaps = freeGaps(
    crew,
    transports.filter((item) => item.id !== transport.id),
    blocks,
    locMap,
    nowMin,
    rules,
  );
  const legs: Leg[] = [];
  for (const gap of gaps) {
    const leg = bestLegInGap(gap, transport, crew, blocks, locMap, rules);
    if (leg && leg.departMin >= nowMin - 0.2) legs.push(leg);
  }
  return legs;
}

export function previewPlacement(
  crew: Crew,
  transport: Transport,
  requestedDepart: number,
  transports: readonly Transport[],
  blocks: readonly TimeBlock[],
  locMap: Map<string, Location>,
  nowMin: number,
  rules: Rules = DEFAULT_RULES,
): PlacementPreview {
  if (transport.cancelled) {
    return { ok: false, reason: "cancelled", message: "Ce transport est annulé." };
  }
  const existing = scheduleFleet([crew], transports, blocks, locMap, "anchored", rules).get(crew.id);
  const current = existing?.legs.find((leg) => leg.transportId === transport.id);
  if (current && current.departMin <= nowMin) {
    return {
      ok: false,
      reason: "started",
      message: "Course déjà engagée : l'équipage est parti.",
    };
  }
  if (transport.posture === "allonge" && crew.vehicleType === "vsl") {
    return {
      ok: false,
      reason: "incompatible",
      message: "Incompatibilité : transport allongé, un VSL n'est pas habilité.",
    };
  }
  if (crew.vehicleType === "ambulance" && !crew.dea) {
    return {
      ok: false,
      reason: "incompatible",
      message: "Incompatibilité : cette ambulance n'a pas de DEA enregistré.",
    };
  }
  const gaps = freeGaps(
    crew,
    transports.filter((item) => item.id !== transport.id),
    blocks,
    locMap,
    nowMin,
    rules,
  );
  let leg: Leg | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const gap of gaps) {
    const placed = placeInGap(gap, transport, crew, blocks, locMap, requestedDepart, rules);
    if (!placed || placed.departMin < nowMin - 0.2) continue;
    const dist = Math.abs(placed.departMin - requestedDepart);
    if (dist < bestDist) {
      bestDist = dist;
      leg = placed;
    }
  }
  if (!leg) {
    return {
      ok: false,
      reason: "conflict",
      message: "Conflit horaire : aucun créneau libre sur cet équipage.",
    };
  }
  const tolerance = toleranceOf(transport);
  let warning: string | undefined;
  if (leg.lateMin >= 1) {
    warning = `Hors tolérance : +${leg.deviationMin} min.`;
  } else if (leg.deviationMin <= -tolerance) {
    warning = `Hors tolérance : ${leg.deviationMin} min.`;
  } else if (leg.deviationMin >= 5) {
    warning = `Prise en charge en retard : +${leg.deviationMin} min.`;
  } else if (leg.deviationMin <= -8) {
    warning = `Prise en charge en avance : ${leg.deviationMin} min.`;
  }
  return { ok: true, departMin: leg.departMin, leg, warning };
}

export function bestSlotFor(
  transport: Transport,
  crews: readonly Crew[],
  transports: readonly Transport[],
  blocks: readonly TimeBlock[],
  locMap: Map<string, Location>,
  nowMin: number,
  rules: Rules = DEFAULT_RULES,
): { crewId: string; departMin: number; warning?: string } | null {
  let best: { crewId: string; departMin: number; cost: number; warning?: string } | null = null;
  for (const crew of crews) {
    const candidates = candidatePlacements(crew, transport, transports, blocks, locMap, nowMin, rules);
    for (const leg of candidates) {
      const cost = leg.deadheadKm * 2.4 + leg.lateMin * 7 + leg.waitMin * 0.12;
      if (!best || cost < best.cost) {
        best = {
          crewId: crew.id,
          departMin: leg.departMin,
          cost,
          warning: leg.lateMin >= 5 ? `Hors fenêtre : +${Math.round(leg.lateMin)} min.` : undefined,
        };
      }
    }
  }
  if (!best) return null;
  return { crewId: best.crewId, departMin: best.departMin, warning: best.warning };
}

export function suggestCompact(
  crews: readonly Crew[],
  transports: readonly Transport[],
  blocks: readonly TimeBlock[],
  locMap: Map<string, Location>,
  nowMin: number,
  rules: Rules = DEFAULT_RULES,
): Map<string, number> {
  const updates = new Map<string, number>();
  const schedules = scheduleFleet(crews, transports, blocks, locMap, "anchored", rules);
  const byId = indexById(transports);

  for (const crew of crews) {
    const schedule = schedules.get(crew.id);
    if (!schedule) continue;
    let cursor = crew.shiftStart;
    let locId = crew.baseId;
    for (const leg of schedule.legs) {
      const transport = byId.get(leg.transportId);
      if (!transport) continue;
      if (leg.departMin <= nowMin) {
        cursor = Math.max(cursor, leg.endMin);
        locId = transport.dropoffId;
        continue;
      }
      cursor = jumpBreaks(blocks, crew.id, cursor);
      let depart = jumpBreaks(
        blocks,
        crew.id,
        Math.max(cursor, smartDepart(cursor, transport, locId, locMap)),
      );
      let next = simulateLeg(transport, depart, locId, crew, locMap, rules);
      const hit = legHitsBlock(blocks, crew.id, next.departMin, next.endMin);
      if (hit) {
        depart = jumpBreaks(blocks, crew.id, hit.endMin);
        next = simulateLeg(transport, depart, locId, crew, locMap, rules);
      }
      if (Math.abs(next.departMin - (transport.departMin ?? next.departMin)) > 0.6) {
        updates.set(transport.id, next.departMin);
      }
      cursor = next.endMin;
      locId = transport.dropoffId;
    }
  }
  return updates;
}

export function crewOrigin(
  crew: Crew,
  schedule: CrewSchedule,
  blocks: readonly TimeBlock[],
  nowMin: number,
): { time: number; locId: string } {
  let time = Math.max(crew.shiftStart, nowMin);
  let locId = crew.baseId;
  for (const leg of schedule.legs) {
    if (leg.endMin <= nowMin) {
      locId = leg.dropoffId;
      time = Math.max(crew.shiftStart, nowMin);
    } else if (leg.departMin <= nowMin) {
      locId = leg.dropoffId;
      time = Math.max(time, leg.endMin);
    }
  }
  time = jumpBreaks(blocks, crew.id, time);
  return { time, locId };
}

export function startedIds(schedules: Map<string, CrewSchedule>, nowMin: number): Set<string> {
  const ids = new Set<string>();
  for (const schedule of schedules.values()) {
    for (const leg of schedule.legs) {
      if (leg.departMin <= nowMin) ids.add(leg.transportId);
    }
  }
  return ids;
}

export function findPauseStart(
  crew: Crew,
  transports: readonly Transport[],
  blocks: readonly TimeBlock[],
  locMap: Map<string, Location>,
  nowMin: number,
  duration: number,
): number {
  const gaps = freeGaps(crew, transports, blocks, locMap, nowMin);
  const gap = gaps.find((item) => item.end - item.start >= duration);
  if (gap) return gap.start;
  const schedule = scheduleFleet([crew], transports, blocks, locMap).get(crew.id);
  const lastEnd = schedule?.legs.length ? schedule.legs[schedule.legs.length - 1]!.endMin : nowMin;
  return jumpBreaks(blocks, crew.id, Math.max(nowMin, lastEnd));
}
