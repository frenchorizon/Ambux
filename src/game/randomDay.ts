import {
  AMBULANCE_MODELS,
  CREW_COLORS,
  CREW_PAIRS,
  DEPOT_ID,
  FIRST_NAMES,
  LAST_NAMES,
  LOCATIONS,
  VSL_MODELS,
} from "../data/world";
import { formatMin, personName } from "../lib/format";
import { irand, mulberry32, pick, shuffle } from "../lib/rng";
import { clamp } from "../lib/utils";
import { naiveBaseline } from "./baseline";
import { pickMealSlot } from "./breaks";
import { indexLocations, legHitsBlock, scheduleCrew, simulateLeg, snap5, travelLoc, type Leg } from "./schedule";
import { shiftForIndex } from "./shifts";
import type {
  Call,
  ConstraintIntensity,
  Crew,
  DayConstraint,
  DayConstraintKind,
  DayNote,
  Location,
  Patient,
  Posture,
  Rules,
  Stats,
  TimeBlock,
  TomorrowItem,
  Transport,
  TransportKind,
  VehicleType,
} from "./types";
import { DAY_END, DAY_START, DEFAULT_RULES } from "./types";
import type { GeneratedFields } from "./generate";

export const INTENSITY_COUNT: Record<ConstraintIntensity, number> = {
  faible: 2,
  moyenne: 4,
  forte: 6,
};

const ROW_KINDS = ["garage", "absence"] as const;
const OTHER_KINDS = ["horaire", "repas", "annulation", "urgence", "panne"] as const;
const SPARE_MATES = ["Lina Morel", "Hugo Perrin", "Nadia Benali"] as const;
const ONE_WAY = ["sortie", "urgence"] as const;

type Pattern = "consultation" | "kine" | "dialyse" | "sortie" | "urgence" | "radio" | "ortho";

const WEIGHTS: readonly (readonly [Pattern, number])[] = [
  ["consultation", 28],
  ["kine", 16],
  ["dialyse", 14],
  ["sortie", 16],
  ["urgence", 8],
  ["radio", 10],
  ["ortho", 8],
];

export interface RandomDayInput {
  seedLabel: string;
  missions: number;
  intensity: ConstraintIntensity;
  rules?: Rules;
}

export interface RandomDay extends GeneratedFields {
  dayNote: DayNote;
}

interface Seat {
  crew: Crew;
  time: number;
  locId: string;
  legs: { id: string; start: number; end: number }[];
}

/** Graine affichée → entier stable pour mulberry32. Un nombre décimal court reste ce nombre. */
export function hashSeed(raw: string): number {
  const text = raw.trim();
  if (/^\d{1,15}$/.test(text)) {
    const numeric = Number(text);
    if (Number.isSafeInteger(numeric)) return numeric >>> 0;
  }
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function freshSeedLabel(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let index = 0; index < 6; index++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return out;
}

export function clampMissions(value: number): number {
  if (!Number.isFinite(value)) return 48;
  return Math.min(90, Math.max(30, Math.round(value)));
}

export function fleetSize(missions: number): { amb: number; vsl: number } {
  if (missions <= 42) return { amb: 2, vsl: 3 };
  if (missions <= 60) return { amb: 3, vsl: 4 };
  if (missions <= 75) return { amb: 4, vsl: 4 };
  return { amb: 4, vsl: 5 };
}

export function randomDay(input: RandomDayInput): RandomDay {
  const rules = input.rules ?? DEFAULT_RULES;
  const missions = clampMissions(input.missions);
  const seedLabel = input.seedLabel.trim() || "journee";
  const seed = hashSeed(seedLabel);
  const rng = mulberry32(seed || 1);
  const token = (seed || 1).toString(36);
  const locations = LOCATIONS;
  const locMap = indexLocations(locations);
  const homes = locations.filter((location) => location.kind === "domicile");
  const dialyse = locations.filter((location) => location.kind === "dialyse");
  const kine = locations.filter((location) => location.id.startsWith("kine"));
  const radio = locations.filter((location) => location.id.startsWith("radio"));
  const ortho = locations.filter((location) => location.id.startsWith("ortho"));
  const consult = locations.filter(
    (location) =>
      location.kind === "chu" ||
      (location.kind === "clinique" &&
        !location.id.startsWith("kine") &&
        !location.id.startsWith("radio") &&
        !location.id.startsWith("ortho")),
  );
  const chu = locations.filter((location) => location.kind === "chu");
  const size = fleetSize(missions);
  const crews = buildCrews(size.amb, size.vsl, rules.amplitudeMin);
  const blocks: TimeBlock[] = [];
  const constraints: DayConstraint[] = [];
  const patients: Patient[] = [];
  const names = uniqueNames(rng, missions + 8);
  let nameCursor = 0;
  let serial = 0;

  const nextPatient = (addressId: string, posture: Posture, note?: string): Patient => {
    const name = names[nameCursor++] ?? { firstName: "Alex", lastName: "Martin" };
    const birthYear = irand(rng, 1944, 1996);
    const month = String(irand(rng, 1, 12)).padStart(2, "0");
    const day = String(irand(rng, 1, 28)).padStart(2, "0");
    const patient: Patient = {
      id: `pat-${token}-${patients.length + 1}`,
      firstName: name.firstName,
      lastName: name.lastName,
      phone: phoneOf(rng),
      birthYear,
      birthDate: `${birthYear}-${month}-${day}`,
      addressId,
      mobility: posture,
      note,
    };
    patients.push(patient);
    return patient;
  };

  const nextDossier = () => {
    serial += 1;
    return `DOS-${47000 + serial}`;
  };

  const kinds = drawKinds(rng, input.intensity);
  const used = new Set<string>();
  const takeCrew = (predicate?: (crew: Crew) => boolean): Crew | undefined => {
    const pool = crews.filter((crew) => !used.has(crew.id) && (!predicate || predicate(crew)));
    const choice = pool.length ? pick(rng, pool) : crews.find((crew) => !used.has(crew.id));
    if (choice) used.add(choice.id);
    return choice;
  };

  if (kinds.includes("garage")) applyGarage(rng, takeCrew(), blocks, constraints);
  if (kinds.includes("absence")) applyAbsence(rng, takeCrew(), blocks, constraints);
  if (kinds.includes("horaire")) applyHours(rng, takeCrew(), constraints);

  const seats: Seat[] = crews.map((crew) => ({
    crew,
    time: crew.shiftStart,
    locId: crew.baseId,
    legs: [],
  }));
  const transports: Transport[] = [];
  const seriesCrew = new Map<string, string>();

  const place = (transport: Transport, preferId?: string): boolean => {
    let best: { seat: Seat; leg: Leg; cost: number } | null = null;
    for (const seat of seats) {
      const leg = fit(seat, transport, blocks, locMap, rules);
      if (!leg) continue;
      const cost = leg.deadheadKm + (seat.crew.id === preferId ? -1000 : 0);
      if (!best || cost < best.cost) best = { seat, leg, cost };
    }
    if (!best) return false;
    transport.crewId = best.seat.crew.id;
    transport.departMin = best.leg.departMin;
    transport.service = best.seat.crew.vehicleType === "ambulance" ? "AMB" : transport.service;
    best.seat.time = best.leg.endMin + irand(rng, 2, 6);
    best.seat.locId = transport.dropoffId;
    best.seat.legs.push({ id: transport.id, start: best.leg.departMin, end: best.leg.endMin });
    return true;
  };

  while (transports.length < missions) {
    const room = missions - transports.length;
    const pattern = room < 2 ? pick(rng, ONE_WAY) : weighted(rng, WEIGHTS);
    const built = buildPattern({
      pattern,
      rng,
      token,
      rules,
      homes,
      dialyse,
      kine,
      radio,
      ortho,
      consult,
      chu,
      nextPatient,
      nextDossier,
      index: transports.length,
      missions,
    });
    for (const transport of built) {
      if (transports.length >= missions) break;
      transports.push(transport);
    }
  }

  const ordered = transports
    .map((transport, index) => ({ transport, index }))
    .sort((a, b) => {
      const left = a.transport.appointmentMin ?? a.transport.windowStart;
      const right = b.transport.appointmentMin ?? b.transport.windowStart;
      return left - right || a.index - b.index;
    });
  for (const { transport } of ordered) {
    const prefer = transport.seriesId ? seriesCrew.get(transport.seriesId) : undefined;
    if (place(transport, prefer) && transport.seriesId && transport.kind.includes("aller")) {
      seriesCrew.set(transport.seriesId, transport.crewId!);
    }
  }

  if (kinds.includes("repas")) applyMeal(crews, seats, blocks, constraints, rules, transports);
  if (kinds.includes("panne")) applyBreakdown(rng, crews, seats, blocks, constraints, transports);
  if (kinds.includes("annulation")) applyCancel(rng, transports, patients, constraints);
  if (kinds.includes("urgence"))
    applyEmergency(rng, transports, constraints, nextPatient, nextDossier, homes, chu, token);
  fillMeals(crews, transports, blocks, locMap, rules);

  const dayNote: DayNote = { seedLabel, missions, intensity: input.intensity, constraints };
  const active = transports.filter((transport) => !transport.cancelled);
  const naive = naiveBaseline({ crews, transports: active, blocks, locMap, rules });
  const stats: Stats = {
    moves: 0,
    optimizerUsed: false,
    optimizerApplied: false,
    callsHandled: 0,
    callsMissed: 0,
    lomacoSends: 0,
    baselineEmptyKm: naive.metrics.emptyKm,
    baselinePlaced: naive.metrics.placed,
    baselineTotal: naive.metrics.total,
    baselineFill: naive.metrics.fillRate,
    baselineLate: naive.metrics.lateCount,
    baselineScore: naive.metrics.planScore,
  };
  const tomorrow = buildTomorrow(transports, patients, locations);
  const calls: Call[] = [];

  return {
    seed,
    density: missions >= 60 ? "chargee" : "normale",
    locations,
    patients,
    crews,
    transports,
    blocks,
    calls,
    lomaco: [
      {
        id: "lomaco-aleatoire",
        atMin: DAY_START,
        message: `Journée aléatoire ${seedLabel} — environnement de démonstration.`,
        ok: true,
      },
    ],
    tomorrowItems: tomorrow.items,
    tomorrowTransports: tomorrow.transports,
    stats,
    dayNote,
  };
}

export function constraintSummary(note: DayNote, courseCount: number): string {
  const labels = note.constraints.map((item) => item.label).join(", ");
  return `Journée ${note.seedLabel} · ${courseCount} courses · ${labels}.`;
}

function drawKinds(rng: () => number, intensity: ConstraintIntensity): DayConstraintKind[] {
  const count = INTENSITY_COUNT[intensity];
  const row = pick(rng, ROW_KINDS);
  const rest = shuffle(rng, OTHER_KINDS).slice(0, count - 1);
  return [row, ...rest];
}

function applyGarage(
  rng: () => number,
  crew: Crew | undefined,
  blocks: TimeBlock[],
  constraints: DayConstraint[],
): void {
  if (!crew) return;
  const full = rng() < 0.55;
  let start = crew.shiftStart;
  let end = crew.shiftEnd;
  if (!full) {
    if (rng() < 0.5) {
      end = snap5(Math.min(crew.shiftEnd - 120, crew.shiftStart + irand(rng, 150, 220)));
    } else {
      start = snap5(Math.max(crew.shiftStart + 120, crew.shiftEnd - irand(rng, 150, 220)));
    }
    if (end - start < 90) {
      start = crew.shiftStart;
      end = crew.shiftEnd;
    }
  }
  blocks.push({
    id: `garage-${crew.id}`,
    crewId: crew.id,
    startMin: start,
    endMin: end,
    kind: "absence",
    label: "Garage",
  });
  constraints.push({
    id: "contrainte-garage",
    kind: "garage",
    label: "Garage",
    detail: `${crew.code} au garage de ${formatMin(start)} à ${formatMin(end)}.`,
    crewId: crew.id,
  });
}

function applyAbsence(
  rng: () => number,
  crew: Crew | undefined,
  blocks: TimeBlock[],
  constraints: DayConstraint[],
): void {
  if (!crew) return;
  const previous = crew.mate || crew.driver;
  const incomplete = crew.vehicleType === "ambulance" || rng() < 0.5;
  if (incomplete) {
    crew.mate = "";
    blocks.push({
      id: `absence-${crew.id}`,
      crewId: crew.id,
      startMin: crew.shiftStart,
      endMin: crew.shiftEnd,
      kind: "absence",
      label: "Absence",
    });
    constraints.push({
      id: "contrainte-absence",
      kind: "absence",
      label: "Absence",
      detail: `${previous} absent : ${crew.code} sans auxiliaire, indisponible ${formatMin(crew.shiftStart)}–${formatMin(crew.shiftEnd)}.`,
      crewId: crew.id,
    });
    return;
  }
  const neu = SPARE_MATES.find((name) => name !== crew.driver) ?? SPARE_MATES[0];
  crew.mate = neu;
  crew.tag = `Renfort ${neu.split(" ")[0]}`;
  constraints.push({
    id: "contrainte-absence",
    kind: "absence",
    label: crew.tag,
    detail: `${previous} absent, remplacé par ${neu} sur ${crew.code}.`,
    crewId: crew.id,
  });
}

function applyHours(rng: () => number, crew: Crew | undefined, constraints: DayConstraint[]): void {
  if (!crew) return;
  const cut = snap5(irand(rng, 90, 150));
  const minSpan = 6 * 60;
  if (rng() < 0.5) crew.shiftStart = snap5(Math.min(crew.shiftEnd - minSpan, crew.shiftStart + cut));
  else crew.shiftEnd = snap5(Math.max(crew.shiftStart + minSpan, crew.shiftEnd - cut));
  crew.tag = "Horaire réduit";
  constraints.push({
    id: "contrainte-horaire",
    kind: "horaire",
    label: "Horaire réduit",
    detail: `${crew.code} en service ${formatMin(crew.shiftStart)}–${formatMin(crew.shiftEnd)}.`,
    crewId: crew.id,
  });
}

function applyMeal(
  crews: readonly Crew[],
  seats: readonly Seat[],
  blocks: TimeBlock[],
  constraints: DayConstraint[],
  rules: Rules,
  transports: Transport[],
): void {
  const crew =
    crews.find(
      (item) =>
        !fullyBlocked(item, blocks) &&
        item.shiftEnd - Math.max(item.shiftStart, rules.mealFrom) >= rules.mealMin &&
        Math.min(item.shiftEnd, rules.mealTo) - item.shiftStart >= rules.mealMin,
    ) ?? crews.find((item) => !fullyBlocked(item, blocks));
  if (!crew || rules.mealMin <= 0) return;
  const seat = seats.find((item) => item.crew.id === crew.id);
  const windowStart = Math.max(crew.shiftStart, rules.mealFrom);
  const windowEnd = Math.min(crew.shiftEnd, rules.mealTo);
  if (windowEnd - windowStart < rules.mealMin - 0.5) return;
  const legs = (seat?.legs ?? []).slice().sort((a, b) => a.start - b.start);
  let cursor = windowStart;
  let start = windowStart;
  let found = false;
  for (const leg of legs) {
    const gapEnd = Math.min(leg.start, windowEnd);
    if (gapEnd - cursor >= rules.mealMin) {
      start = cursor;
      found = true;
      break;
    }
    cursor = Math.max(cursor, leg.end);
  }
  if (!found && windowEnd - cursor >= rules.mealMin) {
    start = cursor;
    found = true;
  }
  if (!found) start = windowStart;
  start = snap5(clamp(start, windowStart, windowEnd - rules.mealMin));
  if (start < windowStart) start = windowStart;
  if (start + rules.mealMin > windowEnd + 0.5) start = windowEnd - rules.mealMin;
  const end = start + rules.mealMin;
  if (seat) {
    for (const leg of seat.legs.slice()) {
      if (leg.start < end - 0.05 && leg.end > start + 0.05) release(transports, seats, leg.id);
    }
  }
  blocks.push({
    id: `repas-impose-${crew.id}`,
    crewId: crew.id,
    startMin: start,
    endMin: end,
    kind: "repas",
    label: "Repas imposé",
  });
  constraints.push({
    id: "contrainte-repas",
    kind: "repas",
    label: "Repas imposé",
    detail: `Pause repas imposée à ${crew.code}, ${formatMin(start)}–${formatMin(end)}.`,
    crewId: crew.id,
  });
}

function applyBreakdown(
  rng: () => number,
  crews: readonly Crew[],
  seats: readonly Seat[],
  blocks: TimeBlock[],
  constraints: DayConstraint[],
  transports: Transport[],
): void {
  const open = crews.filter((crew) => crew.shiftEnd - crew.shiftStart >= 90 && !fullyBlocked(crew, blocks));
  const quiet = open.filter((crew) => !blocks.some((block) => block.crewId === crew.id && block.kind === "repas"));
  const candidates = quiet.length ? quiet : open;
  const crew = candidates.length ? pick(rng, candidates) : undefined;
  if (!crew) return;
  const seat = seats.find((item) => item.crew.id === crew.id);
  const span = 40;
  const mid = seat?.legs.slice().sort((a, b) => a.start - b.start)[0];
  let start = snap5(mid ? Math.min(crew.shiftEnd - span, mid.end) : crew.shiftStart + 90);
  if (start < crew.shiftStart) start = snap5(crew.shiftStart);
  if (start + span > crew.shiftEnd) start = snap5(crew.shiftEnd - span);
  if (start < crew.shiftStart) return;
  const end = start + span;
  if (seat) {
    for (const leg of seat.legs.slice()) {
      if (leg.start < end - 0.05 && leg.end > start + 0.05) release(transports, seats, leg.id);
    }
  }
  blocks.push({
    id: `panne-${crew.id}`,
    crewId: crew.id,
    startMin: start,
    endMin: end,
    kind: "panne",
    label: "Panne",
  });
  constraints.push({
    id: "contrainte-panne",
    kind: "panne",
    label: "Panne",
    detail: `Panne de ${crew.code}, ${formatMin(start)}–${formatMin(end)}.`,
    crewId: crew.id,
  });
}

function applyCancel(
  rng: () => number,
  transports: Transport[],
  patients: readonly Patient[],
  constraints: DayConstraint[],
): void {
  const pool = transports.filter((transport) => !transport.cancelled && !transport.kind.includes("retour"));
  const transport = pool.length ? pick(rng, pool) : transports.find((item) => !item.cancelled);
  if (!transport) return;
  const patient = patients.find((item) => item.id === transport.patientId);
  transport.cancelled = true;
  transport.crewId = undefined;
  transport.departMin = undefined;
  constraints.push({
    id: "contrainte-annulation",
    kind: "annulation",
    label: "Annulation",
    detail: `Annulation de dernière minute : ${patient ? personName(patient) : "patient"} · ${transport.dossier}.`,
    crewId: undefined,
  });
}

function applyEmergency(
  rng: () => number,
  transports: Transport[],
  constraints: DayConstraint[],
  nextPatient: (addressId: string, posture: Posture, note?: string) => Patient,
  nextDossier: () => string,
  homes: readonly Location[],
  chu: readonly Location[],
  token: string,
): void {
  const home = pick(rng, homes);
  const drop = chu.length ? pick(rng, chu) : homes[0]!;
  const posture: Posture = rng() < 0.7 ? "allonge" : "assis";
  const patient = nextPatient(home.id, posture, "Urgence différée");
  const appointment = snap5(irand(rng, 9 * 60, 16 * 60));
  const tolerance = 10;
  transports.push({
    id: `urg-${token}-${transports.length + 1}`,
    dossier: nextDossier(),
    patientId: patient.id,
    pickupId: home.id,
    dropoffId: drop.id,
    windowStart: appointment - tolerance,
    windowEnd: appointment + tolerance,
    appointmentMin: appointment,
    toleranceMin: tolerance,
    posture,
    serviceMin: posture === "allonge" ? 16 : 10,
    kind: "simple",
    priority: "urgent",
    cancelled: false,
    motif: "CONS",
    service: posture === "allonge" ? "AMB" : "VSL",
    note: "Urgence ajoutée en journée",
  });
  constraints.push({
    id: "contrainte-urgence",
    kind: "urgence",
    label: "Urgence",
    detail: `Urgence ajoutée : ${personName(patient)}, ${posture === "allonge" ? "allongé" : "assis"}, à placer.`,
  });
}

function fillMeals(
  crews: readonly Crew[],
  transports: readonly Transport[],
  blocks: TimeBlock[],
  locMap: Map<string, Location>,
  rules: Rules,
): void {
  for (const crew of crews) {
    if (fullyBlocked(crew, blocks)) continue;
    if (blocks.some((block) => block.crewId === crew.id && block.kind === "repas")) continue;
    const schedule = scheduleCrew(
      crew,
      transports.filter((transport) => transport.crewId === crew.id),
      blocks,
      locMap,
      "anchored",
      undefined,
      rules,
    );
    const meal = pickMealSlot(schedule, crew, rules);
    if (!meal) continue;
    const hits = blocks.some(
      (block) =>
        block.crewId === crew.id &&
        block.kind !== "repas" &&
        meal.startMin < block.endMin - 0.05 &&
        meal.endMin > block.startMin + 0.05,
    );
    if (hits) continue;
    blocks.push(meal);
  }
}

function fullyBlocked(crew: Crew, blocks: readonly TimeBlock[]): boolean {
  return blocks.some(
    (block) =>
      block.crewId === crew.id &&
      (block.kind === "absence" || block.kind === "panne") &&
      block.startMin <= crew.shiftStart + 1 &&
      block.endMin >= crew.shiftEnd - 1,
  );
}

function release(transports: Transport[], seats: readonly Seat[], id: string): void {
  const transport = transports.find((item) => item.id === id);
  if (!transport) return;
  for (const seat of seats) seat.legs = seat.legs.filter((leg) => leg.id !== id);
  transport.crewId = undefined;
  transport.departMin = undefined;
}

function fit(
  seat: Seat,
  transport: Transport,
  blocks: readonly TimeBlock[],
  locMap: Map<string, Location>,
  rules: Rules,
): Leg | null {
  const crew = seat.crew;
  if (transport.posture === "allonge" && crew.vehicleType !== "ambulance") return null;
  if (crew.vehicleType === "ambulance" && (!crew.dea || crew.mate.trim() === "")) return null;
  const appointment = transport.appointmentMin ?? transport.windowStart;
  const tolerance = transport.toleranceMin ?? rules.toleranceMin;
  const inbound = travelLoc(seat.locId, transport.pickupId, locMap);
  const latest = appointment + tolerance - inbound.min;
  if (seat.time > latest + 0.5) return null;
  let depart = snap5(Math.max(seat.time, appointment - inbound.min));
  if (depart + 0.2 < seat.time) depart = snap5(seat.time + 4);
  if (depart > latest + 0.5) return null;
  const leg = simulateLeg(transport, depart, seat.locId, crew, locMap, rules);
  if (leg.departMin < crew.shiftStart - 0.2 || leg.endMin > crew.shiftEnd + 0.5) return null;
  if (Math.abs(leg.arrivePickup - appointment) > tolerance + 0.5) return null;
  if (legHitsBlock(blocks, crew.id, leg.departMin, leg.endMin)) return null;
  if (seat.legs.some((item) => leg.departMin < item.end - 0.4 && leg.endMin > item.start + 0.4)) return null;
  return leg;
}

function buildPattern(input: {
  pattern: Pattern;
  rng: () => number;
  token: string;
  rules: Rules;
  homes: Location[];
  dialyse: Location[];
  kine: Location[];
  radio: Location[];
  ortho: Location[];
  consult: Location[];
  chu: Location[];
  nextPatient: (addressId: string, posture: Posture, note?: string) => Patient;
  nextDossier: () => string;
  index: number;
  missions: number;
}): Transport[] {
  const { pattern, rng } = input;
  const home = pick(rng, input.homes);
  const site = siteFor(pattern, rng, input, home);
  const round = pattern !== "sortie" && pattern !== "urgence";
  const posture = postureFor(pattern, rng);
  const note = noteFor(pattern);
  const patient = input.nextPatient(site.home.id, posture, note);
  const tolerance = pattern === "urgence" ? 10 : pick(rng, [15, 20, 20, 30]);
  const appointment = appointmentFor(pattern, rng, input.index, input.missions);
  const seriesId = round ? `serie-${input.token}-${input.index + 1}` : undefined;
  const aller = job({
    token: input.token,
    index: input.index,
    dossier: input.nextDossier(),
    patient,
    pickup: site.pickup,
    dropoff: site.dropoff,
    appointment,
    tolerance,
    posture,
    kind: kindFor(pattern, "aller", round),
    motif: motifFor(pattern),
    seriesId,
    note,
    priority: pattern === "urgence" ? "urgent" : "normal",
  });
  if (!round) return [aller];
  const backAt = snap5(clamp(appointment + site.wait, appointment + 15, DAY_END - 40));
  const retour = job({
    token: input.token,
    index: input.index + 1,
    dossier: input.nextDossier(),
    patient,
    pickup: site.dropoff,
    dropoff: site.pickup,
    appointment: backAt,
    tolerance,
    posture,
    kind: kindFor(pattern, "retour", true),
    motif: motifFor(pattern),
    seriesId,
    note: pattern === "dialyse" ? "Retour de dialyse" : `Retour après ${site.wait} min`,
    priority: "normal",
  });
  return [aller, retour];
}

function siteFor(
  pattern: Pattern,
  rng: () => number,
  input: {
    dialyse: Location[];
    kine: Location[];
    radio: Location[];
    ortho: Location[];
    consult: Location[];
    chu: Location[];
  },
  home: Location,
): { pickup: Location; dropoff: Location; home: Location; wait: number } {
  if (pattern === "dialyse") return { pickup: home, dropoff: pick(rng, input.dialyse), home, wait: 4 * 60 };
  if (pattern === "kine") return { pickup: home, dropoff: pick(rng, input.kine), home, wait: 45 };
  if (pattern === "radio") return { pickup: home, dropoff: pick(rng, input.radio), home, wait: 25 };
  if (pattern === "ortho") return { pickup: home, dropoff: pick(rng, input.ortho), home, wait: 20 };
  if (pattern === "sortie") {
    const hospital = pick(rng, input.chu);
    return { pickup: hospital, dropoff: home, home, wait: 0 };
  }
  if (pattern === "urgence") return { pickup: home, dropoff: pick(rng, input.chu), home, wait: 0 };
  return { pickup: home, dropoff: pick(rng, input.consult), home, wait: 30 };
}

function postureFor(pattern: Pattern, rng: () => number): Posture {
  if (pattern === "urgence") return rng() < 0.7 ? "allonge" : "assis";
  if (pattern === "sortie") return rng() < 0.5 ? "allonge" : rng() < 0.65 ? "fauteuil" : "assis";
  if (pattern === "dialyse") return rng() < 0.22 ? "allonge" : "assis";
  if (rng() < 0.08) return "fauteuil";
  return "assis";
}

function noteFor(pattern: Pattern): string {
  if (pattern === "dialyse") return "Dialyse 4 h";
  if (pattern === "kine") return "Kiné 45 min";
  if (pattern === "consultation") return "Consultation 30 min";
  if (pattern === "sortie") return "Sortie d'hospitalisation";
  if (pattern === "urgence") return "Urgence différée";
  if (pattern === "radio") return "Imagerie";
  return "Orthopédie";
}

function motifFor(pattern: Pattern): NonNullable<Transport["motif"]> {
  if (pattern === "dialyse") return "DIAL";
  if (pattern === "kine") return "KINE";
  if (pattern === "radio") return "RADI";
  if (pattern === "ortho") return "ORTHO";
  return "CONS";
}

function kindFor(pattern: Pattern, leg: "aller" | "retour", round: boolean): TransportKind {
  if (!round) return "simple";
  if (pattern === "dialyse") return leg === "aller" ? "dialyse_aller" : "dialyse_retour";
  return leg;
}

function appointmentFor(pattern: Pattern, rng: () => number, index: number, missions: number): number {
  if (pattern === "dialyse") return snap5(irand(rng, 7 * 60, 10 * 60 + 30));
  if (pattern === "urgence") return snap5(irand(rng, 8 * 60, 16 * 60));
  const base = 7 * 60 + Math.floor((index / Math.max(1, missions)) * (10 * 60));
  return snap5(clamp(base + irand(rng, -15, 20), 7 * 60, 17 * 60));
}

function job(input: {
  token: string;
  index: number;
  dossier: string;
  patient: Patient;
  pickup: Location;
  dropoff: Location;
  appointment: number;
  tolerance: number;
  posture: Posture;
  kind: TransportKind;
  motif: NonNullable<Transport["motif"]>;
  seriesId?: string;
  note?: string;
  priority: Transport["priority"];
}): Transport {
  return {
    id: `t-${input.token}-${input.index + 1}`,
    dossier: input.dossier,
    patientId: input.patient.id,
    pickupId: input.pickup.id,
    dropoffId: input.dropoff.id,
    windowStart: input.appointment - input.tolerance,
    windowEnd: input.appointment + input.tolerance,
    appointmentMin: input.appointment,
    toleranceMin: input.tolerance,
    posture: input.posture,
    serviceMin: input.posture === "allonge" ? 16 : 10,
    kind: input.kind,
    seriesId: input.seriesId,
    priority: input.priority,
    cancelled: false,
    motif: input.motif,
    service: input.posture === "allonge" ? "AMB" : "VSL",
    note: input.note,
  };
}

function buildCrews(amb: number, vsl: number, amplitudeMin: number): Crew[] {
  const crews: Crew[] = [];
  const add = (type: VehicleType, count: number) => {
    for (let index = 0; index < count; index++) {
      const pair = CREW_PAIRS[crews.length % CREW_PAIRS.length]!;
      const park = 101 + crews.length;
      const n = index + 1;
      crews.push({
        id: `${type}-${n}`,
        code: type === "ambulance" ? `AMB-${n}` : `VSL-${n}`,
        driver: pair[0],
        mate: pair[1],
        vehicleType: type,
        vehicleCode: String(park),
        plate: `HC ${park} KL`,
        vehicleName:
          type === "ambulance"
            ? AMBULANCE_MODELS[index % AMBULANCE_MODELS.length]!
            : VSL_MODELS[index % VSL_MODELS.length]!,
        color: CREW_COLORS[crews.length % CREW_COLORS.length]!,
        baseId: DEPOT_ID,
        ...shiftForIndex(crews.length, amplitudeMin),
        delayUntil: 0,
        dea: type === "ambulance",
      });
    }
  };
  add("ambulance", amb);
  add("vsl", vsl);
  return crews;
}

function buildTomorrow(transports: readonly Transport[], patients: readonly Patient[], locations: readonly Location[]) {
  const patientOf = new Map(patients.map((patient) => [patient.id, patient]));
  const locOf = new Map(locations.map((location) => [location.id, location]));
  const chosen = transports.filter((transport) => !transport.cancelled).slice(0, 8);
  const items: TomorrowItem[] = [];
  const tomorrowTransports: Transport[] = [];
  chosen.forEach((transport, index) => {
    const copy: Transport = {
      ...transport,
      id: `tmr-alt-${index + 1}`,
      dossier: `DOS-T${52000 + index}`,
      crewId: undefined,
      departMin: undefined,
      cancelled: false,
      pinned: false,
    };
    tomorrowTransports.push(copy);
    const patient = patientOf.get(transport.patientId);
    items.push({
      id: `item-${copy.id}`,
      transportId: copy.id,
      patientName: patient ? personName(patient) : "Patient",
      from: locOf.get(transport.pickupId)?.short ?? "Départ",
      to: locOf.get(transport.dropoffId)?.short ?? "Arrivée",
      timeLabel: `${formatMin(transport.appointmentMin ?? transport.windowStart)}`,
      posture: transport.posture,
      vehicle: transport.posture === "allonge" ? "ambulance" : "vsl",
      include: true,
    });
  });
  return { items, transports: tomorrowTransports };
}

function uniqueNames(rng: () => number, count: number): { firstName: string; lastName: string }[] {
  const used = new Set<string>();
  const names: { firstName: string; lastName: string }[] = [];
  let guard = 0;
  while (names.length < count && guard++ < count * 40) {
    const firstName = pick(rng, FIRST_NAMES);
    const lastName = pick(rng, LAST_NAMES);
    const key = `${firstName}|${lastName}`;
    if (used.has(key)) continue;
    used.add(key);
    names.push({ firstName, lastName });
  }
  return names;
}

function phoneOf(rng: () => number): string {
  const part = () => String(irand(rng, 0, 99)).padStart(2, "0");
  return `02 35 ${part()} ${part()} ${part()}`;
}

function weighted<T>(rng: () => number, rows: readonly (readonly [T, number])[]): T {
  const total = rows.reduce((sum, row) => sum + row[1], 0);
  let cursor = rng() * total;
  for (const [item, weight] of rows) {
    cursor -= weight;
    if (cursor <= 0) return item;
  }
  return rows[rows.length - 1]![0];
}
