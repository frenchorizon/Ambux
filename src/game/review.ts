import { mealIssue } from "./breaks";
import type { CrewSchedule } from "./schedule";
import type { Crew, Patient, Rules, TimeBlock, Transport } from "./types";

export type IssueKind = "non_place" | "hors_creneau" | "repas" | "serie" | "dea" | "charge" | "amplitude" | "km_estime";

export interface Issue {
  id: string;
  kind: IssueKind;
  level: "bloquant" | "alerte";
  title: string;
  transportId?: string;
  crewId?: string;
}

export function reviewIssues(input: {
  crews: readonly Crew[];
  transports: readonly Transport[];
  blocks: readonly TimeBlock[];
  rules: Rules;
  schedules: Map<string, CrewSchedule>;
  patients: ReadonlyMap<string, Patient>;
}): Issue[] {
  const issues: Issue[] = [];
  const active = input.transports.filter((transport) => !transport.cancelled);
  const byId = new Map(active.map((transport) => [transport.id, transport]));

  for (const transport of active) {
    if (transport.crewId) continue;
    const patient = input.patients.get(transport.patientId);
    issues.push({
      id: `np-${transport.id}`,
      kind: "non_place",
      level: "bloquant",
      title: `${nameOf(patient, transport)} n'est pas placé`,
      transportId: transport.id,
    });
  }

  let estimated = 0;
  for (const crew of input.crews) {
    const schedule = input.schedules.get(crew.id);
    const count = schedule?.legs.length ?? 0;
    const cap = crew.vehicleType === "ambulance" ? input.rules.maxAmb : input.rules.maxVsl;
    if (count > cap) {
      issues.push({
        id: `ch-${crew.id}`,
        kind: "charge",
        level: "bloquant",
        title: `${crew.code} : ${count} courses, plafond ${cap}`,
        crewId: crew.id,
      });
    }
    if (crew.vehicleType === "ambulance" && !crew.dea && count > 0) {
      issues.push({
        id: `dea-${crew.id}`,
        kind: "dea",
        level: "bloquant",
        title: `${crew.code} roule sans DEA enregistré`,
        crewId: crew.id,
      });
    }
    const meal = input.blocks.find((block) => block.crewId === crew.id && block.kind === "repas");
    const mealWarn = mealIssue(meal, input.rules);
    if (mealWarn && count > 0) {
      issues.push({
        id: `meal-${crew.id}`,
        kind: "repas",
        level: "bloquant",
        title: `${crew.code} : ${mealWarn}`,
        crewId: crew.id,
      });
    }
    if (!schedule) continue;
    for (const leg of schedule.legs) {
      const transport = byId.get(leg.transportId);
      if (!transport) continue;
      if (leg.outOfTolerance || leg.lateMin >= 1) {
        const patient = input.patients.get(transport.patientId);
        issues.push({
          id: `ht-${transport.id}`,
          kind: "hors_creneau",
          level: "bloquant",
          title: `${nameOf(patient, transport)} hors créneau (${leg.deviationMin > 0 ? "+" : ""}${leg.deviationMin} min)`,
          transportId: transport.id,
          crewId: crew.id,
        });
      }
      if (leg.endMin > crew.shiftEnd + 0.5) {
        const patient = input.patients.get(transport.patientId);
        issues.push({
          id: `amp-${transport.id}`,
          kind: "amplitude",
          level: "bloquant",
          title: `${nameOf(patient, transport)} finit après la vacation de ${crew.code}`,
          transportId: transport.id,
          crewId: crew.id,
        });
      }
      if (leg.kmEstimated) estimated += 1;
    }
    if (schedule.returnEnd > crew.shiftEnd + 1 && schedule.legs.length) {
      issues.push({
        id: `ret-${crew.id}`,
        kind: "amplitude",
        level: "alerte",
        title: `${crew.code} : retour dépôt après la fin de vacation`,
        crewId: crew.id,
      });
    }
  }

  const groups = new Map<string, Transport[]>();
  for (const transport of active) {
    if (!transport.seriesId || !transport.kind.startsWith("dialyse")) continue;
    const list = groups.get(transport.seriesId) ?? [];
    list.push(transport);
    groups.set(transport.seriesId, list);
  }
  for (const [seriesId, list] of groups) {
    const aller = list.find((transport) => transport.kind.includes("aller"));
    const retour = list.find((transport) => transport.kind.includes("retour"));
    const patient = input.patients.get((aller ?? retour)!.patientId);
    const label = patient ? `${patient.lastName.toUpperCase()} ${patient.firstName}` : "Dialyse";
    const crews = new Set(list.map((transport) => transport.crewId).filter(Boolean));
    if (crews.size > 1) {
      issues.push({
        id: `ser-${seriesId}`,
        kind: "serie",
        level: "alerte",
        title: `${label} : dialyse coupée entre deux équipages`,
        transportId: retour?.id ?? aller?.id,
      });
    }
    if (aller && !retour) {
      issues.push({
        id: `ser-miss-${seriesId}`,
        kind: "serie",
        level: "bloquant",
        title: `${label} : retour de dialyse absent`,
        transportId: aller.id,
      });
    }
    if (aller && retour && aller.crewId && retour.crewId) {
      const allerLeg = legOf(input.schedules, aller.id);
      const retourLeg = legOf(input.schedules, retour.id);
      const expected = retour.centerArriveMin != null ? retour.centerArriveMin + input.rules.sessionMin : null;
      if (
        retourLeg &&
        expected != null &&
        Math.abs(retourLeg.arrivePickup - expected) > input.rules.toleranceMin + 0.5
      ) {
        issues.push({
          id: `ser-gap-${seriesId}`,
          kind: "serie",
          level: "bloquant",
          title: `${label} : retour éloigné de la fin de séance`,
          transportId: retour.id,
        });
      }
      if (allerLeg && retourLeg && retourLeg.departMin < allerLeg.endMin - 0.5) {
        issues.push({
          id: `ser-order-${seriesId}`,
          kind: "serie",
          level: "bloquant",
          title: `${label} : retour planifié avant la fin de l'aller`,
          transportId: retour.id,
        });
      }
    }
  }

  if (estimated > 0) {
    issues.push({
      id: "km-estime",
      kind: "km_estime",
      level: "alerte",
      title: `${estimated} course${estimated > 1 ? "s" : ""} en km estimé (itinéraire non routier)`,
    });
  }

  const order: Record<IssueKind, number> = {
    non_place: 0,
    hors_creneau: 1,
    dea: 2,
    charge: 3,
    amplitude: 4,
    repas: 5,
    serie: 6,
    km_estime: 7,
  };
  return issues.sort((a, b) => order[a.kind] - order[b.kind] || a.title.localeCompare(b.title, "fr"));
}

function legOf(schedules: Map<string, CrewSchedule>, id: string) {
  for (const schedule of schedules.values()) {
    const leg = schedule.legs.find((item) => item.transportId === id);
    if (leg) return leg;
  }
  return undefined;
}

function nameOf(patient: Patient | undefined, transport: Transport): string {
  if (!patient) return transport.dossier;
  return `${patient.lastName.toUpperCase()} ${patient.firstName}`;
}
