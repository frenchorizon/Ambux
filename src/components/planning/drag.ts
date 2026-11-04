import type { PlacementPreview } from "../../game/schedule";
import { snap5 } from "../../game/schedule";

type Refusal = Extract<PlacementPreview, { ok: false }>;

export interface DragState {
  transportId: string;
  pointerId: number;
  x: number;
  y: number;
  originX: number;
  originY: number;
  dx: number;
  dy: number;
  moved: boolean;
  hoverCrewId?: string;
  hoverMinute?: number;
  overUnassigned: boolean;
  preview?: PlacementPreview;
  /** Équipage + minute calée du dernier previewOnGrid. Le suivi visuel ne relance pas le calcul. */
  previewKey?: string;
}

export const GANTT_EDGE_PX = 28;
export const GANTT_EDGE_STEP = 12;

export function previewCacheKey(crewId: string, minute: number): string {
  return `${crewId}:${snap5(minute)}`;
}

/** Motif court du fantôme. La phrase complète reste sur le titre du bloc. */
export function refusalMotif(preview: Refusal): string {
  if (preview.reason === "incompatible") {
    if (preview.message.includes("VSL")) return "VSL";
    if (preview.message.includes("DEA")) return "DEA";
    return "Incompatible";
  }
  if (preview.reason === "conflict") return "Conflit";
  if (preview.reason === "cancelled") return "Annulé";
  return "Engagée";
}

export interface DragStats {
  board: number;
  row: number;
  frames: number;
  commits: number;
}

declare global {
  interface Window {
    __ambuxDragStats?: DragStats;
  }
}

/** Compteur de la mesure de drag. Inerte tant que le test n'a pas posé le seau. */
export function noteDrag(part: keyof DragStats) {
  if (typeof window === "undefined") return;
  const stats = window.__ambuxDragStats;
  if (!stats) return;
  stats[part] += 1;
}

/**
 * Ce qui doit repeindre le fantôme, la ligne visée ou l'état moved.
 * Le translate du bloc tiré n'en fait pas partie : il suit le pointeur hors React.
 */
export function dragCommitKey(drag: DragState): string {
  if (!drag.moved) return "armed";
  if (drag.overUnassigned) return "unassigned";
  if (drag.hoverCrewId != null && drag.hoverMinute != null) return previewCacheKey(drag.hoverCrewId, drag.hoverMinute);
  return "away";
}

/** Même équipage et même départ calé sur 5 minutes : rien à enregistrer. */
export function sameAssignment(
  currentCrew: string | undefined,
  currentDepart: number | undefined,
  nextCrew: string,
  nextDepart: number,
): boolean {
  if (!currentCrew || currentDepart == null) return false;
  return currentCrew === nextCrew && snap5(currentDepart) === snap5(nextDepart);
}

export function ganttEdgeDelta(
  x: number,
  y: number,
  rect: { left: number; top: number; right: number; bottom: number },
): { dx: number; dy: number } {
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return { dx: 0, dy: 0 };
  let dx = 0;
  let dy = 0;
  if (x - rect.left < GANTT_EDGE_PX) dx = -GANTT_EDGE_STEP;
  else if (rect.right - x < GANTT_EDGE_PX) dx = GANTT_EDGE_STEP;
  if (y - rect.top < GANTT_EDGE_PX) dy = -GANTT_EDGE_STEP;
  else if (rect.bottom - y < GANTT_EDGE_PX) dy = GANTT_EDGE_STEP;
  return { dx, dy };
}

export function scrollGanttEdge(x: number, y: number): boolean {
  const scroller = document.querySelector(".gantt-scroll");
  if (!(scroller instanceof HTMLElement)) return false;
  const rect = scroller.getBoundingClientRect();
  const { dx, dy } = ganttEdgeDelta(x, y, rect);
  if (!dx && !dy) return false;
  const left = scroller.scrollLeft;
  const top = scroller.scrollTop;
  scroller.scrollLeft = left + dx;
  scroller.scrollTop = top + dy;
  return scroller.scrollLeft !== left || scroller.scrollTop !== top;
}
