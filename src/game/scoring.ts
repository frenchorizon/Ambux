import { clamp } from "../lib/utils";
import type { CrewSchedule } from "./schedule";
import type { Crew, Stats, TimeBlock, Transport } from "./types";

export interface Metrics {
  emptyKm: number;
  loadedKm: number;
  totalKm: number;
  emptyRatio: number;
  placed: number;
  total: number;
  unassigned: number;
  lateCount: number;
  lateMin: number;
  fillRate: number;
  productiveMin: number;
  availableMin: number;
  incompatCount: number;
  planScore: number;
}

export interface DayScore {
  total: number;
  grade: "A" | "B" | "C" | "D" | "E";
  title: string;
  detail: string;
  timePts: number;
  callPts: number;
}

export function metricsFromSchedules(
  crews: readonly Crew[],
  schedules: Map<string, CrewSchedule>,
  transports: readonly Transport[],
  blocks: readonly TimeBlock[],
): Metrics {
  let emptyKm = 0;
  let loadedKm = 0;
  let lateCount = 0;
  let lateMin = 0;
  let placed = 0;
  let productiveMin = 0;
  let availableMin = 0;
  let incompatCount = 0;

  for (const crew of crews) {
    const schedule = schedules.get(crew.id);
    const panne = blocks
      .filter((block) => block.crewId === crew.id && block.kind === "panne")
      .reduce((sum, block) => sum + (block.endMin - block.startMin), 0);
    availableMin += Math.max(0, crew.shiftEnd - crew.shiftStart - panne);
    if (!schedule) continue;
    emptyKm += schedule.returnKm;
    for (const leg of schedule.legs) {
      placed += 1;
      emptyKm += leg.deadheadKm;
      loadedKm += leg.loadedKm;
      productiveMin += leg.loadedMin + leg.pecMin;
      lateMin += leg.lateMin;
      if (leg.lateMin >= 5) lateCount += 1;
      if (leg.incompatible) incompatCount += 1;
    }
  }

  const total = transports.filter((transport) => !transport.cancelled).length;
  const totalKm = emptyKm + loadedKm;
  const emptyRatio = totalKm > 0 ? emptyKm / totalKm : 0;
  const fillRate = availableMin > 0 ? productiveMin / availableMin : 0;
  const metrics: Metrics = {
    emptyKm,
    loadedKm,
    totalKm,
    emptyRatio,
    placed,
    total,
    unassigned: Math.max(0, total - placed),
    lateCount,
    lateMin,
    fillRate,
    productiveMin,
    availableMin,
    incompatCount,
    planScore: 0,
  };
  metrics.planScore = scorePlan(metrics);
  return metrics;
}

export function scorePlan(metrics: Metrics): number {
  const placedRatio = metrics.total === 0 ? 1 : metrics.placed / metrics.total;
  const placedPts = placedRatio * 34;
  const fillPts = clamp((metrics.fillRate - 0.12) / 0.42, 0, 1) * 18;
  const emptyPts = clamp((0.7 - metrics.emptyRatio) / 0.45, 0, 1) * 18;
  const lateRatio = metrics.placed === 0 ? 0 : metrics.lateCount / metrics.placed;
  const latePts = clamp(1 - lateRatio / 0.35, 0, 1) * 14;
  const raw = placedPts + fillPts + emptyPts + latePts - metrics.incompatCount * 6;
  return Math.round(clamp(raw, 0, 84));
}

export function dayScore(metrics: Metrics, stats: Stats, regulationMs: number, callCount: number): DayScore {
  const minutes = regulationMs / 60000;
  const timePts = Math.round(clamp((18 - minutes) / 13, 0, 1) * 8);
  const missedRatio = callCount === 0 ? 0 : stats.callsMissed / callCount;
  const callPts = Math.round(clamp(1 - missedRatio, 0, 1) * 8);
  const total = clamp(metrics.planScore + timePts + callPts, 0, 100);
  const grade: DayScore["grade"] =
    total >= 90 ? "A" : total >= 78 ? "B" : total >= 65 ? "C" : total >= 50 ? "D" : "E";
  const titles: Record<DayScore["grade"], string> = {
    A: "Régulation d'orfèvre",
    B: "Feuille de route solide",
    C: "Journée tenue",
    D: "Des trajets à reprendre",
    E: "Le standard a gagné",
  };
  const detail =
    metrics.unassigned === 0 && metrics.lateCount === 0
      ? "Tout le programmé est calé, sans retard notable."
      : metrics.emptyRatio < 0.32
        ? "Les kilomètres à vide sont contenus. Reste à surveiller les fenêtres serrées."
        : metrics.placed / Math.max(1, metrics.total) < 0.8
          ? "Trop de courses sont restées au standard. Le remplissage s'en ressent."
          : "La journée est passée. Quelques retours et détours méritent un second regard.";
  return { total, grade, title: titles[grade], detail, timePts, callPts };
}
