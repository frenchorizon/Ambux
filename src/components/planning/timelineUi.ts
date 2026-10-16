import { useSyncExternalStore } from "react";

export type TimelineSheet = "find" | "review" | null;

let query = "";
let sheet: TimelineSheet = null;
let snapshot: { query: string; sheet: TimelineSheet } = { query, sheet };
const listeners = new Set<() => void>();

function emit(): void {
  snapshot = { query, sheet };
  for (const listener of listeners) listener();
}

export function setTimelineQuery(value: string): void {
  query = value;
  emit();
}

export function setTimelineSheet(value: TimelineSheet): void {
  sheet = value;
  emit();
}

export function closeTimelineSheet(): void {
  if (!sheet) return;
  sheet = null;
  emit();
}

export function useTimelineUi(): { query: string; sheet: TimelineSheet } {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => snapshot,
  );
}
