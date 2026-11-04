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

export const HOLD_MS = 300;
export const SCROLL_SLOP = 10;
export const RETURN_MS = 180;

/** Zone de déclenchement du défilement pendant le glisser, en px. */
export const GANTT_EDGE_PX = 56;
/** Vitesse à l'entrée de la zone, puis collé au bord, en px/frame. */
export const GANTT_EDGE_MIN = 2;
export const GANTT_EDGE_MAX = 24;
/** Largeur de la colonne collante des équipages : téléphone, puis bureau. */
export const CREW_COLUMN_PHONE = 104;
export const CREW_COLUMN_DESK = 156;

export function crewColumnWidth(viewportWidth: number): number {
  return viewportWidth <= 1024 ? CREW_COLUMN_PHONE : CREW_COLUMN_DESK;
}

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

export type DragRelease = "select" | "unassign" | "assign" | "same" | "refuse" | "conflict" | "cancel";

/** Décision de relâchement. `cancel` : hors grille et hors À placer, sans écrire. */
export function dragRelease(drag: DragState, samePlace: boolean): DragRelease {
  if (!drag.moved) return "select";
  if (drag.overUnassigned) return "unassign";
  if (drag.preview?.ok && drag.hoverCrewId && drag.preview.departMin % 5 === 0) {
    return samePlace ? "same" : "assign";
  }
  if (drag.preview && !drag.preview.ok) return "refuse";
  if (drag.hoverCrewId) return "conflict";
  return "cancel";
}

/** Le bloc reste à sa place : il revient en douceur au lieu de sauter. */
export function dragReturnsHome(drag: DragState, release: DragRelease): boolean {
  if (drag.dx === 0 && drag.dy === 0) return false;
  return release === "same" || release === "refuse" || release === "conflict" || release === "cancel";
}

export interface GanttViewport {
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Bord droit de la colonne équipage, même repère que `left`. */
  contentLeft: number;
}

/** 0 à l'entrée de la zone, 1 collé au bord. */
export function edgeDepth(distancePx: number): number {
  if (distancePx >= GANTT_EDGE_PX) return 0;
  if (distancePx <= 0) return 1;
  return (GANTT_EDGE_PX - distancePx) / GANTT_EDGE_PX;
}

/** Courbe douce : 2 px/frame à l'entrée, 24 collé au bord. */
export function edgeSpeed(depth: number): number {
  const t = Math.min(1, Math.max(0, depth));
  const eased = t * t * (3 - 2 * t);
  return GANTT_EDGE_MIN + (GANTT_EDGE_MAX - GANTT_EDGE_MIN) * eased;
}

function axisSpeed(distancePx: number): number {
  if (distancePx >= GANTT_EDGE_PX) return 0;
  return edgeSpeed(edgeDepth(distancePx));
}

export function ganttEdgeDelta(x: number, y: number, rect: GanttViewport): { dx: number; dy: number } {
  if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return { dx: 0, dy: 0 };
  let dx = 0;
  let dy = 0;
  if (x >= rect.contentLeft) {
    const fromColumn = x - rect.contentLeft;
    const fromRight = rect.right - x;
    if (fromColumn < GANTT_EDGE_PX && fromColumn <= fromRight) dx = -axisSpeed(fromColumn);
    else if (fromRight < GANTT_EDGE_PX) dx = axisSpeed(fromRight);
  }
  const fromTop = y - rect.top;
  const fromBottom = rect.bottom - y;
  if (fromTop < GANTT_EDGE_PX && fromTop <= fromBottom) dy = -axisSpeed(fromTop);
  else if (fromBottom < GANTT_EDGE_PX) dy = axisSpeed(fromBottom);
  return { dx, dy };
}

export function ganttEdgeRect(scroller: HTMLElement): GanttViewport {
  const rect = scroller.getBoundingClientRect();
  const column = scroller.querySelector("[data-crew-column]");
  const measured =
    column instanceof HTMLElement
      ? column.getBoundingClientRect().right
      : rect.left + crewColumnWidth(window.innerWidth);
  const contentLeft = Math.min(rect.right, Math.max(rect.left, measured));
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, contentLeft };
}

export function scrollGanttEdge(x: number, y: number): boolean {
  const scroller = document.querySelector(".gantt-scroll");
  if (!(scroller instanceof HTMLElement)) return false;
  const { dx, dy } = ganttEdgeDelta(x, y, ganttEdgeRect(scroller));
  if (!dx && !dy) return false;
  const left = scroller.scrollLeft;
  const top = scroller.scrollTop;
  scroller.scrollLeft = left + dx;
  scroller.scrollTop = top + dy;
  return scroller.scrollLeft !== left || scroller.scrollTop !== top;
}
