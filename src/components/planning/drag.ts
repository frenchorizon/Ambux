import type { PlacementPreview } from "../../game/schedule";
import { snap5 } from "../../game/schedule";

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
