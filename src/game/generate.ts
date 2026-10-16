import {
  AMBULANCE_MODELS,
  CREW_COLORS,
  CREW_PAIRS,
  DEPOT_ID,
  FIRST_NAMES,
  LAST_NAMES,
  LOCATIONS,
  NOTES,
  VSL_MODELS,
} from "../data/world";
import { roadKm } from "../lib/geo";
import { irand, mulberry32, pick } from "../lib/rng";
import { clamp } from "../lib/utils";
import { personName } from "../lib/format";
import { naiveBaseline } from "./baseline";
import { indexLocations, simulateLeg, travelLoc } from "./schedule";
import { shiftForIndex } from "./shifts";
import type {
  Call,
  Crew,
  Density,
  Location,
  Patient,
  Posture,
  Stats,
  TimeBlock,
  TomorrowItem,
  Transport,
  TransportKind,
  VehicleType,
} from "./types";
import { DAY_END, DAY_START, DEFAULT_RULES } from "./types";

export interface GeneratedFields {
  seed: number;
  density: Density;
  locations: Location[];
  patients: Patient[];
  crews: Crew[];
  transports: Transport[];
  blocks: TimeBlock[];
  calls: Call[];
  lomaco: { id: string; atMin: number; message: string; ok: boolean }[];
  tomorrowItems: TomorrowItem[];
  tomorrowTransports: Transport[];
  stats: Stats;
}

export function quotas(density: Density): { amb: number; vsl: number } {
  return density === "chargee" ? { amb: 14, vsl: 22 } : { amb: 9, vsl: 13 };
}

export function generateDay(options: {
  amb: number;
  vsl: number;
  density: Density;
  seed: number;
}): GeneratedFields {
  const rng = mulberry32(options.seed);
  const locations = LOCATIONS;
  const locMap = indexLocations(locations);
  const homes = locations.filter((location) => location.kind === "domicile");
  const farHomes = homes.filter((location) =>
    ["dom-barentin", "dom-elbeuf", "dom-caudebec"].includes(location.id),
  );
  const sites = locations.filter((location) =>
    ["chu", "clinique", "dialyse"].includes(location.kind),
  );
  const dialyse = locations.filter((location) => location.kind === "dialyse");
  const depot = locMap.get(DEPOT_ID)!;
  const quota = quotas(options.density);
  const crews = makeCrews(options.amb, options.vsl);
  const patients: Patient[] = [];
  const names = uniqueNames(rng, 220);
  let nameCursor = 0;
  let serial = 0;

  const nextPatient = (addressId: string, note?: string): Patient => {
    const name = names[nameCursor++] ?? { firstName: "Alex", lastName: "Martin" };
    const patient: Patient = {
      id: `pat-${options.seed.toString(36)}-${patients.length + 1}`,
      firstName: name.firstName,
      lastName: name.lastName,
      phone: phoneOf(rng),
      ...birthOf(rng),
      addressId,
      note,
    };
    patients.push(patient);
    return patient;
  };

  const nextDossier = () => {
    serial += 1;
    return `DOS-${49000 + serial}`;
  };

  const transports: Transport[] = [];

  const pushJob = (
    crew: Crew,
    cursor: number,
    fromId: string,
    draft: Omit<Transport, "crewId" | "departMin" | "cancelled">,
  ): { transport: Transport; cursor: number; locId: string; dropoffArrive: number } | null => {
    const wide: Transport = {
      ...draft,
      cancelled: false,
      windowStart: DAY_START,
      windowEnd: DAY_END,
    };
    const inbound = travelLoc(fromId, draft.pickupId, locMap);
    const toleranceMin = draft.toleranceMin ?? 20;
    let departBase = cursor;
    if (draft.appointmentMin != null) {
      const ideal = draft.appointmentMin - inbound.min;
      const latest = draft.appointmentMin + toleranceMin - inbound.min;
      if (cursor > latest + 0.5) return null;
      departBase = Math.max(cursor, ideal);
    }
    const probe = simulateLeg(wide, departBase, fromId, crew, locMap);
    if (probe.endMin > crew.shiftEnd - 4) return null;
    const appointmentMin = draft.appointmentMin ?? Math.round(probe.arrivePickup);
    if (draft.appointmentMin != null && Math.abs(probe.arrivePickup - appointmentMin) > toleranceMin + 0.5) return null;
    const windowStart = clamp(appointmentMin - toleranceMin, DAY_START, DAY_END - 50);
    const windowEnd = clamp(appointmentMin + toleranceMin, windowStart + 20, DAY_END - 4);
    const dropoff = locMap.get(draft.dropoffId);
    const pickupLoc = locMap.get(draft.pickupId);
    const motif = draft.motif ?? motifFor(rng, pickupLoc, dropoff, draft.kind);
    const service = draft.service ?? (crew.vehicleType === "ambulance" ? "AMB" : rng() < 0.4 ? "TAP" : "VSL");
    const transport: Transport = {
      ...draft,
      motif,
      service,
      cancelled: false,
      windowStart,
      windowEnd,
      appointmentMin,
      toleranceMin,
    };
    const leg = simulateLeg(transport, departBase, fromId, crew, locMap);
    if (leg.endMin > crew.shiftEnd) return null;
    if (Math.abs(leg.arrivePickup - appointmentMin) > toleranceMin + 0.5) return null;
    transport.crewId = crew.id;
    transport.departMin = leg.departMin;
    transports.push(transport);
    const loadedEnd = leg.segments.find((segment) => segment.kind === "loaded")?.end ?? leg.arrivePickup;
    return {
      transport,
      cursor: leg.endMin + irand(rng, 2, 6),
      locId: transport.dropoffId,
      dropoffArrive: Math.round(loadedEnd),
    };
  };

  crews.forEach((crew, crewIndex) => {
    const target = crew.vehicleType === "ambulance" ? quota.amb : quota.vsl;
    let cursor = crew.shiftStart + irand(rng, 4, 14);
    let locId = crew.baseId;
    let forcedLong = false;
    let mealTaken = false;
    const pending: {
      patient: Patient;
      homeId: string;
      centerId: string;
      seriesId: string;
      posture: Posture;
      after: number;
      centerArrive: number;
    }[] = [];

    if (dialyse.length && crewIndex % 2 === 0) {
      const home = pickNear(rng, homes, depot);
      const center = pick(rng, dialyse);
      const patient = nextPatient(home.id, "Dialyse 4 h");
      const seriesId = `serie-${crew.id}-${patient.id}`;
      const posture: Posture =
        crew.vehicleType === "ambulance" && rng() < 0.28 ? "allonge" : "assis";
      const placed = pushJob(crew, cursor, locId, {
        id: `t-${options.seed.toString(36)}-${transports.length + 1}`,
        dossier: nextDossier(),
        patientId: patient.id,
        pickupId: home.id,
        dropoffId: center.id,
        windowStart: DAY_START,
        windowEnd: DAY_END,
        posture,
        serviceMin: posture === "allonge" ? irand(rng, 14, 18) : irand(rng, 8, 11),
        kind: "dialyse_aller",
        seriesId,
        priority: "normal",
        note: "PRENDRE PROCHAIN RDV",
      });
      if (placed) {
        cursor = placed.cursor;
        locId = placed.locId;
        pending.push({
          patient,
          homeId: home.id,
          centerId: center.id,
          seriesId,
          posture,
          centerArrive: placed.dropoffArrive,
          after: placed.dropoffArrive + DEFAULT_RULES.sessionMin,
        });
      }
    }

    let guard = 0;
    while (transports.filter((item) => item.crewId === crew.id).length < target && guard++ < target + 14) {
      const due = pending[0];
      const holdMeal = Boolean(due && due.after <= DEFAULT_RULES.mealTo + DEFAULT_RULES.toleranceMin);
      if (!mealTaken && !holdMeal && cursor + 25 >= DEFAULT_RULES.mealFrom && cursor < DEFAULT_RULES.mealTo) {
        const mealStart = Math.max(cursor, DEFAULT_RULES.mealFrom);
        if (mealStart + DEFAULT_RULES.mealMin <= DEFAULT_RULES.mealTo + 0.5) {
          cursor = mealStart + DEFAULT_RULES.mealMin + DEFAULT_RULES.toleranceMin;
          mealTaken = true;
        }
      }
      if (due && cursor >= due.after) {
        pending.shift();
        const placed = pushJob(crew, cursor, locId, {
          id: `t-${options.seed.toString(36)}-${transports.length + 1}`,
          dossier: nextDossier(),
          patientId: due.patient.id,
          pickupId: due.centerId,
          dropoffId: due.homeId,
          windowStart: DAY_START,
          windowEnd: DAY_END,
          appointmentMin: due.after,
          toleranceMin: 20,
          centerArriveMin: due.centerArrive,
          posture: due.posture,
          serviceMin: due.posture === "allonge" ? irand(rng, 12, 16) : irand(rng, 7, 10),
          kind: "dialyse_retour",
          seriesId: due.seriesId,
          priority: "normal",
          note: "Retour de dialyse",
        });
        if (placed) {
          cursor = placed.cursor;
          locId = placed.locId;
        } else {
          keepReturn(due);
        }
        continue;
      }

      const here = locMap.get(locId) ?? depot;
      const leg = chooseLeg(rng, here, crew, homes, farHomes, sites, !forcedLong && crewIndex % 3 === 1);
      if (!leg) continue;
      if (leg.far) forcedLong = true;
      const { pickup, dropoff, kind } = leg;
      if (pickup.id === dropoff.id) continue;
      const rehab = [pickup.id, dropoff.id].some((id) => id.startsWith("kine") || id.startsWith("radio") || id.startsWith("ortho"));
      const posture: Posture =
        crew.vehicleType === "ambulance" && !rehab && rng() < 0.45 ? "allonge" : "assis";
      const patient = nextPatient(
        pickup.kind === "domicile" ? pickup.id : dropoff.kind === "domicile" ? dropoff.id : homes[0]!.id,
        rng() < 0.28 ? pick(rng, NOTES) : undefined,
      );
      const placed = pushJob(crew, cursor, locId, {
        id: `t-${options.seed.toString(36)}-${transports.length + 1}`,
        dossier: nextDossier(),
        patientId: patient.id,
        pickupId: pickup.id,
        dropoffId: dropoff.id,
        windowStart: DAY_START,
        windowEnd: DAY_END,
        posture,
        serviceMin: posture === "allonge" ? irand(rng, 13, 18) : irand(rng, 7, 11),
        kind,
        priority: "normal",
        note: patient.note,
      });
      if (!placed) continue;
      cursor = placed.cursor;
      locId = placed.locId;
    }

    for (const due of pending) {
      const placed = pushJob(crew, Math.max(cursor, due.after - 40), locId, {
        id: `t-${options.seed.toString(36)}-${transports.length + 1}`,
        dossier: nextDossier(),
        patientId: due.patient.id,
        pickupId: due.centerId,
        dropoffId: due.homeId,
        windowStart: DAY_START,
        windowEnd: DAY_END,
        appointmentMin: due.after,
        toleranceMin: 20,
        centerArriveMin: due.centerArrive,
        posture: due.posture,
        serviceMin: 10,
        kind: "dialyse_retour",
        seriesId: due.seriesId,
        priority: "normal",
        note: "Retour de dialyse",
      });
      if (placed) {
        cursor = placed.cursor;
        locId = placed.locId;
      } else {
        keepReturn(due);
      }
    }
  });

  function keepReturn(due: {
    patient: Patient;
    homeId: string;
    centerId: string;
    seriesId: string;
    posture: Posture;
    after: number;
    centerArrive: number;
  }): void {
    if (transports.some((transport) => transport.seriesId === due.seriesId && transport.kind === "dialyse_retour")) return;
    const toleranceMin = 20;
    transports.push({
      id: `t-${options.seed.toString(36)}-${transports.length + 1}`,
      dossier: nextDossier(),
      patientId: due.patient.id,
      pickupId: due.centerId,
      dropoffId: due.homeId,
      windowStart: due.after - toleranceMin,
      windowEnd: due.after + toleranceMin,
      appointmentMin: due.after,
      toleranceMin,
      centerArriveMin: due.centerArrive,
      posture: due.posture,
      serviceMin: 10,
      kind: "dialyse_retour",
      seriesId: due.seriesId,
      priority: "normal",
      cancelled: false,
      motif: "DIAL",
      note: "Retour de dialyse",
    });
  }

  const calls = buildCalls(transports, patients, crews, locations, rng, nextPatient, nextDossier);
  const tomorrow = buildTomorrow(transports, patients, locations);

  const naive = naiveBaseline({ crews, transports, blocks: [], locMap, rules: DEFAULT_RULES });

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

  return {
    seed: options.seed,
    density: options.density,
    locations,
    patients,
    crews,
    transports,
    blocks: [],
    calls,
    lomaco: [
      {
        id: "lomaco-open",
        atMin: DAY_START,
        message: "Connexion Lomaco établie — environnement de démonstration.",
        ok: true,
      },
    ],
    tomorrowItems: tomorrow.items,
    tomorrowTransports: tomorrow.transports,
    stats,
  };
}

function makeCrews(amb: number, vsl: number): Crew[] {
  const crews: Crew[] = [];
  const add = (type: VehicleType, count: number) => {
    for (let index = 0; index < count; index++) {
      const pair = CREW_PAIRS[(crews.length) % CREW_PAIRS.length]!;
      const n = index + 1;
      const park = 101 + crews.length;
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
        ...shiftForIndex(crews.length, DEFAULT_RULES.amplitudeMin),
        delayUntil: 0,
        dea: type === "ambulance",
      });
    }
  };
  add("ambulance", amb);
  add("vsl", vsl);
  return crews;
}

function buildCalls(
  transports: Transport[],
  patients: Patient[],
  crews: Crew[],
  locations: Location[],
  rng: () => number,
  nextPatient: (addressId: string, note?: string) => Patient,
  nextDossier: () => string,
): Call[] {
  const patientOf = new Map(patients.map((patient) => [patient.id, patient]));
  const locOf = new Map(locations.map((location) => [location.id, location]));
  const nameOf = (transport: Transport) => {
    const patient = patientOf.get(transport.patientId);
    return patient ? personName(patient) : "le patient";
  };
  const place = (id: string) => locOf.get(id)?.short ?? "adresse";
  const calls: Call[] = [];
  const used = new Set<string>();

  const take = (predicate: (transport: Transport) => boolean) => {
    const found = transports.find((transport) => !used.has(transport.id) && predicate(transport));
    if (found) used.add(found.id);
    return found;
  };

  const cancel = take(
    (transport) =>
      Boolean(transport.crewId) &&
      transport.windowStart >= 7 * 60 + 40 &&
      transport.windowStart <= 10 * 60 &&
      !transport.kind.startsWith("dialyse"),
  );
  if (cancel) {
    calls.push({
      id: "call-annulation-matin",
      triggerMin: 7 * 60 + 25,
      spawned: false,
      resolved: false,
      expired: false,
      kind: "annulation",
      title: "Annulation patient",
      caller: nameOf(cancel),
      phone: patientOf.get(cancel.patientId)?.phone ?? "02 35 00 00 00",
      body: `${nameOf(cancel)} ne sera pas prêt. La famille demande d'annuler le passage de ${place(cancel.pickupId)} vers ${place(cancel.dropoffId)}.`,
      transportId: cancel.id,
    });
  }

  calls.push(draftCall({
    id: "call-ajout-matin",
    triggerMin: 8 * 60 + 10,
    kind: "ajout",
    rng,
    locations,
    nextPatient,
    nextDossier,
    posture: "assis",
    urgent: false,
  }));

  const delayedCrew = crews[0];
  if (delayedCrew) {
    calls.push({
      id: "call-retard",
      triggerMin: 9 * 60 + 5,
      spawned: false,
      resolved: false,
      expired: false,
      kind: "retard",
      title: "Retard équipage",
      caller: delayedCrew.driver,
      phone: "06 18 44 20 13",
      body: `${delayedCrew.code} — ${delayedCrew.driver} : « Bouchon sur le pont Guillaume-le-Conquérant, on prend vingt minutes. »`,
      crewId: delayedCrew.id,
      deltaMin: 20,
    });
  }

  const move = take(
    (transport) => transport.windowStart >= 10 * 60 + 30 && transport.windowStart <= 15 * 60,
  );
  if (move) {
    const start = clamp(move.windowStart + 40, DAY_START, DAY_END - 50);
    const end = clamp(move.windowEnd + 40, start + 25, DAY_END - 8);
    calls.push({
      id: "call-deplacement",
      triggerMin: 10 * 60 + 15,
      spawned: false,
      resolved: false,
      expired: false,
      kind: "deplacement",
      title: "Déplacement d'horaire",
      caller: nameOf(move),
      phone: patientOf.get(move.patientId)?.phone ?? "02 35 14 22 18",
      body: `${nameOf(move)} demande de décaler le rendez-vous. Nouveau créneau proposé : ${fmt(start)} – ${fmt(end)}.`,
      transportId: move.id,
      newWindowStart: start,
      newWindowEnd: end,
    });
  }

  calls.push(draftCall({
    id: "call-urgent-midi",
    triggerMin: 11 * 60 + 20,
    kind: "urgent",
    rng,
    locations,
    nextPatient,
    nextDossier,
    posture: "allonge",
    urgent: true,
  }));

  const pauseCrew = crews[Math.min(1, crews.length - 1)];
  if (pauseCrew) {
    calls.push({
      id: "call-pause",
      triggerMin: 12 * 60 + 35,
      spawned: false,
      resolved: false,
      expired: false,
      kind: "pause",
      title: "Demande de pause",
      caller: pauseCrew.driver,
      phone: "06 22 90 18 44",
      body: `${pauseCrew.code} — ${pauseCrew.driver} demande 25 minutes pour la pause repas, après la course en cours.`,
      crewId: pauseCrew.id,
      breakMin: 25,
    });
  }

  calls.push(draftCall({
    id: "call-ajout-apres",
    triggerMin: 13 * 60 + 40,
    kind: "ajout",
    rng,
    locations,
    nextPatient,
    nextDossier,
    posture: "assis",
    urgent: false,
  }));

  const broken = crews[Math.min(2, crews.length - 1)];
  if (broken) {
    calls.push({
      id: "call-panne",
      triggerMin: 14 * 60 + 50,
      spawned: false,
      resolved: false,
      expired: false,
      kind: "panne",
      title: "Véhicule en panne",
      caller: broken.driver,
      phone: "06 45 10 77 02",
      body: `${broken.code} — ${broken.driver} : « Voyant moteur, on s'arrête. Il faut 40 minutes et reprendre les courses derrière. »`,
      crewId: broken.id,
      breakMin: 40,
    });
  }

  const moveLate = take((transport) => transport.windowStart >= 15 * 60 + 30);
  if (moveLate) {
    const start = clamp(moveLate.windowStart - 35, 15 * 60, DAY_END - 60);
    const end = clamp(start + 35, start + 20, DAY_END - 8);
    calls.push({
      id: "call-deplacement-soir",
      triggerMin: 16 * 60 + 5,
      spawned: false,
      resolved: false,
      expired: false,
      kind: "deplacement",
      title: "Patient en avance",
      caller: nameOf(moveLate),
      phone: patientOf.get(moveLate.patientId)?.phone ?? "02 35 70 19 40",
      body: `La consultation de ${nameOf(moveLate)} se termine plus tôt. Merci d'avancer le retour si un équipage est libre.`,
      transportId: moveLate.id,
      newWindowStart: start,
      newWindowEnd: end,
    });
  }

  calls.push(draftCall({
    id: "call-urgent-soir",
    triggerMin: 17 * 60 + 10,
    kind: "urgent",
    rng,
    locations,
    nextPatient,
    nextDossier,
    posture: rng() < 0.5 ? "allonge" : "assis",
    urgent: true,
  }));

  return calls.sort((a, b) => a.triggerMin - b.triggerMin);
}

function draftCall(input: {
  id: string;
  triggerMin: number;
  kind: "ajout" | "urgent";
  rng: () => number;
  locations: Location[];
  nextPatient: (addressId: string, note?: string) => Patient;
  nextDossier: () => string;
  posture: Posture;
  urgent: boolean;
}): Call {
  const homes = input.locations.filter((location) => location.kind === "domicile" && !location.id.includes("elbeuf") && !location.id.includes("barentin"));
  const chu = input.locations.find((location) => location.id === "chu-nicolle")!;
  const clinic = input.locations.find((location) => location.id === "mathilde")!;
  const home = pick(input.rng, homes);
  const drop = input.urgent ? chu : clinic;
  const patient = input.nextPatient(home.id, input.urgent ? "Malaise au domicile" : "Consultation ajoutée");
  const windowStart = input.triggerMin + (input.urgent ? 12 : 25);
  const windowEnd = input.triggerMin + (input.urgent ? 55 : 95);
  return {
    id: input.id,
    triggerMin: input.triggerMin,
    spawned: false,
    resolved: false,
    expired: false,
    kind: input.kind,
    title: input.urgent ? "Transport urgent" : "Nouvelle demande",
    caller: input.urgent ? `Famille ${patient.lastName}` : personName(patient),
    phone: patient.phone,
    body: input.urgent
      ? `Demande familiale : ${personName(patient)} doit être allongé, malaise au domicile. Orientation ${drop.short}, dès que possible.`
      : `${personName(patient)} doit être conduit de ${home.short} vers ${drop.short}. Créneau ${fmt(windowStart)} – ${fmt(windowEnd)}.`,
    draft: {
      patient,
      transport: {
        id: `t-live-${input.id}`,
        dossier: input.nextDossier(),
        patientId: patient.id,
        pickupId: home.id,
        dropoffId: drop.id,
        windowStart,
        windowEnd,
        posture: input.posture,
        serviceMin: input.posture === "allonge" ? 16 : 10,
        kind: "simple",
        priority: input.urgent ? "urgent" : "normal",
        note: input.urgent ? "Malaise au domicile" : "Ajout en journée",
      },
    },
  };
}

function buildTomorrow(transports: Transport[], patients: Patient[], locations: Location[]) {
  const patientOf = new Map(patients.map((patient) => [patient.id, patient]));
  const locOf = new Map(locations.map((location) => [location.id, location]));
  const recurring = transports.filter((transport) => transport.kind.startsWith("dialyse"));
  const filler = transports.filter(
    (transport) => transport.posture === "assis" && transport.kind !== "simple" && !transport.kind.startsWith("dialyse"),
  );
  const chosen = [...recurring, ...filler].slice(0, 14);
  const items: TomorrowItem[] = [];
  const tomorrowTransports: Transport[] = [];
  chosen.forEach((transport, index) => {
    const copy: Transport = {
      ...transport,
      id: `tmr-${index + 1}`,
      dossier: `DOS-T${51000 + index}`,
      crewId: undefined,
      departMin: undefined,
      cancelled: false,
      priority: "normal",
    };
    tomorrowTransports.push(copy);
    const patient = patientOf.get(transport.patientId);
    items.push({
      id: `item-${copy.id}`,
      transportId: copy.id,
      patientName: patient ? personName(patient) : "Patient",
      from: locOf.get(transport.pickupId)?.short ?? "Départ",
      to: locOf.get(transport.dropoffId)?.short ?? "Arrivée",
      timeLabel: `${fmt(transport.windowStart)} – ${fmt(transport.windowEnd)}`,
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
  while (names.length < count && guard++ < count * 30) {
    const firstName = pick(rng, FIRST_NAMES);
    const lastName = pick(rng, LAST_NAMES);
    const key = `${firstName}|${lastName}`;
    if (used.has(key)) continue;
    used.add(key);
    names.push({ firstName, lastName });
  }
  return names;
}

function motifFor(
  rng: () => number,
  pickup: Location | undefined,
  dropoff: Location | undefined,
  kind: TransportKind,
): NonNullable<Transport["motif"]> {
  if (kind.startsWith("dialyse") || pickup?.kind === "dialyse" || dropoff?.kind === "dialyse") return "DIAL";
  const place = dropoff?.kind === "domicile" ? pickup : dropoff;
  if (place?.id.startsWith("kine")) return "KINE";
  if (place?.id.startsWith("radio")) return "RADI";
  if (place?.id.startsWith("ortho")) return "ORTHO";
  if (place?.kind === "chu") return rng() < 0.72 ? "CONS" : "RADI";
  const roll = rng();
  if (roll < 0.55) return "CONS";
  if (roll < 0.8) return "ORTHO";
  return "KINE";
}

function chooseLeg(
  rng: () => number,
  here: Location,
  crew: Crew,
  homes: Location[],
  farHomes: Location[],
  sites: Location[],
  allowFar: boolean,
): { pickup: Location; dropoff: Location; kind: TransportKind; far: boolean } | null {
  const farIds = new Set(farHomes.map((home) => home.id));
  const localHomes = homes.filter((home) => !farIds.has(home.id));
  const kines = sites.filter((site) => site.id.startsWith("kine"));
  const images = sites.filter((site) => site.id.startsWith("radio") || site.id.startsWith("ortho"));
  const atCare = here.kind === "chu" || here.kind === "clinique" || here.kind === "dialyse";

  if (allowFar && farHomes.length && rng() < 0.7) {
    const home = pick(rng, farHomes);
    const site = pickBand(rng, sites, home, 8, 32) ?? pickNear(rng, sites, home);
    return { pickup: home, dropoff: site, kind: "aller", far: true };
  }

  if (atCare && rng() < 0.82) {
    const dropoff = pickBand(rng, localHomes, here, 5, 13) ?? pickNear(rng, localHomes, here);
    return { pickup: here, dropoff, kind: "retour", far: false };
  }

  const pickup =
    pickBand(rng, localHomes, here, here.kind === "domicile" ? 0.4 : 1, here.kind === "domicile" ? 2.6 : 5.5) ??
    pickNear(rng, localHomes.length ? localHomes : homes, here);
  const vsl = crew.vehicleType === "vsl";
  const roll = rng();
  let pool = sites;
  let minKm = 6;
  let maxKm = 14;
  if (vsl && kines.length && roll < 0.28) {
    pool = kines;
    minKm = 2.2;
    maxKm = 8;
  } else if (vsl && images.length && roll < 0.46) {
    pool = images;
    minKm = 3;
    maxKm = 10;
  }
  const dropoff = pickBand(rng, pool, pickup, minKm, maxKm) ?? pickNear(rng, sites, pickup);
  return { pickup, dropoff, kind: "aller", far: false };
}

function pickBand(rng: () => number, list: Location[], from: Location, minKm: number, maxKm: number): Location | null {
  let sum = 0;
  const band = list
    .map((location) => {
      if (location.id === from.id) return null;
      const km = roadKm(from, location);
      if (km < minKm || km > maxKm) return null;
      const weight = 1 / (km + 0.5);
      sum += weight;
      return { location, weight };
    })
    .filter((item): item is { location: Location; weight: number } => Boolean(item));
  if (!band.length || sum <= 0) return null;
  let cursor = rng() * sum;
  for (const item of band) {
    cursor -= item.weight;
    if (cursor <= 0) return item.location;
  }
  return band[band.length - 1]!.location;
}

function birthOf(rng: () => number): { birthYear: number; birthDate: string } {
  const birthYear = irand(rng, 1942, 1998);
  const month = String(irand(rng, 1, 12)).padStart(2, "0");
  const day = String(irand(rng, 1, 28)).padStart(2, "0");
  return { birthYear, birthDate: `${birthYear}-${month}-${day}` };
}

function phoneOf(rng: () => number): string {
  const part = () => String(irand(rng, 0, 99)).padStart(2, "0");
  return `02 35 ${part()} ${part()} ${part()}`;
}

function pickNear(rng: () => number, list: Location[], from: Location): Location {
  if (list.length === 1) return list[0]!;
  if (rng() < 0.14) return pick(rng, list);
  let sum = 0;
  const weights = list.map((location) => {
    const weight = 1 / (roadKm(from, location) + 0.7) ** 1.35;
    sum += weight;
    return weight;
  });
  let cursor = rng() * sum;
  for (let index = 0; index < list.length; index++) {
    cursor -= weights[index]!;
    if (cursor <= 0) return list[index]!;
  }
  return list[list.length - 1]!;
}

function fmt(min: number): string {
  const value = Math.round(min);
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
