import type { PlacementPreview } from "../../game/schedule";
import { snap5 } from "../../game/schedule";
import { DAY_END, DAY_START } from "../../game/types";

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

export const CONFLICT_MESSAGE = "Conflit horaire : le créneau de 5 minutes ne tient pas sur cet équipage.";

/** Pointeur fictif : le clavier réutilise l'état du glisser, pas la souris. */
export const KEYBOARD_POINTER = -1;
export const KEY_MINUTE = 5;
export const KEY_MINUTE_SHIFT = 15;

export function isKeyboardDrag(drag: DragState | null | undefined): drag is DragState {
  return drag?.pointerId === KEYBOARD_POINTER;
}

export type KeyboardAim = { crewId: string; departMin: number };
export type KeyboardMove = "left" | "right" | "up" | "down";

/** Même grille que le glisser. Maj avance de 15 minutes, sinon de 5. Haut et bas changent d'équipage. */
export function nextKeyboardAim(
  crews: readonly { id: string }[],
  current: KeyboardAim,
  move: KeyboardMove,
  shift: boolean,
): KeyboardAim | "no-crew" | "edge" {
  const depart = snap5(current.departMin);
  if (move === "left" || move === "right") {
    const step = shift ? KEY_MINUTE_SHIFT : KEY_MINUTE;
    const raw = depart + (move === "left" ? -step : step);
    const clamped = Math.min(DAY_END, Math.max(DAY_START, raw));
    if (clamped === depart) return "edge";
    return { crewId: current.crewId, departMin: clamped };
  }
  const index = crews.findIndex((crew) => crew.id === current.crewId);
  const nextIndex = move === "up" ? index - 1 : index + 1;
  if (index < 0 || nextIndex < 0 || nextIndex >= crews.length) return "no-crew";
  return { crewId: crews[nextIndex]!.id, departMin: depart };
}

export function keyboardDrag(
  transportId: string,
  crewId: string,
  departMin: number,
  preview: PlacementPreview,
): DragState {
  const minute = snap5(departMin);
  return {
    transportId,
    pointerId: KEYBOARD_POINTER,
    x: 0,
    y: 0,
    originX: 0,
    originY: 0,
    dx: 0,
    dy: 0,
    moved: true,
    hoverCrewId: crewId,
    hoverMinute: minute,
    overUnassigned: false,
    preview,
    previewKey: previewCacheKey(crewId, minute),
  };
}

export function blockAriaLabel(patient: string, time: string, crew: string): string {
  return `${patient}, ${time}, ${crew}`;
}

export function announceGrab(patient: string, time: string, crew: string): string {
  return `Course saisie. ${patient}, ${time}, ${crew}.`;
}

export function announceAim(time: string, crew: string, refusal?: string): string {
  const place = `${time}, ${crew}.`;
  return refusal ? `${place} ${refusal}` : place;
}

export function announceAccept(time: string, crew: string): string {
  return `Course posée. ${time}, ${crew}.`;
}

export function announceRefuse(message: string): string {
  return `Refus. ${message}`;
}

export function announceCancel(): string {
  return "Déplacement annulé.";
}

export function announceNoCrew(): string {
  return "Pas d'autre équipage.";
}

export function announceEdge(move: "left" | "right"): string {
  return move === "left" ? "Pas plus tôt." : "Pas plus tard.";
}

export function announceDrop(release: DragRelease, time: string, crew: string, refusal: string): string {
  if (release === "assign" || release === "same") return announceAccept(time, crew);
  if (release === "refuse" || release === "conflict") return announceRefuse(refusal);
  return announceCancel();
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
