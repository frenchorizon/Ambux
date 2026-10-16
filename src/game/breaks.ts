import type { CrewSchedule } from "./schedule";
import type { Crew, Rules, TimeBlock } from "./types";

export function pickMealSlot(schedule: CrewSchedule, crew: Crew, rules: Rules): TimeBlock | null {
  if (rules.mealMin <= 0) return null;
  const ranges = schedule.legs
    .map((leg) => ({ start: leg.departMin, end: leg.endMin }))
    .sort((a, b) => a.start - b.start);
  const gaps: { start: number; end: number }[] = [];
  let cursor = crew.shiftStart;
  for (const range of ranges) {
    if (range.start > cursor + 1) gaps.push({ start: cursor, end: range.start });
    cursor = Math.max(cursor, range.end);
  }
  if (crew.shiftEnd > cursor + 1) gaps.push({ start: cursor, end: crew.shiftEnd });

  const target = (rules.mealFrom + rules.mealTo) / 2;
  let best: { start: number; earliest: number; latest: number; score: number } | null = null;
  for (const gap of gaps) {
    const start = Math.max(gap.start, rules.mealFrom);
    const end = Math.min(gap.end, rules.mealTo);
    if (end - start < rules.mealMin - 0.5) continue;
    const earliest = start;
    const latest = end - rules.mealMin;
    let at = target - rules.mealMin / 2;
    at = Math.max(earliest, Math.min(at, latest));
    const score = Math.abs(at + rules.mealMin / 2 - target);
    if (!best || score < best.score) best = { start: at, earliest, latest, score };
  }
  if (!best) return null;
  const startMin = snapMealStart(best.start, best.earliest, best.latest, rules.mealMin);
  return {
    id: `repas-${crew.id}`,
    crewId: crew.id,
    startMin,
    endMin: startMin + rules.mealMin,
    kind: "repas",
    label: "Repas",
  };
}

/** Départ de repas sur la grille de 5 min, pour que la fin (reprise) le soit aussi. */
function snapMealStart(at: number, earliest: number, latest: number, mealMin: number): number {
  const phase = (5 - (Math.round(mealMin) % 5)) % 5;
  const base = Math.round(at);
  let chosen: number | null = null;
  for (let delta = -10; delta <= 10; delta++) {
    const value = base + delta;
    if (value < earliest - 0.05 || value > latest + 0.05) continue;
    if (((value % 5) + 5) % 5 !== phase) continue;
    if (chosen == null || Math.abs(value - at) < Math.abs(chosen - at)) chosen = value;
  }
  if (chosen != null) return chosen;
  return Math.round(Math.max(earliest, Math.min(at, latest)));
}

export function mealIssue(block: TimeBlock | undefined, rules: Rules): string | null {
  if (rules.mealMin <= 0) return null;
  if (!block) return "Pause repas manquante";
  if (block.startMin < rules.mealFrom - 1 || block.endMin > rules.mealTo + 1) return "Repas hors fenêtre";
  if (block.endMin - block.startMin < rules.mealMin - 1) return "Repas trop court";
  return null;
}
