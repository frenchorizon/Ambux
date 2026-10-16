import type { Action } from "./reducer";
import type { GameState } from "./types";

const TRACKED = new Set<Action["type"]>([
  "START",
  "ASSIGN",
  "UNASSIGN",
  "BEST_SLOT",
  "COMPACT",
  "APPLY_STOPS",
  "PLACE_MEALS",
  "SNAP_BACK",
  "SET_RULES",
  "ADD_VEHICLE",
  "UPDATE_VEHICLE",
  "REMOVE_VEHICLE",
  "UPSERT_STAFF",
  "REMOVE_STAFF",
  "SET_CREW_STAFF",
  "UPDATE_PATIENT",
  "UPDATE_TRANSPORT",
  "ADD_TRANSPORT",
  "IMPORT_BATCH",
  "RESTORE",
  "REMOVE_TRANSPORT",
  "TOGGLE_TOMORROW",
  "SET_MISSION",
  "ROLL_DAY",
  "IMPORT_SERIES",
  "CLEAR_DEMAND",
  "IMPORT_VEHICLES",
  "IMPORT_CREWS",
  "IMPORT_APPLY",
  "REPLAY",
]);

export const HISTORY_LIMIT = 30;

export function isTracked(type: Action["type"]): boolean {
  return TRACKED.has(type);
}

export function recordHistory(
  past: GameState[],
  future: GameState[],
  state: GameState,
  type: Action["type"],
): { past: GameState[]; future: GameState[] } {
  if (!isTracked(type)) return { past, future };
  const next = past.length >= HISTORY_LIMIT ? past.slice(1) : past.slice();
  next.push(state);
  return { past: next, future: [] };
}
