import { indexById } from "../lib/collections";
import { formatMin } from "../lib/format";
import {
  candidatePlacements,
  indexLocations,
  jumpBreaks,
  legHitsBlock,
  previewOnGrid,
  scheduleCrew,
  unavailableAt,
  scheduleFleet,
  smartDepart,
  snap5,
  startedIds,
  simulateLeg,
  toleranceOf,
  type Leg,
} from "./schedule";
import { DEFAULT_RULES, type Crew, type Location, type Rules, type TimeBlock, type Transport } from "./types";

export interface CourseChange {
  transportId: string;
  label: string;
  fromCrewId?: string;
  toCrewId?: string;
  fromDepartMin?: number;
  toDepartMin?: number;
}

export interface RippleShift {
  transportId: string;
  label: string;
  fromDepartMin: number;
  toDepartMin: number;
}

export type RipplePlan =
  { ok: true; departMin: number; shifts: RippleShift[]; warning?: string } | { ok: false; message: string };

export interface StablePlan {
  transports: Transport[];
  changes: CourseChange[];
  lockedIds: string[];
  unassignedIds: string[];
}

export interface UnavailabilityResult {
  transports: Transport[];
  blocks: TimeBlock[];
  changes: CourseChange[];
  changed: boolean;
  message: string;
}

type LabelOf = (transport: Transport) => string;

const dossierLabel: LabelOf = (transport) => transport.dossier;

export function diffSummary(changes: readonly CourseChange[]): string {
  if (changes.length === 0) return "Aucune course déplacée.";
  return `${changes.length} course${changes.length > 1 ? "s" : ""} déplacée${changes.length > 1 ? "s" : ""}.`;
}

export function describeChange(change: CourseChange, crewCode: (id?: string) => string): string {
  const fromCrew = change.fromCrewId ? crewCode(change.fromCrewId) : "À placer";
  const toCrew = change.toCrewId ? crewCode(change.toCrewId) : "À placer";
  const fromTime = change.fromDepartMin != null ? `départ ${formatMin(change.fromDepartMin)}` : "sans heure";
  const toTime = change.toDepartMin != null ? `départ ${formatMin(change.toDepartMin)}` : "sans heure";
  return `${change.label} : ${fromCrew} ${fromTime} → ${toCrew} ${toTime}`;
}

export function rippleMessage(shifts: readonly RippleShift[]): string | undefined {
  if (!shifts.length) return undefined;
  const shown = shifts
    .slice(0, 4)
    .map((shift) => `${shift.label} ${formatMin(shift.fromDepartMin)}→${formatMin(shift.toDepartMin)}`)
    .join(", ");
  const rest = shifts.length - 4;
  const more = rest > 0 ? ` et ${rest} autre${rest > 1 ? "s" : ""}` : "";
  const n = shifts.length;
  return `${n} course${n > 1 ? "s" : ""} suivante${n > 1 ? "s" : ""} décalée${n > 1 ? "s" : ""} : ${shown}${more}.`;
}

export function planChanges(
  before: readonly Transport[],
  after: readonly Transport[],
  labelOf: LabelOf = dossierLabel,
): CourseChange[] {
  const nextById = indexById(after);
  const changes: CourseChange[] = [];
  for (const transport of before) {
    if (transport.cancelled) continue;
    const next = nextById.get(transport.id);
    if (!next || next.cancelled) continue;
    const crewChanged = (transport.crewId ?? "") !== (next.crewId ?? "");
    const timeChanged = Math.abs((transport.departMin ?? -1) - (next.departMin ?? -1)) > 0.6;
    if (!crewChanged && !timeChanged) continue;
    changes.push({
      transportId: transport.id,
      label: labelOf(transport),
      fromCrewId: transport.crewId,
      toCrewId: next.crewId,
      fromDepartMin: transport.departMin,
      toDepartMin: next.departMin,
    });
  }
  return changes;
}

export function planRipple(input: {
  crew: Crew;
  transport: Transport;
  requestedDepart: number;
  transports: readonly Transport[];
  blocks: readonly TimeBlock[];
  locMap: Map<string, Location>;
  nowMin: number;
  rules?: Rules;
  labelOf?: LabelOf;
}): RipplePlan {
  const rules = input.rules ?? DEFAULT_RULES;
  const labelOf = input.labelOf ?? dossierLabel;
  const { crew, transport, blocks, locMap, nowMin } = input;
  if (transport.cancelled) return { ok: false, message: "Ce transport est annulé." };
  if (transport.posture === "allonge" && crew.vehicleType === "vsl") {
    return { ok: false, message: "Incompatibilité : transport allongé, un VSL n'est pas habilité." };
  }
  if (crew.vehicleType === "ambulance" && !crew.dea) {
    return { ok: false, message: "Incompatibilité : cette ambulance n'a pas de DEA enregistré." };
  }
  if (crew.vehicleType === "ambulance" && crew.mate.trim() === "") {
    return { ok: false, message: "Équipage incomplet : cette ambulance n'a pas d'auxiliaire." };
  }
  const current = scheduleFleet([crew], input.transports, blocks, locMap, "anchored", rules)
    .get(crew.id)
    ?.legs.find((leg) => leg.transportId === transport.id);
  if (current && current.departMin <= nowMin) {
    return { ok: false, message: "Course déjà engagée : l'équipage est parti." };
  }

  const depart = snap5(input.requestedDepart);
  const blocked = unavailableAt(crew, blocks, depart);
  if (blocked) return { ok: false, message: `Indisponible : ${blocked.label}.` };
  const others = input.transports
    .filter((item) => item.crewId === crew.id && item.id !== transport.id && !item.cancelled && item.departMin != null)
    .slice()
    .sort((a, b) => a.departMin! - b.departMin!);
  const anchored = scheduleCrew(crew, others, blocks, locMap, "anchored", undefined, rules);
  const overlappingPrior = anchored.legs.filter((leg) => leg.departMin < depart - 0.2 && leg.endMin > depart + 0.4);
  if (overlappingPrior.length) {
    const owner = others.find((item) => item.id === overlappingPrior[0]!.transportId);
    if (owner?.pinned) return pinnedRefusal(owner, labelOf);
    return { ok: false, message: "Conflit horaire : une course précédente occupe ce créneau." };
  }

  const prior = anchored.legs.filter((leg) => leg.endMin <= depart + 0.4);
  const lastPrior = prior[prior.length - 1];
  const fromId = lastPrior?.dropoffId ?? crew.baseId;
  if (lastPrior && depart < lastPrior.endMin - 0.4) {
    return { ok: false, message: "Conflit horaire : une course précédente occupe ce créneau." };
  }
  const moving = simulateLeg(transport, depart, fromId, crew, locMap, rules);
  if (legHitsBlock(blocks, crew.id, moving.departMin, moving.endMin)) {
    return { ok: false, message: "Ce créneau tombe sur une indisponibilité." };
  }
  if (moving.endMin > crew.shiftEnd + 1) {
    return { ok: false, message: "Le créneau dépasse la fin de vacation." };
  }

  const shifts: RippleShift[] = [];
  let cursor = moving.endMin;
  let locId = transport.dropoffId;
  const followers = others.filter((item) => (item.departMin ?? 0) >= depart - 0.2);
  for (const follower of followers) {
    const currentDepart = follower.departMin!;
    const stayed =
      currentDepart >= cursor - 0.4
        ? fitLeg(follower, currentDepart, cursor, locId, crew, blocks, locMap, rules)
        : null;
    if (stayed) {
      cursor = stayed.endMin;
      locId = follower.dropoffId;
      continue;
    }
    if (follower.pinned) return pinnedRefusal(follower, labelOf);
    if (currentDepart <= nowMin) {
      return { ok: false, message: "Course déjà engagée : la suite ne peut pas être décalée." };
    }
    const pushed = chainLeg(Math.max(cursor, currentDepart), follower, locId, crew, blocks, locMap, rules);
    if (!pushed || pushed.departMin + 0.4 < currentDepart || pushed.endMin > crew.shiftEnd + 1) {
      return { ok: false, message: "La suite ne tient plus dans la vacation." };
    }
    if (pushed.departMin > currentDepart + 0.6) {
      shifts.push({
        transportId: follower.id,
        label: labelOf(follower),
        fromDepartMin: currentDepart,
        toDepartMin: pushed.departMin,
      });
    }
    cursor = pushed.endMin;
    locId = follower.dropoffId;
  }

  return { ok: true, departMin: moving.departMin, shifts, warning: toleranceWarning(moving, transport) };
}

export function applyUnavailability(input: {
  crews: readonly Crew[];
  transports: readonly Transport[];
  blocks: readonly TimeBlock[];
  locations: readonly Location[];
  rules?: Rules;
  nowMin: number;
  crewId: string;
  fromMin: number;
  toMin: number;
  reason: "absence" | "panne";
  replace: boolean;
  labelOf?: LabelOf;
}): UnavailabilityResult {
  const rules = input.rules ?? DEFAULT_RULES;
  const labelOf = input.labelOf ?? dossierLabel;
  const unchanged = (message: string): UnavailabilityResult => ({
    transports: input.transports.slice(),
    blocks: input.blocks.slice(),
    changes: [],
    changed: false,
    message,
  });
  const crew = input.crews.find((item) => item.id === input.crewId);
  if (!crew) return unchanged("Équipage introuvable.");
  if (!(input.toMin > input.fromMin)) return unchanged("Le créneau doit avoir une fin après le début.");

  const block: TimeBlock = {
    id: `${input.reason}-${crew.id}`,
    crewId: crew.id,
    startMin: input.fromMin,
    endMin: input.toMin,
    kind: input.reason,
    label: input.reason === "absence" ? "Absent" : "Panne",
  };
  const blocks = [...input.blocks.filter((item) => !(item.crewId === crew.id && item.kind === input.reason)), block];
  const locMap = indexLocations(input.locations);
  const schedule = scheduleFleet(input.crews, input.transports, input.blocks, locMap, "anchored", rules).get(crew.id);
  const released = new Set<string>();
  let engaged = 0;
  for (const transport of input.transports) {
    if (transport.cancelled || transport.crewId !== crew.id || transport.departMin == null) continue;
    const leg = schedule?.legs.find((item) => item.transportId === transport.id);
    const start = leg?.departMin ?? transport.departMin;
    const end = leg?.endMin ?? transport.departMin + 30;
    const overlaps = start < input.toMin - 0.05 && end > input.fromMin + 0.05;
    if (!overlaps) continue;
    if (transport.departMin <= input.nowMin) {
      engaged += 1;
      continue;
    }
    released.add(transport.id);
  }

  let transports = input.transports.map((transport) =>
    released.has(transport.id) ? { ...transport, crewId: undefined, departMin: undefined, pinned: false } : transport,
  );
  if (input.replace) {
    const queue = transports
      .filter((transport) => released.has(transport.id))
      .sort(
        (a, b) =>
          (a.appointmentMin ?? a.windowStart) - (b.appointmentMin ?? b.windowStart) ||
          a.dossier.localeCompare(b.dossier),
      );
    for (const transport of queue) {
      const slot = placeTransport(transport, input.crews, transports, blocks, locMap, input.nowMin, rules);
      if (!slot) continue;
      transports = transports.map((item) =>
        item.id === transport.id ? { ...item, crewId: slot.crewId, departMin: slot.departMin, pinned: false } : item,
      );
    }
  }

  const changes = planChanges(input.transports, transports, labelOf);
  return {
    transports,
    blocks,
    changes,
    changed: true,
    message: unavailabilityMessage(crew, input.fromMin, input.toMin, input.reason, changes, engaged),
  };
}

export function reoptimizeStable(input: {
  crews: readonly Crew[];
  transports: readonly Transport[];
  blocks: readonly TimeBlock[];
  locations: readonly Location[];
  nowMin: number;
  rules?: Rules;
  labelOf?: LabelOf;
}): StablePlan {
  const rules = input.rules ?? DEFAULT_RULES;
  const labelOf = input.labelOf ?? dossierLabel;
  const locMap = indexLocations(input.locations);
  const schedules = scheduleFleet(input.crews, input.transports, input.blocks, locMap, "anchored", rules);
  const started = startedIds(schedules, input.nowMin);
  const active = input.transports.filter((transport) => !transport.cancelled);
  const locked = new Set<string>();

  const disrupted = (transport: Transport): boolean => {
    if (!transport.crewId || transport.departMin == null) return true;
    const leg = schedules.get(transport.crewId)?.legs.find((item) => item.transportId === transport.id);
    if (!leg || leg.conflict || leg.incompatible) return true;
    return input.blocks.some(
      (block) =>
        block.crewId === transport.crewId &&
        (block.kind === "absence" || block.kind === "panne") &&
        leg.departMin < block.endMin - 0.05 &&
        leg.endMin > block.startMin + 0.05,
    );
  };

  for (const transport of active) {
    const placed = transport.crewId != null && transport.departMin != null;
    if (placed && transport.pinned) {
      locked.add(transport.id);
      continue;
    }
    if (started.has(transport.id)) {
      locked.add(transport.id);
      continue;
    }
    if (placed && !disrupted(transport)) locked.add(transport.id);
  }

  const pool = active
    .filter((transport) => !locked.has(transport.id))
    .sort(
      (a, b) =>
        (a.appointmentMin ?? a.windowStart) - (b.appointmentMin ?? b.windowStart) || a.dossier.localeCompare(b.dossier),
    );
  let transports = input.transports.map((transport) =>
    locked.has(transport.id) || transport.cancelled
      ? transport
      : { ...transport, crewId: undefined, departMin: undefined },
  );
  for (const transport of pool) {
    const slot = placeTransport(transport, input.crews, transports, input.blocks, locMap, input.nowMin, rules, {
      crewId: transport.crewId,
      departMin: transport.departMin,
    });
    if (!slot) continue;
    const keepExact =
      transport.crewId === slot.crewId &&
      transport.departMin != null &&
      Math.abs(slot.departMin - transport.departMin) <= 5;
    transports = transports.map((item) =>
      item.id === transport.id
        ? {
            ...item,
            crewId: slot.crewId,
            departMin: keepExact ? transport.departMin : slot.departMin,
            pinned: item.pinned,
          }
        : item,
    );
  }

  return {
    transports,
    changes: planChanges(input.transports, transports, labelOf),
    lockedIds: [...locked],
    unassignedIds: transports
      .filter((transport) => !transport.cancelled && !transport.crewId)
      .map((transport) => transport.id),
  };
}

export function placeTransport(
  transport: Transport,
  crews: readonly Crew[],
  transports: readonly Transport[],
  blocks: readonly TimeBlock[],
  locMap: Map<string, Location>,
  nowMin: number,
  rules: Rules = DEFAULT_RULES,
  prefer?: { crewId?: string; departMin?: number },
): { crewId: string; departMin: number } | null {
  if (prefer?.crewId && prefer.departMin != null) {
    const crew = crews.find((item) => item.id === prefer.crewId);
    if (crew) {
      const preview = previewOnGrid(crew, transport, prefer.departMin, transports, blocks, locMap, nowMin, rules);
      if (preview.ok && !legHitsBlock(blocks, crew.id, preview.leg.departMin, preview.leg.endMin)) {
        return { crewId: crew.id, departMin: preview.departMin };
      }
    }
  }
  let best: { crewId: string; departMin: number; cost: number } | null = null;
  for (const crew of crews) {
    const candidates = candidatePlacements(crew, transport, transports, blocks, locMap, nowMin, rules);
    for (const leg of candidates) {
      const preview = previewOnGrid(crew, transport, leg.departMin, transports, blocks, locMap, nowMin, rules);
      if (!preview.ok || legHitsBlock(blocks, crew.id, preview.leg.departMin, preview.leg.endMin)) continue;
      const sameCrew = prefer?.crewId === crew.id ? 0 : 90;
      const drift = prefer?.departMin != null ? Math.abs(preview.departMin - prefer.departMin) * 0.35 : 0;
      const cost = leg.deadheadKm * 2.4 + leg.lateMin * 8 + leg.waitMin * 0.1 + sameCrew + drift;
      if (!best || cost < best.cost) best = { crewId: crew.id, departMin: preview.departMin, cost };
    }
  }
  return best ? { crewId: best.crewId, departMin: best.departMin } : null;
}

function pinnedRefusal(transport: Transport, labelOf: LabelOf): RipplePlan {
  return { ok: false, message: `Course épinglée : ${labelOf(transport)} ne bouge pas.` };
}

function toleranceWarning(leg: Leg, transport: Transport): string | undefined {
  const tolerance = toleranceOf(transport);
  if (leg.lateMin >= 1) return `Hors tolérance : +${leg.deviationMin} min.`;
  if (leg.deviationMin <= -tolerance) return `Hors tolérance : ${leg.deviationMin} min.`;
  return undefined;
}

function fitLeg(
  transport: Transport,
  departMin: number,
  cursor: number,
  fromId: string,
  crew: Crew,
  blocks: readonly TimeBlock[],
  locMap: Map<string, Location>,
  rules: Rules,
): Leg | null {
  if (departMin < cursor - 0.4) return null;
  const leg = simulateLeg(transport, departMin, fromId, crew, locMap, rules);
  if (leg.departMin < cursor - 0.4) return null;
  if (legHitsBlock(blocks, crew.id, leg.departMin, leg.endMin)) return null;
  if (leg.endMin > crew.shiftEnd + 1) return null;
  return leg;
}

function chainLeg(
  cursor: number,
  transport: Transport,
  fromId: string,
  crew: Crew,
  blocks: readonly TimeBlock[],
  locMap: Map<string, Location>,
  rules: Rules,
): Leg | null {
  let depart = snap5up(Math.max(cursor, smartDepart(cursor, transport, fromId, locMap)));
  for (let guard = 0; guard < 4; guard++) {
    depart = snap5up(jumpBreaks(blocks, crew.id, depart));
    const leg = simulateLeg(transport, depart, fromId, crew, locMap, rules);
    const hit = legHitsBlock(blocks, crew.id, leg.departMin, leg.endMin);
    if (!hit && leg.departMin + 0.2 >= cursor && leg.endMin <= crew.shiftEnd + 1) return leg;
    depart = snap5up(hit ? hit.endMin : Math.max(cursor, leg.departMin + 5));
  }
  return null;
}

function snap5up(min: number): number {
  return Math.ceil((min - 1e-6) / 5) * 5;
}

function unavailabilityMessage(
  crew: Crew,
  fromMin: number,
  toMin: number,
  reason: "absence" | "panne",
  changes: readonly CourseChange[],
  engaged: number,
): string {
  const whole = fromMin <= crew.shiftStart + 0.5 && toMin >= crew.shiftEnd - 0.5;
  const why = reason === "absence" ? "absent" : "en panne";
  const when = whole ? "toute la journée" : `de ${formatMin(fromMin)} à ${formatMin(toMin)}`;
  const placed = changes.filter((change) => change.toCrewId).length;
  const parked = changes.filter((change) => !change.toCrewId).length;
  const parts = [`${crew.code} ${why} ${when}.`];
  if (placed) parts.push(`${placed} course${placed > 1 ? "s" : ""} replacée${placed > 1 ? "s" : ""}.`);
  if (parked) parts.push(`${parked} course${parked > 1 ? "s" : ""} dans À placer.`);
  if (!placed && !parked) parts.push("Aucune course à retirer.");
  if (engaged)
    parts.push(
      `${engaged} course${engaged > 1 ? "s" : ""} déjà engagée${engaged > 1 ? "s" : ""} reste${engaged > 1 ? "nt" : ""} sur la feuille.`,
    );
  return parts.join(" ");
}
