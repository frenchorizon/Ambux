import { pickMealSlot } from "./breaks";
import { metricsFromSchedules, type Metrics } from "./scoring";
import { scheduleCrew, scheduleFleet, type CrewSchedule } from "./schedule";
import { DEFAULT_RULES, type Crew, type Location, type Rules, type TimeBlock, type Transport } from "./types";

export interface BaselinePlan {
  metrics: Metrics;
  emptyDriveMin: number;
}

/** Minutes de trajet sans patient, retour au dépôt compris. */
export function emptyDriveMin(schedules: ReadonlyMap<string, CrewSchedule>): number {
  let total = 0;
  for (const schedule of schedules.values()) {
    total += Math.max(0, schedule.returnEnd - schedule.returnStart);
    for (const leg of schedule.legs) total += leg.deadheadMin;
  }
  return total;
}

/**
 * Planning initial : les courses dans l'ordre des rendez-vous,
 * chacune au premier équipage compatible qui peut la prendre.
 * Mêmes règles dures que la génération (tolérance, charge, pause, amplitude).
 */
export function naiveBaseline(input: {
  crews: readonly Crew[];
  transports: readonly Transport[];
  blocks: readonly TimeBlock[];
  locMap: Map<string, Location>;
  rules?: Rules;
}): BaselinePlan {
  const rules = input.rules ?? DEFAULT_RULES;
  const foreign = input.blocks.filter((block) => block.kind !== "repas");
  const ordered = input.transports
    .filter((transport) => !transport.cancelled)
    .map((transport, index) => ({ transport, index }))
    .sort((a, b) => {
      const left = a.transport.appointmentMin ?? a.transport.windowStart;
      const right = b.transport.appointmentMin ?? b.transport.windowStart;
      return left - right || a.index - b.index;
    });

  const routes = new Map<string, Transport[]>();
  for (const crew of input.crews) routes.set(crew.id, []);

  for (const { transport } of ordered) {
    const job: Transport = { ...transport, crewId: undefined, departMin: undefined };
    for (const crew of input.crews) {
      if (!compatible(crew, job)) continue;
      const current = routes.get(crew.id) ?? [];
      const cap = crew.vehicleType === "ambulance" ? rules.maxAmb : rules.maxVsl;
      if (current.length >= cap) continue;
      const trial = [...current, job];
      if (!seriesOk(trial)) continue;
      const schedule = scheduleCrew(crew, trial, foreign, input.locMap, "chain", undefined, rules);
      if (!routeOk(schedule, crew, rules)) continue;
      routes.set(
        crew.id,
        trial.map((item, index) => ({
          ...item,
          crewId: crew.id,
          departMin: schedule.legs[index]?.departMin,
        })),
      );
      break;
    }
  }

  const assigned = input.transports.map((transport) => {
    if (transport.cancelled) return transport;
    for (const [crewId, list] of routes) {
      const found = list.find((item) => item.id === transport.id);
      if (found) return { ...transport, crewId, departMin: found.departMin };
    }
    return { ...transport, crewId: undefined, departMin: undefined };
  });

  const schedules = scheduleFleet(input.crews, assigned, foreign, input.locMap, "anchored", rules);
  return {
    metrics: metricsFromSchedules(input.crews, schedules, assigned, foreign),
    emptyDriveMin: emptyDriveMin(schedules),
  };
}

function compatible(crew: Crew, transport: Transport): boolean {
  if (transport.posture === "allonge" && crew.vehicleType === "vsl") return false;
  if (crew.vehicleType === "ambulance" && !crew.dea) return false;
  return true;
}

function routeOk(schedule: CrewSchedule, crew: Crew, rules: Rules): boolean {
  const legsOk = schedule.legs.every(
    (leg) => !leg.incompatible && !leg.conflict && leg.lateMin <= 0.5 && !leg.outOfTolerance && leg.endMin <= crew.shiftEnd + 0.5,
  );
  if (!legsOk) return false;
  if (schedule.legs.length > 0 && rules.mealMin > 0 && !pickMealSlot(schedule, crew, rules)) return false;
  return true;
}

function seriesOk(jobs: readonly Transport[]): boolean {
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
    if (aller && retour && jobs.indexOf(retour) < jobs.indexOf(aller)) return false;
  }
  return true;
}
